/**
 * GET /api/v1/watchlists
 * Get all watchlists for the authenticated user
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { WatchlistService } from '@/services/watchlist.service';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let watchlists = await WatchlistService.getUserWatchlists(session.user.id);

    // Self-heal first-load users: always provide one default watchlist.
    if (watchlists.length === 0) {
      try {
        await WatchlistService.createDefaultWatchlist(session.user.id);
      } catch (error: any) {
        // Another concurrent request may have created it already.
        if (error?.code !== '23505') {
          throw error;
        }
      }
      watchlists = await WatchlistService.getUserWatchlists(session.user.id);
    }

    // Self-heal existing users: if default exists but has no items, backfill it.
    const emptyDefault = watchlists.find(
      (w) => w.isDefault && Number(w.instrumentCount ?? 0) === 0
    );
    if (emptyDefault) {
      await WatchlistService.seedWatchlistIfEmpty(emptyDefault.id, session.user.id);
      watchlists = await WatchlistService.getUserWatchlists(session.user.id);
    }

    return NextResponse.json({
      success: true,
      data: watchlists,
    });
  } catch (error) {
    logger.error({ err: error }, 'GET /api/v1/watchlists failed');
    return NextResponse.json(
      { error: 'Failed to fetch watchlists' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/watchlists
 * Create a new watchlist
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Watchlist name is required' },
        { status: 400 }
      );
    }

    const watchlist = await WatchlistService.createWatchlist(
      session.user.id,
      name.trim()
    );

    return NextResponse.json({
      success: true,
      data: watchlist,
    });
  } catch (error) {
    logger.error({ err: error }, 'POST /api/v1/watchlists failed');
    return NextResponse.json(
      { error: 'Failed to create watchlist' },
      { status: 500 }
    );
  }
}
