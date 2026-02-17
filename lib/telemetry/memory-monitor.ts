import { logger } from '@/lib/logger';

let monitorInterval: NodeJS.Timeout | null = null;

/**
 * Start memory telemetry monitoring
 * Logs memory usage every 60 seconds for production stability tracking
 */
export function startMemoryMonitor() {
  if (monitorInterval) {
    console.log('⚠️ Memory monitor already running');
    return;
  }
  
  monitorInterval = setInterval(() => {
    const mem = process.memoryUsage();
    logger.info({
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      rssMB: Math.round(mem.rss / 1024 / 1024),
      externalMB: Math.round(mem.external / 1024 / 1024),
      arrayBuffersMB: Math.round((mem.arrayBuffers || 0) / 1024 / 1024)
    }, 'MemoryTelemetry');
  }, 60000); // Every 60 seconds
  
  console.log('✅ Memory monitor started (60s interval)');
}

/**
 * Stop memory telemetry monitoring
 */
export function stopMemoryMonitor() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.log('🛑 Memory monitor stopped');
  }
}

/**
 * Get current memory snapshot
 */
export function getMemorySnapshot() {
  const mem = process.memoryUsage();
  return {
    heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
    rssMB: Math.round(mem.rss / 1024 / 1024),
    externalMB: Math.round(mem.external / 1024 / 1024),
    arrayBuffersMB: Math.round((mem.arrayBuffers || 0) / 1024 / 1024)
  };
}
