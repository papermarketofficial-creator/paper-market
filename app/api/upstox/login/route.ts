
import { NextRequest, NextResponse } from "next/server";
import { UpstoxService } from "@/services/upstox.service";

export async function GET(req: NextRequest) {
  // Redirect user to Upstox Auth Dialog
  const url = UpstoxService.getAuthUrl();
  console.log("Redirecting to Upstox Auth:", url);
  return NextResponse.redirect(url);
}
