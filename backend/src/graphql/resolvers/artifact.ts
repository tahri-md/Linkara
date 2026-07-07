import { artifactService } from "../../services/ArtifactService.js";
import type { JobArtifact } from "../../services/ArtifactService.js";
import { userCanAccessJob } from "./job.js"; // export this if it isn't already

interface JobArtifactsArgs {
  jobId: string;
}

interface Context {
  userId?: string;
}

export const artifactResolvers = {
  Query: {
    async jobArtifacts(
      _: unknown,
      args: JobArtifactsArgs,
      context: Context,
    ): Promise<JobArtifact[]> {
      if (!context.userId) {
        throw new Error("Authentication required");
      }

      const canAccess = await userCanAccessJob(context.userId, args.jobId);
      if (!canAccess) {
        throw new Error(
          "You do not have permission to access artifacts for this job",
        );
      }

      return artifactService.getArtifacts(args.jobId);
    },
  },
};