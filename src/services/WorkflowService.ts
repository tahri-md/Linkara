import { query } from '../db/connection.js';
import {
  Workflow,
  CreateWorkflowInput,
  UpdateWorkflowInput,
  WorkflowResponse,
  WorkflowListResponse,
  WorkflowDefinition,
} from '../models/Workflow.js';
import { WorkflowValidator } from './WorkflowValidator.js';

export class WorkflowService {
  private validator = new WorkflowValidator();

  async createWorkflow(
    orgId: string,
    userId: string,
    input: CreateWorkflowInput
  ): Promise<WorkflowResponse> {
    const validation = this.validator.validate(input.definition);
    if (!validation.isValid) {
      throw new Error(`Invalid workflow definition: ${validation.errors.join(', ')}`);
    }

    const existingResult = await query(
      `SELECT id FROM workflows WHERE org_id = $1 AND name = $2`,
      [orgId, input.name]
    );

    if (existingResult.rows.length > 0) {
      throw new Error(`Workflow with name "${input.name}" already exists in this organization`);
    }

    const result = await query(
      `INSERT INTO workflows (org_id, name, description, definition, triggers, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING id, org_id, name, description, definition, triggers, is_active, created_by, created_at, updated_at`,
      [
        orgId,
        input.name,
        input.description || null,
        JSON.stringify(input.definition),
        JSON.stringify(input.triggers || []),
        input.is_active ?? true,
        userId,
      ]
    );

    await this.logAuditEvent(
      orgId,
      userId,
      'workflow.created',
      { workflow_id: result.rows[0].id, name: input.name }
    );

    return this.formatWorkflow(result.rows[0]);
  }

  async getWorkflow(workflowId: string, orgId: string): Promise<WorkflowResponse | null> {
    const result = await query(
      `SELECT id, org_id, name, description, definition, triggers, is_active, created_by, created_at, updated_at
       FROM workflows
       WHERE id = $1 AND org_id = $2`,
      [workflowId, orgId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.formatWorkflow(result.rows[0]);
  }

  async listWorkflows(
    orgId: string,
    activeOnly: boolean = false,
    limit: number = 50,
    offset: number = 0
  ): Promise<WorkflowListResponse> {
    const whereClause = activeOnly ? 'WHERE org_id = $1 AND is_active = true' : 'WHERE org_id = $1';

    const countResult = await query(
      `SELECT COUNT(*) as count FROM workflows ${whereClause}`,
      [orgId]
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const result = await query(
      `SELECT id, org_id, name, description, definition, triggers, is_active, created_by, created_at, updated_at
       FROM workflows
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [orgId, limit, offset]
    );

    return {
      data: result.rows.map((row) => this.formatWorkflow(row)),
      total,
    };
  }

  async updateWorkflow(
    workflowId: string,
    orgId: string,
    userId: string,
    input: UpdateWorkflowInput
  ): Promise<WorkflowResponse> {
    const currentWorkflow = await this.getWorkflow(workflowId, orgId);
    if (!currentWorkflow) {
      throw new Error('Workflow not found');
    }

    if (input.definition) {
      const validation = this.validator.validate(input.definition);
      if (!validation.isValid) {
        throw new Error(`Invalid workflow definition: ${validation.errors.join(', ')}`);
      }
    }

    if (input.name && input.name !== currentWorkflow.name) {
      const existingResult = await query(
        `SELECT id FROM workflows WHERE org_id = $1 AND name = $2 AND id != $3`,
        [orgId, input.name, workflowId]
      );
      if (existingResult.rows.length > 0) {
        throw new Error(`Workflow with name "${input.name}" already exists in this organization`);
      }
    }

    const updates: string[] = [];
    const params: any[] = [];
    let paramCount = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      params.push(input.name);
    }

    if (input.description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      params.push(input.description);
    }

    if (input.definition !== undefined) {
      updates.push(`definition = $${paramCount++}`);
      params.push(JSON.stringify(input.definition));
    }

    if (input.triggers !== undefined) {
      updates.push(`triggers = $${paramCount++}`);
      params.push(JSON.stringify(input.triggers));
    }

    if (input.is_active !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      params.push(input.is_active);
    }

    updates.push(`updated_at = NOW()`);

    if (updates.length === 1) {
      return currentWorkflow;
    }

    params.push(workflowId);
    params.push(orgId);

    const updateQuery = `
      UPDATE workflows
      SET ${updates.join(', ')}
      WHERE id = $${paramCount + 1} AND org_id = $${paramCount + 2}
      RETURNING id, org_id, name, description, definition, triggers, is_active, created_by, created_at, updated_at
    `;

    const result = await query(updateQuery, params);

    if (result.rows.length === 0) {
      throw new Error('Failed to update workflow');
    }

    await this.logAuditEvent(
      orgId,
      userId,
      'workflow.updated',
      { workflow_id: workflowId, changes: input }
    );

    return this.formatWorkflow(result.rows[0]);
  }

  async deleteWorkflow(
    workflowId: string,
    orgId: string,
    userId: string,
    hardDelete: boolean = false
  ): Promise<boolean> {
    const workflow = await this.getWorkflow(workflowId, orgId);
    if (!workflow) {
      throw new Error('Workflow not found');
    }

    if (hardDelete) {
      const result = await query(
        `DELETE FROM workflows WHERE id = $1 AND org_id = $2`,
        [workflowId, orgId]
      );

      if (result.rowCount === 0) {
        throw new Error('Failed to delete workflow');
      }

      await this.logAuditEvent(orgId, userId, 'workflow.deleted', {
        workflow_id: workflowId,
        name: workflow.name,
        permanently: true,
      });
    } else {
      const result = await query(
        `UPDATE workflows SET is_active = false, updated_at = NOW() WHERE id = $1 AND org_id = $2`,
        [workflowId, orgId]
      );

      if (result.rowCount === 0) {
        throw new Error('Failed to delete workflow');
      }

      await this.logAuditEvent(orgId, userId, 'workflow.deleted', {
        workflow_id: workflowId,
        name: workflow.name,
        permanently: false,
      });
    }

    return true;
  }

  async restoreWorkflow(
    workflowId: string,
    orgId: string,
    userId: string
  ): Promise<WorkflowResponse> {
    const result = await query(
      `UPDATE workflows
       SET is_active = true, updated_at = NOW()
       WHERE id = $1 AND org_id = $2 AND is_active = false
       RETURNING id, org_id, name, description, definition, triggers, is_active, created_by, created_at, updated_at`,
      [workflowId, orgId]
    );

    if (result.rows.length === 0) {
      throw new Error('Workflow not found or is already active');
    }

    await this.logAuditEvent(orgId, userId, 'workflow.restored', {
      workflow_id: workflowId,
      name: result.rows[0].name,
    });

    return this.formatWorkflow(result.rows[0]);
  }

  private async logAuditEvent(
    orgId: string,
    userId: string,
    action: string,
    metadata: Record<string, any>
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO audit_logs (org_id, user_id, action, changes, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [orgId, userId, action, JSON.stringify(metadata)]
      );
    } catch (err) {
      console.error('Failed to log audit event:', err);
    }
  }

  private formatWorkflow(row: any): WorkflowResponse {
    return {
      id: row.id,
      org_id: row.org_id,
      name: row.name,
      description: row.description,
      definition: typeof row.definition === 'string' ? JSON.parse(row.definition) : row.definition,
      triggers: typeof row.triggers === 'string' ? JSON.parse(row.triggers) : row.triggers,
      is_active: row.is_active,
      created_by: row.created_by,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }
}

export const workflowService = new WorkflowService();
