import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ApiError, handleError } from "@/lib/errors";
import { OptionStrategyPreviewSchema } from "@/lib/validation/options-strategy";
import { OptionsStrategyService } from "@/services/options-strategy.service";

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        }

        const body = await req.json();
        const input = OptionStrategyPreviewSchema.parse(body);
        const preview = await OptionsStrategyService.previewStrategy(
            session.user.id,
            input
        );

        return NextResponse.json({
            success: true,
            data: preview,
        });
    } catch (error) {
        return handleError(error);
    }
}
