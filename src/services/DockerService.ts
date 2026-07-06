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
  repoUrl: string;
  ref: string;
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
    sourceVolume: string,
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
          Binds: [`${sourceVolume}:${options.workingDir || "/app"}`],
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
    console.log(
      `[docker] Waiting for container: ${container.id} (timeout: ${timeoutMs}ms)`,
    );

    let timer: NodeJS.Timeout | undefined;

    try {
      const result = await Promise.race([
        container.wait() as Promise<{ StatusCode: number }>,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            container.kill().catch(console.error);
            reject(new Error(`Container execution timeout (${timeoutMs}ms)`));
          }, timeoutMs);
        }),
      ]);

      console.log(`[docker] Container exited with code: ${result.StatusCode}`);
      return result.StatusCode;
    } catch (err) {
      console.error(`[docker] Wait container error:`, err);
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
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
  async checkoutRepo(repoUrl: string, ref: string, volumeName: string): Promise<void> {
    console.log(`[docker] Checking out ${repoUrl}@${ref} into volume ${volumeName}`);

    // Defensive: a prior attempt with the same jobId may have left a populated
    // volume behind (e.g. crash between checkout and cleanup). Wipe it first
    // so retries always start from a clean, empty volume.
    await this.removeVolume(volumeName);

    await docker.createVolume({ Name: volumeName });

    await this.pullImage("alpine/git:latest");

    const cloneContainer = await docker.createContainer({
      Image: "alpine/git:latest",
      Cmd: ["clone", "--depth", "1", "--branch", ref, repoUrl, "/repo"],
      HostConfig: {
        Binds: [`${volumeName}:/repo`],
      },
    });

    try {
      await cloneContainer.start();
      const waitResult: any = await cloneContainer.wait();
      if (waitResult.StatusCode !== 0) {
        const rawLogs = (await cloneContainer.logs({
          stdout: true,
          stderr: true,
        })) as Buffer;
        const logs = this.demuxToString(rawLogs);
        throw new Error(
          `git clone failed (exit ${waitResult.StatusCode}): ${logs}`,);
      }
    } finally {
      await cloneContainer.remove({ force: true }).catch(console.error);
    }

    console.log(`[docker] Checkout complete: ${volumeName}`);
  }
  private demuxToString(buffer: Buffer): string {
    let result = "";
    let offset = 0;
    while (offset + 8 <= buffer.length) {
      const frameSize = buffer.readUInt32BE(offset + 4);
      const start = offset + 8;
      const end = start + frameSize;
      result += buffer.subarray(start, end).toString("utf8");
      offset = end;
    }
    return result;
  }
  async removeVolume(volumeName: string): Promise<void> {
    try {
      const volume = docker.getVolume(volumeName);
      await volume.remove({ force: true });
      console.log(`[docker] Volume removed: ${volumeName}`);
    } catch (err) {
      console.error(`[docker] Remove volume error (${volumeName}):`, err);
    }
  }
  private demuxBuffer(buffer: Buffer): { stdout: string; stderr: string } {
    let stdout = "";
    let stderr = "";
    let offset = 0;
    while (offset + 8 <= buffer.length) {
      const streamType = buffer.readUInt8(offset);
      const frameSize = buffer.readUInt32BE(offset + 4);
      const start = offset + 8;
      const end = start + frameSize;
      const text = buffer.subarray(start, end).toString("utf8");
      if (streamType === 2) {
        stderr += text;
      } else {
        stdout += text;
      }
      offset = end;
    }
    return { stdout, stderr };
  }

  private async collectLogs(
    container: Docker.Container,
    jobId: string,
  ): Promise<{ stdout: string; stderr: string }> {
    try {
      // follow:false — the container has already exited (we only call this
      // after waitForContainer resolves), so this is a single, finite fetch
      // that always terminates. No more racing an indefinite follow-stream.
      const rawLogs = (await container.logs({
        stdout: true,
        stderr: true,
        follow: false,
        timestamps: false,
      })) as Buffer;

      const { stdout, stderr } = this.demuxBuffer(rawLogs);

      if (stdout) await logStreamService.appendChunk(jobId, stdout, "stdout");
      if (stderr) await logStreamService.appendChunk(jobId, stderr, "stderr");
      await logStreamService.flush(jobId);

      return { stdout, stderr };
    } catch (err) {
      console.error(`[docker] Collect output error:`, err);
      throw err;
    }
  }
  async executeJob(
    options: ContainerCreateOptions,
  ): Promise<ContainerExecutionResult> {
    let container: Docker.Container | null = null;
    const sourceVolume = `linkara-src-${options.jobId}`;

    try {
      await this.pullImage(options.image);
      await this.checkoutRepo(options.repoUrl, options.ref, sourceVolume);
      container = await this.createContainer(options, sourceVolume); await this.startContainer(container);

      // const outputPromise = this.streamContainerOutput(
      //   container,
      //   options.jobId,
      // );

      const exitCode = await this.waitForContainer(container, options.timeout);
      // const { stdout, stderr } = await outputPromise;
      const { stdout, stderr } = await this.collectLogs(container, options.jobId);
      return {
        exitCode,
        stdout,
        stderr,
      };
    } finally {
      if (container) {
        await this.removeContainer(container);
      }
      await this.removeVolume(sourceVolume);
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
