import { CreateWorkflowInput, WorkflowDefinition, WorkflowJobDefinition } from "../models/Workflow";


export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export class WorkflowValidator {
  validate(definition: WorkflowDefinition): ValidationResult {
    const errors: string[] = [];

    if (!definition || !definition.jobs) {
      return {
        isValid: false,
        errors: ["Workflow definition must contain jobs"],
      };
    }

    const jobs = definition.jobs;

    for (const [key, job] of Object.entries(jobs)) {
      this.validateJob(key, job, errors);
    }

    this.checkDependencies(jobs, errors);
    this.checkCycles(jobs, errors);

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  private validateJob(
    key: string,
    job: WorkflowJobDefinition,
    errors: string[]
  ) {
    if (!job.id || job.id !== key) {
      errors.push(`Job key '${key}' does not match id '${job.id}'`);
    }

    if (!job.name || job.name.trim() === "") {
      errors.push(`Job '${key}' must have a name`);
    }

    if (!job.image || job.image.trim() === "") {
      errors.push(`Job '${key}' must have a docker image`);
    }

    if (!job.steps || job.steps.length === 0) {
      errors.push(`Job '${key}' must have at least one step`);
    } else {
      job.steps.forEach((step, i) => {
        if (!step.run || step.run.trim() === "") {
          errors.push(`Job '${key}' has invalid step at index ${i}`);
        }
      });
    }

    if (job.depends_on) {
      if (!Array.isArray(job.depends_on)) {
        errors.push(`Job '${key}' depends_on must be an array`);
      } else {
        const seen = new Set<string>();
        for (const dep of job.depends_on) {
          if (seen.has(dep)) {
            errors.push(`Job '${key}' has duplicate dependency '${dep}'`);
          }
          seen.add(dep);
        }
      }
    }
  }

  private checkDependencies(
    jobs: Record<string, WorkflowJobDefinition>,
    errors: string[]
  ) {
    for (const [key, job] of Object.entries(jobs)) {
      if (!job.depends_on) continue;

      for (const dep of job.depends_on) {
        if (!jobs[dep]) {
          errors.push(`Job '${key}' depends on unknown job '${dep}'`);
        }

        if (dep === key) {
          errors.push(`Job '${key}' cannot depend on itself`);
        }
      }
    }
  }

  private checkCycles(
    jobs: Record<string, WorkflowJobDefinition>,
    errors: string[]
  ) {
    const visited = new Set<string>();
    const stack = new Set<string>();

    const dfs = (id: string, path: string[]) => {
      if (stack.has(id)) {
        const start = path.indexOf(id);
        const cycle = path.slice(start).concat(id);
        errors.push(`Circular dependency detected: ${cycle.join(" -> ")}`);
        return;
      }

      if (visited.has(id)) return;

      stack.add(id);
      path.push(id);

      const deps = jobs[id].depends_on || [];
      for (const dep of deps) {
        if (jobs[dep]) {
          dfs(dep, path);
        }
      }

      stack.delete(id);
      visited.add(id);
      path.pop();
    };

    for (const id of Object.keys(jobs)) {
      if (!visited.has(id)) {
        dfs(id, []);
      }
    }
  }
}
