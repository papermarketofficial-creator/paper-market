
import { NextRequest, NextResponse } from "next/server";
import { realTimeMarketService } from "@/services/realtime-market.service";
import { auth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) { // Allow any logged in user for now, ideally admin only
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { action, symbols } = await req.json();

  try {
      if (action === "start") {
          const defaultSymbols = ["RELIANCE", "SBIN", "INFY", "TCS", "HDFCBANK"];
          const subs = symbols || defaultSymbols;
          
          realTimeMarketService.subscribe(subs);
          
          return NextResponse.json({ 
              status: "started", 
              message: `Stream started for ${subs.join(", ")}` 
          });
      }
      
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
