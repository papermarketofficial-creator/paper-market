#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";

const DEFAULT_SYMBOLS = ["RELIANCE", "INFY", "TCS", "HDFCBANK", "SBIN", "NIFTY 50"];

function toInt(value, fallback) {
  if (value == null || value === "") return fallback;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toFloat(value, fallback) {
  if (value == null || value === "") return fallback;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBool(value, fallback) {
  if (value == null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;

    const stripped = token.slice(2);
    if (stripped.includes("=")) {
      const [key, value] = stripped.split("=", 2);
      args[key] = value;
      continue;
    }

    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[stripped] = "true";
      continue;
    }

    args[stripped] = next;
    i += 1;
  }
  return args;
}

function parseMode(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "step" ? "step" : "single";
}

function parsePositiveIntCsv(value) {
  if (!value || !String(value).trim()) return [];
  return String(value)
    .split(",")
    .map((x) => Number.parseInt(x.trim(), 10))
    .filter((x) => Number.isFinite(x) && x > 0);
}

function uniqueIntsInOrder(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function getConfig(cliArgs) {
  const baseUrl = String(cliArgs["base-url"] ?? process.env.LOAD_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const users = toInt(cliArgs.users ?? process.env.LOAD_USERS, 50);
  const mode = parseMode(cliArgs.mode ?? process.env.LOAD_MODE ?? "single");
  const rampMs = toInt(cliArgs["ramp-ms"] ?? process.env.LOAD_RAMP_MS, 50);
  const durationSec = toInt(cliArgs["duration-sec"] ?? process.env.LOAD_DURATION_SEC, 120);
  const reportEverySec = toInt(cliArgs["report-every-sec"] ?? process.env.LOAD_REPORT_EVERY_SEC, 5);
  const subscribe = toBool(cliArgs.subscribe ?? process.env.LOAD_SUBSCRIBE, true);
  const subscribeEverySec = toInt(cliArgs["subscribe-every-sec"] ?? process.env.LOAD_SUBSCRIBE_EVERY_SEC, 20);
  const symbolsFile = String(cliArgs["symbols-file"] ?? process.env.LOAD_SYMBOLS_FILE ?? "public/instruments.json");
  const symbolsLimit = toInt(cliArgs["symbols-limit"] ?? process.env.LOAD_SYMBOLS_LIMIT, 300);
  const symbolsCsv = String(cliArgs.symbols ?? process.env.LOAD_SYMBOLS ?? "");
  const symbolsMin = toInt(cliArgs["symbols-min"] ?? process.env.LOAD_SYMBOLS_MIN, 2);
  const symbolsMax = toInt(cliArgs["symbols-max"] ?? process.env.LOAD_SYMBOLS_MAX, 6);
  const authCookie = String(cliArgs["auth-cookie"] ?? process.env.LOAD_AUTH_COOKIE ?? "");
  const stopOnUnauthorized = toBool(cliArgs["stop-on-401"] ?? process.env.LOAD_STOP_ON_401, true);
  const csvOut = String(cliArgs["csv-out"] ?? process.env.LOAD_CSV_OUT ?? "");

  const stepValuesRaw = String(cliArgs["step-values"] ?? process.env.LOAD_STEP_VALUES ?? "");
  const stepStart = toInt(cliArgs["step-start"] ?? process.env.LOAD_STEP_START, users);
  const stepMax = toInt(cliArgs["step-max"] ?? process.env.LOAD_STEP_MAX, Math.max(users, stepStart));
  const stepFactor = toFloat(cliArgs["step-factor"] ?? process.env.LOAD_STEP_FACTOR, 2);
  const stepAdd = toInt(cliArgs["step-add"] ?? process.env.LOAD_STEP_ADD, 0);
  const stepStopOnFail = toBool(cliArgs["step-stop-on-fail"] ?? process.env.LOAD_STEP_STOP_ON_FAIL, true);

  const thresholds = {
    minConnectSuccessPct: toFloat(
      cliArgs["pass-min-connect-success-pct"] ?? process.env.LOAD_PASS_MIN_CONNECT_SUCCESS_PCT,
      99
    ),
    maxSseReadErrors: toInt(
      cliArgs["pass-max-sse-read-errors"] ?? process.env.LOAD_PASS_MAX_SSE_READ_ERRORS,
      0
    ),
    maxConnectP95Ms: toFloat(
      cliArgs["pass-max-connect-p95-ms"] ?? process.env.LOAD_PASS_MAX_CONNECT_P95_MS,
      5000
    ),
    minSubscribeSuccessPct: toFloat(
      cliArgs["pass-min-subscribe-success-pct"] ?? process.env.LOAD_PASS_MIN_SUBSCRIBE_SUCCESS_PCT,
      95
    ),
    minUnsubscribeSuccessPct: toFloat(
      cliArgs["pass-min-unsubscribe-success-pct"] ?? process.env.LOAD_PASS_MIN_UNSUBSCRIBE_SUCCESS_PCT,
      95
    ),
    maxSubscribeP95Ms: toFloat(
      cliArgs["pass-max-subscribe-p95-ms"] ?? process.env.LOAD_PASS_MAX_SUBSCRIBE_P95_MS,
      10000
    ),
    maxUnsubscribeP95Ms: toFloat(
      cliArgs["pass-max-unsubscribe-p95-ms"] ?? process.env.LOAD_PASS_MAX_UNSUBSCRIBE_P95_MS,
      10000
    ),
    maxUsersStillActive: toInt(
      cliArgs["pass-max-users-still-active"] ?? process.env.LOAD_PASS_MAX_USERS_STILL_ACTIVE,
      0
    ),
  };

  return {
    mode,
    baseUrl,
    users: Math.max(1, users),
    rampMs: Math.max(0, rampMs),
    durationSec: Math.max(5, durationSec),
    reportEverySec: Math.max(1, reportEverySec),
    subscribe,
    subscribeEverySec: Math.max(1, subscribeEverySec),
    symbolsFile,
    symbolsLimit: Math.max(1, symbolsLimit),
    symbolsCsv,
    symbolsMin: Math.max(1, symbolsMin),
    symbolsMax: Math.max(1, Math.max(symbolsMin, symbolsMax)),
    authCookie,
    stopOnUnauthorized,
    csvOut,
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
  --mode <single|step>          Run one load test or automatic step tests (default: single)
  --base-url <url>              Base URL (default: http://localhost:3000)
  --users <n>                   Virtual users for single mode (default: 50)
  --ramp-ms <ms>                Delay between spawning users (default: 50)
  --duration-sec <sec>          Total test duration per run (default: 120)
  --report-every-sec <sec>      Progress report interval (default: 5)
  --subscribe <true|false>      Hit subscribe/unsubscribe API too (default: true)
  --subscribe-every-sec <sec>   Subscription rotate interval (default: 20)
  --symbols <csv>               Explicit symbols list (comma separated)
  --symbols-file <path>         JSON source (default: public/instruments.json)
  --symbols-limit <n>           Max symbols loaded from file (default: 300)
  --symbols-min <n>             Min symbols per user (default: 2)
  --symbols-max <n>             Max symbols per user (default: 6)
  --auth-cookie <cookie>        Cookie header value for auth
  --stop-on-401 <true|false>    Stop on unauthorized (default: true)
  --csv-out <path>              Write CSV summary (single=1 row, step=all rows)

Step mode options:
  --step-values <csv>           Explicit users per step (example: 50,100,200,400)
  --step-start <n>              Start users when step-values not provided (default: --users)
  --step-max <n>                Max users when step-values not provided
  --step-factor <n>             Multiplier for next step (default: 2)
  --step-add <n>                Additive increment per step (default: 0)
  --step-stop-on-fail <bool>    Stop on first failed step (default: true)

Pass/Fail thresholds:
  --pass-min-connect-success-pct <n>    default 99
  --pass-max-sse-read-errors <n>        default 0
  --pass-max-connect-p95-ms <n>         default 5000
  --pass-min-subscribe-success-pct <n>  default 95
  --pass-min-unsubscribe-success-pct <n> default 95
  --pass-max-subscribe-p95-ms <n>       default 10000
  --pass-max-unsubscribe-p95-ms <n>     default 10000
  --pass-max-users-still-active <n>     default 0
  --help                                Show this help

Notes:
  - The market stream endpoint requires auth.
  - For local stress testing, run server with TEST_MODE=true in non-production,
    or pass a valid --auth-cookie.
`);
}

function loadSymbols(config) {
  if (config.symbolsCsv.trim().length > 0) {
    const values = config.symbolsCsv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (values.length > 0) return values;
  }

  const absPath = path.isAbsolute(config.symbolsFile)
    ? config.symbolsFile
    : path.join(process.cwd(), config.symbolsFile);

  try {
    const raw = fs.readFileSync(absPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_SYMBOLS;

    const symbols = [];
    for (const row of parsed) {
      if (typeof row?.tradingsymbol === "string" && row.tradingsymbol.trim().length > 0) {
        symbols.push(row.tradingsymbol.trim());
      }
      if (symbols.length >= config.symbolsLimit) break;
    }

    return symbols.length > 0 ? symbols : DEFAULT_SYMBOLS;
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

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function nowIso() {
  return new Date().toISOString();
}

function printConfig(config, symbols, label = "single") {
  console.log("---- Load Test Config ----");
  console.log(`label: ${label}`);
  console.log(`time: ${nowIso()}`);
  console.log(`mode: ${config.mode}`);
  console.log(`baseUrl: ${config.baseUrl}`);
  console.log(`users: ${config.users}`);
  console.log(`rampMs: ${config.rampMs}`);
  console.log(`durationSec: ${config.durationSec}`);
  console.log(`subscribe: ${config.subscribe}`);
  console.log(`subscribeEverySec: ${config.subscribeEverySec}`);
  console.log(`symbolsAvailable: ${symbols.length}`);
  console.log(`symbolsPerUser: ${config.symbolsMin}-${config.symbolsMax}`);
  console.log(`stopOn401: ${config.stopOnUnauthorized}`);
  console.log(`authCookie: ${config.authCookie ? "provided" : "not provided"}`);
  if (config.mode === "step") {
    console.log(
      `thresholds: connect>=${config.thresholds.minConnectSuccessPct}% readErrors<=${config.thresholds.maxSseReadErrors} ` +
      `connP95<=${config.thresholds.maxConnectP95Ms}ms sub>=${config.thresholds.minSubscribeSuccessPct}% ` +
      `unsub>=${config.thresholds.minUnsubscribeSuccessPct}%`
    );
  }
  console.log("--------------------------");
}

function parseSseChunk(state, chunk) {
  state.buffer += chunk;
  const blocks = [];

  while (true) {
    const idx = state.buffer.indexOf("\n\n");
    if (idx < 0) break;
    blocks.push(state.buffer.slice(0, idx));
    state.buffer = state.buffer.slice(idx + 2);
  }

  return blocks;
}

async function callSubscriptionApi({
  method,
  baseUrl,
  symbols,
  authCookie,
  metrics,
  stopState,
  stopOnUnauthorized,
}) {
  const url = `${baseUrl}/api/v1/market/subscribe`;
  const started = performance.now();

  if (method === "POST") metrics.subscribeAttempts += 1;
  if (method === "DELETE") metrics.unsubscribeAttempts += 1;

  const headers = { "content-type": "application/json" };
  if (authCookie) headers.cookie = authCookie;

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: JSON.stringify({ symbols }),
    });

    const latency = performance.now() - started;
    if (method === "POST") metrics.subscribeLatencies.push(latency);
    if (method === "DELETE") metrics.unsubscribeLatencies.push(latency);

    if (res.status === 401) {
      if (method === "POST") metrics.subscribeUnauthorized += 1;
      if (method === "DELETE") metrics.unsubscribeUnauthorized += 1;

      if (stopOnUnauthorized) {
        stopState.stopping = true;
        stopState.reason = "Unauthorized (401) during subscribe/unsubscribe.";
      }
      return;
    }

    if (res.ok) {
      if (method === "POST") metrics.subscribeOk += 1;
      if (method === "DELETE") metrics.unsubscribeOk += 1;
    } else {
      if (method === "POST") metrics.subscribeFailed += 1;
      if (method === "DELETE") metrics.unsubscribeFailed += 1;
    }
  } catch {
    if (method === "POST") metrics.subscribeFailed += 1;
    if (method === "DELETE") metrics.unsubscribeFailed += 1;
  }
}

async function runSymbolRotation({
  config,
  symbolPool,
  authCookie,
  metrics,
  stopState,
  abortSignal,
}) {
  let activeSymbols = pickRandomSymbols(symbolPool, config.symbolsMin, config.symbolsMax);
  await callSubscriptionApi({
    method: "POST",
    baseUrl: config.baseUrl,
    symbols: activeSymbols,
    authCookie,
    metrics,
    stopState,
    stopOnUnauthorized: config.stopOnUnauthorized,
  });

  while (!stopState.stopping && !abortSignal.aborted) {
    try {
      await sleep(config.subscribeEverySec * 1000, undefined, { signal: abortSignal });
    } catch {
      break;
    }
    if (stopState.stopping || abortSignal.aborted) break;

    const nextSymbols = pickRandomSymbols(symbolPool, config.symbolsMin, config.symbolsMax);

    await callSubscriptionApi({
      method: "DELETE",
      baseUrl: config.baseUrl,
      symbols: activeSymbols,
      authCookie,
      metrics,
      stopState,
      stopOnUnauthorized: config.stopOnUnauthorized,
    });

    await callSubscriptionApi({
      method: "POST",
      baseUrl: config.baseUrl,
      symbols: nextSymbols,
      authCookie,
      metrics,
      stopState,
      stopOnUnauthorized: config.stopOnUnauthorized,
    });

    activeSymbols = nextSymbols;
  }

  if (activeSymbols.length > 0) {
    await callSubscriptionApi({
      method: "DELETE",
      baseUrl: config.baseUrl,
      symbols: activeSymbols,
      authCookie,
      metrics,
      stopState,
      stopOnUnauthorized: config.stopOnUnauthorized,
    });
  }
}

async function runVirtualUser({
  runtime,
  config,
  symbolPool,
  metrics,
  stopState,
}) {
  const headers = { accept: "text/event-stream" };
  if (config.authCookie) headers.cookie = config.authCookie;

  const connectStarted = performance.now();
  metrics.sseConnectAttempts += 1;

  let response;
  try {
    response = await fetch(`${config.baseUrl}/api/v1/market/stream`, {
      headers,
      signal: runtime.controller.signal,
    });
  } catch {
    metrics.sseConnectFailed += 1;
    runtime.done = true;
    return;
  }

  metrics.sseConnectLatencies.push(performance.now() - connectStarted);

  if (response.status === 401) {
    metrics.sseConnectUnauthorized += 1;
    metrics.sseConnectFailed += 1;
    if (config.stopOnUnauthorized) {
      stopState.stopping = true;
      stopState.reason = "Unauthorized (401) when opening SSE stream.";
    }
    runtime.done = true;
    return;
  }

  if (!response.ok || !response.body) {
    metrics.sseConnectFailed += 1;
    runtime.done = true;
    return;
  }

  runtime.connected = true;
  metrics.sseConnected += 1;

  const rotationTask = config.subscribe
    ? runSymbolRotation({
        config,
        symbolPool,
        authCookie: config.authCookie,
        metrics,
        stopState,
        abortSignal: runtime.controller.signal,
      })
    : null;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const sseState = { buffer: "" };

  try {
    while (!stopState.stopping && !runtime.controller.signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;

      metrics.sseBytes += value.byteLength;
      const text = decoder.decode(value, { stream: true });
      const blocks = parseSseChunk(sseState, text.replace(/\r/g, ""));

      for (const block of blocks) {
        metrics.sseEvents += 1;

        const dataLines = block
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("\n");

        if (!dataLines) continue;

        try {
          const parsed = JSON.parse(dataLines);
          if (parsed?.type === "tick") metrics.tickEvents += 1;
          if (parsed?.type === "heartbeat") metrics.heartbeatEvents += 1;
        } catch {
          metrics.sseParseErrors += 1;
        }
      }
    }
  } catch {
    if (!stopState.stopping) metrics.sseReadErrors += 1;
  } finally {
    runtime.connected = false;
    runtime.done = true;
    metrics.sseDisconnected += 1;
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
    if (rotationTask) {
      try {
        await rotationTask;
      } catch {
        // ignore
      }
    }
  }
}

function makeMetrics() {
  return {
    startedAtMs: Date.now(),
    sseConnectAttempts: 0,
    sseConnected: 0,
    sseConnectFailed: 0,
    sseConnectUnauthorized: 0,
    sseConnectLatencies: [],
    sseDisconnected: 0,
    sseReadErrors: 0,
    sseParseErrors: 0,
    sseEvents: 0,
    tickEvents: 0,
    heartbeatEvents: 0,
    sseBytes: 0,
    subscribeAttempts: 0,
    subscribeOk: 0,
    subscribeFailed: 0,
    subscribeUnauthorized: 0,
    unsubscribeAttempts: 0,
    unsubscribeOk: 0,
    unsubscribeFailed: 0,
    unsubscribeUnauthorized: 0,
    subscribeLatencies: [],
    unsubscribeLatencies: [],
  };
}

function printProgress(metrics, runtimes, config, previousSnapshot, label) {
  const now = Date.now();
  const elapsedSec = Math.max(1, Math.floor((now - metrics.startedAtMs) / 1000));
  const activeUsers = runtimes.filter((r) => !r.done).length;
  const connectedNow = runtimes.filter((r) => r.connected).length;

  const eventDelta = metrics.sseEvents - previousSnapshot.sseEvents;
  const tickDelta = metrics.tickEvents - previousSnapshot.tickEvents;
  const bytesDelta = metrics.sseBytes - previousSnapshot.sseBytes;
  const intervalSec = Math.max(1, (now - previousSnapshot.tsMs) / 1000);

  const eventsPerSec = eventDelta / intervalSec;
  const ticksPerSec = tickDelta / intervalSec;
  const kbPerSec = bytesDelta / 1024 / intervalSec;
  const heapMb = process.memoryUsage().heapUsed / 1024 / 1024;

  const connectP95 = percentile(metrics.sseConnectLatencies, 95);
  const subscribeP95 = percentile(metrics.subscribeLatencies, 95);

  console.log(
    `[${label}] [${nowIso()}] elapsed=${elapsedSec}s active=${activeUsers}/${config.users} connected=${connectedNow} ` +
      `connectOk=${metrics.sseConnected} connectFail=${metrics.sseConnectFailed} events/s=${eventsPerSec.toFixed(1)} ` +
      `ticks/s=${ticksPerSec.toFixed(1)} kb/s=${kbPerSec.toFixed(1)} heapMb=${heapMb.toFixed(1)} ` +
      `connP95Ms=${connectP95.toFixed(1)} subP95Ms=${subscribeP95.toFixed(1)}`
  );

  previousSnapshot.tsMs = now;
  previousSnapshot.sseEvents = metrics.sseEvents;
  previousSnapshot.tickEvents = metrics.tickEvents;
  previousSnapshot.sseBytes = metrics.sseBytes;
}

function buildSummary(metrics, runtimes) {
  const finishedAtMs = Date.now();
  const elapsedSec = Math.max(1, Math.floor((finishedAtMs - metrics.startedAtMs) / 1000));
  const activeLeft = runtimes.filter((r) => !r.done).length;

  const connectSuccessRate = metrics.sseConnectAttempts
    ? (metrics.sseConnected / metrics.sseConnectAttempts) * 100
    : 0;
  const subscribeSuccessRate = metrics.subscribeAttempts
    ? (metrics.subscribeOk / metrics.subscribeAttempts) * 100
    : 0;
  const unsubscribeSuccessRate = metrics.unsubscribeAttempts
    ? (metrics.unsubscribeOk / metrics.unsubscribeAttempts) * 100
    : 0;

  return {
    finishedAtIso: nowIso(),
    durationSec: elapsedSec,
    sseConnectAttempts: metrics.sseConnectAttempts,
    sseConnected: metrics.sseConnected,
    sseConnectFailed: metrics.sseConnectFailed,
    sseConnectUnauthorized: metrics.sseConnectUnauthorized,
    sseConnectSuccessRatePct: connectSuccessRate,
    sseReadErrors: metrics.sseReadErrors,
    sseParseErrors: metrics.sseParseErrors,
    sseEvents: metrics.sseEvents,
    tickEvents: metrics.tickEvents,
    heartbeatEvents: metrics.heartbeatEvents,
    avgEventsPerSec: metrics.sseEvents / elapsedSec,
    avgTicksPerSec: metrics.tickEvents / elapsedSec,
    sseBytesMB: metrics.sseBytes / 1024 / 1024,
    connectP50Ms: percentile(metrics.sseConnectLatencies, 50),
    connectP95Ms: percentile(metrics.sseConnectLatencies, 95),
    subscribeAttempts: metrics.subscribeAttempts,
    subscribeOk: metrics.subscribeOk,
    subscribeFailed: metrics.subscribeFailed,
    subscribeUnauthorized: metrics.subscribeUnauthorized,
    subscribeSuccessRatePct: subscribeSuccessRate,
    subscribeP95Ms: percentile(metrics.subscribeLatencies, 95),
    unsubscribeAttempts: metrics.unsubscribeAttempts,
    unsubscribeOk: metrics.unsubscribeOk,
    unsubscribeFailed: metrics.unsubscribeFailed,
    unsubscribeUnauthorized: metrics.unsubscribeUnauthorized,
    unsubscribeSuccessRatePct: unsubscribeSuccessRate,
    unsubscribeP95Ms: percentile(metrics.unsubscribeLatencies, 95),
    usersStillActive: activeLeft,
  };
}

function printSummary(summary, label) {
  console.log(`\n==== Load Test Summary (${label}) ====`);
  console.log(`finishedAt: ${summary.finishedAtIso}`);
  console.log(`durationSec: ${summary.durationSec}`);
  console.log(`sseConnectAttempts: ${summary.sseConnectAttempts}`);
  console.log(`sseConnected: ${summary.sseConnected}`);
  console.log(`sseConnectFailed: ${summary.sseConnectFailed}`);
  console.log(`sseConnectUnauthorized: ${summary.sseConnectUnauthorized}`);
  console.log(`sseConnectSuccessRatePct: ${summary.sseConnectSuccessRatePct.toFixed(2)}`);
  console.log(`sseReadErrors: ${summary.sseReadErrors}`);
  console.log(`sseParseErrors: ${summary.sseParseErrors}`);
  console.log(`sseEvents: ${summary.sseEvents}`);
  console.log(`tickEvents: ${summary.tickEvents}`);
  console.log(`heartbeatEvents: ${summary.heartbeatEvents}`);
  console.log(`avgEventsPerSec: ${summary.avgEventsPerSec.toFixed(2)}`);
  console.log(`avgTicksPerSec: ${summary.avgTicksPerSec.toFixed(2)}`);
  console.log(`sseBytesMB: ${summary.sseBytesMB.toFixed(2)}`);
  console.log(`connectP50Ms: ${summary.connectP50Ms.toFixed(1)}`);
  console.log(`connectP95Ms: ${summary.connectP95Ms.toFixed(1)}`);
  console.log(`subscribeAttempts: ${summary.subscribeAttempts}`);
  console.log(`subscribeOk: ${summary.subscribeOk}`);
  console.log(`subscribeFailed: ${summary.subscribeFailed}`);
  console.log(`subscribeUnauthorized: ${summary.subscribeUnauthorized}`);
  console.log(`subscribeSuccessRatePct: ${summary.subscribeSuccessRatePct.toFixed(2)}`);
  console.log(`subscribeP95Ms: ${summary.subscribeP95Ms.toFixed(1)}`);
  console.log(`unsubscribeAttempts: ${summary.unsubscribeAttempts}`);
  console.log(`unsubscribeOk: ${summary.unsubscribeOk}`);
  console.log(`unsubscribeFailed: ${summary.unsubscribeFailed}`);
  console.log(`unsubscribeUnauthorized: ${summary.unsubscribeUnauthorized}`);
  console.log(`unsubscribeSuccessRatePct: ${summary.unsubscribeSuccessRatePct.toFixed(2)}`);
  console.log(`unsubscribeP95Ms: ${summary.unsubscribeP95Ms.toFixed(1)}`);
  console.log(`usersStillActive: ${summary.usersStillActive}`);
  console.log("===================================\n");
}

function evaluateSummary(summary, config) {
  const reasons = [];
  const t = config.thresholds;

  if (summary.sseConnectSuccessRatePct < t.minConnectSuccessPct) {
    reasons.push(
      `connect success ${summary.sseConnectSuccessRatePct.toFixed(2)}% < ${t.minConnectSuccessPct}%`
    );
  }
  if (summary.sseReadErrors > t.maxSseReadErrors) {
    reasons.push(`sseReadErrors ${summary.sseReadErrors} > ${t.maxSseReadErrors}`);
  }
  if (summary.connectP95Ms > t.maxConnectP95Ms) {
    reasons.push(`connectP95 ${summary.connectP95Ms.toFixed(1)}ms > ${t.maxConnectP95Ms}ms`);
  }
  if (summary.usersStillActive > t.maxUsersStillActive) {
    reasons.push(`usersStillActive ${summary.usersStillActive} > ${t.maxUsersStillActive}`);
  }

  if (config.subscribe) {
    if (summary.subscribeSuccessRatePct < t.minSubscribeSuccessPct) {
      reasons.push(
        `subscribe success ${summary.subscribeSuccessRatePct.toFixed(2)}% < ${t.minSubscribeSuccessPct}%`
      );
    }
    if (summary.unsubscribeSuccessRatePct < t.minUnsubscribeSuccessPct) {
      reasons.push(
        `unsubscribe success ${summary.unsubscribeSuccessRatePct.toFixed(2)}% < ${t.minUnsubscribeSuccessPct}%`
      );
    }
    if (summary.subscribeP95Ms > t.maxSubscribeP95Ms) {
      reasons.push(`subscribeP95 ${summary.subscribeP95Ms.toFixed(1)}ms > ${t.maxSubscribeP95Ms}ms`);
    }
    if (summary.unsubscribeP95Ms > t.maxUnsubscribeP95Ms) {
      reasons.push(
        `unsubscribeP95 ${summary.unsubscribeP95Ms.toFixed(1)}ms > ${t.maxUnsubscribeP95Ms}ms`
      );
    }
  }

  return {
    pass: reasons.length === 0,
    reasons,
  };
}

function csvEscape(value) {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
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
    "time",
    "mode",
    "label",
    "step_index",
    "users",
    "duration_sec",
    "connect_success_pct",
    "connect_p95_ms",
    "sse_read_errors",
    "sse_events",
    "tick_events",
    "subscribe_success_pct",
    "unsubscribe_success_pct",
    "subscribe_p95_ms",
    "unsubscribe_p95_ms",
    "pass",
    "fail_reasons",
    "stop_reason",
  ];

  const lines = [headers.join(",")];
  for (const row of rows) {
    const values = headers.map((header) => csvEscape(row[header] ?? ""));
    lines.push(values.join(","));
  }
  fs.writeFileSync(absPath, `${lines.join("\n")}\n`, "utf8");
  console.log(`CSV written: ${absPath}`);
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

async function runLoadScenario({
  config,
  symbolPool,
  label,
  globalControl,
}) {
  printConfig(config, symbolPool, label);

  const metrics = makeMetrics();
  const stopState = { stopping: false, reason: "" };
  const runtimes = [];
  const tasks = [];

  const testEndAt = Date.now() + config.durationSec * 1000;
  const previousSnapshot = {
    tsMs: Date.now(),
    sseEvents: 0,
    tickEvents: 0,
    sseBytes: 0,
  };

  const reporter = setInterval(() => {
    printProgress(metrics, runtimes, config, previousSnapshot, label);
  }, config.reportEverySec * 1000);

  try {
    for (let i = 0; i < config.users && !stopState.stopping && !globalControl.interrupted; i++) {
      const runtime = {
        id: i + 1,
        controller: new AbortController(),
        connected: false,
        done: false,
      };
      runtimes.push(runtime);

      const task = runVirtualUser({
        runtime,
        config,
        symbolPool,
        metrics,
        stopState,
      });
      tasks.push(task);

      if (Date.now() >= testEndAt) break;
      if (config.rampMs > 0) await sleep(config.rampMs);
    }

    while (!stopState.stopping && !globalControl.interrupted && Date.now() < testEndAt) {
      await sleep(200);
    }

    if (!stopState.stopping) {
      if (globalControl.interrupted) {
        stopState.stopping = true;
        stopState.reason = "Interrupted by SIGINT.";
      } else {
        stopState.stopping = true;
        stopState.reason = "Duration complete.";
      }
    }
  } finally {
    clearInterval(reporter);
    for (const runtime of runtimes) {
      try {
        runtime.controller.abort();
      } catch {
        // ignore
      }
    }
    await Promise.allSettled(tasks);
  }

  if (stopState.reason) {
    console.log(`[${label}] Stop reason: ${stopState.reason}`);
  }

  const summary = buildSummary(metrics, runtimes);
  printSummary(summary, label);

  const unauthorizedTotal =
    summary.sseConnectUnauthorized + summary.subscribeUnauthorized + summary.unsubscribeUnauthorized;

  return {
    summary,
    stopReason: stopState.reason,
    unauthorizedTotal,
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
  console.log("\n==== Step Test Results ====");
  for (const row of rows) {
    console.log(
      `step=${row.step_index} users=${row.users} pass=${row.pass} ` +
      `conn=${Number(row.connect_success_pct).toFixed(2)}% ` +
      `connP95=${Number(row.connect_p95_ms).toFixed(1)}ms ` +
      `sub=${Number(row.subscribe_success_pct).toFixed(2)}% ` +
      `unsub=${Number(row.unsubscribe_success_pct).toFixed(2)}%`
    );
  }
  console.log("===========================\n");
}

async function runSingleMode({ config, symbolPool, globalControl }) {
  const result = await runLoadScenario({
    config,
    symbolPool,
    label: "single",
    globalControl,
  });

  const evaluation = evaluateSummary(result.summary, config);
  printStepEvaluation({ label: "single", users: config.users, evaluation });

  const row = {
    time: nowIso(),
    mode: "single",
    label: "single",
    step_index: 1,
    users: config.users,
    duration_sec: result.summary.durationSec,
    connect_success_pct: result.summary.sseConnectSuccessRatePct.toFixed(2),
    connect_p95_ms: result.summary.connectP95Ms.toFixed(1),
    sse_read_errors: result.summary.sseReadErrors,
    sse_events: result.summary.sseEvents,
    tick_events: result.summary.tickEvents,
    subscribe_success_pct: result.summary.subscribeSuccessRatePct.toFixed(2),
    unsubscribe_success_pct: result.summary.unsubscribeSuccessRatePct.toFixed(2),
    subscribe_p95_ms: result.summary.subscribeP95Ms.toFixed(1),
    unsubscribe_p95_ms: result.summary.unsubscribeP95Ms.toFixed(1),
    pass: evaluation.pass ? "PASS" : "FAIL",
    fail_reasons: evaluation.reasons.join(" | "),
    stop_reason: result.stopReason,
  };

  if (config.csvOut) {
    writeCsv(config.csvOut, [row]);
  }

  return {
    unauthorizedTotal: result.unauthorizedTotal,
    anyFail: !evaluation.pass,
  };
}

async function runStepMode({ config, symbolPool, globalControl }) {
  const steps = buildStepUsers(config);
  if (!steps.length) {
    throw new Error("No step values generated.");
  }

  console.log(`Step users: ${steps.join(", ")}`);
  const rows = [];
  let unauthorizedTotal = 0;
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

    unauthorizedTotal += result.unauthorizedTotal;
    const evaluation = evaluateSummary(result.summary, stepConfig);
    if (!evaluation.pass) anyFail = true;

    printStepEvaluation({ label, users, evaluation });

    rows.push({
      time: nowIso(),
      mode: "step",
      label,
      step_index: i + 1,
      users,
      duration_sec: result.summary.durationSec,
      connect_success_pct: result.summary.sseConnectSuccessRatePct.toFixed(2),
      connect_p95_ms: result.summary.connectP95Ms.toFixed(1),
      sse_read_errors: result.summary.sseReadErrors,
      sse_events: result.summary.sseEvents,
      tick_events: result.summary.tickEvents,
      subscribe_success_pct: result.summary.subscribeSuccessRatePct.toFixed(2),
      unsubscribe_success_pct: result.summary.unsubscribeSuccessRatePct.toFixed(2),
      subscribe_p95_ms: result.summary.subscribeP95Ms.toFixed(1),
      unsubscribe_p95_ms: result.summary.unsubscribeP95Ms.toFixed(1),
      pass: evaluation.pass ? "PASS" : "FAIL",
      fail_reasons: evaluation.reasons.join(" | "),
      stop_reason: result.stopReason,
    });

    if (!evaluation.pass && config.stepStopOnFail) {
      console.log(`Stopping step run on first failure at users=${users}.`);
      break;
    }
  }

  printStepTable(rows);
  if (config.csvOut) {
    writeCsv(config.csvOut, rows);
  }

  return { unauthorizedTotal, anyFail };
}

async function main() {
  const cliArgs = parseArgs(process.argv.slice(2));
  if (cliArgs.help === "true") {
    printHelp();
    return;
  }

  const config = getConfig(cliArgs);
  const symbolPool = loadSymbols(config);
  const globalControl = { interrupted: false };

  process.on("SIGINT", () => {
    if (!globalControl.interrupted) {
      globalControl.interrupted = true;
      console.log("\nStopping test (SIGINT)...");
    }
  });

  let result;
  if (config.mode === "step") {
    result = await runStepMode({ config, symbolPool, globalControl });
  } else {
    result = await runSingleMode({ config, symbolPool, globalControl });
  }

  if (result.unauthorizedTotal > 0) {
    process.exitCode = 2;
    return;
  }

  if (result.anyFail) {
    process.exitCode = 3;
  }
}

main().catch((error) => {
  console.error("Load test script failed:", error);
  process.exit(1);
});
