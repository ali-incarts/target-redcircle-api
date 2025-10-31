TARGET REDCIRCLE API - COMPLETE TECHNICAL DOCUMENTATION

API Overview
RedCircle API Documentation: https://docs.trajectdata.com/redcircleapi
Official Support: hello@redcircleapi.com

What This API Does:
The Target RedCircle API is a READ-ONLY data retrieval API for accessing public Target product information in real-time. It returns structured JSON or CSV data.

Core Capabilities:
✓ Search for products (type=search)
✓ Get detailed product information (type=product)
✓ Retrieve category listings (type=category)
✓ Fetch customer reviews (type=reviews)
✓ Check stock availability by location

API Endpoint:
Base URL: https://api.redcircleapi.com/request

Required Parameters:
Api_key: Your API key (sign up at RedCircle API)
- type: Request type (search, product, category, reviews)
Response Time: 1-6 seconds typically

—

Product Page Links

API Support: ✓ FULLY SUPPORTED

The API returns direct Target product page URLs in this format:
https://www.target.com/p/[product-name]/-/A-[TCIN]

TCIN = Target’s unique product identifier

Example API Request (Get Product by TCIN):
https://api.redcircleapi.com/request?api_key=demo&type=product&tcin=78025470

Returns product data including:
{
  “Product”: {
    “Tcin”: “78025470”,
    “Title”: “Sharpie Pocket 4pk Highlighters…”,
    “Link”: “https://www.target.com/p/sharpie-pocket-4pk-highlighters-narrow-chisel-tip-multicolored/-/A-78025470”,
    “Brand”: “Sharpie”,
    “Price”: { “value”: 2.89, “currency”: “USD” },
    “Rating”: 4.7,
    “Main_image”: “https://target.scene7.com/…”,
    …
  }
}

Example API Request (Search Products):
https://api.redcircleapi.com/request?api_key=demo&type=search&search_term=highlighter+pens&sort_by=best_seller

Returns array of products, each with a “link” field pointing to the Target product page.

Product Lookup Methods:
By TCIN: &type=product&tcin=12345678
2. By UPC/GTIN: &type=product&gtin=071641174603
3. By Search: &type=search&search_term=your+query
For Your Application:
Import product data from Target via API
- Store the product “link” field from API responses
- Use these links to create product page buttons/links
- Update product information periodically via API
—

Add-to-Cart Links

API Support: ✗ NOT SUPPORTED

CRITICAL LIMITATION: The Target RedCircle API does NOT provide add-to-cart functionality or generate cart URLs.

This is a data-only API - it cannot:
✗ Generate add-to-cart links
✗ Manipulate shopping carts
✗ Create checkout URLs
✗ Handle any transactional operations

Comparison to Walmart:
Unlike Walmart (which supports direct add-to-cart URLs), Target’s public API is strictly for reading product data.

Your Options:
Product page links only (supported via API)
2. Manual URL pattern research (not documented - may not exist publicly)
3. Contact Target Partnership/Affiliate team for cart integration capabilities beyond the public API
Recommendation:
For Target integration, your platform should:
Support product page links (fully functional via API)
- Inform users that Target links go to product pages where they manually add to cart
- Clearly distinguish Target capabilities from Walmart capabilities
—

Key Data Points Available

Product Information:
TCIN (Target product ID)
- Product title
- Brand and brand link
- UPC/GTIN codes
- DPCI (department/class/item number)
- Product description
- Feature bullets
- Specifications
- Weight and dimensions
- Product images (multiple)
- Product videos
Pricing & Availability:
Current price
- Currency
- Stock status (IN_STOCK, OUT_OF_STOCK)
- Store pickup availability
- Pickup ready time (minutes)
- Store location details
- Delivery from store options
- Shipping availability and timing
Customer Feedback:
Overall rating
- Total number of ratings
- Individual reviews (with separate reviews API call)
Additional Data:
Product categories/breadcrumbs
- Related search queries
- Search pagination
- Facets/filters available
—

API Request Examples

Search for Products:
GET https://api.redcircleapi.com/request?api_key=YOUR_KEY&type=search&search_term=highlighter+pens&sort_by=best_seller
2. Get Specific Product by TCIN:
GET https://api.redcircleapi.com/request?api_key=YOUR_KEY&type=product&tcin=78025470

Get Product by UPC:
GET https://api.redcircleapi.com/request?api_key=YOUR_KEY&type=product&gtin=071641174603
4. Get Category Products:
GET https://api.redcircleapi.com/request?api_key=YOUR_KEY&type=category&category_id=5xsxr

Get Reviews:
GET https://api.redcircleapi.com/request?api_key=YOUR_KEY&type=reviews&tcin=78025470
—

Important Technical Notes

Rate Limits & Credits:
Each API request consumes credits from your account
- Standard request: 1 credit
- GTIN lookup with cache skip: 2 credits
- Response times: typically 1-6 seconds
Pagination:
Search and category results support pagination
- Use pagination parameters for large result sets
Collections API:
For high-volume operations (up to 15,000 requests)
- Can schedule requests to run automatically
- Executes concurrently on RedCircle infrastructure
Data Freshness:
Real-time data retrieval from Target
- GTIN-to-TCIN mappings cached for 2 months
- Use skip_gtin_cache=true to force fresh lookup
—

Integration Workflow for Your Platform

Product Import:
   - User provides Target product URL or searches
   - Extract TCIN from URL or search via API
   - Retrieve full product data via Product API
   - Store product information and Target link
2. Link Creation:
Product Page Links: Use “link” field from API response
   - Add-to-Cart: NOT AVAILABLE - explain limitation to users
3. Data Updates:
Periodically refresh product data (pricing, availability)
   - Use Collections API for bulk updates
   - Monitor stock status if needed
4. User Experience:
Display “View on Target” buttons → link to product pages
   - Show current pricing and availability from API
   - Display product images and details from API
   - Note: Users complete purchase on Target.com
—

Limitations Summary

✓ What You CAN Do:
Get product data in real-time
- Create links to Target product pages  
- Display prices, images, descriptions
- Show availability and ratings
- Search and browse products
- Look up by TCIN, UPC, or keyword
✗ What You CANNOT Do:
Create add-to-cart links
- Manipulate shopping carts
- Generate checkout URLs
- Process transactions
- Modify Target listings
- Access private/non-public data
—

Next Steps

Sign up for RedCircle API key
2. Test API endpoints with demo key
3. Implement product search/import in your platform
4. Store and display Target product page links
5. Set up periodic data refresh workflow
6. Document Target limitations for your users (no add-to-cart)
7. Consider contacting Target Partnership team for enhanced integration options
