import WebSocket from "ws";
import protobuf from "protobufjs";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { tokenProvider } from "./token-provider.js";
import { logger } from "../lib/logger.js";

type MarketUpdateCallback = (data: unknown) => void;
type SubscriptionMethod = "sub" | "unsub" | "change_mode";

let upstoxWebSocketInstance: UpstoxWebSocket | null = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const protoPath = join(__dirname, "proto.json");
const protoJson = JSON.parse(readFileSync(protoPath, "utf-8"));

let protobufRoot: protobuf.Root | null = null;

function getProtobufRoot(): protobuf.Root {
  if (protobufRoot) return protobufRoot;
  protobufRoot = protobuf.Root.fromJSON(protoJson as any);
  logger.info("Protobuf JSON loaded successfully");
  return protobufRoot;
}

function createGuid(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class UpstoxWebSocket {
  private ws: WebSocket | null = null;
  private onUpdate: MarketUpdateCallback | null = null;
  private subscriptions = new Set<string>();
  private isConnected = false;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private authCooldownUntilMs = 0;
  private lastTokenUsed: string | null = null;
  private readonly SUBSCRIPTION_MODE = "ltpc";

  private constructor() {}

  public static getInstance(): UpstoxWebSocket {
    if (!upstoxWebSocketInstance) {
      logger.info("Creating UpstoxWebSocket singleton");
      upstoxWebSocketInstance = new UpstoxWebSocket();
    }
    return upstoxWebSocketInstance;
  }

  isSocketConnected(): boolean {
    return this.isConnected;
  }

  hasActiveSubscriptions(): boolean {
    return this.subscriptions.size > 0;
  }

  getAuthCooldownRemainingMs(): number {
    return Math.max(0, this.authCooldownUntilMs - Date.now());
  }

  async connect(onUpdate: MarketUpdateCallback): Promise<void> {
    if (this.isConnected) {
      this.onUpdate = onUpdate;
      return;
    }
    if (this.isConnecting) {
      this.onUpdate = onUpdate;
      return;
    }

    const authCooldownRemainingMs = this.getAuthCooldownRemainingMs();
    if (authCooldownRemainingMs > 0) {
      logger.warn(
        { cooldownMs: authCooldownRemainingMs },
        "Skipping Upstox WebSocket connect during auth cooldown"
      );
      return;
    }

    this.onUpdate = onUpdate;
    const initialKeys = Array.from(this.subscriptions);
    if (initialKeys.length === 0) {
      logger.info("No symbols queued - skipping WS connect");
      return;
    }

    this.isConnecting = true;

    try {
      const token = await tokenProvider.getToken();
      this.lastTokenUsed = token;

      const authorizedUrl = await this.getAuthorizedWsUrl(token);
      logger.info(
        { symbolCount: initialKeys.length },
        "Connecting to Upstox authorized market feed URL"
      );

      this.ws = new WebSocket(authorizedUrl, { followRedirects: true });

      this.ws.on("open", () => {
        this.isConnected = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        logger.info("Upstox WebSocket Connected");

        const currentKeys = Array.from(this.subscriptions);
        if (currentKeys.length > 0) {
          this.sendRequest("sub", currentKeys, this.SUBSCRIPTION_MODE);
          logger.info(
            { symbolCount: currentKeys.length },
            "Subscribed initial instruments on open"
          );
        }
      });

      this.ws.on("message", (raw) => {
        const decoded = this.decodeMessage(raw);
        if (decoded && this.onUpdate) {
          this.onUpdate(decoded);
        }
      });

      this.ws.on("error", (error) => {
        this.handleError(error);
      });

      this.ws.on("close", () => {
        this.handleClose();
      });
    } catch (error: any) {
      const message = String(error?.message || "");
      logger.error({ err: message }, "Failed to start Upstox stream");

      if (this.isAuthFailure(error)) {
        tokenProvider.invalidate(this.lastTokenUsed || undefined);
        this.authCooldownUntilMs = Date.now() + 60_000;
        logger.warn("Upstox auth failure (401/403) during connect; cooldown applied");
      } else {
        this.reconnectAttempts++;
      }

      this.isConnecting = false;
    }
  }

  subscribe(instrumentKeys: string[]): void {
    const wasEmpty = this.subscriptions.size === 0;
    instrumentKeys.forEach((key) => this.subscriptions.add(key));

    if (this.isConnected) {
      this.sendRequest("sub", instrumentKeys, this.SUBSCRIPTION_MODE);
      logger.info({ symbolCount: instrumentKeys.length }, "Subscribed via Upstox WebSocket");
      return;
    }

    if (wasEmpty && instrumentKeys.length > 0 && this.onUpdate) {
      void this.connect(this.onUpdate);
    }
  }

  unsubscribe(instrumentKeys: string[]): void {
    instrumentKeys.forEach((key) => this.subscriptions.delete(key));

    if (this.isConnected) {
      this.sendRequest("unsub", instrumentKeys);
      logger.info({ symbolCount: instrumentKeys.length }, "Unsubscribed via Upstox WebSocket");
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close(1000);
      this.ws = null;
    }
    this.isConnected = false;
    this.isConnecting = false;
    logger.info("Upstox Streamer stopped");
  }

  private isAuthFailure(errorLike: unknown): boolean {
    const message = String((errorLike as any)?.message || errorLike || "").toLowerCase();
    return (
      message.includes("401") ||
      message.includes("403") ||
      message.includes("unauthorized") ||
      message.includes("forbidden")
    );
  }

  private async getAuthorizedWsUrl(token: string): Promise<string> {
    const response = await fetch("https://api.upstox.com/v3/feed/market-data-feed/authorize", {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    const bodyText = await response.text();
    let payload: any = null;
    try {
      payload = JSON.parse(bodyText);
    } catch {
      payload = null;
    }

    if (!response.ok) {
      throw new Error(
        `Upstox authorize failed (${response.status}): ${bodyText.slice(0, 300)}`
      );
    }

    const url =
      payload?.data?.authorizedRedirectUri ??
      payload?.data?.authorized_redirect_uri ??
      null;

    if (!url || typeof url !== "string") {
      throw new Error("Upstox authorize response missing authorized redirect URI");
    }

    return url;
  }

  private sendRequest(
    method: SubscriptionMethod,
    instrumentKeys: string[],
    mode?: string
  ): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (instrumentKeys.length === 0) return;

    const payload: any = {
      guid: createGuid(),
      method,
      data: {
        instrumentKeys,
      },
    };

    if (mode) {
      payload.data.mode = mode;
    }

    this.ws.send(Buffer.from(JSON.stringify(payload)));
  }

  private decodeMessage(raw: WebSocket.RawData): unknown | null {
    try {
      const root = getProtobufRoot();
      const FeedResponse = root.lookupType(
        "com.upstox.marketdatafeederv3udapi.rpc.proto.FeedResponse"
      );

      let buffer: Buffer;
      if (Buffer.isBuffer(raw)) {
        buffer = raw;
      } else if (Array.isArray(raw)) {
        buffer = Buffer.concat(raw as Buffer[]);
      } else if (raw instanceof ArrayBuffer) {
        buffer = Buffer.from(raw);
      } else {
        buffer = Buffer.from(raw as Buffer);
      }

      const decoded = FeedResponse.decode(buffer);
      return FeedResponse.toObject(decoded, {
        longs: Number,
        enums: String,
        bytes: Buffer,
      });
    } catch (error) {
      logger.warn({ err: error }, "Failed to decode Upstox protobuf message");
      return null;
    }
  }

  private handleError(error: unknown): void {
    logger.error({ err: error }, "Upstox Streamer Error");

    if (this.isAuthFailure(error)) {
      tokenProvider.invalidate(this.lastTokenUsed || undefined);
      this.authCooldownUntilMs = Date.now() + 60_000;
      this.isConnected = false;
      this.isConnecting = false;
      logger.warn("Upstox runtime auth failure (401/403); cached token invalidated");
    }
  }

  private handleClose(): void {
    this.isConnected = false;
    this.isConnecting = false;
    this.ws = null;
    logger.info("Upstox Streamer Disconnected");
  }
}
