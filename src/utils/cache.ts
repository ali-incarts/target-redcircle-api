/**
 * @fileoverview Two-layer caching system for Target API
 * @description Implements product cache (1 hour) and stock cache (5 minutes) for performance optimization
 * @module utils/cache
 * @related services/stock/availability.ts, services/target/api.ts
 */

import NodeCache from 'node-cache';

// ============================================================================
// Cache Configuration
// ============================================================================

/**
 * Stock cache TTL: 5 minutes (inventory changes frequently)
 */
const STOCK_CACHE_TTL = parseInt(process.env.CACHE_TTL_SECONDS || '300', 10);

/**
 * Product cache TTL: 1 hour (product data changes slowly)
 */
const PRODUCT_CACHE_TTL = parseInt(process.env.PRODUCT_CACHE_TTL_SECONDS || '3600', 10);

// ============================================================================
// Cache Instances
// ============================================================================

/**
 * Stock availability cache (5 minutes)
 * Stores real-time inventory data
 */
export const stockCache = new NodeCache({
  stdTTL: STOCK_CACHE_TTL,
  checkperiod: 60, // Check for expired entries every 60 seconds
  useClones: false, // Avoid cloning for better performance
});

/**
 * Product information cache (1 hour)
 * Stores product metadata (title, price, images, etc.)
 */
export const productCache = new NodeCache({
  stdTTL: PRODUCT_CACHE_TTL,
  checkperiod: 120,
  useClones: false,
});

// ============================================================================
// Cache Key Generators
// ============================================================================

/**
 * Generate cache key for stock availability check
 * Format: stock:{zipCode}:{storeId}:{sortedProductIds}
 *
 * @param zipCode - ZIP code for location
 * @param productIds - Array of product IDs (TCINs)
 * @param storeId - Optional store ID
 * @returns Cache key string
 *
 * @example
 * generateStockCacheKey('04457', ['12345', '67890'])
 * // Returns: 'stock:04457:undefined:12345,67890'
 */
export function generateStockCacheKey(
  zipCode: string,
  productIds: string[],
  storeId?: string
): string {
  // Sort product IDs for consistent cache keys regardless of order
  const sortedIds = [...productIds].sort().join(',');
  return `stock:${zipCode}:${storeId || 'undefined'}:${sortedIds}`;
}

/**
 * Generate cache key for individual product stock
 * Format: stock:{zipCode}:{storeId}:{tcin}
 *
 * @param zipCode - ZIP code for location
 * @param tcin - Target TCIN
 * @param storeId - Optional store ID
 * @returns Cache key string
 */
export function generateProductStockCacheKey(
  zipCode: string,
  tcin: string,
  storeId?: string
): string {
  return `stock:${zipCode}:${storeId || 'undefined'}:${tcin}`;
}

/**
 * Generate cache key for product information
 * Format: product:{tcin}
 *
 * @param tcin - Target TCIN
 * @returns Cache key string
 */
export function generateProductCacheKey(tcin: string): string {
  return `product:${tcin}`;
}

// ============================================================================
// Cache Helper Functions
// ============================================================================

/**
 * Get value from cache with type safety
 *
 * @param cache - Cache instance
 * @param key - Cache key
 * @returns Cached value or undefined
 */
export function getCachedValue<T>(cache: NodeCache, key: string): T | undefined {
  const value = cache.get<T>(key);
  if (value !== undefined && process.env.NODE_ENV === 'development') {
    console.log(`[Cache HIT] ${key}`);
  }
  return value;
}

/**
 * Set value in cache with type safety
 *
 * @param cache - Cache instance
 * @param key - Cache key
 * @param value - Value to cache
 * @param ttl - Optional custom TTL in seconds
 * @returns Success boolean
 */
export function setCachedValue<T>(
  cache: NodeCache,
  key: string,
  value: T,
  ttl?: number
): boolean {
  // Only pass TTL if explicitly provided, otherwise use cache default
  // Note: ttl=0 means "never expire" in node-cache, so we must not pass 0 accidentally
  const success = ttl !== undefined
    ? cache.set(key, value, ttl)
    : cache.set(key, value);

  if (success && process.env.NODE_ENV === 'development') {
    const effectiveTTL = ttl !== undefined ? ttl : cache.options.stdTTL;
    console.log(`[Cache SET] ${key} (TTL: ${effectiveTTL}s)`);
  }
  return success;
}

/**
 * Delete value from cache
 *
 * @param cache - Cache instance
 * @param key - Cache key
 * @returns Number of deleted entries
 */
export function deleteCachedValue(cache: NodeCache, key: string): number {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Cache DEL] ${key}`);
  }
  return cache.del(key);
}

/**
 * Clear all entries from a cache
 *
 * @param cache - Cache instance
 */
export function clearCache(cache: NodeCache): void {
  cache.flushAll();
  if (process.env.NODE_ENV === 'development') {
    console.log('[Cache] Cleared all entries');
  }
}

/**
 * Get cache statistics
 *
 * @param cache - Cache instance
 * @returns Cache statistics
 */
export function getCacheStats(cache: NodeCache) {
  return {
    keys: cache.keys().length,
    hits: cache.getStats().hits,
    misses: cache.getStats().misses,
    hitRate: cache.getStats().hits / (cache.getStats().hits + cache.getStats().misses) || 0,
  };
}

// ============================================================================
// Cache Warming (Optional Advanced Feature)
// ============================================================================

/**
 * Pre-fetch and cache common products for faster responses
 *
 * @param productIds - Array of product IDs to pre-cache
 * @param zipCode - ZIP code for location
 * @param fetchFunction - Function to fetch data
 */
export async function warmCache<T>(
  productIds: string[],
  zipCode: string,
  fetchFunction: (tcin: string, zipCode: string) => Promise<T>
): Promise<void> {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Cache] Warming cache for ${productIds.length} products`);
  }

  const promises = productIds.map(async (tcin) => {
    try {
      const data = await fetchFunction(tcin, zipCode);
      const cacheKey = generateProductStockCacheKey(zipCode, tcin);
      setCachedValue(stockCache, cacheKey, data);
    } catch (error) {
      // Silently fail - cache warming is optional
      if (process.env.NODE_ENV === 'development') {
        console.error(`[Cache] Failed to warm cache for ${tcin}:`, error);
      }
    }
  });

  await Promise.allSettled(promises);
}

// ============================================================================
// Cache Monitoring (Development Only)
// ============================================================================

if (process.env.NODE_ENV === 'development') {
  // Log cache statistics every 5 minutes
  setInterval(() => {
    console.log('[Cache Stats]', {
      stock: getCacheStats(stockCache),
      product: getCacheStats(productCache),
    });
  }, 300000);
}
