import pino from "pino";
import { config } from "./config";

export const logger = pino({
    level: config.isDev ? "debug" : "info",
    // transport: config.isDev
    //     ? {
    //         target: "pino-pretty",
    //         options: {
    //             colorize: true,
    //             ignore: "pid,hostname",
    //             translateTime: "SYS:standard",
    //         },
    //     }
    //     : undefined,
    redact: {
        paths: [
            "password",
            "token",
            "accessToken",
            "refreshToken",
            "secret",
            "apiKey",
            "auth.secret",
            "upstox.apiSecret",
            "redis.token"
        ],
        remove: true,
    },
    serializers: {
        err: pino.stdSerializers.err,
        error: pino.stdSerializers.err,
    },
});
