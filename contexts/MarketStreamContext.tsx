'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { tickBus } from '@/lib/trading/tick-bus';

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
 * Mount this ONCE at root layout level.
 * Child components consume via useMarketStreamStatus hook.
 * 
 * Why: Prevents multiple SSE connections that cause:
 * - Duplicate upstream subscriptions
 * - Broker throttling
 * - Ghost subscriptions
 * - Partial feeds
 */
export function MarketStreamProvider({ children }: { children: React.ReactNode }) {
    const [status, setStatus] = useState<MarketStreamContextValue['status']>('connecting');
    const [error, setError] = useState<string>();
    
    useEffect(() => {
        console.log('🔌 MarketStreamProvider: Establishing SINGLE SSE connection');
        
        let eventSource: EventSource | null = null;
        let reconnectAttempts = 0;
        const maxReconnectAttempts = 5;
        
        // 🔥 CRITICAL: Tab sleep detection
        let lastHeartbeat = Date.now();
        let heartbeatCheckInterval: NodeJS.Timeout | null = null;
        
        function connect() {
            try {
                eventSource = new EventSource('/api/v1/market/stream');
                
                eventSource.onopen = () => {
                    console.log('✅ SSE Connected');
                    setStatus('connected');
                    setError(undefined);
                    reconnectAttempts = 0;
                    lastHeartbeat = Date.now();
                    
                    // Start heartbeat monitoring
                    if (heartbeatCheckInterval) clearInterval(heartbeatCheckInterval);
                    heartbeatCheckInterval = setInterval(() => {
                        const timeSinceHeartbeat = Date.now() - lastHeartbeat;
                        
                        // 🔥 CRITICAL: Detect dead connection (browser sleep, network issue)
                        if (timeSinceHeartbeat > 30000) {
                            console.warn(`⚠️ No heartbeat for ${timeSinceHeartbeat/1000}s, reconnecting...`);
                            eventSource?.close();
                            connect();
                        }
                    }, 10000); // Check every 10s
                };
                
                eventSource.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data);
                        
                        // Handle different message types
                        if (message.type === 'connected') {
                            console.log('📡 SSE: Server confirmed connection');
                        } else if (message.type === 'heartbeat') {
                            // 🔥 Server heartbeat
                            lastHeartbeat = Date.now();
                        } else if (message.type === 'tick') {
                            // Update heartbeat on any tick
                            lastHeartbeat = Date.now();
                            // 🔥 CRITICAL: Emit to TickBus (batched dispatch with backpressure)
                            tickBus.emitTick(message.data);
                        } else if (message.type === 'error') {
                            console.error('❌ SSE Server Error:', message.error);
                            setError(message.error);
                        }
                    } catch (err) {
                        console.error('❌ Failed to parse SSE message:', err);
                    }
                };
                
                eventSource.onerror = (err) => {
                    console.error('❌ SSE Error:', err);
                    setStatus('error');
                    eventSource?.close();
                    
                    if (heartbeatCheckInterval) {
                        clearInterval(heartbeatCheckInterval);
                        heartbeatCheckInterval = null;
                    }
                    
                    // Exponential backoff reconnect
                    if (reconnectAttempts < maxReconnectAttempts) {
                        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts) + Math.random() * 500, 30000);
                        reconnectAttempts++;
                        
                        console.log(`🔄 Reconnecting SSE in ${delay}ms (attempt ${reconnectAttempts})`);
                        setTimeout(connect, delay);
                    } else {
                        setError('Maximum reconnect attempts reached');
                        setStatus('disconnected');
                    }
                };
            } catch (err) {
                console.error('❌ Failed to create EventSource:', err);
                setStatus('error');
                setError(err instanceof Error ? err.message : 'Unknown error');
            }
        }
        
        // Initial connection
        connect();
        
        // Cleanup on unmount
        return () => {
            console.log('🔴 MarketStreamProvider: Closing SSE connection');
            if (heartbeatCheckInterval) {
                clearInterval(heartbeatCheckInterval);
            }
            if (eventSource) {
                eventSource.close();
            }
        };
    }, []); // Empty deps - connect once, never reconnect due to React
    
    return (
        <MarketStreamContext.Provider value={{ status, error }}>
            {children}
        </MarketStreamContext.Provider>
    );
}

/**
 * Hook to access market stream status
 * 
 * Usage:
 * ```tsx
 * const { status } = useMarketStreamStatus();
 * if (status === 'connected') { // Show live indicator }
 * ```
 */
export function useMarketStreamStatus() {
    const context = useContext(MarketStreamContext);
    
    if (!context) {
        throw new Error('useMarketStreamStatus must be used within MarketStreamProvider');
    }
    
    return context;
}
