'use client';
import { useEffect, useState } from 'react';

export default function DiagnosticPage() {
    const [logs, setLogs] = useState<string[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [tickCount, setTickCount] = useState(0);
    const [lastTick, setLastTick] = useState<any>(null);

    const addLog = (message: string) => {
        const timestamp = new Date().toLocaleTimeString();
        setLogs(prev => [`[${timestamp}] ${message}`, ...prev].slice(0, 50));
        console.log(message);
    };

    useEffect(() => {
        addLog("🚀 Starting SSE connection test...");
        
        // Test symbols
        const testSymbols = ['RELIANCE', 'TCS', 'INFY'];
        const url = `/api/v1/market/stream?symbols=${testSymbols.join(',')}`;
        
        addLog(`📡 Connecting to: ${url}`);
        
        const eventSource = new EventSource(url);
        
        eventSource.onopen = () => {
            addLog("✅ SSE Connection OPENED");
            setIsConnected(true);
        };
        
        eventSource.onmessage = (event) => {
            try {
                if (event.data.startsWith(':')) {
                    addLog("💓 Heartbeat received");
                    return;
                }
                
                const message = JSON.parse(event.data);
                
                if (message.type === 'connected') {
                    addLog("✅ Server confirmed connection");
                    return;
                }
                
                if (message.type === 'tick') {
                    setTickCount(prev => prev + 1);
                    setLastTick(message.data);
                    addLog(`📊 TICK: ${message.data.symbol} = ₹${message.data.price}`);
                }
            } catch (err) {
                addLog(`❌ Parse error: ${err}`);
            }
        };
        
        eventSource.onerror = (err) => {
            addLog(`❌ SSE ERROR: ${JSON.stringify(err)}`);
            setIsConnected(false);
        };
        
        return () => {
            addLog("🔴 Closing connection");
            eventSource.close();
        };
    }, []);

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold mb-6">Live Tick Diagnostic</h1>
            
            <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="p-4 bg-card rounded-lg border">
                    <div className="text-sm text-muted-foreground">Connection</div>
                    <div className={`text-2xl font-bold ${isConnected ? 'text-green-500' : 'text-red-500'}`}>
                        {isConnected ? '✅ Connected' : '❌ Disconnected'}
                    </div>
                </div>
                
                <div className="p-4 bg-card rounded-lg border">
                    <div className="text-sm text-muted-foreground">Ticks Received</div>
                    <div className="text-2xl font-bold">{tickCount}</div>
                </div>
                
                <div className="p-4 bg-card rounded-lg border">
                    <div className="text-sm text-muted-foreground">Last Tick</div>
                    <div className="text-sm font-mono">
                        {lastTick ? `${lastTick.symbol}: ₹${lastTick.price}` : 'None'}
                    </div>
                </div>
            </div>
            
            {lastTick && (
                <div className="mb-6 p-4 bg-card rounded-lg border">
                    <h2 className="font-bold mb-2">Last Tick Details</h2>
                    <pre className="text-xs overflow-auto">
                        {JSON.stringify(lastTick, null, 2)}
                    </pre>
                </div>
            )}
            
            <div className="bg-black text-green-400 p-4 rounded-lg font-mono text-sm h-96 overflow-auto">
                {logs.map((log, i) => (
                    <div key={i}>{log}</div>
                ))}
            </div>
        </div>
    );
}
