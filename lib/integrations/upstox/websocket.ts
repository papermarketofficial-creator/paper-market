import { ApiClient, MarketDataStreamerV3 } from "upstox-js-sdk";
import { UpstoxService } from "@/services/upstox.service";
import { logger } from "@/lib/logger";
import path from "path";
import protobuf from "protobufjs";

type MarketUpdateCallback = (data: unknown) => void;

// ─────────────────────────────────────────────────────────────────
// 🛠️ HACK: Pre-load .proto file synchronously for patching
// Use absolute path from project root (process.cwd() points to project root in Next.js)
const PROTO_PATH = path.join(
    process.cwd(),
    "lib", "integrations", "upstox", "proto", "MarketDataFeedV3.proto"
);

let protobufRoot: any = null;
try {
    protobufRoot = protobuf.loadSync(PROTO_PATH);
    console.log("✅ Protobuf loaded from:", PROTO_PATH);
} catch (e) {
    console.error("Error loading .proto file", e);
    // Try fallback path for development
    try {
        const fallbackPath = path.join(__dirname, "proto", "MarketDataFeedV3.proto");
        protobufRoot = protobuf.loadSync(fallbackPath);
        console.log("✅ Protobuf loaded from fallback:", fallbackPath);
    } catch (e2) {
        console.error("❌ CRITICAL: Failed to load .proto from both paths");
    }
}
// ─────────────────────────────────────────────────────────────────

export class UpstoxWebSocket {
    private streamer: any = null; // SDK Streamer instance
    private onUpdate: MarketUpdateCallback | null = null;
    private subscriptions: Set<string> = new Set();
    private isConnected: boolean = false;

    constructor() {}

    /**
     * Connect to Upstox WebSocket using SDK
     */
    async connect(onUpdate: MarketUpdateCallback): Promise<void> {
        if (this.isConnected) {
            console.log("⚠️ UpstoxWebSocket: Already connected or connecting");
            return;
        }

        this.onUpdate = onUpdate;

        try {
            console.log("STEP 1: trying to fetch token");
            const token = await UpstoxService.getSystemToken();
            if (!token) {
                console.log("❌ STEP 1 FAIL: No token found");
                throw new Error("No active Upstox token found");
            }
            console.log("STEP 2: token received");

            console.log("STEP 3: setting ApiClient");
            // Configure API Client using singleton instance
            const defaultClient = ApiClient.instance;
            const OAUTH2 = defaultClient.authentications["OAUTH2"];
            OAUTH2.accessToken = token;

            console.log("STEP 4: creating streamer");
            // Initialize Streamer WITH initial subscriptions (required by SDK)
            // Convert pending subscriptions to array
            const initialKeys = Array.from(this.subscriptions);
            const initialMode = "ltpc"; // Start with lightweight mode
            
            console.log(`📡 Initializing streamer with ${initialKeys.length} symbols:`, initialKeys);
            this.streamer = new MarketDataStreamerV3(
                initialKeys.length > 0 ? initialKeys : ["NSE_EQ|INE002A01018"], // Fallback to dummy symbol if empty
                initialMode
            );

            console.log("STEP 5: attaching events");
            // Setup Event Handlers
            this.streamer.on("open", this.handleOpen.bind(this));
            this.streamer.on("message", this.handleMessage.bind(this));
            this.streamer.on("error", this.handleError.bind(this));
            this.streamer.on("close", this.handleClose.bind(this));
            
            // TEMPORARY: Disable Auto Reconnect until token is stable
            this.streamer.autoReconnect(false);

            console.log("STEP 6: calling connect()");
            logger.info("Starting Upstox SDK Streamer V3...");
            this.streamer.connect();

        } catch (error: any) {
            console.log("❌ STEP FAIL:", error.message);
            logger.error({ err: error.message }, "Failed to start Upstox Streamer");
        }
    }

    /**
     * Subscribe to instruments
     */
    subscribe(instrumentKeys: string[]): void {
        instrumentKeys.forEach(key => this.subscriptions.add(key));

        if (this.isConnected && this.streamer) {
            console.log(`📡 SUB: Subscribing to ${instrumentKeys.join(', ')} (ltpc)`);
            this.streamer.subscribe(instrumentKeys, "ltpc");
            logger.info({ count: instrumentKeys.length }, "Subscribed via SDK");
        }
    }

    /**
     * Unsubscribe
     */
    unsubscribe(instrumentKeys: string[]): void {
        instrumentKeys.forEach(key => this.subscriptions.delete(key));

        if (this.isConnected && this.streamer) {
            console.log(`📡 UNSUB: Unsubscribing from ${instrumentKeys.join(', ')}`);
            this.streamer.unsubscribe(instrumentKeys);
        }
    }

    /**
     * Disconnect
     */
    disconnect(): void {
        if (this.streamer) {
            console.log("🔴 DISCONNECT CALLED");
            this.streamer.disconnect();
            this.streamer = null;
        }
        this.isConnected = false;
        logger.info("Upstox Streamer stopped");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Event Handlers
    // ─────────────────────────────────────────────────────────────────────────

    private handleOpen(): void {
        this.isConnected = true;
        console.log("🟢 WS OPEN EVENT FIRED");

        // ─────────────────────────────────────────────────────────────────
        // 🛠️ HACK: Inject pre-loaded Protobuf root into SDK feeder
        // The internal feeder is only available AFTER connect(), so we patch here.
        // ─────────────────────────────────────────────────────────────────
        const feeder = (this.streamer as any)?.streamer;
        if (feeder && protobufRoot) {
            feeder.protobufRoot = protobufRoot;
            console.log("✅ HACK: Protobuf root injected into SDK feeder.");
        } else {
            console.error("❌ HACK FAIL: Could not inject protobufRoot. Feeder:", !!feeder, "Root:", !!protobufRoot);
        }
        // ─────────────────────────────────────────────────────────────────
        
        logger.info("Upstox SDK Streamer Connected");

        // Note: Symbols passed to constructor are auto-subscribed on connect
        // Only subscribe to additional symbols added after connection
        // For now, we pass all symbols to constructor, so no need to resubscribe here
    }

    private handleMessage(data: any): void {
        let decoded: any = null;

        try {
            // Case 1: Native Buffer
            if (Buffer.isBuffer(data)) {
                decoded = JSON.parse(data.toString("utf-8"));
            }
            // Case 2: { type: "Buffer", data: [...] } (Serialized Buffer)
            else if (data?.type === "Buffer" && Array.isArray(data.data)) {
                decoded = JSON.parse(Buffer.from(data.data).toString("utf-8"));
            }
            // Already decoded object
            else {
                decoded = data;
            }

            console.log("📩 TICK:", JSON.stringify(decoded, null, 2));

            if (this.onUpdate) {
                this.onUpdate(decoded);
            }
        } catch (err) {
            console.error("❌ Decode failed:", err, "Data:", JSON.stringify(data).slice(0, 100));
        }
    }

    private handleError(error: any): void {
        console.log("❌ ERROR:", JSON.stringify(error));
        logger.error({ err: error }, "Upstox Streamer Error");
    }

    private handleClose(): void {
        this.isConnected = false;
        console.log("🔴 CLOSE");
        logger.info("Upstox Streamer Disconnected");
    }
}
