/**
 * DELETE /api/v1/watchlists/:id/instruments/:token
 * Remove instrument from watchlist
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { WatchlistService } from '@/services/watchlist.service';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; token: string }> }
) {
  try {
    const { id, token } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Decode the token (it's URL-encoded because it contains |)
    const instrumentToken = decodeURIComponent(token);

    await WatchlistService.removeInstrument(
      id,
      instrumentToken,
      session.user.id
    );

    return NextResponse.json({
      success: true,
      message: 'Instrument removed',
    });
  } catch (error: any) {
    const { id, token } = await params;
    logger.error({ err: error, watchlistId: id, token }, 'DELETE /api/v1/watchlists/:id/instruments/:token failed');
    
    if (error.message?.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(
      { error: 'Failed to remove instrument' },
      { status: 500 }
    );
  }
}
