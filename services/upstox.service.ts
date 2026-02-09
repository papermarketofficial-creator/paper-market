import { db } from "@/lib/db";
import { upstoxTokens, type NewUpstoxToken, instruments } from "@/lib/db/schema";
import { eq, gt, desc } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { ApiError } from "@/lib/errors";
import { cache, CacheKeys } from "@/lib/cache";
import { upstoxRateLimiter } from "@/lib/rate-limit";

const UPSTOX_API_URL = "https://api.upstox.com/v2";

export interface UpstoxConfig {
  apiKey: string;
  apiSecret: string;
  redirectUri: string;
}

export class UpstoxService {
  private static config: UpstoxConfig = {
    apiKey: process.env.UPSTOX_API_KEY || "",
    apiSecret: process.env.UPSTOX_API_SECRET || "",
    redirectUri: process.env.UPSTOX_REDIRECT_URI || "",
  };

  // ═══════════════════════════════════════════════════════════
  // 🚨 PHASE 3: Token Cache (Prevent DB hits on reconnect)
  // ═══════════════════════════════════════════════════════════
  // WHY: Reconnect path must be memory-only. DB hits = latency spikes.
  // Reconnect storms → DB storms → system latency (cascade failure)
  private static cachedToken: string | null = null;
  private static expiry = 0;
  // 🔥 CRITICAL: promise lock to prevent stampedes
  private static tokenPromise: Promise<string | null> | null = null;

  /**
   * Generate the Authorization URL for user login
   */
  static getAuthUrl(): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.config.apiKey,
      redirect_uri: this.config.redirectUri,
      state: "random_state_string",
    });

    return `${UPSTOX_API_URL}/login/authorization/dialog?${params.toString()}`;
  }

  /**
   * Exchange Auth Code for Access Token
   */
  static async generateToken(code: string, userId: string): Promise<string> {
    const params = new URLSearchParams({
      code,
      client_id: this.config.apiKey,
      client_secret: this.config.apiSecret,
      redirect_uri: this.config.redirectUri,
      grant_type: "authorization_code",
    });

    try {
      const response = await fetch(`${UPSTOX_API_URL}/login/authorization/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: params,
      });

      const data = await response.json();

      if (!response.ok || data.status === "error") {
        throw new Error(data.message || "Failed to generate token");
      }

      const accessToken = data.access_token;
      
      // Store token in DB
      await this.saveToken(userId, accessToken);

      logger.info({ userId }, "Upstox token generated and saved");
      return accessToken;
    } catch (error: any) {
      logger.error({ err: error, userId }, "Upstox Token Generation Failed");
      throw new ApiError("Failed to authenticate with Upstox", 502, "UPSTOX_AUTH_FAILED");
    }
  }

  /**
   * Save or Update User's Upstox Token
   */
  private static async saveToken(userId: string, accessToken: string) {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // Valid for typically 1 day

    await db
      .insert(upstoxTokens)
      .values({
        userId,
        accessToken,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: upstoxTokens.userId,
        set: {
            accessToken,
            expiresAt,
            updatedAt: new Date(),
        }
      });
  }

  /**
   * Get Valid Access Token for User
   */
  static async getAccessToken(userId: string): Promise<string | null> {
    const [record] = await db
      .select()
      .from(upstoxTokens)
      .where(eq(upstoxTokens.userId, userId))
      .limit(1);

    if (!record) return null;

    // Check expiry
    const now = new Date();
    if (record.expiresAt < now) {
        logger.warn({ userId }, "Upstox token expired");
        return null;
    }

    return record.accessToken;
  }

  /**
   * Get ANY valid token for system-wide background tasks (Stream)
   * 🚨 PHASE 3: Cached to prevent DB hits on reconnect
   */
  static async getSystemToken(): Promise<string | null> {
    const now = Date.now();

    // Return cached token if still valid (with 5min buffer)
    if (this.cachedToken && now < this.expiry - 300000) {
      return this.cachedToken;
    }

    // 🔥 CRITICAL: promise lock
    if (this.tokenPromise) {
        return this.tokenPromise;
    }

    this.tokenPromise = (async () => {
        // Fetch from DB
        const [record] = await db
        .select()
        .from(upstoxTokens)
        .where(gt(upstoxTokens.expiresAt, new Date())) // Must be valid
        .orderBy(desc(upstoxTokens.updatedAt)) // Get most recently used
        .limit(1);

        if (!record) {
        this.cachedToken = null;
        this.expiry = 0;
        this.tokenPromise = null;
        return null;
        }

        // Cache the token
        this.cachedToken = record.accessToken;
        this.expiry = new Date(record.expiresAt).getTime();
        this.tokenPromise = null; // Clear promise when done

        return this.cachedToken;
    })();

    return this.tokenPromise;
  }

  /**
   * Fetch Market Quotes (LTP)
   */
  static async getMarketQuotes(userId: string, instrumentKeys: string[]): Promise<Record<string, number>> {
      const token = await this.getAccessToken(userId);
      if (!token) {
          throw new ApiError("Upstox token missing or expired", 401, "UPSTOX_TOKEN_MISSING");
      }

      return this.fetchQuotesWithToken(token, instrumentKeys);
  }

  /**
   * Fetch Market Quotes using System Token (for background/SSE use)
   * This seeds the cache with initial prices when WebSocket is delta-only
   */
  static async getSystemQuotes(instrumentKeys: string[]): Promise<Record<string, number>> {
      const token = await this.getSystemToken();
      if (!token) {
          logger.warn("No system token available for snapshot fetch");
          return {};
      }

      return this.fetchQuotesWithToken(token, instrumentKeys);
  }

  /**
   * Internal: Fetch quotes with a given token
   */
  private static async fetchQuotesWithToken(token: string, instrumentKeys: string[]): Promise<Record<string, number>> {
      if (instrumentKeys.length === 0) return {};

      const symbolList = instrumentKeys
          .map(k => encodeURIComponent(k))
          .join(",");
      // NOTE: Upstox REST uses 'instrument_key' param with URL encoding
      const url = `${UPSTOX_API_URL}/market-quote/ltp?instrument_key=${symbolList}`;
 
      try {
          await upstoxRateLimiter.waitForToken("market-quote");
          const response = await fetch(url, {
              headers: {
                  Authorization: `Bearer ${token}`,
                  Accept: "application/json",
              },
          });

          const data = await response.json();

          if (data.status === "error") {
             throw new Error(data.message);
          }

          const quotes: Record<string, number> = {};
          if (data.data) {
             for (const [key, value] of Object.entries(data.data as Record<string, any>)) {
                 quotes[key] = value.last_price;
             }
          }
           
          logger.info({ count: Object.keys(quotes).length }, "Fetched snapshot quotes");
          return quotes;

      } catch (error: any) {
          logger.error({ err: error }, "Failed to fetch market quotes");
          return {};
      }
  }

   /**
    * Fetch Historical Candle Data (API V3)
    * @param instrumentKey - NSE_EQ|INE...
    * @param unit - minutes, hours, days, weeks, months
    * @param interval - 1, 3, 5, 30, etc.
    * @param fromDate - YYYY-MM-DD
    * @param toDate - YYYY-MM-DD
    */
    private static requestInflights = new Map<string, Promise<any[]>>();

    /**
     * Resolve valid candle source to prevent dual-fetching
     */
    
    /**
     * Get today's date in IST timezone (YYYY-MM-DD format)
     * 🔥 CRITICAL: Never mix UTC + IST in trading systems
     */
    private static todayIST(): string {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(new Date());
    }
    
    private static resolveCandleSource(
        interval: string,
        fromDate: string,
        toDate: string
    ): 'intraday' | 'historical' {
        // 🔥 CRITICAL FIX: Use IST timezone consistently
        // Mixing UTC (.toISOString()) with IST (orchestrator) causes:
        // - Duplicate fetch windows
        // - Overlapping merges
        // - Phantom pagination
        // - Missing candles
        const today = this.todayIST();

        // 🟢 ROUTING RULE: If requesting today's data with 1-minute interval -> Use Intraday endpoint
        if (interval === "1" && fromDate === today && toDate === today) {
            return "intraday";
        }

        // ✅ REMOVED: Incorrect 3-day limit validation
        // Upstox API V3 supports:
        // - 1-15 minute intervals: 1 MONTH max retrieval
        // - >15 minute intervals: 1 QUARTER max retrieval
        // Let Upstox API handle validation and return proper errors

        return "historical";
    }

   /**
    * Fetch Historical Candle Data (API V3)
    * @param instrumentKey - NSE_EQ|INE...
    * @param unit - minutes, hours, days, weeks, months
    * @param interval - 1, 3, 5, 30, etc.
    * @param fromDate - YYYY-MM-DD
    * @param toDate - YYYY-MM-DD
    */

   static async getHistoricalCandleData(
       instrumentKey: string, 
       unit: string, 
       interval: string, 
       fromDate: string, 
       toDate: string
    ): Promise<any[]> {
        // ═══════════════════════════════════════════════════════════
        // 🚨 CRITICAL RULE: Single Routing Authority
        // ═══════════════════════════════════════════════════════════
        // This method is the ONLY place that decides between Intraday/Historical endpoints.
        // Do NOT call getIntraDayCandleData() separately from the outside.
        // The CandleOrchestrator relies on this internal routing.
        
        // 🟢 ROUTING TABLE: Decide Source Logic
        
        // 🟢 ROUTING TABLE: Decide Source Logic
        // Service layer must NEVER mutate request parameters
        // CandleOrchestrator is the SINGLE AUTHORITY for date resolution

        // 🟢 ROUTING EXECUTION
        const source = this.resolveCandleSource(interval, fromDate, toDate);
        
        if (source === 'intraday') {
             logger.debug({ instrumentKey }, "🔀 Routing to Intraday Endpoint (Optimized Path)");
             return this.getIntraDayCandleData(instrumentKey, unit, interval);
        }

        // 1. Generate Cache Key (with unit to prevent collisions)
        const cacheKey = CacheKeys.historicalCandles(instrumentKey, unit, interval, fromDate, toDate);

        // ═══════════════════════════════════════════════════════════
        // ⚡ LOAD SPIKE PREVENTION: Request Coalescing
        // ═══════════════════════════════════════════════════════════
        if (this.requestInflights.has(cacheKey)) {
            // logger.debug({ cacheKey }, "⚡ Coalescing inflight request");
            return this.requestInflights.get(cacheKey)!;
        }

        // 2. Check Cache
        const cachedData = cache.get(cacheKey) as any[];
        if (cachedData) {
            // logger.debug({ cacheKey }, "History served from CACHE");
            return cachedData;
        }

        const fetchPromise = (async () => {
            try {
                const token = await this.getSystemToken();
                if (!token) throw new Error("No token");

                const encodedKey = encodeURIComponent(instrumentKey);
                const urlV3 = `https://api.upstox.com/v3/historical-candle/${encodedKey}/${unit}/${interval}/${toDate}/${fromDate}`;
        
                logger.info({ instrumentKey, interval }, "Fetching History from UPSTOX API");
                
                await upstoxRateLimiter.waitForToken("history");
                const response = await fetch(urlV3, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: "application/json"
                    }
                });

                const data = await response.json();
                
                if (!response.ok) {
                    console.error(`❌ Upstox API Error (${response.status}):`, data);
                    logger.error({ instrumentKey, interval, error: data }, "Upstox API returned error");
                    return [];
                }
                
                if (data.status === "success" && data.data && data.data.candles) {
                    let candles = data.data.candles;
                    
                    console.log(`🔍 Service: Received ${candles.length} raw candles from Upstox`);
                    
                    // 🔥 CRITICAL FIX: HARD numeric validation at service layer
                    // Service must guarantee clean data - orchestrator should NEVER be defensive
                    // Upstox can return: "0" (string), NaN, null volume, partial candles (especially near market open)
                    const beforeFilterCount = candles.length;
                    candles = candles.filter((c: any) => {
                        if (!c || !Array.isArray(c) || c.length < 6) {
                            console.warn('⚠️ Service: Skipping malformed candle:', c);
                            return false;
                        }
                        
                        // Convert and validate OHLC
                        const open = Number(c[1]);
                        const high = Number(c[2]);
                        const low = Number(c[3]);
                        const close = Number(c[4]);
                        const volume = Number(c[5]);
                        
                        if (!Number.isFinite(open) || !Number.isFinite(high) || 
                            !Number.isFinite(low) || !Number.isFinite(close) ||
                            !Number.isFinite(volume)) {
                            console.warn('⚠️ Service: Skipping candle with invalid numbers:', {
                                timestamp: c[0],
                                open: c[1],
                                high: c[2],
                                low: c[3],
                                close: c[4],
                                volume: c[5]
                            });
                            return false;
                        }
                        
                        return true;
                    });
                    
                    console.log(`🔍 Service: Filtered ${beforeFilterCount - candles.length} invalid candles, ${candles.length} remaining`);
                    
                    if (candles.length === 0) {
                        console.warn('⚠️ Service: All candles filtered out - no valid data from Upstox');
                        return [];
                    }
                    
                    // ═══════════════════════════════════════════════════════════
                    // 🔗 BRIDGE GAP: Merge Intraday Data for 1-minute intervals
                    // ═══════════════════════════════════════════════════════════
                    // Problem: Historical endpoint returns completed candles up to some point in the past
                    // Live candles start at current time, creating a visual gap
                    // Solution: Fetch today's intraday data and merge it with historical data
                    const today = this.todayIST(); // 🔥 FIX: Use IST consistently
                    const shouldMergeIntraday = interval === "1" && toDate === today;
                    
                    console.log('🔍 Intraday Merge Check:', { interval, toDate, today, shouldMergeIntraday });
                    
                    if (shouldMergeIntraday) {
                        try {
                            logger.debug({ instrumentKey }, "🔗 Fetching intraday data to bridge gap");
                            console.log('🔗 Fetching intraday data to bridge gap for', instrumentKey);
                            const intradayCandles = await this.getIntraDayCandleData(instrumentKey, unit, interval);
                            
                            if (intradayCandles.length > 0) {
                                // 🔥 CRITICAL FIX: Normalize timestamps to Unix time BEFORE deduplication
                                // Problem: "2026-02-09T09:15:00+05:30" vs "2026-02-09T03:45:00Z" are same moment
                                // but string comparison fails → duplicates slip through → chart crash
                                // Solution: Convert to Unix time first, then dedupe
                                const historicalTimestamps = new Set(
                                    candles.map((c: any) => new Date(c[0]).getTime())
                                );
                                const newIntradayCandles = intradayCandles.filter(
                                    (c: any) => !historicalTimestamps.has(new Date(c[0]).getTime())
                                );
                                
                                console.log('🔗 Intraday Merge:', {
                                    historicalCount: candles.length,
                                    intradayTotal: intradayCandles.length,
                                    intradayNew: newIntradayCandles.length,
                                    lastHistorical: candles[candles.length - 1]?.[0],
                                    firstIntraday: intradayCandles[0]?.[0]
                                });
                                
                                // Combine and sort by timestamp
                                candles = [...candles, ...newIntradayCandles].sort((a, b) => {
                                    const timeA = new Date(a[0]).getTime();
                                    const timeB = new Date(b[0]).getTime();
                                    return timeA - timeB;
                                });
                                
                                logger.debug({ 
                                    historical: candles.length - newIntradayCandles.length, 
                                    intraday: newIntradayCandles.length,
                                    total: candles.length 
                                }, "🔗 Merged intraday data with historical");
                                
                                console.log('✅ Merged! Total candles:', candles.length);
                            } else {
                                console.log('⚠️ No intraday candles returned');
                            }
                        } catch (error) {
                            // Don't fail the whole request if intraday fetch fails
                            console.error('❌ Failed to fetch intraday data:', error);
                            logger.warn({ instrumentKey, error }, "Failed to fetch intraday data for merge");
                        }
                    }
                    
                    // 3. Store in Cache
                    let ttl = 1000 * 60 * 5; // Default 5 min for 1m
                    
                    if (interval === "day" || interval === "week" || interval === "month") {
                        ttl = 1000 * 60 * 60 * 24; 
                    } else if (parseInt(interval) >= 60) {
                        ttl = 1000 * 60 * 30; 
                    } else if (parseInt(interval) >= 5) {
                        ttl = 1000 * 60 * 15; 
                    }

                    cache.set(cacheKey, candles, { ttl } as any);
                    return candles;
                }
                
                console.warn("⚠️ Upstox API returned no candles:", { instrumentKey, unit, interval, fromDate, toDate, response: data });
                return [];
            } catch (error) {
                console.error("❌ Historical Data Fetch Failed:", error);
                logger.error({ instrumentKey, interval, error }, "Historical fetch exception");
                return [];
            }
        })();

        // Track Inflight
        this.requestInflights.set(cacheKey, fetchPromise);

        try {
            return await fetchPromise;
        } finally {
            // Cleanup inflight map
            this.requestInflights.delete(cacheKey);
        }
   }

   /**
    * Search for instruments
    * @param query - search query (e.g. RELIANCE)
    * @param segment - optional segment (e.g. equity) - unused in simple search
    */
   static async searchInstruments(query: string, segment?: string): Promise<any[]> {
       const token = await this.getSystemToken();
       if (!token) throw new Error("No token");

       // Endpoint: /v2/market/search/instrument
       const url = `${UPSTOX_API_URL}/market/search/instrument?instrument_name=${encodeURIComponent(query)}`;

       try {
           await upstoxRateLimiter.waitForToken("market-quote"); // Using market quote rate limit bucket
           const response = await fetch(url, {
               headers: {
                   Authorization: `Bearer ${token}`,
                   Accept: "application/json",
               },
           });

           const data = await response.json();
           if (data.status === "success" && Array.isArray(data.data)) {
               return data.data;
           }
           return [];
       } catch (error) {
           logger.error({ err: error, query }, "Instrument Search Failed");
           return [];
       }
   }

    /**
     * Resolve Instrument Key from Symbol (Cached)
     * 🚨 PHASE 4: Memory Cache to prevent DB spam
     */
    static async resolveInstrumentKey(symbol: string): Promise<string> {
        // 1. Check Cache (24h TTL)
        const cacheKey = CacheKeys.instrumentKey(symbol);
        const cached = cache.get(cacheKey) as string;
        if (cached) {
            // logger.debug({ symbol }, "Instrument Key resolved from CACHE");
            return cached;
        }

        // 2. DB Lookup
        try {
            const [instrument] = await db
                .select({ token: instruments.instrumentToken })
                .from(instruments)
                .where(eq(instruments.tradingsymbol, symbol))
                .limit(1);
            
            if (instrument) {
                // 3. Cache Result
                cache.set(cacheKey, instrument.token, { ttl: 86400000 }); // 24 hours
                return instrument.token;
            }
        } catch (e) {
            logger.error({ err: e, symbol }, "Instrument DB Lookup Failed");
        }
        
        // 4. Fallback
        return `NSE_EQ|${symbol}`;
    }

    /**
     * Fetch Intraday Candle Data (V3 API) - For current trading day
     * @param instrumentKey - NSE_EQ|INE...
     * @param unit - minutes, hours, days
     * @param interval - 1, 2, 3, ... 300 for minutes; 1-5 for hours; 1 for days
     */
    static async getIntraDayCandleData(
        instrumentKey: string,
        unit: string,
        interval: string
    ): Promise<any[]> {
        const token = await this.getSystemToken();
        if (!token) throw new Error("No token");

        // V3 Intraday endpoint: /v3/historical-candle/intraday/:instrument_key/:unit/:interval
        const encodedKey = encodeURIComponent(instrumentKey);
        const urlV3 = `https://api.upstox.com/v3/historical-candle/intraday/${encodedKey}/${unit}/${interval}`;

        try {
            logger.info({ instrumentKey, unit, interval }, "Fetching Intraday Data from UPSTOX V3 API");
            
            await upstoxRateLimiter.waitForToken("history");
            const response = await fetch(urlV3, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/json"
                }
            });

            const data = await response.json();
            if (data.status === "success" && data.data && data.data.candles) {
                return data.data.candles;
            }
            return [];
        } catch (error) {
            console.error("Intraday Data Fetch Failed", error);
            return [];
        }
    }
}
