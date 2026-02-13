import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  instruments,
  positions,
  watchlistItems,
  watchlists,
} from "@/lib/db/schema";
import { realTimeMarketService } from "@/services/realtime-market.service";

export const dynamic = "force-dynamic";

const INDEX_SYMBOLS = ["NIFTY 50", "NIFTY BANK", "NIFTY FIN SERVICE"] as const;

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await realTimeMarketService.initialize();

    const [watchlistRows, positionRows] = await Promise.all([
      db
        .select({
          symbol: instruments.tradingsymbol,
          instrumentKey: instruments.instrumentToken,
        })
        .from(watchlists)
        .innerJoin(watchlistItems, eq(watchlists.id, watchlistItems.watchlistId))
        .innerJoin(instruments, eq(watchlistItems.instrumentToken, instruments.instrumentToken))
        .where(eq(watchlists.userId, session.user.id)),
      db
        .select({
          symbol: positions.symbol,
          instrumentKey: instruments.instrumentToken,
        })
        .from(positions)
        .leftJoin(instruments, eq(positions.symbol, instruments.tradingsymbol))
        .where(eq(positions.userId, session.user.id)),
    ]);

    const requestKeys = Array.from(
      new Set([
        ...watchlistRows.map((row) => row.symbol),
        ...watchlistRows.map((row) => row.instrumentKey),
        ...positionRows.map((row) => row.symbol),
        ...positionRows.map((row) => row.instrumentKey),
        ...INDEX_SYMBOLS,
      ].filter(Boolean) as string[])
    );

    await realTimeMarketService.warmSnapshotForSymbols(requestKeys);
    const quotes = realTimeMarketService.getSnapshotForSymbols(requestKeys);

    return NextResponse.json({
      success: true,
      data: {
        symbols: requestKeys,
        quotes,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to load market snapshot",
      },
      { status: 500 }
    );
  }
}
