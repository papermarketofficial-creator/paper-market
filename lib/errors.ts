import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { logger } from "./logger";
import { config } from "./config";

export class ApiError extends Error {
    public readonly statusCode: number;
    public readonly code: string;

    constructor(message: string, statusCode: number = 500, code: string = "INTERNAL_SERVER_ERROR") {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.name = "ApiError";
    }
}

interface ErrorResponse {
    success: false;
    error: {
        code: string;
        message: string;
        details?: unknown; // For Validation Errors
    };
}

export function handleError(error: unknown): NextResponse<ErrorResponse> {
    // 1. Handle Known ApiError
    if (error instanceof ApiError) {
        logger.warn({ err: error }, `ApiError: ${error.message}`);
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: error.code,
                    message: error.message,
                },
            },
            { status: error.statusCode }
        );
    }

    // 2. Handle Zod Validation Errors
    if (error instanceof ZodError) {
        logger.warn({ err: error }, "Validation Error");
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: "VALIDATION_ERROR",
                    message: "Invalid request data",
                    details: error.errors,
                },
            },
            { status: 400 }
        );
    }

    // 3. Handle Unexpected Errors
    logger.error({ err: error }, "Unhandled Exception");

    return NextResponse.json(
        {
            success: false,
            error: {
                code: "INTERNAL_SERVER_ERROR",
                message: config.isDev && error instanceof Error ? error.message : "An unexpected error occurred.",
            },
        },
        { status: 500 }
    );
}
