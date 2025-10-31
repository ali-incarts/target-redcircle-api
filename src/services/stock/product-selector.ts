/**
 * @fileoverview Smart product selection with backup substitution
 * @description Implements the standardized substitution algorithm for product availability
 * @module services/stock/product-selector
 * @related services/stock/availability.ts, controllers/stock.ts
 */

import {
  SmartSelectionRequest,
  SmartSelectionResponse,
  ProductSelectionResult,
  SelectedProduct,
  BackupProductUsed,
  ProductAvailability,
} from '../../types';
import { checkBatchAvailability, isProductAvailable, getAvailability } from './availability';
import { generateProductUrl } from '../target/api';

// ============================================================================
// Main Selection Function
// ============================================================================

/**
 * Select available products with intelligent backup substitution
 * This is the core algorithm following the standardization specification
 *
 * @param request - Smart selection request
 * @param zipCode - ZIP code for availability
 * @param storeId - Optional store ID
 * @returns Smart selection response with redirect URL
 *
 * @example
 * const response = await selectAvailableProducts({
 *   shortLink: 'https://incarts-us.web.app/xyz',
 *   longLink: 'https://www.target.com/...',
 *   backups: [
 *     { primaryId: '12345678', backupIds: ['87654321'] }
 *   ],
 *   zipCode: '04457'
 * }, '04457');
 */
export async function selectAvailableProducts(
  request: SmartSelectionRequest,
  zipCode: string,
  storeId?: string
): Promise<SmartSelectionResponse> {
  if (process.env.NODE_ENV === 'development') {
    console.log('[Product Selector] Starting smart selection');
    console.log('[Product Selector] Request:', {
      shortLink: request.shortLink,
      backupGroups: request.backups.length,
      zipCode,
      storeId,
    });
  }

  // Step 1: Extract all product IDs (primary + backups)
  const allProductIds = extractAllProductIds(request.backups);

  if (process.env.NODE_ENV === 'development') {
    console.log('[Product Selector] Checking availability for', allProductIds.length, 'products');
  }

  // Step 2: Single bulk availability check for ALL products
  const availabilityResult = await checkBatchAvailability({
    productIds: allProductIds,
    zipCode,
    storeId,
  });

  // Step 3: Perform product selection with substitution
  const selectionResult = performProductSelection(request.backups, availabilityResult.availabilityMap);

  if (process.env.NODE_ENV === 'development') {
    console.log('[Product Selector] Selection result:', {
      selected: selectionResult.selectedProducts.length,
      substitutions: selectionResult.backupProductsUsed.length,
      unavailable: selectionResult.unavailableProducts.length,
    });
  }

  // Step 4: Build redirect URL
  const redirectUrl = buildRedirectUrl(
    selectionResult,
    request.longLink,
    request.customUrl,
    request.allowPdp
  );

  // Step 5: Log analytics events
  logAnalyticsEvents(request, selectionResult);

  // Step 6: Return standardized response
  const allProductsUnavailable = selectionResult.selectedProducts.length === 0;
  const finalCartUrlType = determineCartUrlType(selectionResult, request.customUrl, request.allowPdp);

  // Target URLs don't include store IDs in any format (PDP, longLink, or custom)
  // Unlike Walmart which can embed ?store=1234, Target product pages have no store parameter
  // Therefore, storeIdAttached is always undefined to accurately reflect what's in the URL
  const actualStoreIdAttached = undefined;

  // Extract requested options or use defaults
  const requestedMode = request.cartUrlOptions?.mode || 'auto';

  // Determine if we fell back to longLink/customUrl instead of generating a Target URL
  // This happens when:
  // - All products unavailable
  // - Multiple products selected (Target doesn't support multi-item cart URLs)
  // - allowPdp=false (even with single product)
  const didFallback = finalCartUrlType !== 'pdp';

  return {
    redirectUrl,
    backupsUsed: selectionResult.backupProductsUsed.length > 0,
    backupProducts: selectionResult.backupProductsUsed,
    allProductsUnavailable,
    cartUrlType: finalCartUrlType,
    storeIdAttached: actualStoreIdAttached,
    cartOptionsSummary: {
      mode: requestedMode, // What the client requested
      includeStoreId: 'never', // Target never includes store IDs (what was actually done)
      fallbackApplied: didFallback, // True if we used longLink/customUrl instead of PDP
      finalType: finalCartUrlType, // What we actually generated
    },
  };
}

// ============================================================================
// Core Substitution Algorithm
// ============================================================================

/**
 * Extract all product IDs from backup groups
 *
 * @param backups - Array of backup groups
 * @returns Flat array of all unique product IDs
 */
function extractAllProductIds(
  backups: Array<{ primaryId: string; backupIds: string[] }>
): string[] {
  const allIds = new Set<string>();

  backups.forEach((group) => {
    allIds.add(group.primaryId);
    group.backupIds.forEach((id) => allIds.add(id));
  });

  return Array.from(allIds);
}

/**
 * Perform product selection with substitution algorithm
 * Follows standardization specification exactly
 *
 * Algorithm:
 * 1. For each primary product:
 *    a. Check if primary is available AND usable
 *    b. If NO → Check backups in order [0, 1, 2...]
 *    c. Use first available backup
 *    d. If none available → Skip product
 *
 * @param backups - Backup groups
 * @param availabilityMap - Availability data for all products
 * @returns Selection result with substitutions
 */
function performProductSelection(
  backups: Array<{ primaryId: string; backupIds: string[] }>,
  availabilityMap: Map<string, ProductAvailability>
): ProductSelectionResult {
  const selectedProducts: SelectedProduct[] = [];
  const backupProductsUsed: BackupProductUsed[] = [];
  const unavailableProducts: string[] = [];

  // Process each backup group
  backups.forEach((group) => {
    const { primaryId, backupIds } = group;

    // Check primary availability
    const primaryAvailability = getAvailability(availabilityMap, primaryId);
    const primaryUsable = isProductAvailable(primaryAvailability);

    if (primaryUsable && primaryAvailability) {
      // Primary is available - use it
      selectedProducts.push({
        productId: primaryId,
        availability: primaryAvailability,
      });

      if (process.env.NODE_ENV === 'development') {
        console.log(`[Selector] Using primary: ${primaryId}`);
      }
      return; // Continue to next group
    }

    // Primary unavailable - check backups in order
    let replaced = false;

    for (const backupId of backupIds) {
      const backupAvailability = getAvailability(availabilityMap, backupId);
      const backupUsable = isProductAvailable(backupAvailability);

      if (backupUsable && backupAvailability) {
        // Found available backup - use it
        selectedProducts.push({
          productId: backupId,
          availability: backupAvailability,
        });

        // Record substitution
        backupProductsUsed.push({
          originalId: primaryId,
          replacementId: backupId,
          reason: primaryAvailability ? 'OUT_OF_STOCK' : 'PRIMARY_UNUSABLE',
        });

        if (process.env.NODE_ENV === 'development') {
          console.log(`[Selector] Substituted ${primaryId} → ${backupId}`);
        }

        replaced = true;
        break; // Stop checking remaining backups (short-circuit)
      }
    }

    // No products available (primary or backups)
    if (!replaced) {
      unavailableProducts.push(primaryId);

      if (process.env.NODE_ENV === 'development') {
        console.log(`[Selector] All options unavailable for ${primaryId}`);
      }
    }
  });

  return {
    selectedProducts,
    backupProductsUsed,
    unavailableProducts,
  };
}

// ============================================================================
// URL Generation
// ============================================================================

/**
 * Build redirect URL based on selected products
 *
 * Target-specific logic:
 * - Single product: Direct to product page (if allowPdp)
 * - Multiple products: Use customUrl or longLink (Target doesn't support cart URLs)
 * - No products: Use customUrl or longLink
 *
 * @param selectionResult - Product selection result
 * @param longLink - Original long link (fallback)
 * @param customUrl - Custom fallback URL
 * @param allowPdp - Allow product detail page redirect
 * @returns Redirect URL
 */
function buildRedirectUrl(
  selectionResult: ProductSelectionResult,
  longLink: string,
  customUrl?: string,
  allowPdp?: boolean
): string {
  const { selectedProducts } = selectionResult;

  // No products available - use fallback
  if (selectedProducts.length === 0) {
    return customUrl || longLink;
  }

  // Single product and allowPdp - direct to product page
  if (selectedProducts.length === 1 && allowPdp !== false) {
    const tcin = selectedProducts[0].productId;
    return generateProductUrl(tcin);
  }

  // Multiple products or allowPdp=false - Target doesn't support multi-product cart URLs
  // Use custom URL if provided, otherwise fall back to long link
  if (selectedProducts.length > 1) {
    if (process.env.NODE_ENV === 'development') {
      console.log(
        '[Product Selector] Multiple products selected, but Target does not support cart URLs. Using fallback.'
      );
    }
    return customUrl || longLink;
  }

  // Default fallback
  return customUrl || longLink;
}

/**
 * Determine cart URL type for response
 *
 * @param selectionResult - Selection result
 * @param customUrl - Custom URL
 * @param allowPdp - Allow PDP
 * @returns Cart URL type
 */
function determineCartUrlType(
  selectionResult: ProductSelectionResult,
  customUrl?: string,
  allowPdp?: boolean
): 'pdp' | 'longLink' | 'custom' {
  if (selectionResult.selectedProducts.length === 0) {
    return customUrl ? 'custom' : 'longLink';
  }

  if (selectionResult.selectedProducts.length === 1 && allowPdp !== false) {
    return 'pdp';
  }

  return customUrl ? 'custom' : 'longLink';
}

// ============================================================================
// Analytics & Logging
// ============================================================================

/**
 * Log analytics events for substitutions and unavailable products
 *
 * @param request - Original request
 * @param selectionResult - Selection result
 */
function logAnalyticsEvents(
  request: SmartSelectionRequest,
  selectionResult: ProductSelectionResult
): void {
  // Log substitution events
  selectionResult.backupProductsUsed.forEach((substitution) => {
    logSubstitutionEvent({
      shortLink: request.shortLink,
      originalId: substitution.originalId,
      replacementId: substitution.replacementId,
      reason: substitution.reason,
      zipCode: request.zipCode,
      storeId: request.storeId,
    });
  });

  // Log all products unavailable event
  if (selectionResult.selectedProducts.length === 0) {
    logAllProductsUnavailableEvent({
      shortLink: request.shortLink,
      primaryProductIds: request.backups.map((b) => b.primaryId),
      zipCode: request.zipCode,
      fallbackUrl: request.customUrl || request.longLink,
    });
  }
}

/**
 * Log product substitution event
 *
 * @param data - Substitution event data
 */
function logSubstitutionEvent(data: {
  shortLink: string;
  originalId: string;
  replacementId: string;
  reason: string;
  zipCode: string;
  storeId?: string;
}): void {
  if (process.env.NODE_ENV === 'development') {
    console.log('[Analytics] Product Substitution:', {
      event: 'product_substitution',
      timestamp: new Date().toISOString(),
      ...data,
    });
  }

  // In production, send to analytics service (e.g., Google Analytics, Mixpanel)
  // Example: analytics.track('product_substitution', data);
}

/**
 * Log all products unavailable event
 *
 * @param data - Unavailable event data
 */
function logAllProductsUnavailableEvent(data: {
  shortLink: string;
  primaryProductIds: string[];
  zipCode: string;
  fallbackUrl: string;
}): void {
  if (process.env.NODE_ENV === 'development') {
    console.log('[Analytics] All Products Unavailable:', {
      event: 'all_products_unavailable',
      timestamp: new Date().toISOString(),
      ...data,
    });
  }

  // In production, send to analytics service
  // Example: analytics.track('all_products_unavailable', data);
}

/**
 * Log API performance metrics
 *
 * @param data - Performance data
 */
export function logApiPerformance(data: {
  endpoint: string;
  durationMs: number;
  cacheHit: boolean;
  productsChecked: number;
  substitutions: number;
}): void {
  if (process.env.NODE_ENV === 'development') {
    console.log('[Analytics] API Performance:', {
      event: 'api_call',
      timestamp: new Date().toISOString(),
      ...data,
    });
  }

  // In production, send to monitoring service (e.g., DataDog, New Relic)
  // Example: monitoring.recordMetric('api_call', data);
}
