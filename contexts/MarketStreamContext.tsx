'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { tickBus } from '@/lib/trading/tick-bus';
import { getMarketStream } from '@/lib/sse'; // 🔥 USE SINGLETON

// ═══════════════════════════════════════════════════════════
// 📡 MARKET STREAM CONTEXT: Single SSE connection for entire app
// ═══════════════════════════════════════════════════════════

interface MarketStreamContextValue {
    status: 'connecting' | 'connected' | 'error' | 'disconnected';
    error?: string;
}

const MarketStreamContext = createContext<MarketStreamContextValue | null>(null);

/**
 * 🔥 CRITICAL: Single SSE connection provider
 * 
 * Mount this ONCE at dashboard layout level.
 * Child components consume via useMarketStreamStatus hook.
 * 
 * Uses getMarketStream() singleton to prevent duplicate connections
 * from both this context AND use-market-stream.ts hook.
 */
export function MarketStreamProvider({ children }: { children: React.ReactNode }) {
    const [status, setStatus] = useState<MarketStreamContextValue['status']>('connecting');
    const [error, setError] = useState<string>();
    
    useEffect(() => {
        console.log('🔌 MarketStreamProvider: Using SSE singleton');
        
        // 🔥 CRITICAL: Use singleton instead of raw EventSource
        // This prevents duplicate connections
        const eventSource = getMarketStream();
        
        // 🔥 Tab sleep detection
        let lastHeartbeat = Date.now();
        let heartbeatCheckInterval: NodeJS.Timeout | null = null;
        
        // Check if already connected
        if (eventSource.readyState === EventSource.OPEN) {
            setStatus('connected');
        }
        
        // Start heartbeat monitoring
        heartbeatCheckInterval = setInterval(() => {
            const timeSinceHeartbeat = Date.now() - lastHeartbeat;
            
            // Detect dead connection (browser sleep, network issue)
            if (timeSinceHeartbeat > 30000 && status === 'connected') {
                console.warn(`⚠️ No heartbeat for ${timeSinceHeartbeat/1000}s`);
                setStatus('error');
            }
        }, 10000);
        
        const handleOpen = () => {
            console.log('✅ SSE Connected (Context)');
            setStatus('connected');
            setError(undefined);
            lastHeartbeat = Date.now();
        };
        
        const handleMessage = (event: MessageEvent) => {
            try {
                const message = JSON.parse(event.data);
                
                if (message.type === 'connected') {
                    console.log('📡 SSE: Server confirmed connection');
                    setStatus('connected');
                } else if (message.type === 'heartbeat') {
                    lastHeartbeat = Date.now();
                } else if (message.type === 'tick') {
                    lastHeartbeat = Date.now();
                    // Emit to TickBus
                    tickBus.emitTick(message.data);
                } else if (message.type === 'error') {
                    console.error('❌ SSE Server Error:', message.error);
                    setError(message.error);
                }
            } catch (err) {
                console.error('❌ Failed to parse SSE message:', err);
            }
        };
        
        const handleError = (err: Event) => {
            console.error('❌ SSE Error (Context):', err);
            setStatus('error');
        };
        
        // Attach listeners
        eventSource.addEventListener('open', handleOpen);
        eventSource.addEventListener('message', handleMessage);
        eventSource.addEventListener('error', handleError);
        
        // Cleanup
        return () => {
            console.log('🧹 MarketStreamProvider: Detaching listeners (NOT closing singleton)');
            if (heartbeatCheckInterval) {
                clearInterval(heartbeatCheckInterval);
            }
            eventSource.removeEventListener('open', handleOpen);
            eventSource.removeEventListener('message', handleMessage);
            eventSource.removeEventListener('error', handleError);
            // 🔥 DO NOT close singleton - other components may still use it
        };
    }, [status]);
    
    return (
        <MarketStreamContext.Provider value={{ status, error }}>
            {children}
        </MarketStreamContext.Provider>
    );
}

/**
 * Hook to access market stream status
 */
export function useMarketStreamStatus() {
    const context = useContext(MarketStreamContext);
    
    if (!context) {
        throw new Error('useMarketStreamStatus must be used within MarketStreamProvider');
    }
    
    return context;
}
