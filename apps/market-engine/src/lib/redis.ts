import { Redis } from "@upstash/redis";
import { logger } from "./logger.js";

let redisClient: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (redisClient !== undefined) {
    return redisClient;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!url || !token) {
    redisClient = null;
    return redisClient;
  }

  try {
    redisClient = new Redis({ url, token });
  } catch (error) {
    logger.warn({ err: error }, "Failed to initialize Upstash Redis client");
    redisClient = null;
  }

  return redisClient;
}
