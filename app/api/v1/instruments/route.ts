/**
 * GET /api/v1/instruments
 * Get all tradable instruments
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { InstrumentService } from '@/services/instrument.service';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const instruments = await InstrumentService.getAll();

    return NextResponse.json({
      success: true,
      data: instruments,
    });
  } catch (error) {
    logger.error({ err: error }, 'GET /api/v1/instruments failed');
    return NextResponse.json(
      { error: 'Failed to fetch instruments' },
      { status: 500 }
    );
  }
}
