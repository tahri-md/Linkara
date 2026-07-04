import Docker from "dockerode";
import { PassThrough } from "stream";
import { logStreamService } from "./LogStreamService.js";

function createDockerClient(): Docker {
  const dockerHost = process.env.DOCKER_HOST;

  // No DOCKER_HOST, or an explicit unix:// socket -> use socketPath
  if (!dockerHost || dockerHost.startsWith("unix://")) {
    const socketPath = dockerHost
      ? dockerHost.replace("unix://", "")
      : "/var/run/docker.sock";
    return new Docker({ socketPath });
  }

  // TCP daemon, e.g. tcp://1.2.3.4:2375
  const url = new URL(dockerHost);
  return new Docker({
    host: url.hostname,
    port: url.port ? parseInt(url.port, 10) : 2375,
    protocol: url.protocol.replace(":", "") as "http" | "https",
  });
}

const docker = createDockerClient();

export interface ContainerCreateOptions {
  jobId: string;
  image: string;
  cmd: string[];
  env?: Record<string, string>;
  workingDir?: string;
  timeout?: number;
}

export interface ContainerExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export class DockerService {
  async pullImage(image: string): Promise<void> {
    try {
      console.log(`[docker] Pulling image: ${image}`);
      const stream = await docker.pull(image);

      return new Promise((resolve, reject) => {
        docker.modem.followProgress(
          stream,
          (err: any) => {
            if (err) {
              console.error(`[docker] Failed to pull image ${image}:`, err);
              reject(new Error(`Failed to pull Docker image: ${err.message}`));
            } else {
              console.log(`[docker] Image pulled successfully: ${image}`);
              resolve();
            }
          },
          (output: any) => {
            console.log(`[docker] Pull progress:`, output);
          },
        );
      });
    } catch (err) {
      console.error(`[docker] Pull image error:`, err);
      throw err;
    }
  }

  async createContainer(
    options: ContainerCreateOptions,
  ): Promise<Docker.Container> {
    try {
      console.log(`[docker] Creating container from image: ${options.image}`);

      const envArray = options.env
        ? Object.entries(options.env).map(([key, value]) => `${key}=${value}`)
        : [];

      const container = await docker.createContainer({
        Image: options.image,
        Cmd: options.cmd,
        Env: envArray,
        WorkingDir: options.workingDir || "/app",
        AttachStdout: true,
        AttachStderr: true,
        HostConfig: {
          Memory: 512 * 1024 * 1024,
          CpuQuota: 100000,
          CpuPeriod: 100000,
          // Prevent containers from making arbitrary outbound network calls,
          // which would allow exfiltration of injected secrets.
          NetworkMode: "bridge",
          // Drop all Linux capabilities; grant back only what's needed
          CapDrop: ["ALL"],
          // Read-only root filesystem prevents tampering with the image
          ReadonlyRootfs: false, // set to true if your jobs don't need writes
          // Prevent privilege escalation inside the container
          SecurityOpt: ["no-new-privileges"],
        },
      });

      console.log(`[docker] Container created: ${container.id}`);
      return container;
    } catch (err) {
      console.error(`[docker] Create container error:`, err);
      throw err;
    }
  }

  async startContainer(container: Docker.Container): Promise<void> {
    try {
      console.log(`[docker] Starting container: ${container.id}`);
      await container.start();
      console.log(`[docker] Container started: ${container.id}`);
    } catch (err) {
      console.error(`[docker] Start container error:`, err);
      throw err;
    }
  }

  async waitForContainer(
    container: Docker.Container,
    timeoutMs: number = 3600000,
  ): Promise<number> {
    try {
      console.log(
        `[docker] Waiting for container: ${container.id} (timeout: ${timeoutMs}ms)`,
      );

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          container.kill().catch(console.error);
          reject(new Error(`Container execution timeout (${timeoutMs}ms)`));
        }, timeoutMs);

        container.wait((err: any, result: any) => {
          clearTimeout(timer);
          if (err) {
            reject(err);
          } else {
            console.log(
              `[docker] Container exited with code: ${result.StatusCode}`,
            );
            resolve(result.StatusCode);
          }
        });
      });
    } catch (err) {
      console.error(`[docker] Wait container error:`, err);
      throw err;
    }
  }

  private async streamContainerOutput(
    container: Docker.Container,
    jobId: string,
  ): Promise<{ stdout: string; stderr: string }> {
    try {
      const output = (await container.logs({
        stdout: true,
        stderr: true,
        follow: true,
        timestamps: false,
      })) as NodeJS.ReadableStream;

      const stdoutStream = new PassThrough();
      const stderrStream = new PassThrough();
      docker.modem.demuxStream(output, stdoutStream, stderrStream);

      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];
      const logWrites: Promise<unknown>[] = [];

      const stdoutDone = new Promise<void>((resolve, reject) => {
        stdoutStream.on("data", (chunk: Buffer) => {
          const text = chunk.toString("utf8");
          stdoutChunks.push(text);
          logWrites.push(logStreamService.appendChunk(jobId, text, "stdout"));
        });
        stdoutStream.on("end", () => resolve());
        stdoutStream.on("error", (err) => reject(err));
      });

      const stderrDone = new Promise<void>((resolve, reject) => {
        stderrStream.on("data", (chunk: Buffer) => {
          const text = chunk.toString("utf8");
          stderrChunks.push(text);
          logWrites.push(logStreamService.appendChunk(jobId, text, "stderr"));
        });
        stderrStream.on("end", () => resolve());
        stderrStream.on("error", (err) => reject(err));
      });

      await Promise.all([stdoutDone, stderrDone]);
      await Promise.all(logWrites);

      const stdout = stdoutChunks.join("");
      const stderr = stderrChunks.join("");

      await logStreamService.flush(jobId);

      return { stdout, stderr };
    } catch (err) {
      console.error(`[docker] Collect output error:`, err);
      throw err;
    }
  }

  async removeContainer(container: Docker.Container): Promise<void> {
    try {
      console.log(`[docker] Removing container: ${container.id}`);
      await container.remove({ force: true });
      console.log(`[docker] Container removed: ${container.id}`);
    } catch (err) {
      console.error(`[docker] Remove container error:`, err);
      throw err;
    }
  }

  async executeJob(
    options: ContainerCreateOptions,
  ): Promise<ContainerExecutionResult> {
    let container: Docker.Container | null = null;

    try {
      await this.pullImage(options.image);
      container = await this.createContainer(options);
      await this.startContainer(container);

      const outputPromise = this.streamContainerOutput(
        container,
        options.jobId,
      );

      const exitCode = await this.waitForContainer(container, options.timeout);
      const { stdout, stderr } = await outputPromise;

      return {
        exitCode,
        stdout,
        stderr,
      };
    } finally {
      if (container) {
        await this.removeContainer(container);
      }
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await docker.ping();
      return true;
    } catch (err) {
      console.error("[docker] Health check failed:", err);
      return false;
    }
  }
}

export const dockerService = new DockerService();
