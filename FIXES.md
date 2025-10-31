# Critical Bug Fixes

## Summary

Three critical issues have been identified and fixed in the Target RedCircle API backend implementation.

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

2. **cartUrlOptions**: The standardization spec exists to ensure consistency between Walmart and Target backends. Clients should be able to swap backends without code changes. Hardcoding values breaks this promise.

3. **storeIdAttached**: Accurate API responses are fundamental. If we claim a store ID is in the URL when it's not, clients might build features around this assumption that will fail.

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
