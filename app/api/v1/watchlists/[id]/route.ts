/**
 * GET /api/v1/watchlists/:id/instruments
 * Get watchlist with instruments
 * 
 * DELETE /api/v1/watchlists/:id
 * Delete a watchlist
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { WatchlistService } from '@/services/watchlist.service';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const watchlist = await WatchlistService.getWatchlistWithInstruments(
      id,
      session.user.id
    );

    return NextResponse.json({
      success: true,
      data: watchlist,
    });
  } catch (error: any) {
    const { id } = await params; // Ensure id is available
    logger.error({ err: error, watchlistId: id }, 'GET /api/v1/watchlists/:id failed');
    
    if (error.message?.includes('not found') || error.message?.includes('access denied')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(
      { error: 'Failed to fetch watchlist' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await WatchlistService.deleteWatchlist(id, session.user.id);

    return NextResponse.json({
      success: true,
      message: 'Watchlist deleted',
    });
  } catch (error: any) {
    const { id } = await params;
    logger.error({ err: error, watchlistId: id }, 'DELETE /api/v1/watchlists/:id failed');
    
    if (error.message?.includes('not found') || error.message?.includes('access denied')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error.message?.includes('Cannot delete default')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to delete watchlist' },
      { status: 500 }
    );
  }
}
