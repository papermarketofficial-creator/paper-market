import { ApiClient, MarketDataStreamerV3 } from "upstox-js-sdk";
import { tokenProvider } from "./token-provider.js";
import { logger } from "../lib/logger.js";
import protobuf from "protobufjs";
import { readFileSync } from "fs";
import { join } from "path";

// Load proto.json from the source directory
const protoPath = join(process.cwd(), 'src', 'upstox', 'proto.json');
const protoJson = JSON.parse(readFileSync(protoPath, 'utf-8'));

// ═══════════════════════════════════════════════════════════
// 🛠️ SINGLETON PATTERN: Global declaration
// ═══════════════════════════════════════════════════════════
let upstoxWebSocketInstance: UpstoxWebSocket | null = null;

type MarketUpdateCallback = (data: unknown) => void;

// Lazy singleton for protobuf root
let protobufRoot: any = null;
let protobufLoadPatched = false;

function getProtobufRoot() {
    if (protobufRoot) return protobufRoot;

    try {
        protobufRoot = protobuf.Root.fromJSON(protoJson as any);
        console.log("✅ Protobuf JSON loaded successfully");
        return protobufRoot;
    } catch (error) {
        console.error("❌ Failed to load protobuf JSON:", error);
        throw error;
    }
}

function patchSdkProtoLoad(): void {
    if (protobufLoadPatched) return;

    const originalLoad = (protobuf as any).load?.bind(protobuf);
    if (typeof originalLoad !== "function") return;

    (protobuf as any).load = (filename: any, callback?: any) => {
        const target = typeof filename === "string" ? filename : "";
        const isMarketFeedProto = target.includes("MarketDataFeedV3.proto");

        if (isMarketFeedProto) {
            const root = getProtobufRoot();
            if (typeof callback === "function") {
                callback(null, root);
                return;
            }
            return Promise.resolve(root);
        }

        return originalLoad(filename, callback);
    };

    protobufLoadPatched = true;
}

export class UpstoxWebSocket {
    private streamer: any = null; // SDK Streamer instance
    private onUpdate: MarketUpdateCallback | null = null;
    private subscriptions: Set<string> = new Set();
    private isConnected: boolean = false;
    private isConnecting: boolean = false;
    private reconnectAttempts: number = 0;
    private authCooldownUntilMs: number = 0;

    // ═══════════════════════════════════════════════════════════
    // 🛠️ PRIVATE CONSTRUCTOR: Prevent direct instantiation
    // ═══════════════════════════════════════════════════════════
    private constructor() {}

    // ═══════════════════════════════════════════════════════════
    // 🛠️ SINGLETON ACCESSOR: Get or create instance
    // ═══════════════════════════════════════════════════════════
    public static getInstance(): UpstoxWebSocket {
        if (!upstoxWebSocketInstance) {
            console.log("🆕 Creating UpstoxWebSocket singleton");
            upstoxWebSocketInstance = new UpstoxWebSocket();
        } else {
            console.log("♻️ Reusing UpstoxWebSocket singleton");
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

    /**
     * Connect to Upstox WebSocket using SDK
     */
    async connect(onUpdate: MarketUpdateCallback): Promise<void> {
        // ═══════════════════════════════════════════════════════════
        // 🛠️ GUARD: Already connected
        // ═══════════════════════════════════════════════════════════
        if (this.isConnected) {
            console.log("⚠️ UpstoxWebSocket: Already connected");
            this.onUpdate = onUpdate; // Update callback
            return;
        }
        if (this.isConnecting) {
            console.log("⏳ UpstoxWebSocket: Connect already in progress");
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

        // ═══════════════════════════════════════════════════════════
        // 🛠️ GUARD: Never connect with 0 symbols
        // ═══════════════════════════════════════════════════════════
        const initialKeys = Array.from(this.subscriptions);
        if (initialKeys.length === 0) {
            console.log("⚠️ No symbols queued - skipping WS connect");
            // Store callback for later when symbols are added
            return;
        }

        this.isConnecting = true;

        try {
            console.log("STEP 1: trying to fetch token");
            const token = await tokenProvider.getToken();
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
            // Patch protobufjs load for Upstox SDK constructor-time proto init.
            patchSdkProtoLoad();
            // Initialize Streamer WITH initial subscriptions (required by SDK)
            const initialMode = "ltpc"; // Start with lightweight mode
            
            console.log(`📡 Initializing streamer with ${initialKeys.length} symbols:`, initialKeys);
            this.streamer = new MarketDataStreamerV3(
                initialKeys, // Use actual symbols only (no fallback)
                initialMode
            );

            // ═══════════════════════════════════════════════════════════
            // 🚨 PROTOBUF INJECTION
            // ═══════════════════════════════════════════════════════════
            // SDK tries to load proto during connect(), so inject before that
            const feeder = (this.streamer as any)?.streamer;
            const root = getProtobufRoot();
            
            if (feeder && root) {
                feeder.protobufRoot = root;
                console.log("✅ Protobuf pre-injected into SDK feeder");
            }

            console.log("STEP 5: attaching events");
            // Setup Event Handlers
            this.streamer.on("open", this.handleOpen.bind(this));
            this.streamer.on("message", this.handleMessage.bind(this));
            this.streamer.on("error", this.handleError.bind(this));
            this.streamer.on("close", this.handleClose.bind(this));
            
            // Disable Auto Reconnect - we handle it manually with exponential backoff
            this.streamer.autoReconnect(false);

            console.log("STEP 6: calling connect()");
            logger.info("Starting Upstox SDK Streamer V3...");
            this.streamer.connect();

        } catch (error: any) {
            const message = String(error?.message || "");
            const isUnauthorized = message.includes("401") || message.toLowerCase().includes("unauthorized");
            console.log("STEP FAIL:", message);
            logger.error({ err: message }, "Failed to start Upstox Streamer");

            if (isUnauthorized) {
                tokenProvider.invalidate();
                this.authCooldownUntilMs = Date.now() + 60_000;
                logger.warn("Upstox connect unauthorized; cooldown applied");
                this.isConnecting = false;
                return;
            }

            this.reconnectAttempts++;
            this.isConnecting = false;
            logger.warn(
                { reconnectAttempts: this.reconnectAttempts },
                "Upstox connect failed; reconnect delegated to MarketFeedSupervisor"
            );
        }
    }

    /**
     * Subscribe to instruments
     */
    subscribe(instrumentKeys: string[]): void {
        const wasEmpty = this.subscriptions.size === 0;
        
        instrumentKeys.forEach(key => this.subscriptions.add(key));

        // ═══════════════════════════════════════════════════════════
        // 🛠️ TRIGGER CONNECTION: If this is the first subscription
        // ═══════════════════════════════════════════════════════════
        if (wasEmpty && instrumentKeys.length > 0 && !this.isConnected) {
            console.log("🔌 First subscription - initiating connection");
            if (this.onUpdate) {
                this.connect(this.onUpdate);
            }
        }
        // If already connected, subscribe normally
        else if (this.isConnected && this.streamer) {
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
        this.isConnecting = false;
        logger.info("Upstox Streamer stopped");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Event Handlers
    // ─────────────────────────────────────────────────────────────────────────

    private handleOpen(): void {
        this.isConnected = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0; // Reset on successful connection
        console.log("🟢 WS OPEN EVENT FIRED");

        // ─────────────────────────────────────────────────────────────────
        // 🛠️ HACK: Inject pre-loaded Protobuf root into SDK feeder
        // The internal feeder is only available AFTER connect(), so we patch here.
        // ─────────────────────────────────────────────────────────────────
        const feeder = (this.streamer as any)?.streamer;
        const root = getProtobufRoot();
        
        if (feeder && root) {
            feeder.protobufRoot = root;
            console.log("✅ Protobuf injected into SDK feeder");
        } else {
            console.error("❌ HACK FAIL: Could not inject protobufRoot. Feeder:", !!feeder, "Root:", !!root);
        }
        // ─────────────────────────────────────────────────────────────────
        
        logger.info("Upstox WebSocket Connected");
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

            if (process.env.DEBUG_MARKET === 'true') {
                console.log("📩 TICK:", JSON.stringify(decoded, null, 2));
            }

            if (this.onUpdate) {
                this.onUpdate(decoded);
            }
        } catch (err) {
            console.error("❌ Decode failed:", err, "Data:", JSON.stringify(data).slice(0, 100));
        }
    }

    private handleError(error: any): void {
        console.log("ERROR:", JSON.stringify(error));
        logger.error({ err: error }, "Upstox Streamer Error");

        const message = String(error?.message || "");
        const isUnauthorized = message.includes("401") || message.toLowerCase().includes("unauthorized");
        if (isUnauthorized) {
            tokenProvider.invalidate();
            this.authCooldownUntilMs = Date.now() + 60_000;
            this.isConnected = false;
            this.isConnecting = false;
            logger.warn("Upstox runtime unauthorized; cached token invalidated");
        }
    }

    private handleClose(): void {
        this.isConnected = false;
        this.isConnecting = false;
        console.log("🔴 CLOSE");
        logger.info("Upstox Streamer Disconnected");
    }
}
