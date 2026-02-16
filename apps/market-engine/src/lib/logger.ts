import pino from "pino";

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
    level: isDev ? "debug" : "info",
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
