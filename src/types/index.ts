/**
 * @fileoverview Type definitions for Target RedCircle API backend
 * @description Standardized interfaces following the Smart Product Selection API specification
 * @module types
 * @related controllers/stock.ts, services/stock/availability.ts, services/stock/product-selector.ts
 */

// ============================================================================
// Standard Request Types (Aligned with Walmart Backend)
// ============================================================================

/**
 * Backup product group with primary and backup product IDs
 */
export interface BackupGroup {
  primaryId: string;
  backupIds: string[];
}

/**
 * Cart URL generation options
 * Note: For Target, these options are accepted but have no effect (product pages only)
 */
export interface CartUrlOptions {
  mode?: 'auto' | 'offers' | 'items';
  fallbackMode?: 'offers' | 'items';
  includeStoreId?: 'never' | 'auto' | 'always';
  preferItemsForWalmart?: boolean;
  preferOffersForMarketplace?: boolean;
}

/**
 * Standard request payload for smart product selection
 */
export interface SmartSelectionRequest {
  shortLink: string;
  longLink: string;
  backups: BackupGroup[];
  zipCode: string;
  storeId?: string;
  customUrl?: string;
  allowPdp?: boolean;
  cartUrlOptions?: CartUrlOptions;
}

// ============================================================================
// Standard Response Types
// ============================================================================

/**
 * Product substitution record
 */
export interface BackupProductUsed {
  originalId: string;
  replacementId: string;
  reason: 'OUT_OF_STOCK' | 'PRIMARY_UNUSABLE';
}

/**
 * Cart URL generation summary
 */
export interface CartOptionsSummary {
  mode: string;
  includeStoreId: string;
  fallbackApplied: boolean;
  finalType: string;
}

/**
 * Standard response from smart product selection
 */
export interface SmartSelectionResponse {
  redirectUrl: string;
  backupsUsed: boolean;
  backupProducts: BackupProductUsed[];
  allProductsUnavailable: boolean;
  cartUrlType: 'pdp' | 'longLink' | 'custom';
  storeIdAttached?: string;
  cartOptionsSummary: CartOptionsSummary;
}

// ============================================================================
// Target RedCircle API Types
// ============================================================================

/**
 * Store stock result from Target RedCircle API
 */
export interface TargetStoreStock {
  Position: number;
  Store_name: string;
  Store_id: string;
  In_stock: boolean;
  Stock_level: number;
  Distance: number;
  Address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
}

/**
 * Store stock response from RedCircle API
 */
export interface TargetStoreStockResponse {
  Store_stock_results?: TargetStoreStock[];
  request_info?: {
    success: boolean;
    credits_used: number;
    credits_remaining?: number;
  };
}

/**
 * Product information from Target RedCircle API
 */
export interface TargetProduct {
  Tcin: string;
  Title: string;
  Link: string;
  Brand?: string;
  Price?: {
    value: number;
    currency: string;
  };
  Rating?: number;
  Main_image?: string;
  Stock_status?: 'IN_STOCK' | 'OUT_OF_STOCK';
  Description?: string;
}

/**
 * Product response from RedCircle API
 */
export interface TargetProductResponse {
  Product?: TargetProduct;
  request_info?: {
    success: boolean;
    credits_used: number;
    credits_remaining?: number;
  };
}

// ============================================================================
// Internal Service Types
// ============================================================================

/**
 * Product availability information (standardized format)
 */
export interface ProductAvailability {
  productId: string;
  inStock: boolean;
  availableQuantity: number;
  storeId?: string;
  storeName?: string;
  distance?: number;
  offerId?: string; // Not used for Target, included for standardization
  offerType?: string;
}

/**
 * Parameters for stock checking
 */
export interface StockCheckParams {
  productIds: string[];
  zipCode: string;
  storeId?: string;
}

/**
 * Result from stock availability check
 */
export interface StockCheckResult {
  availabilityMap: Map<string, ProductAvailability>;
  errors: ProductError[];
}

/**
 * Product error information
 */
export interface ProductError {
  productId: string;
  error: string;
  code?: string | number;
}

/**
 * Selected product information
 */
export interface SelectedProduct {
  productId: string;
  quantity?: number;
  availability: ProductAvailability;
}

/**
 * Product selection result
 */
export interface ProductSelectionResult {
  selectedProducts: SelectedProduct[];
  backupProductsUsed: BackupProductUsed[];
  unavailableProducts: string[];
}

// ============================================================================
// Cache Types
// ============================================================================

/**
 * Cache key components
 */
export interface CacheKey {
  prefix: string;
  zipCode?: string;
  storeId?: string;
  productIds?: string[];
}

/**
 * Cached data wrapper
 */
export interface CachedData<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

// ============================================================================
// API Configuration Types
// ============================================================================

/**
 * Target API configuration
 */
export interface TargetApiConfig {
  apiKey: string;
  baseUrl: string;
  timeout?: number;
  retryAttempts?: number;
}

/**
 * API request options
 */
export interface ApiRequestOptions {
  skipCache?: boolean;
  timeout?: number;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * API error with code and details
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public code: string | number,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Validation error
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}
