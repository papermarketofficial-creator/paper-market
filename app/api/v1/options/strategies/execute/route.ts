import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ApiError, handleError } from "@/lib/errors";
import { OptionStrategyExecuteSchema } from "@/lib/validation/options-strategy";
import { OptionsStrategyService } from "@/services/options-strategy.service";

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        }

        const body = await req.json();
        const input = OptionStrategyExecuteSchema.parse(body);
        const result = await OptionsStrategyService.executeStrategy(
            session.user.id,
            input
        );

        return NextResponse.json({
            success: true,
            data: result,
        });
    } catch (error) {
        return handleError(error);
    }
}
