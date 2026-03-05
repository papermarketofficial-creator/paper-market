import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { DashboardService } from "@/services/dashboard.service";
import { handleError, ApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
    }

    const overview = await DashboardService.getOverview(session.user.id);

    return NextResponse.json({
      success: true,
      data: overview,
    });
  } catch (error) {
    return handleError(error);
  }
}
