import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { handleError, ApiError } from "@/lib/errors";
import { AdminSyncTriggerSchema } from "@/lib/validation/instruments";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
    try {
        // Auth check
        const session = await auth();
        if (!session?.user) {
            throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        }

        // Validate input
        const body = await req.json();
        const validated = AdminSyncTriggerSchema.parse(body);

        logger.info(
            { userId: session.user.id, force: validated.force },
            "Admin sync triggered"
        );

        // TODO: Implement actual sync logic in Phase 4.2 (Seeder Script)
        // For now, return a placeholder response
        return NextResponse.json({
            success: true,
            data: {
                message: "Sync endpoint ready. Seeder implementation pending.",
                force: validated.force,
            },
        });
    } catch (error) {
        return handleError(error);
    }
}
