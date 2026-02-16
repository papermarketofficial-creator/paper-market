import 'dotenv/config';
import Fastify from 'fastify';
import { createWebSocketServer } from './server/ws-server.js';
import { initializeEngine, getEngineStats } from './engine.js';
import { checkDbConnection } from './lib/db.js';
import { logger } from './lib/logger.js';

// ═══════════════════════════════════════════════════════════
// 🚀 MARKET ENGINE: Entry Point
// ═══════════════════════════════════════════════════════════

const PORT = parseInt(process.env.PORT || '4200', 10);
const WS_PORT = parseInt(process.env.WS_PORT || '4201', 10);

async function main() {
    logger.info('Starting Market Engine...');

    // ═══════════════════════════════════════════════════════════
    // 🔌 STEP 1: Check database connection
    // ═══════════════════════════════════════════════════════════
    const dbOk = await checkDbConnection();
    if (!dbOk) {
        logger.error('Database connection failed. Exiting.');
        process.exit(1);
    }

    // ═══════════════════════════════════════════════════════════
    // 🏭 STEP 2: Initialize engine
    // ═══════════════════════════════════════════════════════════
    await initializeEngine();

    // ═══════════════════════════════════════════════════════════
    // 📡 STEP 3: Start WebSocket server
    // ═══════════════════════════════════════════════════════════
    const wss = createWebSocketServer(WS_PORT);
    logger.info({ port: WS_PORT }, 'WebSocket server started');

    // ═══════════════════════════════════════════════════════════
    // 🌐 STEP 4: Start HTTP server (health check)
    // ═══════════════════════════════════════════════════════════
    const fastify = Fastify({
        logger: false // Use our pino logger instead
    });

    fastify.get('/health', async () => {
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            stats: getEngineStats()
        };
    });

    fastify.get('/stats', async () => {
        return getEngineStats();
    });

    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    logger.info({ port: PORT }, 'HTTP server started');

    logger.info('✅ Market Engine is running');

    // ═══════════════════════════════════════════════════════════
    // 🛑 GRACEFUL SHUTDOWN
    // ═══════════════════════════════════════════════════════════
    const shutdown = async () => {
        logger.info('Shutting down...');
        wss.close();
        await fastify.close();
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main().catch((error) => {
    logger.error({ err: error }, 'Fatal error');
    process.exit(1);
});
