/**
 * POST /api/v1/watchlists/:id/instruments
 * Add instrument to watchlist
 * 
 * DELETE /api/v1/watchlists/:id/instruments/:token
 * Remove instrument from watchlist
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { WatchlistService } from '@/services/watchlist.service';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { instrumentToken } = body;

    if (!instrumentToken || typeof instrumentToken !== 'string') {
      return NextResponse.json(
        { error: 'instrumentToken is required' },
        { status: 400 }
      );
    }

    const item = await WatchlistService.addInstrument(
      id,
      instrumentToken,
      session.user.id
    );

    return NextResponse.json({
      success: true,
      data: item,
    });
  } catch (error: any) {
    const { id } = await params;
    logger.error({ err: error, watchlistId: id }, 'POST /api/v1/watchlists/:id/instruments failed');
    
    if (error.message?.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error.message?.includes('full')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to add instrument' },
      { status: 500 }
    );
  }
}
