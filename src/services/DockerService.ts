import Docker from 'dockerode';

const docker = new Docker({
  host: process.env.DOCKER_HOST || 'unix:///var/run/docker.sock',
  port: process.env.DOCKER_PORT ? parseInt(process.env.DOCKER_PORT, 10) : undefined,
});

export interface ContainerCreateOptions {
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
          }
        );
      });
    } catch (err) {
      console.error(`[docker] Pull image error:`, err);
      throw err;
    }
  }

  async createContainer(options: ContainerCreateOptions): Promise<Docker.Container> {
    try {
      console.log(`[docker] Creating container from image: ${options.image}`);

      const envArray = options.env
        ? Object.entries(options.env).map(([key, value]) => `${key}=${value}`)
        : [];

      const container = await docker.createContainer({
        Image: options.image,
        Cmd: options.cmd,
        Env: envArray,
        WorkingDir: options.workingDir || '/app',
        AttachStdout: true,
        AttachStderr: true,
        HostConfig: {
          Memory: 512 * 1024 * 1024,
          CpuQuota: 100000,
          CpuPeriod: 100000,
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
    timeoutMs: number = 3600000
  ): Promise<number> {
    try {
      console.log(`[docker] Waiting for container: ${container.id} (timeout: ${timeoutMs}ms)`);

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
            console.log(`[docker] Container exited with code: ${result.StatusCode}`);
            resolve(result.StatusCode);
          }
        });
      });
    } catch (err) {
      console.error(`[docker] Wait container error:`, err);
      throw err;
    }
  }

  async getLogs(container: Docker.Container): Promise<string> {
    try {
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        follow: false,
      });

      return logs.toString('utf-8');
    } catch (err) {
      console.error(`[docker] Get logs error:`, err);
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

  async executeJob(options: ContainerCreateOptions): Promise<ContainerExecutionResult> {
    let container: Docker.Container | null = null;

    try {
      await this.pullImage(options.image);
      container = await this.createContainer(options);
      await this.startContainer(container);

      const exitCode = await this.waitForContainer(container, options.timeout);
      const logs = await this.getLogs(container);

      return {
        exitCode,
        stdout: logs,
        stderr: logs,
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
      console.error('[docker] Health check failed:', err);
      return false;
    }
  }
}

export const dockerService = new DockerService();
