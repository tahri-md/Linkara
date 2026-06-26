import { query } from "../db/connection.js";
import { Workflow } from "../models/Workflow.js";
import { jobExecutionQueue } from "../queue/queues.js";
import type { TriggerType } from "../models/PipelineRun.js";

export class PipelineService {
  async trigger_pipelineRun(
    workflow: Workflow,
    triggerType: TriggerType = "manual",
    triggerData?: Record<string, unknown>,
  ) {
    if (!workflow) {
      throw new Error("workflow is invalid");
    }

    const workflowDb = await query(
      "SELECT id FROM workflows WHERE id = $1 AND org_id = $2",
      [workflow.id, workflow.org_id],
    );
    if (workflowDb.rows.length === 0) {
      throw new Error("Workflow does not exist");
    }

    const orgDb = await query("SELECT id FROM organizations WHERE id = $1", [
      workflow.org_id,
    ]);
    if (orgDb.rows.length === 0) {
      throw new Error("Organization does not exist");
    }

    if (!workflow.is_active) {
      throw new Error("Workflow is not active");
    }

    const jobs = Object.values(workflow.definition.jobs || {});
    if (jobs.length === 0) {
      throw new Error("Workflow has no jobs");
    }

    const pipelineRunResult = await query(
      `INSERT INTO pipeline_runs (workflow_id, org_id, trigger_type, trigger_data, status, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             RETURNING id, workflow_id, org_id, trigger_type, trigger_data, triggered_by, status, started_at, completed_at, duration_seconds, created_at`,
      [
        workflow.id,
        workflow.org_id,
        triggerType,
        JSON.stringify(triggerData ?? { workflow_id: workflow.id }),
        "pending",
      ],
    );

    const pipelineRun = pipelineRunResult.rows[0];

    const createdJobs: Array<{
      id: string;
      workflowJobId: string;
      dependsOn: string[];
    }> = [];

    for (const workflowJob of jobs) {
      const dependsOn = Array.isArray(workflowJob.depends_on)
        ? workflowJob.depends_on
        : [];

      const jobResult = await query(
        `INSERT INTO jobs (pipeline_run_id, workflow_job_id, job_name, status, docker_image, created_at)
                 VALUES ($1, $2, $3, $4, $5, NOW())
                 RETURNING id, pipeline_run_id, workflow_job_id, job_name, status, docker_image, docker_container_id, started_at, completed_at, duration_seconds, exit_code, created_at`,
        [
          pipelineRun.id,
          workflowJob.id,
          workflowJob.name,
          "pending",
          workflowJob.image,
        ],
      );

      createdJobs.push({
        id: jobResult.rows[0].id,
        workflowJobId: workflowJob.id,
        dependsOn,
      });
    }

    // Only enqueue jobs that have no dependencies
    const independentJobs = createdJobs.filter(
      (job) => job.dependsOn.length === 0,
    );

    await Promise.all(
      independentJobs.map((job) =>
        jobExecutionQueue.add("job_execution", {
          jobId: job.id,
          pipelineRunId: pipelineRun.id,
          workflowJobId: job.workflowJobId,
          workflowId: workflow.id,
          orgId: workflow.org_id,
        }),
      ),
    );

    await query(
      `UPDATE pipeline_runs SET status = 'running', started_at = NOW() WHERE id = $1`,
      [pipelineRun.id],
    );

    return pipelineRun;
  }

  /**
   * After a job completes, find all workflow jobs that depend on it and
   * enqueue any whose full dependency set is now satisfied.
   *
   * Bug fix: the original code read depends_on from the *completed* job,
   * which gives the jobs IT waits for (already finished). We need the
   * reverse: jobs whose depends_on list *contains* the completed job.
   */
  async queue_dependent_jobs(
    pipelineRunId: string,
    completedJobId: string,
    completedJobStatus: string,
  ) {
    const jobResult = await query(
      `SELECT id, workflow_job_id FROM jobs WHERE id = $1`,
      [completedJobId],
    );
    if (jobResult.rows.length === 0) {
      throw new Error("Job not found");
    }

    const completedWorkflowJobId: string = jobResult.rows[0].workflow_job_id;

    const pipelineResult = await query(
      `SELECT workflow_id FROM pipeline_runs WHERE id = $1`,
      [pipelineRunId],
    );
    if (pipelineResult.rows.length === 0) {
      throw new Error("Pipeline run not found");
    }

    const workflowId = pipelineResult.rows[0].workflow_id;

    const workflowResult = await query(
      `SELECT definition FROM workflows WHERE id = $1`,
      [workflowId],
    );
    if (workflowResult.rows.length === 0) {
      throw new Error("Workflow not found");
    }

    const workflowDefinition =
      typeof workflowResult.rows[0].definition === "string"
        ? JSON.parse(workflowResult.rows[0].definition)
        : workflowResult.rows[0].definition;

    // Find all workflow job definitions whose depends_on includes the completed job
    const allWorkflowJobs = Object.values(
      workflowDefinition.jobs || {},
    ) as Array<{
      id: string;
      depends_on?: string[];
    }>;

    const waitingOnCompleted = allWorkflowJobs.filter(
      (wj) =>
        Array.isArray(wj.depends_on) &&
        wj.depends_on.includes(completedWorkflowJobId),
    );

    if (waitingOnCompleted.length === 0) {
      // No downstream jobs — just update pipeline status
      await this.update_pipeline_run_status(pipelineRunId);
      return;
    }

    if (completedJobStatus === "failed") {
      // Mark all downstream jobs as skipped
      for (const wj of waitingOnCompleted) {
        const dbResult = await query(
          `SELECT id FROM jobs WHERE workflow_job_id = $1 AND pipeline_run_id = $2`,
          [wj.id, pipelineRunId],
        );
        if (dbResult.rows.length > 0) {
          await query(`UPDATE jobs SET status = 'skipped' WHERE id = $1`, [
            dbResult.rows[0].id,
          ]);
        }
      }
      await this.update_pipeline_run_status(pipelineRunId);
      return;
    }

    if (completedJobStatus !== "success") {
      return;
    }

    for (const wj of waitingOnCompleted) {
      const dbResult = await query(
        `SELECT id, status FROM jobs WHERE workflow_job_id = $1 AND pipeline_run_id = $2`,
        [wj.id, pipelineRunId],
      );
      if (dbResult.rows.length === 0) continue;

      const depJob = dbResult.rows[0];
      if (depJob.status !== "pending") continue;

      // All dependencies of this candidate job must be succeeded
      const requiredDeps: string[] = wj.depends_on ?? [];

      const depsStatusResult = await query(
        `SELECT COUNT(*) as total,
                        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as succeeded
                 FROM jobs
                 WHERE pipeline_run_id = $1 AND workflow_job_id = ANY($2::text[])`,
        [pipelineRunId, requiredDeps],
      );

      const total = parseInt(depsStatusResult.rows[0].total, 10);
      const succeeded = parseInt(depsStatusResult.rows[0].succeeded, 10);

      if (total === requiredDeps.length && total === succeeded) {
        await jobExecutionQueue.add("job_execution", {
          jobId: depJob.id,
          pipelineRunId,
          workflowJobId: wj.id,
          workflowId,
        });
      }
    }

    await this.update_pipeline_run_status(pipelineRunId);
  }

  async update_pipeline_run_status(pipelineRunId: string) {
    const jobsResult = await query(
      `SELECT status FROM jobs WHERE pipeline_run_id = $1`,
      [pipelineRunId],
    );

    const statuses = jobsResult.rows.map((row) => row.status as string);

    let pipelineStatus: string;

    if (statuses.includes("running") || statuses.includes("pending")) {
      pipelineStatus = "running";
    } else if (statuses.includes("failed")) {
      pipelineStatus = "failed";
    } else if (statuses.every((s) => s === "success" || s === "skipped")) {
      pipelineStatus = "success";
    } else {
      pipelineStatus = "running";
    }

    const isTerminal =
      pipelineStatus === "success" || pipelineStatus === "failed";

    await query(
      `UPDATE pipeline_runs
             SET status = $1
               ${
                 isTerminal
                   ? `, completed_at = NOW(),
                 duration_seconds = COALESCE(
                   EXTRACT(EPOCH FROM (NOW() - started_at))::INT, 0
                 )`
                   : ""
               }
             WHERE id = $2`,
      [pipelineStatus, pipelineRunId],
    );
  }
}
