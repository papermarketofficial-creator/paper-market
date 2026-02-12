/**
 * Watchlist Service
 * Handles user watchlist CRUD operations
 */

import { db } from '@/lib/db';
import { watchlists, watchlistItems, instruments, type Watchlist, type NewWatchlist } from '@/lib/db/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getFromCache, setInCache, cache } from '@/lib/cache';

export class WatchlistService {
  /**
   * Get all watchlists for a user
   */
  static async getUserWatchlists(userId: string) {
    try {
      const userWatchlists = await db
        .select({
          id: watchlists.id,
          name: watchlists.name,
          isDefault: watchlists.isDefault,
          maxItems: watchlists.maxItems,
          createdAt: watchlists.createdAt,
          instrumentCount: sql<number>`count(${watchlistItems.id})::int`,
        })
        .from(watchlists)
        .leftJoin(watchlistItems, eq(watchlists.id, watchlistItems.watchlistId))
        .where(eq(watchlists.userId, userId))
        .groupBy(watchlists.id)
        .orderBy(sql`${watchlists.isDefault} DESC, ${watchlists.createdAt} ASC`);

      return userWatchlists;
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to get user watchlists');
      throw error;
    }
  }

  /**
   * Get watchlist with instruments
   */
  static async getWatchlistWithInstruments(watchlistId: string, userId: string) {
    try {
      const cacheKey = `watchlist:${watchlistId}:instruments`;
      
      // 1. Check Cache
      const cached = getFromCache<any>(cacheKey); // Using any to avoid complex type reconstruction for now
      if (cached) {
         // Verify ownership implicitly (cache key contains ID, but we should verify user matches? 
         // Actually cache stores the result of THIS function.
         // If we trust the cache key logic.
         // But we passed userId to this function.
         // If key is just watchlistId, multiple users shouldn't access same watchlistId unless shared.
         // Watchlists are user-specific.
         if (cached.userId === userId) {
             return cached;
         }
      }

      // Verify ownership
      const watchlist = await db.query.watchlists.findFirst({
        where: and(
          eq(watchlists.id, watchlistId),
          eq(watchlists.userId, userId)
        ),
      });

      if (!watchlist) {
        throw new Error('Watchlist not found or access denied');
      }

      // Get instruments
      const items = await db
        .select({
          instrumentToken: instruments.instrumentToken,
          tradingsymbol: instruments.tradingsymbol,
          name: instruments.name,
          lastPrice: instruments.lastPrice,
          lotSize: instruments.lotSize,
          exchange: instruments.exchange,
          segment: instruments.segment,
          addedAt: watchlistItems.addedAt,
        })
        .from(watchlistItems)
        .innerJoin(instruments, eq(watchlistItems.instrumentToken, instruments.instrumentToken))
        .where(eq(watchlistItems.watchlistId, watchlistId))
        .orderBy(watchlistItems.addedAt);

      const result = {
        ...watchlist,
        instruments: items,
      };

      // 2. Set Cache (5 mins)
      setInCache(cacheKey, result, 1000 * 60 * 5);

      return result;
    } catch (error) {
      logger.error({ err: error, watchlistId, userId }, 'Failed to get watchlist with instruments');
      throw error;
    }
  }

  /**
   * Create a new watchlist
   */
  static async createWatchlist(userId: string, name: string) {
    try {
      const [newWatchlist] = await db
        .insert(watchlists)
        .values({
          userId,
          name,
          isDefault: false, // Only first watchlist should be default
          maxItems: 20,
        })
        .returning();

      logger.info({ watchlistId: newWatchlist.id, userId, name }, 'Created watchlist');
      return newWatchlist;
    } catch (error) {
      logger.error({ err: error, userId, name }, 'Failed to create watchlist');
      throw error;
    }
  }

  /**
   * Create default watchlist for a new user
   * Called during user signup
   */
  static async createDefaultWatchlist(userId: string) {
    try {
      // Create default watchlist
      const [watchlist] = await db
        .insert(watchlists)
        .values({
          userId,
          name: 'Top 10 Stocks',
          isDefault: true,
          maxItems: 20,
        })
        .returning();

      // Add top instruments to default watchlist
      const topStocks = [
          'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 
          'BHARTIARTL', 'SBIN', 'ITC', 'HINDUNILVR', 'LT',
          'TATAMOTORS', 'AXISBANK' // Added a few more to make it robust
      ];

      const equityInstruments = await db
        .select({ instrumentToken: instruments.instrumentToken })
        .from(instruments)
        .where(inArray(instruments.tradingsymbol, topStocks));

      const fallbackInstruments = equityInstruments.length === 0
        ? await db
            .select({ instrumentToken: instruments.instrumentToken })
            .from(instruments)
            .limit(10)
        : [];

      const selectedInstruments =
        equityInstruments.length > 0 ? equityInstruments : fallbackInstruments;

      if (selectedInstruments.length > 0) {
        await db.insert(watchlistItems).values(
          selectedInstruments.map(inst => ({
            watchlistId: watchlist.id,
            instrumentToken: inst.instrumentToken,
          }))
        );
      }

      logger.info(
        {
          watchlistId: watchlist.id,
          userId,
          count: selectedInstruments.length,
          seededFrom: equityInstruments.length > 0 ? 'top-stocks' : 'fallback-first-10',
        },
        'Created default watchlist'
      );
      return watchlist;
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to create default watchlist');
      throw error;
    }
  }

  /**
   * Delete a watchlist
   */
  static async deleteWatchlist(watchlistId: string, userId: string) {
    try {
      // Verify ownership and not default
      const watchlist = await db.query.watchlists.findFirst({
        where: and(
          eq(watchlists.id, watchlistId),
          eq(watchlists.userId, userId)
        ),
      });

      if (!watchlist) {
        throw new Error('Watchlist not found or access denied');
      }

      if (watchlist.isDefault) {
        throw new Error('Cannot delete default watchlist');
      }

      await db.delete(watchlists).where(eq(watchlists.id, watchlistId));

      logger.info({ watchlistId, userId }, 'Deleted watchlist');
      return { success: true };
    } catch (error) {
      logger.error({ err: error, watchlistId, userId }, 'Failed to delete watchlist');
      throw error;
    }
  }

  /**
   * Add instrument to watchlist
   */
  static async addInstrument(watchlistId: string, instrumentToken: string, userId: string) {
    try {
      // Verify ownership
      const watchlist = await db.query.watchlists.findFirst({
        where: and(
          eq(watchlists.id, watchlistId),
          eq(watchlists.userId, userId)
        ),
      });

      if (!watchlist) {
        throw new Error('Watchlist not found or access denied');
      }

      // Check if instrument exists
      const instrument = await db.query.instruments.findFirst({
        where: eq(instruments.instrumentToken, instrumentToken),
      });

      if (!instrument) {
        throw new Error('Instrument not found');
      }

      // Check max items limit
      const currentCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(watchlistItems)
        .where(eq(watchlistItems.watchlistId, watchlistId));

      if (watchlist.maxItems && currentCount[0].count >= watchlist.maxItems) {
        throw new Error(`Watchlist is full (max ${watchlist.maxItems} items)`);
      }

      // Add to watchlist (unique constraint will prevent duplicates)
      const [item] = await db
        .insert(watchlistItems)
        .values({
          watchlistId,
          instrumentToken,
        })
        .returning();
      
      // Invalidate cache
      cache.delete(`watchlist:${watchlistId}:instruments`);

      logger.info({ watchlistId, instrumentToken, userId }, 'Added instrument to watchlist');
      return item;
    } catch (error) {
      logger.error({ err: error, watchlistId, instrumentToken, userId }, 'Failed to add instrument');
      throw error;
    }
  }

  /**
   * Remove instrument from watchlist
   */
  static async removeInstrument(watchlistId: string, instrumentToken: string, userId: string) {
    try {
      // Verify ownership
      const watchlist = await db.query.watchlists.findFirst({
        where: and(
          eq(watchlists.id, watchlistId),
          eq(watchlists.userId, userId)
        ),
      });

      if (!watchlist) {
        throw new Error('Watchlist not found or access denied');
      }

      await db
        .delete(watchlistItems)
        .where(
          and(
            eq(watchlistItems.watchlistId, watchlistId),
            eq(watchlistItems.instrumentToken, instrumentToken)
          )
        );

      logger.info({ watchlistId, instrumentToken, userId }, 'Removed instrument from watchlist');
      
      // Invalidate cache
      cache.delete(`watchlist:${watchlistId}:instruments`);
      
      return { success: true };
    } catch (error) {
      logger.error({ err: error, watchlistId, instrumentToken, userId }, 'Failed to remove instrument');
      throw error;
    }
  }
}
