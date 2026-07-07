import { Redis } from "ioredis";
import { redisConfig } from "../config/queue.js";

export const redis = new Redis({
  host: redisConfig.host,
  port: redisConfig.port,
  password: redisConfig.password,
  db: redisConfig.db,
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

redis.on("connect", () => {
  console.log("[queue:redis] Connected");
});

redis.on("ready", () => {
  console.log("[queue:redis] Ready");
});

redis.on("error", (err) => {
  console.error("[queue:redis] Connection error:", err);
});

redis.on("close", () => {
  console.warn("[queue:redis] Connection closed");
});

export async function testRedisConnection(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === "PONG";
  } catch (err) {
    console.error("[queue:redis] Ping failed:", err);
    return false;
  }
}

export async function closeRedisConnection(): Promise<void> {
  await redis.quit();
}
