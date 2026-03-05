#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import WebSocket from 'ws';

const DEFAULT_WS_URL = 'ws://localhost:4201';
const DEFAULT_SYMBOLS = [
  'NSE_EQ|RELIANCE',
  'NSE_EQ|INFY',
  'NSE_EQ|TCS',
  'NSE_EQ|HDFCBANK',
  'NSE_EQ|SBIN',
  'NSE_INDEX|NIFTY 50',
];

function toInt(value, fallback) {
  if (value == null || value === '') return fallback;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toFloat(value, fallback) {
  if (value == null || value === '') return fallback;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBool(value, fallback) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseMode(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'step' ? 'step' : 'single';
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;

    const stripped = token.slice(2);
    if (stripped.includes('=')) {
      const [key, value] = stripped.split('=', 2);
      args[key] = value;
      continue;
    }

    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[stripped] = 'true';
      continue;
    }

    args[stripped] = next;
    i += 1;
  }
  return args;
}

function parsePositiveIntCsv(value) {
  if (!value || !String(value).trim()) return [];
  return String(value)
    .split(',')
    .map((x) => Number.parseInt(x.trim(), 10))
    .filter((x) => Number.isFinite(x) && x > 0);
}

function uniqueInOrder(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function uniqueIntsInOrder(values) {
  return uniqueInOrder(values.filter((x) => Number.isFinite(x) && x > 0));
}

function normalizeSymbol(value) {
  return String(value || '')
    .trim()
    .replace(':', '|')
    .replace(/\s*\|\s*/g, '|')
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function nowIso() {
  return new Date().toISOString();
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function getConfig(cliArgs) {
  const wsUrl = String(cliArgs['ws-url'] ?? process.env.LOAD_WS_URL ?? DEFAULT_WS_URL).trim();
  const users = toInt(cliArgs.users ?? process.env.LOAD_USERS, 50);
  const mode = parseMode(cliArgs.mode ?? process.env.LOAD_MODE ?? 'single');
  const rampMs = toInt(cliArgs['ramp-ms'] ?? process.env.LOAD_RAMP_MS, 50);
  const durationSec = toInt(cliArgs['duration-sec'] ?? process.env.LOAD_DURATION_SEC, 120);
  const reportEverySec = toInt(cliArgs['report-every-sec'] ?? process.env.LOAD_REPORT_EVERY_SEC, 5);
  const symbolsFile = String(cliArgs['symbols-file'] ?? process.env.LOAD_SYMBOLS_FILE ?? 'public/instruments.json');
  const symbolsLimit = toInt(cliArgs['symbols-limit'] ?? process.env.LOAD_SYMBOLS_LIMIT, 500);
  const symbolsCsv = String(cliArgs.symbols ?? process.env.LOAD_SYMBOLS ?? '');
  const symbolsMin = toInt(cliArgs['symbols-min'] ?? process.env.LOAD_SYMBOLS_MIN, 2);
  const symbolsMax = toInt(cliArgs['symbols-max'] ?? process.env.LOAD_SYMBOLS_MAX, 6);
  const token = String(cliArgs.token ?? process.env.LOAD_WS_TOKEN ?? '').trim();
  const csvOut = String(cliArgs['csv-out'] ?? process.env.LOAD_CSV_OUT ?? '');
  const slowClientPct = toFloat(cliArgs['slow-client-pct'] ?? process.env.LOAD_SLOW_CLIENT_PCT, 0);
  const slowReadDelayMs = toInt(cliArgs['slow-read-delay-ms'] ?? process.env.LOAD_SLOW_READ_DELAY_MS, 250);
  const resubscribeEveryMs = toInt(
    cliArgs['resubscribe-every-ms'] ?? process.env.LOAD_RESUBSCRIBE_EVERY_MS,
    0
  );

  const stepValuesRaw = String(cliArgs['step-values'] ?? process.env.LOAD_STEP_VALUES ?? '');
  const stepStart = toInt(cliArgs['step-start'] ?? process.env.LOAD_STEP_START, users);
  const stepMax = toInt(cliArgs['step-max'] ?? process.env.LOAD_STEP_MAX, Math.max(users, stepStart));
  const stepFactor = toFloat(cliArgs['step-factor'] ?? process.env.LOAD_STEP_FACTOR, 2);
  const stepAdd = toInt(cliArgs['step-add'] ?? process.env.LOAD_STEP_ADD, 0);
  const stepStopOnFail = toBool(cliArgs['step-stop-on-fail'] ?? process.env.LOAD_STEP_STOP_ON_FAIL, true);

  const thresholds = {
    minConnectSuccessPct: toFloat(
      cliArgs['pass-min-connect-success-pct'] ?? process.env.LOAD_PASS_MIN_CONNECT_SUCCESS_PCT,
      99
    ),
    maxDisconnectPct: toFloat(
      cliArgs['pass-max-disconnect-pct'] ?? process.env.LOAD_PASS_MAX_DISCONNECT_PCT,
      1
    ),
    maxConnectP95Ms: toFloat(
      cliArgs['pass-max-connect-p95-ms'] ?? process.env.LOAD_PASS_MAX_CONNECT_P95_MS,
      3000
    ),
    maxEventLoopLagMs: toFloat(
      cliArgs['pass-max-event-loop-lag-ms'] ?? process.env.LOAD_PASS_MAX_EVENT_LOOP_LAG_MS,
      200
    ),
    maxTickLatencyP95Ms: toFloat(
      cliArgs['pass-max-tick-latency-p95-ms'] ?? process.env.LOAD_PASS_MAX_TICK_LATENCY_P95_MS,
      250
    ),
    failOnHeapGrowth: toBool(
      cliArgs['pass-fail-on-heap-growth'] ?? process.env.LOAD_PASS_FAIL_ON_HEAP_GROWTH,
      true
    ),
  };

  return {
    mode,
    wsUrl,
    users: Math.max(1, users),
    rampMs: Math.max(0, rampMs),
    durationSec: Math.max(5, durationSec),
    reportEverySec: Math.max(1, reportEverySec),
    symbolsFile,
    symbolsLimit: Math.max(1, symbolsLimit),
    symbolsCsv,
    symbolsMin: Math.max(1, symbolsMin),
    symbolsMax: Math.max(1, Math.max(symbolsMin, symbolsMax)),
    token,
    csvOut,
    slowClientPct: Math.min(100, Math.max(0, slowClientPct)),
    slowReadDelayMs: Math.max(0, slowReadDelayMs),
    resubscribeEveryMs: Math.max(0, resubscribeEveryMs),
    stepValuesRaw,
    stepStart: Math.max(1, stepStart),
    stepMax: Math.max(1, stepMax),
    stepFactor: stepFactor > 0 ? stepFactor : 2,
    stepAdd: Math.max(0, stepAdd),
    stepStopOnFail,
    thresholds,
  };
}

function printHelp() {
  console.log(`
Usage:
  npm run load:users -- [options]

Core options:
  --mode <single|step>            Run one load test or step tests (default: single)
  --ws-url <url>                  Target WS URL (default: ws://localhost:4201)
  --token <jwt>                   JWT sent as ?token=<jwt>
  --users <n>                     Virtual users for single mode (default: 50)
  --ramp-ms <ms>                  Delay between spawning users (default: 50)
  --duration-sec <sec>            Total test duration per run (default: 120)
  --report-every-sec <sec>        Progress interval (default: 5)
  --symbols <csv>                 Explicit symbol list (comma separated)
  --symbols-file <path>           JSON source (default: public/instruments.json)
  --symbols-limit <n>             Max symbols loaded from file (default: 500)
  --symbols-min <n>               Min symbols per user (default: 2)
  --symbols-max <n>               Max symbols per user (default: 6)
  --slow-client-pct <n>           Percent users with delayed message processing (default: 0)
  --slow-read-delay-ms <ms>       Delay for slow clients (default: 250)
  --resubscribe-every-ms <ms>     Rotate unsubscribe/subscribe every N ms (default: 0=off)
  --csv-out <path>                Write CSV summary (single=1 row, step=all rows)

Step mode options:
  --step-values <csv>             Explicit users per step (example: 50,100,200)
  --step-start <n>                Start users if step-values not provided (default: --users)
  --step-max <n>                  Max users when step-values not provided
  --step-factor <n>               Multiplier per step (default: 2)
  --step-add <n>                  Additive increment per step (default: 0)
  --step-stop-on-fail <bool>      Stop on first failed step (default: true)

Pass/Fail thresholds:
  --pass-min-connect-success-pct <n> default 99
  --pass-max-disconnect-pct <n>      default 1
  --pass-max-connect-p95-ms <n>      default 3000
  --pass-max-event-loop-lag-ms <n>   default 200
  --pass-max-tick-latency-p95-ms <n> default 250
  --pass-fail-on-heap-growth <bool>  default true

Notes:
  - Uses native ws client, not SSE.
  - On connect, each user sends: {"action":"subscribe","symbols":[...]}
`);
}

function loadSymbols(config) {
  if (config.symbolsCsv.trim().length > 0) {
    const values = uniqueInOrder(
      config.symbolsCsv
        .split(',')
        .map((s) => normalizeSymbol(s))
        .filter(Boolean)
    );
    if (values.length > 0) return values;
  }

  const absPath = path.isAbsolute(config.symbolsFile)
    ? config.symbolsFile
    : path.join(process.cwd(), config.symbolsFile);

  try {
    const raw = fs.readFileSync(absPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_SYMBOLS;

    const symbols = [];
    for (const row of parsed) {
      const candidate =
        row?.instrumentToken ||
        row?.instrument_token ||
        row?.instrumentKey ||
        row?.instrument_key ||
        row?.tradingsymbol ||
        row?.symbol;

      if (typeof candidate !== 'string') continue;
      const normalized = normalizeSymbol(candidate);
      if (!normalized) continue;
      symbols.push(normalized);
      if (symbols.length >= config.symbolsLimit) break;
    }

    const unique = uniqueInOrder(symbols);
    return unique.length > 0 ? unique : DEFAULT_SYMBOLS;
  } catch {
    return DEFAULT_SYMBOLS;
  }
}

function pickRandomSymbols(pool, minCount, maxCount) {
  const uniquePool = pool.length > 0 ? pool : DEFAULT_SYMBOLS;
  const max = Math.min(maxCount, uniquePool.length);
  const min = Math.min(minCount, max);
  const targetSize = min + Math.floor(Math.random() * (max - min + 1));

  const copied = [...uniquePool];
  for (let i = copied.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }

  return copied.slice(0, targetSize);
}

function buildStepUsers(config) {
  const explicit = uniqueIntsInOrder(parsePositiveIntCsv(config.stepValuesRaw));
  if (explicit.length > 0) return explicit;

  const values = [];
  let current = Math.max(1, config.stepStart);
  const max = Math.max(current, config.stepMax);

  for (let i = 0; i < 100 && current <= max; i++) {
    values.push(current);
    const nextCandidate = Math.floor(current * config.stepFactor) + config.stepAdd;
    const next = nextCandidate > current ? nextCandidate : current + 1;
    current = next;
  }

  if (!values.length) values.push(config.users);
  return uniqueIntsInOrder(values);
}

function makeMetrics() {
  const startHeapMb = process.memoryUsage().heapUsed / 1024 / 1024;
  return {
    startedAtMs: Date.now(),

    connectAttempts: 0,
    connectOk: 0,
    connectFailures: 0,
    connectLatenciesMs: [],

    disconnects: 0,
    wsErrors: 0,
    parseErrors: 0,

    messageCount: 0,
    tickCount: 0,
    tickLatencyMs: [],
    tickLatencyMaxMs: 0,
    candleCount: 0,
    heartbeatCount: 0,
    bytesReceived: 0,

    eventLoopLagSamplesMs: [],
    eventLoopLagMaxMs: 0,

    heapSamplesMb: [startHeapMb],
    startHeapMb,
    maxHeapMb: startHeapMb,
    endHeapMb: startHeapMb,

    slowClients: 0,
    subscribeSendAttempts: 0,
    subscribeSendFailures: 0,
    resubscribeCount: 0,
  };
}

function collectHeapSample(metrics) {
  const heapMb = process.memoryUsage().heapUsed / 1024 / 1024;
  metrics.heapSamplesMb.push(heapMb);
  if (heapMb > metrics.maxHeapMb) metrics.maxHeapMb = heapMb;
  metrics.endHeapMb = heapMb;
}

function startEventLoopLagMonitor(metrics, sampleEveryMs = 100) {
  const intervalNs = BigInt(sampleEveryMs) * 1_000_000n;
  let expected = process.hrtime.bigint() + intervalNs;

  const timer = setInterval(() => {
    const now = process.hrtime.bigint();
    const lagMs = Math.max(0, Number(now - expected) / 1_000_000);
    metrics.eventLoopLagSamplesMs.push(lagMs);
    if (lagMs > metrics.eventLoopLagMaxMs) metrics.eventLoopLagMaxMs = lagMs;
    expected = now + intervalNs;
  }, sampleEveryMs);

  timer.unref?.();
  return () => clearInterval(timer);
}

function heapGrowingContinuously(samplesMb, window = 6, minGrowthMb = 2) {
  if (samplesMb.length < window) return false;
  const tail = samplesMb.slice(-window);
  for (let i = 1; i < tail.length; i++) {
    if (!(tail[i] > tail[i - 1])) return false;
  }
  return tail[tail.length - 1] - tail[0] >= minGrowthMb;
}

function buildWsUrl(config) {
  const url = new URL(config.wsUrl);
  if (config.token) {
    url.searchParams.set('token', config.token);
  }
  return url.toString();
}

function rawDataBytes(data) {
  if (Buffer.isBuffer(data)) return data.length;
  if (typeof data === 'string') return Buffer.byteLength(data, 'utf8');
  if (Array.isArray(data)) return data.reduce((sum, chunk) => sum + rawDataBytes(chunk), 0);
  if (data && typeof data.byteLength === 'number') return data.byteLength;
  return 0;
}

function parseMessageType(payload) {
  if (!payload || typeof payload !== 'object') return '';
  if (typeof payload.type === 'string') return payload.type;
  if (typeof payload.action === 'string') return payload.action;
  return '';
}

function normalizeTimestampMs(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  // Treat sub-trillion values as seconds.
  return num < 1_000_000_000_000 ? num * 1000 : num;
}

function extractTimestampMs(payload) {
  if (!payload || typeof payload !== 'object') return 0;
  const root = payload;
  const data = payload.data && typeof payload.data === 'object' ? payload.data : null;

  const ts =
    root.timestamp ??
    root.ts ??
    root.exchange_timestamp ??
    data?.timestamp ??
    data?.ts ??
    data?.exchange_timestamp;

  return normalizeTimestampMs(ts);
}

function printConfig(config, symbols, label = 'single') {
  console.log('---- WS Load Test Config ----');
  console.log(`label: ${label}`);
  console.log(`time: ${nowIso()}`);
  console.log(`mode: ${config.mode}`);
  console.log(`wsUrl: ${config.wsUrl}`);
  console.log(`token: ${config.token ? 'provided' : 'not provided'}`);
  console.log(`users: ${config.users}`);
  console.log(`rampMs: ${config.rampMs}`);
  console.log(`durationSec: ${config.durationSec}`);
  console.log(`reportEverySec: ${config.reportEverySec}`);
  console.log(`symbolsAvailable: ${symbols.length}`);
  console.log(`symbolsPerUser: ${config.symbolsMin}-${config.symbolsMax}`);
  console.log(`slowClientPct: ${config.slowClientPct}`);
  console.log(`slowReadDelayMs: ${config.slowReadDelayMs}`);
  console.log(`resubscribeEveryMs: ${config.resubscribeEveryMs}`);
  console.log(
    `thresholds: connect>=${config.thresholds.minConnectSuccessPct}% disconnect<=${config.thresholds.maxDisconnectPct}% ` +
      `connectP95<=${config.thresholds.maxConnectP95Ms}ms lag<=${config.thresholds.maxEventLoopLagMs}ms ` +
      `tickP95<=${config.thresholds.maxTickLatencyP95Ms}ms ` +
      `heapGrowthFail=${config.thresholds.failOnHeapGrowth}`
  );
  console.log('-----------------------------');
}

function createRuntime(id, isSlow) {
  return {
    id,
    isSlow,
    symbols: [],
    ws: null,
    connected: false,
    done: false,
    stopRequested: false,
    connectFailureCounted: false,
    socketPaused: false,
    pendingTimers: new Set(),
  };
}

function cleanupRuntimeTimers(runtime) {
  for (const timer of runtime.pendingTimers) {
    clearTimeout(timer);
    clearInterval(timer);
  }
  runtime.pendingTimers.clear();
  runtime.socketPaused = false;
}

function scheduleDelayedMessage(runtime, delayMs, fn) {
  const timer = setTimeout(() => {
    runtime.pendingTimers.delete(timer);
    fn();
  }, delayMs);
  timer.unref?.();
  runtime.pendingTimers.add(timer);
}

function pauseSocketForBackpressure(runtime, ws, delayMs) {
  if (runtime.socketPaused || delayMs <= 0) return false;
  const socket = ws?._socket;
  if (!socket || typeof socket.pause !== 'function' || typeof socket.resume !== 'function') return false;

  try {
    socket.pause();
    runtime.socketPaused = true;
  } catch {
    runtime.socketPaused = false;
    return false;
  }

  const timer = setTimeout(() => {
    runtime.pendingTimers.delete(timer);
    try {
      socket.resume();
    } catch {
      // ignore
    }
    runtime.socketPaused = false;
  }, delayMs);

  timer.unref?.();
  runtime.pendingTimers.add(timer);
  return true;
}

function runVirtualUser({ runtime, config, symbolPool, metrics, stopState }) {
  return new Promise((resolve) => {
    const targetUrl = buildWsUrl(config);

    const finish = () => {
      if (runtime.done) return;
      runtime.done = true;
      cleanupRuntimeTimers(runtime);
      resolve();
    };

    const countConnectFailureOnce = () => {
      if (runtime.connectFailureCounted) return;
      runtime.connectFailureCounted = true;
      metrics.connectFailures += 1;
    };

    const connectStarted = process.hrtime.bigint();
    metrics.connectAttempts += 1;

    const ws = new WebSocket(targetUrl, {
      perMessageDeflate: false,
      handshakeTimeout: 10_000,
    });

    runtime.ws = ws;

    const sendControl = (action, symbols) => {
      if (ws.readyState !== WebSocket.OPEN) return false;
      try {
        ws.send(JSON.stringify({ action, symbols }));
        return true;
      } catch {
        return false;
      }
    };

    ws.on('open', () => {
      runtime.connected = true;
      metrics.connectOk += 1;
      const latencyMs = Number(process.hrtime.bigint() - connectStarted) / 1_000_000;
      metrics.connectLatenciesMs.push(latencyMs);

      runtime.symbols = pickRandomSymbols(symbolPool, config.symbolsMin, config.symbolsMax);
      metrics.subscribeSendAttempts += 1;
      if (!sendControl('subscribe', runtime.symbols)) {
        metrics.subscribeSendFailures += 1;
      }

      if (config.resubscribeEveryMs > 0) {
        const timer = setInterval(() => {
          if (runtime.stopRequested || ws.readyState !== WebSocket.OPEN) return;

          const previousSymbols = runtime.symbols;
          if (previousSymbols.length > 0) {
            sendControl('unsubscribe', previousSymbols);
          }

          runtime.symbols = pickRandomSymbols(symbolPool, config.symbolsMin, config.symbolsMax);
          metrics.subscribeSendAttempts += 1;
          if (!sendControl('subscribe', runtime.symbols)) {
            metrics.subscribeSendFailures += 1;
            return;
          }
          metrics.resubscribeCount += 1;
        }, config.resubscribeEveryMs);

        timer.unref?.();
        runtime.pendingTimers.add(timer);
      }
    });

    ws.on('message', (data) => {
      const processMessage = () => {
        const bytes = rawDataBytes(data);
        metrics.bytesReceived += bytes;
        metrics.messageCount += 1;

        try {
          const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
          const parsed = JSON.parse(text);
          const type = parseMessageType(parsed);
          if (type === 'tick') {
            metrics.tickCount += 1;
            const tsMs = extractTimestampMs(parsed);
            if (tsMs > 0) {
              const latencyMs = Date.now() - tsMs;
              if (latencyMs >= 0) {
                metrics.tickLatencyMs.push(latencyMs);
                if (latencyMs > metrics.tickLatencyMaxMs) {
                  metrics.tickLatencyMaxMs = latencyMs;
                }
              }
            }
          }
          if (type === 'candle') metrics.candleCount += 1;
          if (type === 'heartbeat') metrics.heartbeatCount += 1;
        } catch {
          metrics.parseErrors += 1;
        }
      };

      if (runtime.isSlow && config.slowReadDelayMs > 0) {
        const applied = pauseSocketForBackpressure(runtime, ws, config.slowReadDelayMs);
        if (!applied) {
          scheduleDelayedMessage(runtime, config.slowReadDelayMs, processMessage);
          return;
        }
      }

      processMessage();
    });

    ws.on('error', () => {
      metrics.wsErrors += 1;
      if (!runtime.connected) {
        countConnectFailureOnce();
      }
    });

    ws.on('close', () => {
      if (!runtime.connected) {
        countConnectFailureOnce();
      } else {
        if (!runtime.stopRequested && !stopState.stopping) {
          metrics.disconnects += 1;
        }
      }
      finish();
    });

    runtime.stop = () => {
      if (runtime.stopRequested) return;
      runtime.stopRequested = true;
      try {
        if (runtime.socketPaused && ws?._socket && typeof ws._socket.resume === 'function') {
          ws._socket.resume();
        }
      } catch {
        // ignore
      }
      cleanupRuntimeTimers(runtime);
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(1000, 'load-test-stop');
        }
      } catch {
        // ignore
      }

      setTimeout(() => {
        try {
          if (!runtime.done) ws.terminate();
        } catch {
          // ignore
        }
      }, 1000).unref?.();
    };

    if (stopState.stopping) {
      runtime.stop();
    }
  });
}

function printProgress(metrics, runtimes, config, previousSnapshot, label) {
  collectHeapSample(metrics);

  const now = Date.now();
  const elapsedSec = Math.max(1, Math.floor((now - metrics.startedAtMs) / 1000));
  const activeUsers = runtimes.filter((r) => !r.done).length;
  const connectedNow = runtimes.filter((r) => r.connected && !r.done).length;

  const messageDelta = metrics.messageCount - previousSnapshot.messageCount;
  const tickDelta = metrics.tickCount - previousSnapshot.tickCount;
  const bytesDelta = metrics.bytesReceived - previousSnapshot.bytesReceived;
  const intervalSec = Math.max(0.001, (now - previousSnapshot.tsMs) / 1000);

  const msgPerSec = messageDelta / intervalSec;
  const tickPerSec = tickDelta / intervalSec;
  const bytesPerSec = bytesDelta / intervalSec;

  const heapMb = metrics.endHeapMb;
  const connectP95 = percentile(metrics.connectLatenciesMs, 95);
  const lagP95 = percentile(metrics.eventLoopLagSamplesMs, 95);

  console.log(
    `[${label}] [${nowIso()}] elapsed=${elapsedSec}s active=${activeUsers}/${config.users} connected=${connectedNow} ` +
      `connectOk=${metrics.connectOk} connectFail=${metrics.connectFailures} disconnects=${metrics.disconnects} ` +
      `msg/s=${msgPerSec.toFixed(1)} tick/s=${tickPerSec.toFixed(1)} bytes/s=${bytesPerSec.toFixed(0)} ` +
      `heapMb=${heapMb.toFixed(1)} lagP95Ms=${lagP95.toFixed(1)} connP95Ms=${connectP95.toFixed(1)}`
  );

  previousSnapshot.tsMs = now;
  previousSnapshot.messageCount = metrics.messageCount;
  previousSnapshot.tickCount = metrics.tickCount;
  previousSnapshot.bytesReceived = metrics.bytesReceived;
}

function buildSummary(metrics, config) {
  const finishedAtMs = Date.now();
  const elapsedSec = Math.max(1, Math.floor((finishedAtMs - metrics.startedAtMs) / 1000));

  const connectSuccessPct = metrics.connectAttempts
    ? (metrics.connectOk / metrics.connectAttempts) * 100
    : 0;
  const disconnectPct = metrics.connectOk
    ? (metrics.disconnects / metrics.connectOk) * 100
    : 0;

  const eventLoopLagP95Ms = percentile(metrics.eventLoopLagSamplesMs, 95);
  const tickLatencyP50Ms = percentile(metrics.tickLatencyMs, 50);
  const tickLatencyP95Ms = percentile(metrics.tickLatencyMs, 95);
  const heapGrowthMb = metrics.endHeapMb - metrics.startHeapMb;
  const heapContinuousGrowth = heapGrowingContinuously(metrics.heapSamplesMb);
  const bytesPerUser = metrics.connectOk ? metrics.bytesReceived / metrics.connectOk : 0;

  return {
    finishedAtIso: nowIso(),
    durationSec: elapsedSec,

    users: config.users,
    slowClients: metrics.slowClients,

    connectAttempts: metrics.connectAttempts,
    connectOk: metrics.connectOk,
    connectFailures: metrics.connectFailures,
    connectSuccessPct,
    connectP50Ms: percentile(metrics.connectLatenciesMs, 50),
    connectP95Ms: percentile(metrics.connectLatenciesMs, 95),

    disconnects: metrics.disconnects,
    disconnectPct,

    wsErrors: metrics.wsErrors,
    parseErrors: metrics.parseErrors,

    messages: metrics.messageCount,
    ticks: metrics.tickCount,
    tickLatencyP50Ms,
    tickLatencyP95Ms,
    tickLatencyMaxMs: metrics.tickLatencyMaxMs,
    candles: metrics.candleCount,
    heartbeats: metrics.heartbeatCount,
    bytesReceivedMB: metrics.bytesReceived / 1024 / 1024,
    bytesPerUser,

    avgMessagesPerSec: metrics.messageCount / elapsedSec,
    avgTicksPerSec: metrics.tickCount / elapsedSec,
    avgBytesPerSec: metrics.bytesReceived / elapsedSec,

    eventLoopLagP50Ms: percentile(metrics.eventLoopLagSamplesMs, 50),
    eventLoopLagP95Ms,
    eventLoopLagMaxMs: metrics.eventLoopLagMaxMs,

    heapStartMb: metrics.startHeapMb,
    heapEndMb: metrics.endHeapMb,
    heapMaxMb: metrics.maxHeapMb,
    heapGrowthMb,
    heapContinuousGrowth,

    subscribeSendAttempts: metrics.subscribeSendAttempts,
    subscribeSendFailures: metrics.subscribeSendFailures,
    resubscribeCount: metrics.resubscribeCount,
  };
}

function printSummary(summary, label) {
  console.log(`\n==== WS Load Test Summary (${label}) ====`);
  console.log(`finishedAt: ${summary.finishedAtIso}`);
  console.log(`durationSec: ${summary.durationSec}`);
  console.log(`users: ${summary.users}`);
  console.log(`slowClients: ${summary.slowClients}`);
  console.log(`connectAttempts: ${summary.connectAttempts}`);
  console.log(`connectOk: ${summary.connectOk}`);
  console.log(`connectFailures: ${summary.connectFailures}`);
  console.log(`connectSuccessPct: ${summary.connectSuccessPct.toFixed(2)}`);
  console.log(`connectP50Ms: ${summary.connectP50Ms.toFixed(1)}`);
  console.log(`connectP95Ms: ${summary.connectP95Ms.toFixed(1)}`);
  console.log(`disconnects: ${summary.disconnects}`);
  console.log(`disconnectPct: ${summary.disconnectPct.toFixed(2)}`);
  console.log(`messages: ${summary.messages}`);
  console.log(`ticks: ${summary.ticks}`);
  console.log(`tickLatencyP50Ms: ${summary.tickLatencyP50Ms.toFixed(2)}`);
  console.log(`tickLatencyP95Ms: ${summary.tickLatencyP95Ms.toFixed(2)}`);
  console.log(`tickLatencyMaxMs: ${summary.tickLatencyMaxMs.toFixed(2)}`);
  console.log(`bytesReceivedMB: ${summary.bytesReceivedMB.toFixed(2)}`);
  console.log(`bytesPerUser: ${summary.bytesPerUser.toFixed(2)}`);
  console.log(`avgMessagesPerSec: ${summary.avgMessagesPerSec.toFixed(2)}`);
  console.log(`avgTicksPerSec: ${summary.avgTicksPerSec.toFixed(2)}`);
  console.log(`avgBytesPerSec: ${summary.avgBytesPerSec.toFixed(0)}`);
  console.log(`eventLoopLagP50Ms: ${summary.eventLoopLagP50Ms.toFixed(2)}`);
  console.log(`eventLoopLagP95Ms: ${summary.eventLoopLagP95Ms.toFixed(2)}`);
  console.log(`eventLoopLagMaxMs: ${summary.eventLoopLagMaxMs.toFixed(2)}`);
  console.log(`heapStartMb: ${summary.heapStartMb.toFixed(2)}`);
  console.log(`heapEndMb: ${summary.heapEndMb.toFixed(2)}`);
  console.log(`heapMaxMb: ${summary.heapMaxMb.toFixed(2)}`);
  console.log(`heapGrowthMb: ${summary.heapGrowthMb.toFixed(2)}`);
  console.log(`heapContinuousGrowth: ${summary.heapContinuousGrowth}`);
  console.log(`subscribeSendAttempts: ${summary.subscribeSendAttempts}`);
  console.log(`subscribeSendFailures: ${summary.subscribeSendFailures}`);
  console.log(`resubscribeCount: ${summary.resubscribeCount}`);
  console.log('=====================================\n');
}

function evaluateSummary(summary, config) {
  const reasons = [];
  const t = config.thresholds;

  if (summary.connectSuccessPct < t.minConnectSuccessPct) {
    reasons.push(`connect success ${summary.connectSuccessPct.toFixed(2)}% < ${t.minConnectSuccessPct}%`);
  }
  if (summary.disconnectPct > t.maxDisconnectPct) {
    reasons.push(`disconnects ${summary.disconnectPct.toFixed(2)}% > ${t.maxDisconnectPct}%`);
  }
  if (summary.connectP95Ms > t.maxConnectP95Ms) {
    reasons.push(`connectP95 ${summary.connectP95Ms.toFixed(1)}ms > ${t.maxConnectP95Ms}ms`);
  }
  if (summary.eventLoopLagMaxMs > t.maxEventLoopLagMs) {
    reasons.push(`eventLoopLagMax ${summary.eventLoopLagMaxMs.toFixed(1)}ms > ${t.maxEventLoopLagMs}ms`);
  }
  if (summary.tickLatencyP95Ms > t.maxTickLatencyP95Ms) {
    reasons.push(`tickLatencyP95 ${summary.tickLatencyP95Ms.toFixed(1)}ms > ${t.maxTickLatencyP95Ms}ms`);
  }
  if (t.failOnHeapGrowth && summary.heapContinuousGrowth) {
    reasons.push('heap usage shows continuous growth trend');
  }

  return {
    pass: reasons.length === 0,
    reasons,
  };
}

function csvEscape(value) {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function writeCsv(outPath, rows) {
  if (!outPath) return;
  const absPath = path.isAbsolute(outPath) ? outPath : path.join(process.cwd(), outPath);
  const dir = path.dirname(absPath);
  fs.mkdirSync(dir, { recursive: true });

  const headers = [
    'time',
    'mode',
    'label',
    'step_index',
    'users',
    'duration_sec',
    'connect_success_pct',
    'connect_p95_ms',
    'disconnect_pct',
    'messages',
    'ticks',
    'tick_latency_p95_ms',
    'tick_latency_max_ms',
    'avg_messages_per_sec',
    'avg_ticks_per_sec',
    'avg_bytes_per_sec',
    'bytes_per_user',
    'event_loop_lag_p95_ms',
    'event_loop_lag_max_ms',
    'heap_growth_mb',
    'heap_continuous_growth',
    'resubscribe_count',
    'pass',
    'fail_reasons',
    'stop_reason',
  ];

  const lines = [headers.join(',')];
  for (const row of rows) {
    const values = headers.map((header) => csvEscape(row[header] ?? ''));
    lines.push(values.join(','));
  }

  fs.writeFileSync(absPath, `${lines.join('\n')}\n`, 'utf8');
  console.log(`CSV written: ${absPath}`);
}

async function runLoadScenario({ config, symbolPool, label, globalControl }) {
  printConfig(config, symbolPool, label);

  const metrics = makeMetrics();
  const stopState = { stopping: false, reason: '' };
  const runtimes = [];
  const tasks = [];

  const stopLagMonitor = startEventLoopLagMonitor(metrics, 100);

  const testEndAt = Date.now() + config.durationSec * 1000;
  const previousSnapshot = {
    tsMs: Date.now(),
    messageCount: 0,
    tickCount: 0,
    bytesReceived: 0,
  };

  const reporter = setInterval(() => {
    printProgress(metrics, runtimes, config, previousSnapshot, label);
  }, config.reportEverySec * 1000);

  reporter.unref?.();

  try {
    for (let i = 0; i < config.users && !stopState.stopping && !globalControl.interrupted; i++) {
      const isSlow = Math.random() * 100 < config.slowClientPct;
      const runtime = createRuntime(i + 1, isSlow);
      if (isSlow) metrics.slowClients += 1;

      runtimes.push(runtime);
      const task = runVirtualUser({ runtime, config, symbolPool, metrics, stopState });
      tasks.push(task);

      if (Date.now() >= testEndAt) break;
      if (config.rampMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, config.rampMs));
      }
    }

    while (!stopState.stopping && !globalControl.interrupted && Date.now() < testEndAt) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    if (!stopState.stopping) {
      if (globalControl.interrupted) {
        stopState.stopping = true;
        stopState.reason = 'Interrupted by SIGINT.';
      } else {
        stopState.stopping = true;
        stopState.reason = 'Duration complete.';
      }
    }
  } finally {
    clearInterval(reporter);

    for (const runtime of runtimes) {
      try {
        runtime.stop?.();
      } catch {
        // ignore
      }
    }

    await Promise.allSettled(tasks);

    stopLagMonitor();
    collectHeapSample(metrics);
  }

  if (stopState.reason) {
    console.log(`[${label}] Stop reason: ${stopState.reason}`);
  }

  const summary = buildSummary(metrics, config);
  printSummary(summary, label);

  return {
    summary,
    stopReason: stopState.reason,
  };
}

function printStepEvaluation({ label, users, evaluation }) {
  if (evaluation.pass) {
    console.log(`[${label}] PASS at users=${users}`);
    return;
  }

  console.log(`[${label}] FAIL at users=${users}`);
  for (const reason of evaluation.reasons) {
    console.log(`[${label}]   - ${reason}`);
  }
}

function printStepTable(rows) {
  if (!rows.length) return;

  console.log('\n==== Step Test Results ====');
  for (const row of rows) {
    console.log(
      `step=${row.step_index} users=${row.users} pass=${row.pass} ` +
        `conn=${Number(row.connect_success_pct).toFixed(2)}% ` +
        `disc=${Number(row.disconnect_pct).toFixed(2)}% ` +
        `connP95=${Number(row.connect_p95_ms).toFixed(1)}ms ` +
        `lagMax=${Number(row.event_loop_lag_max_ms).toFixed(1)}ms`
    );
  }
  console.log('===========================\n');
}

function toCsvRow({ mode, label, stepIndex, summary, evaluation, stopReason }) {
  return {
    time: nowIso(),
    mode,
    label,
    step_index: stepIndex,
    users: summary.users,
    duration_sec: summary.durationSec,
    connect_success_pct: summary.connectSuccessPct.toFixed(2),
    connect_p95_ms: summary.connectP95Ms.toFixed(1),
    disconnect_pct: summary.disconnectPct.toFixed(2),
    messages: summary.messages,
    ticks: summary.ticks,
    tick_latency_p95_ms: summary.tickLatencyP95Ms.toFixed(2),
    tick_latency_max_ms: summary.tickLatencyMaxMs.toFixed(2),
    avg_messages_per_sec: summary.avgMessagesPerSec.toFixed(2),
    avg_ticks_per_sec: summary.avgTicksPerSec.toFixed(2),
    avg_bytes_per_sec: summary.avgBytesPerSec.toFixed(0),
    bytes_per_user: summary.bytesPerUser.toFixed(2),
    event_loop_lag_p95_ms: summary.eventLoopLagP95Ms.toFixed(2),
    event_loop_lag_max_ms: summary.eventLoopLagMaxMs.toFixed(2),
    heap_growth_mb: summary.heapGrowthMb.toFixed(2),
    heap_continuous_growth: summary.heapContinuousGrowth ? 'true' : 'false',
    resubscribe_count: summary.resubscribeCount,
    pass: evaluation.pass ? 'PASS' : 'FAIL',
    fail_reasons: evaluation.reasons.join(' | '),
    stop_reason: stopReason,
  };
}

async function runSingleMode({ config, symbolPool, globalControl }) {
  const result = await runLoadScenario({
    config,
    symbolPool,
    label: 'single',
    globalControl,
  });

  const evaluation = evaluateSummary(result.summary, config);
  printStepEvaluation({ label: 'single', users: config.users, evaluation });

  const row = toCsvRow({
    mode: 'single',
    label: 'single',
    stepIndex: 1,
    summary: result.summary,
    evaluation,
    stopReason: result.stopReason,
  });

  if (config.csvOut) {
    writeCsv(config.csvOut, [row]);
  }

  return {
    anyFail: !evaluation.pass,
  };
}

async function runStepMode({ config, symbolPool, globalControl }) {
  const steps = buildStepUsers(config);
  if (!steps.length) {
    throw new Error('No step values generated.');
  }

  console.log(`Step users: ${steps.join(', ')}`);
  const rows = [];
  let anyFail = false;

  for (let i = 0; i < steps.length; i++) {
    if (globalControl.interrupted) break;

    const users = steps[i];
    const label = `step-${i + 1}`;
    const stepConfig = { ...config, users };

    const result = await runLoadScenario({
      config: stepConfig,
      symbolPool,
      label,
      globalControl,
    });

    const evaluation = evaluateSummary(result.summary, stepConfig);
    if (!evaluation.pass) anyFail = true;

    printStepEvaluation({ label, users, evaluation });

    rows.push(
      toCsvRow({
        mode: 'step',
        label,
        stepIndex: i + 1,
        summary: result.summary,
        evaluation,
        stopReason: result.stopReason,
      })
    );

    if (!evaluation.pass && config.stepStopOnFail) {
      console.log(`Stopping step run on first failure at users=${users}.`);
      break;
    }
  }

  printStepTable(rows);
  if (config.csvOut) {
    writeCsv(config.csvOut, rows);
  }

  return { anyFail };
}

async function main() {
  const cliArgs = parseArgs(process.argv.slice(2));
  if (cliArgs.help === 'true') {
    printHelp();
    return;
  }

  const config = getConfig(cliArgs);
  const symbolPool = loadSymbols(config);
  const globalControl = { interrupted: false };

  process.on('SIGINT', () => {
    if (!globalControl.interrupted) {
      globalControl.interrupted = true;
      console.log('\nStopping test (SIGINT)...');
    }
  });

  let result;
  if (config.mode === 'step') {
    result = await runStepMode({ config, symbolPool, globalControl });
  } else {
    result = await runSingleMode({ config, symbolPool, globalControl });
  }

  if (result.anyFail) {
    process.exitCode = 3;
  }
}

main().catch((error) => {
  console.error('Load test script failed:', error);
  process.exit(1);
});
