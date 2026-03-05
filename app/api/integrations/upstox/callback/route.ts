
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { UpstoxService } from "@/services/upstox.service";

export async function GET(req: NextRequest) {
  // Hard debugging: Log everything
  console.log("🔥 Upstox Callback HIT!");
  
  const session = await auth();
  if (!session?.user?.id) {
    console.error("❌ Upstox Callback: No Session Found");
    return NextResponse.json({ error: "Unauthorized - Please Login First" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL("/admin/upstox?status=error&message=" + error, req.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/admin/upstox?status=error&message=No+code+provided", req.url));
  }

  try {
    await UpstoxService.generateToken(code, session.user.id);
    console.log("✅ Upstox Token Generated Successfully for user:", session.user.id);
    return NextResponse.redirect(new URL("/admin/upstox?status=success", req.url));
  } catch (err: any) {
    console.error("Upstox Callback Error:", err);
    return NextResponse.redirect(new URL("/admin/upstox?status=error&message=" + encodeURIComponent(err.message), req.url));
  }
}
