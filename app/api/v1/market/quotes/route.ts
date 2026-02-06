import { NextRequest, NextResponse } from "next/server";
import { handleError } from "@/lib/errors";
import { logger } from "@/lib/logger";

const UPSTOX_API_URL = "https://api.upstox.com/v2";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { instrumentKeys } = body;

        console.log('📥 Batch quote request for', instrumentKeys?.length, 'instruments');

        if (!instrumentKeys || !Array.isArray(instrumentKeys)) {
            return NextResponse.json({
                success: false,
                error: "instrumentKeys array is required"
            }, { status: 400 });
        }

        // Get system token
        const { UpstoxService } = await import("@/services/upstox.service");
        const token = await UpstoxService.getSystemToken();
        
        if (!token) {
            console.error('❌ No system token available');
            return NextResponse.json({
                success: false,
                error: "No system token available"
            }, { status: 500 });
        }

        console.log('🔑 System token obtained, fetching quotes from Upstox...');

        // Fetch quotes from Upstox API
        const symbolList = instrumentKeys.map(k => encodeURIComponent(k)).join(",");
        const url = `${UPSTOX_API_URL}/market-quote/ltp?instrument_key=${symbolList}`;
        
        console.log('📡 Upstox API URL:', url.substring(0, 100) + '...');
        
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json",
            },
        });

        console.log('📊 Upstox response:', response.status, response.statusText);

        const data = await response.json();

        if (data.status === "error") {
            console.error('❌ Upstox API error:', data.message);
            throw new Error(data.message);
        }

        console.log('✅ Received', Object.keys(data.data || {}).length, 'quotes from Upstox');

        // Return full quote objects
        return NextResponse.json({
            success: true,
            data: data.data || {},
            count: Object.keys(data.data || {}).length,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('❌ Quote fetch error:', error);
        return handleError(error);
    }
}
