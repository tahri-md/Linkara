import { query } from "../db/connection.js";

export interface JobArtifact {
  id: string;
  job_id: string;
  name: string;
  file_path: string;
  file_size_bytes: number;
  s3_url?: string;
  uploaded_at: Date;
}

export interface ArtifactMetadata {
  name: string;
  filePath: string;
  fileSizeBytes: number;
  s3Url?: string;
}

export class ArtifactService {
  async storeArtifact(
    jobId: string,
    metadata: ArtifactMetadata,
  ): Promise<JobArtifact> {
    try {
      console.log(
        `[artifacts] Storing artifact for job ${jobId}: ${metadata.name}`,
      );

      const result = await query(
        `INSERT INTO job_artifacts (job_id, name, file_path, file_size_bytes, s3_url, uploaded_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING id, job_id, name, file_path, file_size_bytes, s3_url, uploaded_at`,
        [
          jobId,
          metadata.name,
          metadata.filePath,
          metadata.fileSizeBytes,
          metadata.s3Url || null,
        ],
      );

      console.log(`[artifacts] Artifact stored: ${result.rows[0].id}`);
      return result.rows[0] as JobArtifact;
    } catch (err) {
      console.error(`[artifacts] Store artifact error:`, err);
      throw err;
    }
  }

  async getArtifacts(jobId: string): Promise<JobArtifact[]> {
    try {
      const result = await query(
        `SELECT id, job_id, name, file_path, file_size_bytes, s3_url, uploaded_at
         FROM job_artifacts
         WHERE job_id = $1
         ORDER BY uploaded_at DESC`,
        [jobId],
      );

      return result.rows as JobArtifact[];
    } catch (err) {
      console.error(`[artifacts] Get artifacts error:`, err);
      throw err;
    }
  }

  async deleteArtifacts(jobId: string): Promise<void> {
    try {
      console.log(`[artifacts] Deleting artifacts for job ${jobId}`);

      await query(`DELETE FROM job_artifacts WHERE job_id = $1`, [jobId]);

      console.log(`[artifacts] Artifacts deleted for job ${jobId}`);
    } catch (err) {
      console.error(`[artifacts] Delete artifacts error:`, err);
      throw err;
    }
  }

  async collectArtifacts(
    jobId: string,
    containerLogs: string,
  ): Promise<ArtifactMetadata[]> {
    const artifacts: ArtifactMetadata[] = [];

    try {
      console.log(`[artifacts] Collecting artifacts from container logs`);

      const artifactPattern = /ARTIFACT:\s+(\S+)\s+(\d+)\s+(\S*)/g;
      let match;

      while ((match = artifactPattern.exec(containerLogs)) !== null) {
        artifacts.push({
          name: match[1],
          fileSizeBytes: parseInt(match[2], 10),
          filePath: match[3] || "",
          s3Url: undefined,
        });
      }

      console.log(`[artifacts] Found ${artifacts.length} artifacts`);

      for (const artifact of artifacts) {
        await this.storeArtifact(jobId, artifact);
      }

      return artifacts;
    } catch (err) {
      console.error(`[artifacts] Collect artifacts error:`, err);
      throw err;
    }
  }

  async getArtifactSize(jobId: string): Promise<number> {
    try {
      const result = await query(
        `SELECT COALESCE(SUM(file_size_bytes), 0) as total_size
         FROM job_artifacts
         WHERE job_id = $1`,
        [jobId],
      );

      return parseInt(result.rows[0].total_size, 10);
    } catch (err) {
      console.error(`[artifacts] Get artifact size error:`, err);
      throw err;
    }
  }
}

export const artifactService = new ArtifactService();
