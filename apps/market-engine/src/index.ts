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
    // 🌐 STEP 3: Start HTTP server (health check + websocket upgrades)
    // ═══════════════════════════════════════════════════════════
    const fastify = Fastify({
        logger: false // Use our pino logger instead
    });

    // Attach websocket server to the same HTTP server/port.
    const wss = createWebSocketServer(fastify.server);

    fastify.get('/', async () => {
        return {
            status: 'ok',
            service: 'market-engine',
            timestamp: new Date().toISOString()
        };
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
    logger.info({ port: PORT }, 'HTTP + WebSocket server started');

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
