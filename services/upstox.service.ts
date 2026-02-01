import { db } from "@/lib/db";
import { upstoxTokens, type NewUpstoxToken } from "@/lib/db/schema";
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
   */
  static async getSystemToken(): Promise<string | null> {
    const [record] = await db
      .select()
      .from(upstoxTokens)
      .where(gt(upstoxTokens.expiresAt, new Date())) // Must be valid
      .orderBy(desc(upstoxTokens.updatedAt)) // Get most recently used
      .limit(1);

    return record ? record.accessToken : null;
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
   static async getHistoricalCandleData(
       instrumentKey: string, 
       unit: string, 
       interval: string, 
       fromDate: string, 
       toDate: string
    ): Promise<any[]> {
        // 1. Generate Cache Key
        const cacheKey = CacheKeys.historicalCandles(instrumentKey, interval, fromDate, toDate);

        // 2. Check Cache
        const cachedData = cache.get(cacheKey) as any[];
        if (cachedData) {
            logger.debug({ cacheKey }, "History served from CACHE");
            return cachedData;
        }

        const token = await this.getSystemToken();
        if (!token) throw new Error("No token");

        // Construct URL: /v3/historical-candle/:instrumentKey/:unit/:interval/:toDate/:fromDate
        // Note: Docs say /:toDate/:fromDate order for path params or is it query?
        // Let's re-read the doc closely. 
        // Doc says: GET /historical-candle/:instrument_key/:unit/:interval/:to_date/:from_date
        // Example: .../minutes/1/2025-01-02/2025-01-01
        
        const encodedKey = encodeURIComponent(instrumentKey);


        const urlV3 = `https://api.upstox.com/v3/historical-candle/${encodedKey}/${unit}/${interval}/${toDate}/${fromDate}`;
 
         try {
             logger.info({ instrumentKey, interval }, "Fetching History from UPSTOX API");
             
             await upstoxRateLimiter.waitForToken("history");
             const response = await fetch(urlV3, {
                 headers: {
                     Authorization: `Bearer ${token}`,
                    Accept: "application/json"
                }
            });

            const data = await response.json();
            if (data.status === "success" && data.data && data.data.candles) {
                const candles = data.data.candles;
                
                // 3. Store in Cache
                // TTL Logic:
                // - 1m candles: 1 minute (high churn)
                // - 30m+ candles: 15 minutes
                // - Day candles: 1 hour
                let ttl = 1000 * 60; // Default 1 min
                if (interval === "day" || interval === "week" || interval === "month") {
                    ttl = 1000 * 60 * 60; // 1 hour for daily+
                } else if (parseInt(interval) >= 30) {
                     ttl = 1000 * 60 * 15; // 15 mins for 30m+
                }

                cache.set(cacheKey, candles, { ttl } as any);
                logger.debug({ cacheKey, ttl }, "History cached");

                return candles;
            }
            return [];
        } catch (error) {
            console.error("Historical Data Fetch Failed", error);
            return [];
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
