# New RedCircle API Endpoints

## Summary

Three new product-related endpoints have been added to the Target RedCircle API backend, providing comprehensive product lookup and search capabilities.

---

## New Endpoints

### 1. Product Lookup by TCIN

**Endpoint**: `GET /api/products/:tcin`

**Description**: Retrieve comprehensive product information using Target's internal product ID (TCIN).

**Parameters**:
- `tcin` (path, required): 8-digit Target TCIN
  - Example: `78025470`
  - Pattern: `^\d{8}$`

**Example Request**:
```bash
curl http://localhost:3000/api/products/78025470
```

**Example Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "Tcin": "78025470",
    "Title": "Sample Product Title",
    "Link": "https://www.target.com/p/-/A-78025470",
    "Brand": "Example Brand",
    "Main_image": "https://example.com/image.jpg",
    "Rating": 4.5,
    "Ratings_total": 123,
    "Price": {
      "value": 19.99,
      "currency": "USD",
      "currency_symbol": "$"
    },
    "Description": "Product description...",
    "Feature_bullets": ["Feature 1", "Feature 2"],
    "Availability": {
      "raw": "In stock",
      "in_stock": true
    }
  },
  "request_info": {
    "success": true,
    "credits_used": 1,
    "credits_remaining": 999
  }
}
```

**Error Responses**:
- `400 Bad Request`: Invalid TCIN format
- `404 Not Found`: Product not found
- `500 Internal Server Error`: Server error

---

### 2. Product Lookup by UPC/GTIN

**Endpoint**: `GET /api/products/upc/:gtin`

**Description**: Convert UPC barcode to Target TCIN and retrieve product information. Useful for barcode scanning applications.

**Parameters**:
- `gtin` (path, required): UPC/GTIN barcode (8-14 digits)
  - Example: `123456789012`
  - Pattern: `^\d{8,14}$`

**Example Request**:
```bash
curl http://localhost:3000/api/products/upc/123456789012
```

**Example Response**: Same format as TCIN lookup

**Use Cases**:
- Barcode scanning apps
- Price comparison tools
- Inventory management systems
- Point-of-sale integrations

---

### 3. Product Search

**Endpoint**: `GET /api/products/search`

**Description**: Search Target products by keyword with pagination and sorting options.

**Query Parameters**:
- `q` (required): Search keyword(s)
  - Example: `highlighter pens`
- `page` (optional): Page number (default: 1, minimum: 1)
- `sort` (optional): Sort order
  - Options: `best_seller`, `price_low_to_high`, `price_high_to_low`, `highest_rated`, `newest`

**Example Request**:
```bash
curl "http://localhost:3000/api/products/search?q=highlighter+pens&page=1&sort=best_seller"
```

**Example Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "position": 1,
        "product": {
          "title": "Highlighter Pens - 6pk",
          "link": "https://www.target.com/p/-/A-12345678",
          "tcin": "12345678",
          "brand": "up & up",
          "main_image": "https://example.com/image.jpg",
          "rating": 4.5,
          "ratings_total": 234
        },
        "offers": {
          "primary": {
            "price": 3.99,
            "currency_symbol": "$"
          }
        }
      }
    ],
    "pagination": {
      "current_page": 1,
      "total_pages": 5,
      "total_results": 119
    },
    "facets": [...],
    "categories": [...],
    "related_queries": [...]
  },
  "request_info": {
    "success": true,
    "credits_used": 1,
    "credits_remaining": 998
  }
}
```

---

## Implementation Details

### Files Modified/Created

**New Files**:
1. `src/controllers/products.ts` - Controller handlers for product endpoints
2. `NEW_ENDPOINTS.md` - This documentation file

**Modified Files**:
1. `src/types/index.ts` - Added types:
   - `TargetProductDetails`
   - `TargetProductFullResponse`
   - `TargetSearchResultItem`
   - `TargetSearchResponse`

2. `src/services/target/api.ts` - Added service methods:
   - `getFullProductByTcin(tcin, options)` - Get complete product details
   - `getProductByGtin(gtin, options)` - Lookup by UPC/GTIN
   - `searchProducts(searchTerm, options)` - Search products

3. `src/index.ts` - Added routes:
   - `GET /api/products/:tcin`
   - `GET /api/products/upc/:gtin`
   - `GET /api/products/search`

4. `src/config/swagger.ts` - Added Swagger schemas:
   - `ProductDetails`
   - `ProductResponse`
   - `SearchResultItem`
   - `SearchResponse`

---

## Features

### Caching
All endpoints use aggressive caching to minimize API costs:
- **Product lookups (TCIN/GTIN)**: 1 hour TTL
- **Search results**: 5 minutes TTL

### Error Handling
Comprehensive validation and error responses:
- Input validation (TCIN format, UPC format, search terms)
- 404 responses for products not found
- Graceful error handling with appropriate status codes
- Development-friendly error messages

### Logging
Development mode logging for:
- API requests
- Cache hits/misses
- Error details

---

## API Documentation

Interactive Swagger documentation is available at:
- **Swagger UI**: http://localhost:3000/api-docs
- **OpenAPI Spec**: http://localhost:3000/api-docs.json

All new endpoints are fully documented with:
- Request/response schemas
- Parameter validation rules
- Example requests and responses
- Error response formats

---

## Usage Examples

### 1. Get Product Details
```javascript
// Using fetch
const response = await fetch('http://localhost:3000/api/products/78025470');
const data = await response.json();
console.log(data.data.Title); // Product title
```

### 2. Barcode Lookup
```javascript
// Scan barcode and lookup product
const upc = '123456789012'; // From barcode scanner
const response = await fetch(`http://localhost:3000/api/products/upc/${upc}`);
const product = await response.json();
```

### 3. Search Products
```javascript
// Search with pagination
const searchTerm = 'highlighter pens';
const page = 1;
const response = await fetch(
  `http://localhost:3000/api/products/search?q=${encodeURIComponent(searchTerm)}&page=${page}&sort=best_seller`
);
const results = await response.json();
console.log(`Found ${results.data.pagination.total_results} results`);
```

---

## Testing

### Manual Testing
```bash
# Start server
pnpm dev

# Test product by TCIN
curl http://localhost:3000/api/products/78025470

# Test product by UPC (requires valid UPC)
curl http://localhost:3000/api/products/upc/035000521019

# Test search
curl "http://localhost:3000/api/products/search?q=highlighter&page=1"

# Test with invalid input
curl http://localhost:3000/api/products/123  # Should return 400
```

### Build Verification
```bash
# TypeScript compilation
pnpm type-check  # ✓ Passes

# Production build
pnpm build  # ✓ Succeeds

# Linting
pnpm lint  # ✓ No errors
```

---

## RedCircle API Credits

Each endpoint consumes RedCircle API credits:
- **Product lookup**: 1 credit per request
- **Search**: 1 credit per page

Caching significantly reduces credit consumption:
- Product details cached for 1 hour
- Search results cached for 5 minutes

---

## Integration with Existing Features

These endpoints complement the existing smart product selection endpoint:
- Use `/api/products/:tcin` to preview products before adding to smart selection
- Use `/api/products/search` to find products and their TCINs
- Use `/api/products/upc/:gtin` to convert barcodes to TCINs for smart selection

---

## Next Steps

Potential enhancements:
1. Add product reviews endpoint (`type=reviews`)
2. Add category browse endpoint (`type=category`)
3. Add batch product lookup for multiple TCINs
4. Add more search filters (price range, category, brand)
5. Add webhook support for product availability changes

---

## API Reference

For complete API documentation, visit:
- **Main README**: [README.md](./README.md)
- **Swagger Documentation**: http://localhost:3000/api-docs (when server is running)
- **RedCircle API Docs**: https://docs.trajectdata.com/redcircleapi
