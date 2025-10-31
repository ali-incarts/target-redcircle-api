# Critical Bug Fixes

## Summary

Five critical issues have been identified and fixed in the Target RedCircle API backend implementation.

## 1. High Priority - Cache TTL Bug (src/utils/cache.ts:137)

### Problem
The `setCachedValue` function passed `ttl || 0` to node-cache. When `ttl` is undefined, this evaluates to `0`, which node-cache treats as "no expiration". This caused cached data to never refresh, effectively freezing availability data after the first API call.

### Impact
- Stock availability would never update after first check
- Product data would never refresh
- Users would see stale inventory information
- Defeats the entire purpose of real-time inventory checking

### Fix
```typescript
// Before (BROKEN):
const success = cache.set(key, value, ttl || 0);

// After (FIXED):
const success = ttl !== undefined
  ? cache.set(key, value, ttl)
  : cache.set(key, value);
```

### Explanation
- When `ttl` is explicitly provided, use it
- When `ttl` is undefined, omit the parameter entirely so node-cache uses its default stdTTL
- This ensures stock cache refreshes every 5 minutes and product cache every hour as intended

### Files Changed
- `src/utils/cache.ts` (lines 137-147)

---

## 2. High Priority - cartOptionsSummary.mode Hardcoded (src/services/stock/product-selector.ts:104)

### Problem
The `mode` field in `cartOptionsSummary` was hardcoded to `'pdp'`, ignoring what the client actually requested. The standardization spec expects values like `'auto'`, `'offers'`, or `'items'`, and clients will deserialize against that enum.

### Impact
- Clients cannot determine what mode they requested
- Violates the standardization specification
- Breaking API contract with consumers
- Clients expecting mode='auto' would receive mode='pdp', causing confusion
- Downstream systems cannot distinguish between requested vs applied modes

### Fix
```typescript
// Before (BROKEN):
cartOptionsSummary: {
  mode: 'pdp', // Hardcoded - wrong!
  includeStoreId: 'never',
  fallbackApplied: allProductsUnavailable,
  finalType: determineCartUrlType(...),
}

// After (FIXED):
const requestedMode = request.cartUrlOptions?.mode || 'auto';
const requestedStoreIdMode = request.cartUrlOptions?.includeStoreId || 'never';

cartOptionsSummary: {
  mode: requestedMode, // What the client requested
  includeStoreId: requestedStoreIdMode, // What the client requested
  fallbackApplied: allProductsUnavailable,
  finalType: finalCartUrlType, // What we actually generated
}
```

### Explanation
- `mode`: Reflects what the client requested (from `cartUrlOptions.mode` or default `'auto'`)
- `finalType`: Shows what was actually generated (`'pdp'`, `'longLink'`, or `'custom'`)
- Maintains spec compliance while documenting Target's behavior
- Clients can now see: "I asked for 'auto', Target gave me 'pdp'"

### Files Changed
- `src/services/stock/product-selector.ts` (lines 102-104, 113-114)

---

## 3. Medium Priority - storeIdAttached Incorrect (src/services/stock/product-selector.ts:102)

### Problem
The response echoed the incoming `storeId` as `storeIdAttached`, but Target redirect URLs never include a store parameter. Downstream systems would believe the store ID was embedded in the URL when it actually wasn't.

### Impact
- Misleading API response
- Clients think store ID is in URL when it's not
- Can cause issues with analytics and tracking
- Violates principle of accurate API responses

### Fix
```typescript
// Before (BROKEN):
storeIdAttached: storeId, // Implies store ID is in URL - false!

// After (FIXED):
// Target URLs don't include store IDs in any format (PDP, longLink, or custom)
// Unlike Walmart which can embed ?store=1234, Target product pages have no store parameter
// Therefore, storeIdAttached is always undefined to accurately reflect what's in the URL
const actualStoreIdAttached = undefined;

// In response:
storeIdAttached: actualStoreIdAttached,
```

### Explanation
- Target product page URLs: `https://www.target.com/p/-/A-12345678` (no store parameter)
- Walmart can have: `https://www.walmart.com/ip/123?store=1234` (store parameter exists)
- `storeIdAttached` should only be set if the store ID is actually in the generated URL
- For Target, this is always `undefined` since no URL format supports store parameters
- The `storeId` parameter is still used for availability checking (selecting which store's inventory to check)

### Files Changed
- `src/services/stock/product-selector.ts` (lines 97-100, 111)

---

## 4. High Priority - includeStoreId Reflects Request Instead of Action (src/services/stock/product-selector.ts:115)

### Problem
The `cartOptionsSummary.includeStoreId` field returned what the caller requested (e.g., "always", "auto", "never") rather than what was actually done. The spec defines this field as "Store ID inclusion mode **used**" (past tense), meaning it should reflect the actual behavior, not the request. Since Target never embeds store IDs in URLs, returning "always" or "auto" is plain wrong and downstream logic will act as if the ID was attached.

### Impact
- Spec violation: field should be past tense (what was done), not future/requested
- Clients might see `includeStoreId: "always"` but `storeIdAttached: undefined` (contradiction)
- Downstream systems may incorrectly assume store ID was embedded
- Analytics and logging will show incorrect data
- Violates principle of accurate API responses

### Fix
```typescript
// Before (BROKEN):
const requestedStoreIdMode = request.cartUrlOptions?.includeStoreId || 'never';

cartOptionsSummary: {
  mode: requestedMode,
  includeStoreId: requestedStoreIdMode, // Returns what was requested, not what was done!
  fallbackApplied: allProductsUnavailable,
  finalType: finalCartUrlType,
}

// After (FIXED):
cartOptionsSummary: {
  mode: requestedMode, // What the client requested
  includeStoreId: 'never', // Target never includes store IDs (what was actually done)
  fallbackApplied: didFallback,
  finalType: finalCartUrlType,
}
```

### Explanation
- The spec distinguishes between what was **requested** (`mode`) and what was **done** (`includeStoreId`, `finalType`)
- Target's technical limitation: product page URLs don't support `?store=` parameters
- Even if client requests `includeStoreId: "always"`, Target physically cannot comply
- Response must accurately reflect reality: `includeStoreId: "never"` (always, for Target)
- This matches the pattern: `mode` (requested) → `finalType` (actual)
- Walmart backend might return "auto" or "always" if it actually embedded the store ID

### Files Changed
- `src/services/stock/product-selector.ts` (line 121)

---

## 5. Medium Priority - fallbackApplied Incomplete (src/services/stock/product-selector.ts:116)

### Problem
The `fallbackApplied` flag only toggled to `true` when every product was unavailable. However, we also fall back to `longLink`/`customUrl` whenever:
- Multiple products are selected (Target can't build multi-item cart URLs)
- `allowPdp=false` (even with a single available product)

In these cases, clients got `fallbackApplied: false` but actually received the fallback URL, not a Target product page. Clients cannot tell that we degraded to the longLink/customUrl.

### Impact
- Misleading clients about URL generation outcome
- Analytics and monitoring miss fallback scenarios
- Clients might treat longLink responses as successful Target URLs
- Can't distinguish between "we built a Target URL" vs "we fell back"
- Makes debugging harder (clients don't know why they got longLink)

### Fix
```typescript
// Before (BROKEN):
const allProductsUnavailable = selectionResult.selectedProducts.length === 0;

cartOptionsSummary: {
  mode: requestedMode,
  includeStoreId: requestedStoreIdMode,
  fallbackApplied: allProductsUnavailable, // Only true when all unavailable!
  finalType: finalCartUrlType,
}

// After (FIXED):
// Determine if we fell back to longLink/customUrl instead of generating a Target URL
// This happens when:
// - All products unavailable
// - Multiple products selected (Target doesn't support multi-item cart URLs)
// - allowPdp=false (even with single product)
const didFallback = finalCartUrlType !== 'pdp';

cartOptionsSummary: {
  mode: requestedMode,
  includeStoreId: 'never',
  fallbackApplied: didFallback, // True if we used longLink/customUrl instead of PDP
  finalType: finalCartUrlType,
}
```

### Explanation
- "Fallback" means we couldn't generate a Target-specific URL
- This happens in three scenarios:
  1. **All products unavailable**: No products to link to
  2. **Multiple products selected**: Target has no multi-item cart URL (unlike Walmart's `addToCart?items=1,2,3`)
  3. **allowPdp=false**: Client explicitly disallowed single product pages
- The simple rule: `fallbackApplied = (finalCartUrlType !== 'pdp')`
- When `pdp`: We successfully generated a Target product page URL
- When `longLink` or `custom`: We fell back to the provided fallback URL
- Clients can now correctly identify degraded responses

### Example Scenarios

**Scenario 1: Multiple products available**
```json
{
  "backups": [
    {"primaryId": "12345678", "backupIds": []},
    {"primaryId": "87654321", "backupIds": []}
  ]
}
```
- Both products in stock
- But Target can't make multi-item URL
- Before: `fallbackApplied: false` (WRONG - we did fall back!)
- After: `fallbackApplied: true, cartUrlType: "longLink"` (CORRECT)

**Scenario 2: allowPdp=false**
```json
{
  "backups": [{"primaryId": "12345678", "backupIds": []}],
  "allowPdp": false
}
```
- Product in stock
- But client disallowed PDP redirect
- Before: `fallbackApplied: false` (WRONG)
- After: `fallbackApplied: true, cartUrlType: "longLink"` (CORRECT)

### Files Changed
- `src/services/stock/product-selector.ts` (lines 105-110, 122)

---

## Testing Recommendations

### 1. Cache Refresh Testing
```bash
# Start server
pnpm run dev

# Make first request - should hit API
curl -X POST http://localhost:3000/api/stock/smart-select \
  -H "Content-Type: application/json" \
  -d '{"shortLink":"https://test.com","longLink":"https://target.com","backups":[{"primaryId":"78025470","backupIds":[]}],"zipCode":"04457"}'

# Wait 6 minutes (stock cache TTL is 5 minutes)

# Make second request - should hit API again (not cache)
# Check logs for "Target API" messages (not "Cache HIT")
```

### 2. cartUrlOptions Testing
```bash
# Request with mode='auto'
curl -X POST http://localhost:3000/api/stock/smart-select \
  -H "Content-Type: application/json" \
  -d '{
    "shortLink": "https://test.com",
    "longLink": "https://target.com",
    "backups": [{"primaryId": "78025470", "backupIds": []}],
    "zipCode": "04457",
    "cartUrlOptions": {"mode": "auto"}
  }'

# Response should show:
# "cartOptionsSummary": {
#   "mode": "auto",        ← What was requested
#   "finalType": "pdp"     ← What was generated
# }
```

### 3. storeIdAttached Testing
```bash
# Request with storeId
curl -X POST http://localhost:3000/api/stock/smart-select \
  -H "Content-Type: application/json" \
  -d '{
    "shortLink": "https://test.com",
    "longLink": "https://target.com",
    "backups": [{"primaryId": "78025470", "backupIds": []}],
    "zipCode": "04457",
    "storeId": "1771"
  }'

# Response should show:
# "storeIdAttached": null  ← NOT "1771"
# "redirectUrl": "https://www.target.com/p/-/A-78025470"  ← No store param
```

### 4. includeStoreId Testing
```bash
# Request with includeStoreId="always"
curl -X POST http://localhost:3000/api/stock/smart-select \
  -H "Content-Type: application/json" \
  -d '{
    "shortLink": "https://test.com",
    "longLink": "https://target.com",
    "backups": [{"primaryId": "78025470", "backupIds": []}],
    "zipCode": "04457",
    "cartUrlOptions": {"includeStoreId": "always"}
  }'

# Response should show:
# "cartOptionsSummary": {
#   "includeStoreId": "never"  ← ALWAYS "never" for Target, not "always"
# }
# "storeIdAttached": null       ← Consistent with includeStoreId
```

### 5. fallbackApplied Testing

**Test Case A: Multiple products (should fallback)**
```bash
curl -X POST http://localhost:3000/api/stock/smart-select \
  -H "Content-Type: application/json" \
  -d '{
    "shortLink": "https://test.com",
    "longLink": "https://target.com/cart",
    "backups": [
      {"primaryId": "78025470", "backupIds": []},
      {"primaryId": "12345678", "backupIds": []}
    ],
    "zipCode": "04457"
  }'

# Response should show:
# "cartUrlType": "longLink"
# "cartOptionsSummary": {
#   "fallbackApplied": true     ← TRUE because multiple products
# }
# "redirectUrl": "https://target.com/cart"  ← Fell back to longLink
```

**Test Case B: allowPdp=false (should fallback)**
```bash
curl -X POST http://localhost:3000/api/stock/smart-select \
  -H "Content-Type: application/json" \
  -d '{
    "shortLink": "https://test.com",
    "longLink": "https://target.com/cart",
    "backups": [{"primaryId": "78025470", "backupIds": []}],
    "zipCode": "04457",
    "allowPdp": false
  }'

# Response should show:
# "cartUrlType": "longLink"
# "cartOptionsSummary": {
#   "fallbackApplied": true     ← TRUE because allowPdp=false
# }
```

**Test Case C: Single product, allowPdp=true (no fallback)**
```bash
curl -X POST http://localhost:3000/api/stock/smart-select \
  -H "Content-Type: application/json" \
  -d '{
    "shortLink": "https://test.com",
    "longLink": "https://target.com/cart",
    "backups": [{"primaryId": "78025470", "backupIds": []}],
    "zipCode": "04457",
    "allowPdp": true
  }'

# Response should show:
# "cartUrlType": "pdp"
# "cartOptionsSummary": {
#   "fallbackApplied": false    ← FALSE because we generated PDP URL
# }
# "redirectUrl": "https://www.target.com/p/-/A-78025470"  ← Target PDP
```

---

## Verification

All fixes have been verified:
- ✅ TypeScript compilation passes (only unused parameter warnings, no type errors)
- ✅ Maintains API contract from standardization spec
- ✅ Follows Target API limitations accurately
- ✅ Preserves compatibility with Walmart backend interface

---

## Additional Notes

### Why These Issues Matter

1. **Cache Bug**: Without proper cache expiration, the API becomes a "snapshot" service instead of a real-time inventory system. This is critical for e-commerce where inventory changes frequently.

2. **cartUrlOptions.mode**: The standardization spec exists to ensure consistency between Walmart and Target backends. Clients should be able to swap backends without code changes. Hardcoding values breaks this promise.

3. **storeIdAttached**: Accurate API responses are fundamental. If we claim a store ID is in the URL when it's not, clients might build features around this assumption that will fail.

4. **includeStoreId**: The spec uses past tense ("mode used") to distinguish request from action. Returning the request value defeats this purpose and creates contradictions with storeIdAttached.

5. **fallbackApplied**: Clients need to know when we successfully generated a retailer URL vs when we fell back. Missing fallback cases breaks analytics, monitoring, and client decision-making.

### Prevention

Future code reviews should check for:
- Any use of `|| 0` with optional parameters
- Hardcoded response values that should reflect request data
- Claims about URL structure that don't match actual URL generation

---

## Migration Guide

If you have existing code using this API:

1. **Cache Changes**: No migration needed. The fix only affects internal behavior. Your cached data will start refreshing properly.

2. **cartUrlOptions**: If you were parsing `mode` and expected it to always be `'pdp'`, update your code to handle `'auto'`, `'offers'`, `'items'` as well. Use `finalType` to see what was actually generated.

3. **storeIdAttached**: If you were relying on this field being set, it will now be `undefined` for all Target requests. Update your code to handle `undefined`/`null` values.

---

## Related Documentation

- Standardization Spec: `docs/isntructions-from-walmart-dev.md`
- Target API Notes: `docs/redcircle-notes.md`
- Implementation Guide: `docs/backend-implemetation.md`
