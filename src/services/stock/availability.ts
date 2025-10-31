/**
 * @fileoverview Product availability checking service
 * @description Handles concurrent stock checking for multiple products with caching
 * @module services/stock/availability
 * @related services/target/api.ts, services/stock/product-selector.ts
 */

import {
  StockCheckParams,
  StockCheckResult,
  ProductAvailability,
  ProductError,
  ApiError,
} from '../../types';
import { checkBulkStoreStock } from '../target/api';

// ============================================================================
// Availability Checking
// ============================================================================

/**
 * Check availability for multiple products concurrently
 * This is the main entry point for stock checking
 *
 * @param params - Stock check parameters
 * @returns Availability map and errors
 *
 * @example
 * const result = await checkBatchAvailability({
 *   productIds: ['78025470', '12345678'],
 *   zipCode: '04457',
 *   storeId: '1771'
 * });
 *
 * const availability = result.availabilityMap.get('78025470');
 * console.log(availability?.inStock); // true/false
 */
export async function checkBatchAvailability(
  params: StockCheckParams
): Promise<StockCheckResult> {
  const { productIds, zipCode, storeId } = params;

  if (process.env.NODE_ENV === 'development') {
    console.log(`[Availability] Checking ${productIds.length} products for ${zipCode}`);
  }

  // Initialize result containers
  const availabilityMap = new Map<string, ProductAvailability>();
  const errors: ProductError[] = [];

  try {
    // Single bulk API call for all products (concurrent requests)
    const stockResults = await checkBulkStoreStock(productIds, zipCode, storeId);

    // Process each product result
    productIds.forEach((productId) => {
      try {
        const stockData = stockResults.get(productId) ||
                         stockResults.get(productId.toString()) ||
                         stockResults.get(Number(productId).toString());

        if (!stockData || !stockData.Store_stock_results) {
          // Product not found or no stock data
          const availability: ProductAvailability = {
            productId,
            inStock: false,
            availableQuantity: 0,
          };

          // Store with multiple key types for flexible lookup
          setAvailabilityForAllKeyTypes(availabilityMap, productId, availability);

          errors.push({
            productId,
            error: 'No stock data available',
            code: 'NO_STOCK_DATA',
          });

          return;
        }

        // Select store based on priority:
        // 1. User-specified store (if provided)
        // 2. First in-stock store (closest by distance)
        // 3. First store in results (even if out of stock)
        const selectedStore = selectBestStore(stockData.Store_stock_results, storeId);

        if (!selectedStore) {
          // No stores found
          const availability: ProductAvailability = {
            productId,
            inStock: false,
            availableQuantity: 0,
          };

          setAvailabilityForAllKeyTypes(availabilityMap, productId, availability);

          errors.push({
            productId,
            error: 'No stores found',
            code: 'NO_STORES',
          });

          return;
        }

        // Build availability object
        const availability: ProductAvailability = {
          productId,
          inStock: selectedStore.In_stock && selectedStore.Stock_level > 0,
          availableQuantity: selectedStore.Stock_level || 0,
          storeId: selectedStore.Store_id,
          storeName: selectedStore.Store_name,
          distance: selectedStore.Distance,
          offerType: 'TARGET_PRODUCT', // Target doesn't use offer IDs
        };

        // Store with multiple key types for flexible lookup (critical for Map.get() to work)
        setAvailabilityForAllKeyTypes(availabilityMap, productId, availability);

        if (process.env.NODE_ENV === 'development') {
          console.log(
            `[Availability] ${productId}: ${availability.inStock ? 'IN STOCK' : 'OUT OF STOCK'} ` +
            `at ${selectedStore.Store_name} (${selectedStore.Stock_level} units)`
          );
        }
      } catch (error) {
        // Individual product error - don't fail entire batch
        const apiError = error as ApiError;
        errors.push({
          productId,
          error: apiError.message,
          code: apiError.code,
        });

        // Still add to availability map as unavailable
        const availability: ProductAvailability = {
          productId,
          inStock: false,
          availableQuantity: 0,
        };

        setAvailabilityForAllKeyTypes(availabilityMap, productId, availability);

        if (process.env.NODE_ENV === 'development') {
          console.warn(`[Availability] Error checking ${productId}:`, error);
        }
      }
    });

    return {
      availabilityMap,
      errors,
    };
  } catch (error) {
    // Catastrophic error - entire batch failed
    throw new Error(`Failed to check availability: ${(error as Error).message}`);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Select the best store from results based on availability and user preference
 *
 * Priority:
 * 1. User-specified store (if provided and in results)
 * 2. First in-stock store (closest by distance, results are sorted)
 * 3. First store in results (as fallback)
 *
 * @param stores - Array of store stock results
 * @param preferredStoreId - Optional user-specified store ID
 * @returns Selected store or undefined
 */
function selectBestStore(
  stores: Array<{
    Store_id: string;
    In_stock: boolean;
    Stock_level: number;
    Store_name: string;
    Distance: number;
  }>,
  preferredStoreId?: string
) {
  if (stores.length === 0) {
    return undefined;
  }

  // If user specified a store, try to find it
  if (preferredStoreId) {
    const userStore = stores.find((s) => s.Store_id === preferredStoreId);
    if (userStore) {
      return userStore;
    }
  }

  // Otherwise, find first in-stock store (closest)
  const inStockStore = stores.find((s) => s.In_stock && s.Stock_level > 0);
  if (inStockStore) {
    return inStockStore;
  }

  // Fallback: return first store (even if out of stock)
  return stores[0];
}

/**
 * Store availability with multiple key types for flexible lookup
 * Critical for handling inconsistent product ID types (string vs number)
 *
 * @param map - Availability map
 * @param productId - Product ID (any format)
 * @param availability - Availability data
 */
function setAvailabilityForAllKeyTypes(
  map: Map<string, ProductAvailability>,
  productId: string | number,
  availability: ProductAvailability
): void {
  // Store as original type
  map.set(productId.toString(), availability);

  // Store as string
  map.set(String(productId), availability);

  // Store as number string (if valid number)
  if (!isNaN(Number(productId))) {
    map.set(Number(productId).toString(), availability);
  }
}

/**
 * Check if a product is available and usable
 * Follows standardization criteria from specification
 *
 * @param availability - Product availability data
 * @returns True if product is available and usable
 */
export function isProductAvailable(availability: ProductAvailability | undefined): boolean {
  if (!availability) {
    return false;
  }

  // Target-specific availability criteria:
  // 1. Must be in stock
  // 2. Must have quantity > 0
  return availability.inStock && availability.availableQuantity > 0;
}

/**
 * Get availability for a specific product from the map
 * Handles multiple key type lookups
 *
 * @param availabilityMap - Availability map
 * @param productId - Product ID (string or number)
 * @returns Availability data or undefined
 */
export function getAvailability(
  availabilityMap: Map<string, ProductAvailability>,
  productId: string | number
): ProductAvailability | undefined {
  // Try multiple key formats
  return (
    availabilityMap.get(productId.toString()) ||
    availabilityMap.get(String(productId)) ||
    availabilityMap.get(Number(productId).toString())
  );
}

// ============================================================================
// Analytics & Logging
// ============================================================================

/**
 * Log availability check results (development only)
 *
 * @param result - Stock check result
 */
export function logAvailabilityResults(result: StockCheckResult): void {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  const totalProducts = result.availabilityMap.size;
  let inStockCount = 0;
  let outOfStockCount = 0;

  result.availabilityMap.forEach((availability) => {
    if (availability.inStock) {
      inStockCount++;
    } else {
      outOfStockCount++;
    }
  });

  console.log('[Availability Summary]', {
    total: totalProducts,
    inStock: inStockCount,
    outOfStock: outOfStockCount,
    errors: result.errors.length,
  });

  if (result.errors.length > 0) {
    console.log('[Availability Errors]', result.errors);
  }
}
