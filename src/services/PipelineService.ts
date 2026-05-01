import { query } from "../db/connection";
import { Workflow } from "../models/Workflow";
import { jobExecutionQueue } from "../queue/queues";
import { JobExecutorService } from "./JobExecutorService";

export class PipelineService {
    private jobExecutor = new JobExecutorService()

    async trigger_pipelineRun(workflow: Workflow) {
        if (!workflow) {
            throw new Error("workflow is invalid")
        }

        const workflowDb = await query("SELECT id FROM workflows WHERE id = $1 AND org_id = $2", [workflow.id, workflow.org_id])
        if (workflowDb.rows.length === 0) {
            throw new Error("Workflow doesnt exist")
        }

        const orgDb = await query("SELECT id FROM organizations WHERE id = $1", [workflow.org_id])
        if (orgDb.rows.length === 0) {
            throw new Error("Organization doesnt exist")
        }

        if (!workflow.is_active) {
            throw new Error("Workflow is not activated")
        }

        const jobs = Object.values(workflow.definition.jobs || {})
        if (jobs.length === 0) {
            throw new Error("Workflow has no jobs")
        }

        const pipelineRunResult = await query(
            `INSERT INTO pipeline_runs (workflow_id, org_id, trigger_type, trigger_data, status, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             RETURNING id, workflow_id, org_id, trigger_type, trigger_data, triggered_by, status, started_at, completed_at, duration_seconds, created_at`,
            [workflow.id, workflow.org_id, 'manual', JSON.stringify({ workflow_id: workflow.id }), 'pending']
        )

        const pipelineRun = pipelineRunResult.rows[0]

        const createdJobs: Array<{ id: string; workflowJobId: string; dependsOn: string[] }> = []

        for (const workflowJob of jobs) {
            const dependsOn = Array.isArray(workflowJob.depends_on) ? workflowJob.depends_on : []

            const jobResult = await query(
                `INSERT INTO jobs (pipeline_run_id, workflow_job_id, job_name, status, docker_image, created_at)
                 VALUES ($1, $2, $3, $4, $5, NOW())
                 RETURNING id, pipeline_run_id, workflow_job_id, job_name, status, docker_image, docker_container_id, started_at, completed_at, duration_seconds, exit_code, created_at`,
                [pipelineRun.id, workflowJob.id, workflowJob.name, 'pending', workflowJob.image]
            )

            createdJobs.push({
                id: jobResult.rows[0].id,
                workflowJobId: workflowJob.id,
                dependsOn,
            })
        }

        const independentJobs = createdJobs.filter((job) => job.dependsOn.length === 0)

        await Promise.all(
            independentJobs.map((job) =>
                jobExecutionQueue.add('job_execution', {
                    jobId: job.id,
                    pipelineRunId: pipelineRun.id,
                    workflowJobId: job.workflowJobId,
                    workflowId: workflow.id,
                    orgId: workflow.org_id,
                })
            )
        )

        await query(
            `UPDATE pipeline_runs
             SET status = 'running', started_at = NOW()
             WHERE id = $1`,
            [pipelineRun.id]
        )

        return pipelineRun


    }
    async execute_workflow(workflow: Workflow) {
        const jobs = Object.values(workflow.definition.jobs || {})
        if (jobs.length === 0) {
            throw new Error("Workflow has no jobs")
        }

        const jobMap = new Map(jobs.map((job) => [job.id, job]))
        const dependencyMap = new Map<string, string[]>()
        const reverseDependencyMap = new Map<string, string[]>()
        const inDegree = new Map<string, number>()

        for (const job of jobs) {
            const deps = Array.isArray(job.depends_on) ? job.depends_on : []

            for (const dep of deps) {
                if (!jobMap.has(dep)) {
                    throw new Error(`Job "${job.id}" depends on non-existent job "${dep}"`)
                }

                if (!reverseDependencyMap.has(dep)) {
                    reverseDependencyMap.set(dep, [])
                }
                reverseDependencyMap.get(dep)!.push(job.id)
            }

            dependencyMap.set(job.id, deps)
            inDegree.set(job.id, deps.length)
        }

        const runnableJobs = Array.from(inDegree.entries())
            .filter(([_, degree]) => degree === 0)
            .map(([jobId, _]) => jobId)

        const visited = new Set<string>()
        const stack = [runnableJobs[0]]

        while (stack.length > 0) {
            const current = stack.pop()!
            if (visited.has(current)) continue
            visited.add(current)

            const dependents = reverseDependencyMap.get(current) || []
            for (const dep of dependents) {
                stack.push(dep)
            }
        }

        if (visited.size !== jobs.length) {
            throw new Error("Circular dependency detected in workflow")
        }

        return {
            jobs,
            jobMap,
            dependencyMap,
            reverseDependencyMap,
            inDegree,
            runnableJobs,
        }
    }

    async queue_dependent_jobs(pipelineRunId: string, completedJobId: string, completedJobStatus: string) {
        const jobResult = await query(
            `SELECT id, workflow_job_id, pipeline_run_id FROM jobs WHERE id = $1`,
            [completedJobId]
        )

        if (jobResult.rows.length === 0) {
            throw new Error("Job not found")
        }

        const completedJob = jobResult.rows[0]
        const workflowJobId = completedJob.workflow_job_id

        const pipelineResult = await query(
            `SELECT workflow_id FROM pipeline_runs WHERE id = $1`,
            [pipelineRunId]
        )

        if (pipelineResult.rows.length === 0) {
            throw new Error("Pipeline run not found")
        }

        const workflowId = pipelineResult.rows[0].workflow_id

        const workflowResult = await query(
            `SELECT definition FROM workflows WHERE id = $1`,
            [workflowId]
        )

        if (workflowResult.rows.length === 0) {
            throw new Error("Workflow not found")
        }

        const workflowDefinition = typeof workflowResult.rows[0].definition === 'string'
            ? JSON.parse(workflowResult.rows[0].definition)
            : workflowResult.rows[0].definition

        const dependentJobIds = workflowDefinition.jobs[workflowJobId]?.depends_on || []

        if (completedJobStatus === 'failed') {
            for (const depJobId of dependentJobIds) {
                const depJobDbResult = await query(
                    `SELECT id FROM jobs WHERE workflow_job_id = $1 AND pipeline_run_id = $2`,
                    [depJobId, pipelineRunId]
                )

                if (depJobDbResult.rows.length > 0) {
                    await query(
                        `UPDATE jobs SET status = 'skipped' WHERE id = $1`,
                        [depJobDbResult.rows[0].id]
                    )
                }
            }
            return
        }

        if (completedJobStatus !== 'success') {
            return
        }

        for (const depJobId of dependentJobIds) {
            const depJobDbResult = await query(
                `SELECT id FROM jobs WHERE workflow_job_id = $1 AND pipeline_run_id = $2`,
                [depJobId, pipelineRunId]
            )

            if (depJobDbResult.rows.length === 0) {
                continue
            }

            const depJob = depJobDbResult.rows[0]

            const allDepsResult = await query(
                `SELECT wj.depends_on FROM workflows w
                 JOIN json_each_text(w.definition->'jobs') AS wj(key, value) ON true
                 WHERE w.id = $1 AND wj.key = $2`,
                [workflowId, depJobId]
            )

            const depJobAllDeps = allDepsResult.rows.length > 0
                ? JSON.parse(allDepsResult.rows[0].depends_on || '[]')
                : []

            const allDepsStatusResult = await query(
                `SELECT COUNT(*) as total, 
                        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as succeeded
                 FROM jobs 
                 WHERE pipeline_run_id = $1 AND workflow_job_id = ANY($2)`,
                [pipelineRunId, depJobAllDeps]
            )

            const allDepsSucceeded =
                parseInt(allDepsStatusResult.rows[0].total) ===
                parseInt(allDepsStatusResult.rows[0].succeeded)

            if (allDepsSucceeded && depJob.status === 'pending') {
                await query(
                    `UPDATE jobs SET status = 'pending' WHERE id = $1`,
                    [depJob.id]
                )

                await jobExecutionQueue.add('job_execution', {
                    jobId: depJob.id,
                    pipelineRunId: pipelineRunId,
                    workflowJobId: depJobId,
                })
            }
        }

        await this.update_pipeline_run_status(pipelineRunId)
    }

    async update_pipeline_run_status(pipelineRunId: string) {
        const jobsResult = await query(
            `SELECT status FROM jobs WHERE pipeline_run_id = $1`,
            [pipelineRunId]
        )

        const statuses = jobsResult.rows.map((row) => row.status)

        let pipelineStatus: string

        if (statuses.includes('running')) {
            pipelineStatus = 'running'
        } else if (statuses.includes('failed')) {
            pipelineStatus = 'failed'
        } else if (statuses.every((s) => s === 'success')) {
            pipelineStatus = 'success'
        } else if (statuses.includes('pending')) {
            pipelineStatus = 'running'
        } else {
            pipelineStatus = 'running'
        }

        await query(
            `UPDATE pipeline_runs SET status = $1 WHERE id = $2`,
            [pipelineStatus, pipelineRunId]
        )
    }
}
