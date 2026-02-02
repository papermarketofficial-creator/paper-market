import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { EODPriceUpdateService } from '@/services/eod-price-update.service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // 🔒 SECURITY: Require authentication
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // TODO: Add admin role check in production
  // if (session.user.role !== 'admin') {
  //   return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  // }

  try {
    const result = await EODPriceUpdateService.updateAllPrices();
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
