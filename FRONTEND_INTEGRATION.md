# Frontend Integration Guide - Payment API

This guide provides complete documentation for integrating the payment system with your frontend application.

## Table of Contents
- [API Endpoint](#api-endpoint)
- [Calculate Order Price](#calculate-order-price)
- [Promocode System](#promocode-system)
- [Authentication](#authentication)
- [Request Structure](#request-structure)
- [Response Structure](#response-structure)
- [Integration Examples](#integration-examples)
- [Error Handling](#error-handling)
- [Payment Flow Diagrams](#payment-flow-diagrams)
- [TypeScript Types](#typescript-types)
- [Testing](#testing)

---

## API Endpoint

**Base URL:** `https://your-strapi-domain.com/api`

**Endpoint:** `POST /payments/initiate`

**Content-Type:** `application/json`

---

## Calculate Order Price

Before creating an order, you can calculate the total price to display to users. This endpoint uses the same pricing logic as order creation but doesn't create an order.

**Endpoint:** `POST /orders/calculate-price`

**Content-Type:** `application/json`

**Authentication:** Not required (public endpoint)

### Request Structure

```typescript
{
  products: Array<{
    productSlug: string;  // Product slug (e.g., "my-product-name")
    quantity: number;     // Quantity (must be > 0)
  }>;
  type?: 'shipping' | 'selfShipping';  // Optional, default: 'shipping'
  promocode?: string;  // Optional promocode name
}
```

### Response Structure

```typescript
{
  success: true,
  data: {
    products: Array<{
      slug: string;
      title: string;
      unitPrice: number;
      quantity: number;
      totalPrice: number;
    }>;
    subtotal: number;              // Sum of all products before discounts/shipping
    shippingCost: number;          // FREE (0 BYN) if subtotal >= 400 BYN, otherwise 20 BYN for shipping, 0 for selfShipping
    freeShipping: boolean;         // true if shipping is free (subtotal >= 400 BYN and type is 'shipping')
    discount: {
      baseDiscount: number;        // Discount based on subtotal tiers (0%, 5%, or 20%)
      selfShippingDiscount: number; // Additional 3% discount for selfShipping
      totalDiscount: number;       // Total discount applied
      description: string;        // Description of discount tier
    };
    promocode: {                   // Promocode details if applied, null otherwise
      name: string;
      type: 'order' | 'shipping' | 'whole';
      percentDiscount: number;
      discountAmount: number;
    } | null;
    totalAmount: number;            // Final total after all calculations
    shippingType: 'shipping' | 'selfShipping';
  }
}
```

### Example Request

```javascript
const response = await fetch('https://your-api.com/api/orders/calculate-price', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
    body: JSON.stringify({
      products: [
        { productSlug: 'my-product-slug', quantity: 2 },
        { productSlug: 'another-product-slug', quantity: 1 }
      ],
      type: 'shipping',  // or 'selfShipping'
      promocode: 'SUMMER2024'  // Optional promocode
    })
});

const result = await response.json();
```

### Example Response (Order < 400 BYN)

```json
{
  "success": true,
  "data": {
    "products": [
      {
        "slug": "my-product-slug",
        "title": "Product Name",
        "unitPrice": 50.00,
        "quantity": 2,
        "totalPrice": 100.00
      },
      {
        "slug": "another-product-slug",
        "title": "Another Product",
        "unitPrice": 30.00,
        "quantity": 1,
        "totalPrice": 30.00
      }
    ],
    "subtotal": 130.00,
    "shippingCost": 20.00,
    "freeShipping": false,
    "discount": {
      "baseDiscount": 0.00,
      "selfShippingDiscount": 0.00,
      "totalDiscount": 0.00,
      "description": "0% (<700 BYN)"
    },
    "totalAmount": 150.00,
    "shippingType": "shipping",
    "promocode": null
  }
}
```

### Example Response (Order ≥ 400 BYN - Free Shipping)

```json
{
  "success": true,
  "data": {
    "products": [
      {
        "slug": "product-1",
        "title": "Expensive Product",
        "unitPrice": 200.00,
        "quantity": 3,
        "totalPrice": 600.00
      }
    ],
    "subtotal": 600.00,
    "shippingCost": 0.00,
    "freeShipping": true,
    "discount": {
      "baseDiscount": 0.00,
      "selfShippingDiscount": 0.00,
      "totalDiscount": 0.00,
      "description": "0% (<700 BYN)"
    },
    "totalAmount": 600.00,
    "shippingType": "shipping",
    "promocode": null
  }
}
```

**Example Response with Promocode:**
```json
{
  "success": true,
  "data": {
    "products": [...],
    "subtotal": 130.00,
    "shippingCost": 20.00,
    "freeShipping": false,
    "discount": {
      "baseDiscount": 0.00,
      "selfShippingDiscount": 0.00,
      "totalDiscount": 0.00,
      "description": "0% (<700 BYN)"
    },
    "promocode": {
      "name": "SUMMER2024",
      "type": "whole",
      "percentDiscount": 10,
      "discountAmount": 15.00
    },
    "totalAmount": 135.00,
    "shippingType": "shipping"
  }
}
```

### Discount Tiers

The discount is calculated based on the subtotal:

| Subtotal | Discount | Description |
|----------|----------|-------------|
| < 700 BYN | 0% | No discount |
| ≥ 700 BYN | 5% | 5% discount applied |
| ≥ 1500 BYN | 20% | 20% discount applied |

**Note:** For `selfShipping`, an additional 3% discount is applied on top of the base discount.

### Use Cases

1. **Cart Preview**: Calculate and display total price as user adds items to cart
2. **Shipping Selection**: Show price difference when user switches between shipping and self-pickup
3. **Price Validation**: Verify price before submitting order
4. **Dynamic Updates**: Recalculate price when quantity changes

### Error Responses

```typescript
// Missing products
{
  error: {
    status: 400,
    message: "Products array is required and cannot be empty"
  }
}

// Invalid product slug
{
  error: {
    status: 404,
    message: "Product with slug \"invalid-slug\" not found"
  }
}

// Product without price
{
  error: {
    status: 400,
    message: "Product \"my-product-slug\" has no price"
  }
}
```

---

## Promocode System

The system supports promotional codes that can provide discounts on orders. Promocodes can be validated before use and applied during order creation.

### Validate Promocode

**Endpoint:** `POST /promocodes/validate`

**Content-Type:** `application/json`

**Authentication:** Not required (public endpoint)

#### Request Structure

```typescript
{
  name: string;  // Promocode name (e.g., "SUMMER2024")
}
```

#### Response Structure

**Valid Promocode:**
```typescript
{
  valid: true,
  data: {
    name: string;
    type: 'order' | 'shipping' | 'whole';
    percentDiscount: number;  // Percentage (e.g., 10 for 10%)
    availableUsages: number;
    currentUsages: number;
    remainingUsages: number;
  }
}
```

**Invalid Promocode:**
```typescript
{
  valid: false,
  message: string;  // Error message explaining why promocode is invalid
}
```

#### Example Request

```javascript
const response = await fetch('https://your-api.com/api/promocodes/validate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    name: 'SUMMER2024'
  })
});

const result = await response.json();

if (result.valid) {
  console.log('Promocode is valid!');
  console.log(`Discount: ${result.data.percentDiscount}%`);
  console.log(`Type: ${result.data.type}`);
  console.log(`Remaining uses: ${result.data.remainingUsages}`);
} else {
  console.log('Promocode is invalid:', result.message);
}
```

#### Promocode Types

| Type | Description | Discount Applied To |
|------|-------------|---------------------|
| `order` | Discount on products | Subtotal (sum of all products, before shipping) |
| `shipping` | Discount on delivery | Shipping cost only (20 BYN) |
| `whole` | Discount on total | Total amount (after all calculations) |

#### Validation Rules

A promocode is valid if:
- ✅ It exists in the database
- ✅ It is published (`publishedAt` is not null)
- ✅ `isActual` is `true`
- ✅ Current usages < `availableUsages`

#### Error Messages

- `"Promocode not found"` - Promocode doesn't exist
- `"Promocode is not active"` - `isActual` is `false`
- `"Promocode has reached maximum usages"` - All available usages are exhausted

### Using Promocodes in Orders

Promocodes can be applied when:
1. **Calculating order price** - See [Calculate Order Price](#calculate-order-price)
2. **Creating an order** - See [Request Structure](#request-structure)

**Important Notes:**
- Invalid promocodes are **silently ignored** (no errors thrown)
- Promocode validation happens automatically during order creation
- If a promocode is invalid, the order will be created without the discount
- Each promocode can only be used a limited number of times (`availableUsages`)

---

## Authentication

If your Strapi API requires authentication, include the JWT token in the request headers:

```javascript
headers: {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${userToken}`
}
```

---

## Request Structure

### Common Fields (Required for All Requests)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `products` | `Array<Product>` | ✅ Yes | Array of products to purchase |
| `isIndividual` | `boolean` | ✅ Yes | `true` for individuals, `false` for organizations |
| `paymentMethod` | `string` | ✅ Yes | Payment method (see below for allowed values) |
| `type` | `string` | ❌ No | Address type: `"shipping"` (adds 20 BYN) or `"selfShipping"` (3% discount). Default: `"shipping"` |
| `comment` | `string` | ❌ No | Order comment/notes |
| `promocode` | `string` | ❌ No | Optional promocode name. Invalid promocodes are silently ignored |

### Product Object Structure

```typescript
{
  productSlug: string;  // Product slug from Strapi (e.g., "my-product-name")
  quantity: number;    // Quantity (must be > 0)
}
```

**Important:** Use the product's `slug` (string), not the numeric `id` or `documentId`. The slug is a URL-friendly identifier that remains stable.

### Individual Customer Fields (`isIndividual: true`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `fullName` | `string` | ✅ Yes | Customer's full name |
| `email` | `string` | ✅ Yes | Customer's email |
| `phone` | `string` | ✅ Yes | Customer's phone number |
| `city` | `string` | ✅ Yes | Customer's city |
| `address` | `string` | ✅ Yes* | Customer's delivery address (*deprecated - use `deliveryAddress`) |
| `deliveryAddress` | `string` | ✅ Yes* | Customer's delivery address (*preferred field) |
| `paymentMethod` | `string` | ✅ Yes | Either `"card"` or `"ERIP"` |

> **Note:** Either `address` or `deliveryAddress` must be provided. `deliveryAddress` is the preferred field.

### Organization Fields (`isIndividual: false`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `organization` | `string` | ✅ Yes | Company name |
| `fullName` | `string` | ✅ Yes | Contact person's full name |
| `UNP` | `string` | ✅ Yes | Tax identification number |
| `paymentAccount` | `string` | ✅ Yes | Bank account number (IBAN format, up to 28 chars, e.g., BY13 NBRB 3600 9000 0000 2Z00 AB00) |
| `bankAdress` | `string` | ✅ Yes | Bank address |
| `email` | `string` | ✅ Yes | Company email |
| `phone` | `string` | ✅ Yes | Company phone |
| `city` | `string` | ✅ Yes | Company city |
| `legalAddress` | `string` | ✅ Yes | Company's legal address (for official documents and invoices) |
| `deliveryAddress` | `string` | ✅ Yes | Delivery address (where the order will be shipped) |
| `paymentMethod` | `string` | ✅ Yes | Either `"ERIP"` or `"paymentAccount"` |

> **Important:** For organizations, both `legalAddress` (for official documents) and `deliveryAddress` (for shipment) are required.

---

## Pricing Calculation

The final order price is calculated based on the shipping type:

### Shipping Type: `"shipping"` (Delivery)
- **Base Price:** Sum of all products
- **Shipping Cost:** 
  - FREE for orders ≥ 400 BYN
  - +20 BYN for orders < 400 BYN
- **Formula:** 
  - If `subtotal >= 400`: `totalAmount = subtotal`
  - If `subtotal < 400`: `totalAmount = subtotal + 20`
- **Examples:** 
  - **Order < 400 BYN:**
    - Products: 350 BYN
    - Shipping: +20 BYN
    - **Total: 370 BYN**
  - **Order ≥ 400 BYN:**
    - Products: 450 BYN
    - Shipping: FREE
    - **Total: 450 BYN**

### Shipping Type: `"selfShipping"` (Self-Pickup)
- **Base Price:** Sum of all products
- **Discount:** -3% of subtotal (always applied for self-pickup)
- **Formula:** `totalAmount = subtotal - (subtotal × 0.03)`
- **Example:**
  - Products: 350 BYN
  - Discount: -10.50 BYN (3%)
  - **Total: 339.50 BYN**

### Volume Discounts (Applied to BOTH Delivery and Self-Pickup)

The system automatically applies volume discounts based on subtotal:

| Subtotal Range | Discount | Applied To |
|----------------|----------|------------|
| < 700 BYN | 0% | - |
| 700 - 1499 BYN | 5% | Delivery & Self-Pickup |
| ≥ 1500 BYN | 20% | Delivery & Self-Pickup |

**Examples:**

1. **Delivery with volume discount (subtotal = 800 BYN):**
   - Subtotal: 800 BYN
   - Discount 5%: -40 BYN
   - Shipping: FREE (≥400 BYN)
   - **Total: 760 BYN**

2. **Self-Pickup with volume discount (subtotal = 800 BYN):**
   - Subtotal: 800 BYN
   - Discount 5%: -40 BYN
   - Self-Pickup discount 3%: -24 BYN
   - **Total: 736 BYN**

3. **Delivery with large order (subtotal = 1600 BYN):**
   - Subtotal: 1600 BYN
   - Discount 20%: -320 BYN
   - Shipping: FREE (≥400 BYN)
   - **Total: 1280 BYN**

### Important Notes:
- The `subtotal` field contains the sum of all products **before** shipping/discounts
- The `totalAmount` field contains the **final price** after applying all shipping costs and discounts
- Volume discounts and self-pickup discounts are **cumulative** (both apply for self-pickup)
- Free shipping applies when subtotal ≥ 400 BYN (only for delivery type)
- All calculations are done automatically on the backend
- The frontend should display both subtotal and total to the user

---

## Response Structure

### Success Response - Card Payment (Individual)

```typescript
{
  success: true,
  orderId: number,              // Internal order ID
  orderNumber: number,          // Order number for customer reference
  hashId: string,               // Payment hash from AlphaBank
  paymentLink: string           // URL to redirect customer for payment
}
```

### Success Response - Other Payment Methods

```typescript
{
  success: true,
  orderId: number,              // Internal order ID
  orderNumber: number           // Order number for customer reference
  // NO hashId or paymentLink for ERIP/paymentAccount
}
```

### Error Response

```typescript
{
  error: {
    status: number,             // HTTP status code (400, 500, etc.)
    name: string,               // Error name
    message: string,            // Error description
    details: object             // Additional error details
  }
}
```

---

## Integration Examples

### Example 1: Individual Customer - Card Payment with Delivery (Online)

```javascript
// User fills out form and selects card payment with delivery
// Products total: 100 BYN
// Shipping: +20 BYN
// Total: 120 BYN
const orderData = {
  products: [
    { productSlug: "my-product-slug", quantity: 2 },  // 50 BYN each = 100 BYN
    { productSlug: "another-product-slug", quantity: 1 }   // Assume total is 100 BYN
  ],
  isIndividual: true,
  fullName: "Иван Иванов",
  email: "ivan@example.com",
  phone: "+375291234567",
  city: "Минск",
  address: "ул. Ленина, д. 10, кв. 5",
  paymentMethod: "card",
  type: "shipping",  // Adds 20 BYN shipping cost
  comment: "Доставка после 18:00"
};

// Make API request
const response = await fetch('https://your-api.com/api/payments/initiate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(orderData)
});

const result = await response.json();

if (result.success) {
  // Card payment - redirect to payment gateway
  console.log('Order created:', result.orderNumber);
  console.log('Redirecting to payment...');
  window.location.href = result.paymentLink; // Redirect user to AlphaBank
} else {
  // Handle error
  console.error('Error:', result.error.message);
}
```

**Expected Response:**
```json
{
  "success": true,
  "orderId": 123,
  "orderNumber": 1702745123456,
  "hashId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "paymentLink": "https://payment.alfabank.by/payment/merchants/test/payment_ru.html?mdOrder=a1b2c3d4"
}
```

**What happens next:**
1. User is redirected to AlphaBank payment page
2. User enters card details and completes payment
3. AlphaBank redirects back to your success/failure page
4. Your callback URL receives the payment status

---

### Example 1.5: Individual Customer - Card Payment with Self-Pickup (Online)

```javascript
// User fills out form and selects card payment with self-pickup
// Products total: 100 BYN
// Discount (3%): -3 BYN
// Total: 97 BYN
const orderData = {
  products: [
    { productSlug: "my-product-slug", quantity: 2 },  // 50 BYN each = 100 BYN
  ],
  isIndividual: true,
  fullName: "Петр Петров",
  email: "petr@example.com",
  phone: "+375291234567",
  city: "Минск",
  address: "ул. Ленина, д. 10, кв. 5",
  paymentMethod: "card",
  type: "selfShipping",  // Applies 3% discount
  comment: "Заберу завтра"
};

const response = await fetch('https://your-api.com/api/payments/initiate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(orderData)
});

const result = await response.json();

if (result.success) {
  // Card payment - redirect to payment gateway
  console.log('Order created:', result.orderNumber);
  console.log('Redirecting to payment...');
  window.location.href = result.paymentLink; // Redirect user to AlphaBank
} else {
  // Handle error
  console.error('Error:', result.error.message);
}
```

**Expected Response:**
```json
{
  "success": true,
  "orderId": 124,
  "orderNumber": 1702745123457,
  "hashId": "b2c3d4e5-f6g7-8901-bcde-fg2345678901",
  "paymentLink": "https://payment.alfabank.by/payment/merchants/test/payment_ru.html?mdOrder=b2c3d4e5"
}
```

**What happens next:**
1. User is redirected to AlphaBank payment page
2. User pays 97 BYN (100 - 3% discount)
3. AlphaBank redirects back to your success/failure page

---

### Example 2: Individual Customer - ERIP Payment (Offline)

```javascript
const orderData = {
  products: [
    { productSlug: "my-product-slug", quantity: 3 }
  ],
  isIndividual: true,
  fullName: "Петр Петров",
  email: "petr@example.com",
  phone: "+375291234567",
  city: "Гомель",
  address: "пр. Победы, 25",
  paymentMethod: "ERIP",
  type: "shipping"
};

const response = await fetch('https://your-api.com/api/payments/initiate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(orderData)
});

const result = await response.json();

if (result.success) {
  // ERIP payment - show instructions
  console.log('Order created:', result.orderNumber);
  // Show user instructions for ERIP payment
  showERIPInstructions(result.orderNumber);
} else {
  console.error('Error:', result.error.message);
}
```

**Expected Response:**
```json
{
  "success": true,
  "orderId": 124,
  "orderNumber": 1702745123457
}
```

**What happens next:**
1. Show user ERIP payment instructions with order number
2. User pays through ERIP system independently
3. Admin manually confirms payment in Strapi

---

### Example 3: Organization - Payment Account (Bank Transfer)

```javascript
const orderData = {
  products: [
    { productSlug: "my-product-slug", quantity: 10 }
  ],
  isIndividual: false,
  organization: "ООО «Компания»",
  fullName: "Сидоров Сидор Сидорович",
  UNP: "123456789",
  paymentAccount: "BY12ALFA12345678901234567890",
  bankAdress: "ул. Банковская, 1, г. Минск",
  email: "company@example.com",
  phone: "+375171234567",
  city: "Минск",
  legalAddress: "ул. Юридическая, 5, офис 101, г. Минск",  // Legal address for documents
  deliveryAddress: "ул. Промышленная, 50, склад 3, г. Минск",  // Delivery address
  paymentMethod: "paymentAccount",
  type: "shipping",
  comment: "Требуется счет-фактура"
};

const response = await fetch('https://your-api.com/api/payments/initiate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(orderData)
});

const result = await response.json();

if (result.success) {
  // Payment account - show success and instructions
  console.log('Order created:', result.orderNumber);
  showBankTransferInstructions(result.orderNumber);
} else {
  console.error('Error:', result.error.message);
}
```

**Expected Response:**
```json
{
  "success": true,
  "orderId": 125,
  "orderNumber": 1702745123458
}
```

**What happens next:**
1. Show user bank transfer instructions
2. Admin sends invoice to organization
3. Organization makes bank transfer
4. Admin confirms payment in Strapi

---

### Example 4: Organization - ERIP Payment

```javascript
const orderData = {
  products: [
    { productSlug: "my-product-slug", quantity: 5 }
  ],
  isIndividual: false,
  organization: "ИП Иванов",
  fullName: "Иванов Иван Иванович",
  UNP: "987654321",
  paymentAccount: "BY99ALFA99999999999999999999",
  bankAdress: "ул. Центральная, 10, г. Брест",
  email: "ip.ivanov@example.com",
  phone: "+375162345678",
  city: "Брест",
  legalAddress: "ул. Советская, 15, г. Брест",  // Legal address for documents
  deliveryAddress: "ул. Складская, 8, г. Брест",  // Delivery address
  paymentMethod: "ERIP",
  type: "shipping"
};

const response = await fetch('https://your-api.com/api/payments/initiate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(orderData)
});

const result = await response.json();

if (result.success) {
  console.log('Order created:', result.orderNumber);
  showERIPInstructions(result.orderNumber);
}
```

**Expected Response:**
```json
{
  "success": true,
  "orderId": 126,
  "orderNumber": 1702745123459
}
```

---

### Example 5: Calculate Order Price Before Checkout

```javascript
// Calculate price as user adds items to cart or changes shipping type
const calculatePrice = async (cartItems, shippingType = 'shipping') => {
  const response = await fetch('https://your-api.com/api/orders/calculate-price', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      products: cartItems.map(item => ({
        productSlug: item.slug,
        quantity: item.quantity
      })),
      type: shippingType
    })
  });

  if (!response.ok) {
    throw new Error('Failed to calculate price');
  }

  const result = await response.json();
  return result.data;
};

// Usage in React component
const [priceData, setPriceData] = useState(null);
const [shippingType, setShippingType] = useState('shipping');

useEffect(() => {
  if (cartItems.length > 0) {
    calculatePrice(cartItems, shippingType)
      .then(data => setPriceData(data))
      .catch(error => console.error('Price calculation error:', error));
  }
}, [cartItems, shippingType]);

// Display price breakdown
if (priceData) {
  return (
    <div className="price-summary">
      <div>Subtotal: {priceData.subtotal} BYN</div>
      {priceData.shippingCost > 0 && (
        <div>Shipping: +{priceData.shippingCost} BYN</div>
      )}
      {priceData.discount.totalDiscount > 0 && (
        <div>
          Discount ({priceData.discount.description}): 
          -{priceData.discount.totalDiscount} BYN
        </div>
      )}
      <div className="total">
        <strong>Total: {priceData.totalAmount} BYN</strong>
      </div>
    </div>
  );
}
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "slug": "product-1",
        "title": "Product 1",
        "unitPrice": 50.00,
        "quantity": 2,
        "totalPrice": 100.00
      }
    ],
    "subtotal": 100.00,
    "shippingCost": 20.00,
    "discount": {
      "baseDiscount": 0.00,
      "selfShippingDiscount": 0.00,
      "totalDiscount": 0.00,
      "description": "0% (<700 BYN)"
    },
    "totalAmount": 120.00,
    "shippingType": "shipping"
  }
}
```

---

### Example 6: Using Promocode with Order

```javascript
// First, validate the promocode
const validatePromocode = async (promocodeName) => {
  const response = await fetch('https://your-api.com/api/promocodes/validate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: promocodeName })
  });

  return await response.json();
};

// Validate before showing to user
const promocodeResult = await validatePromocode('SUMMER2024');

if (promocodeResult.valid) {
  console.log(`Promocode valid! ${promocodeResult.data.percentDiscount}% discount`);
  // Show discount info to user
} else {
  console.log('Promocode invalid:', promocodeResult.message);
  // Show error to user
}

// Use promocode when creating order
const orderData = {
  products: [
    { productSlug: 'my-product-slug', quantity: 2 }
  ],
  isIndividual: true,
  fullName: 'Иван Иванов',
  email: 'ivan@example.com',
  phone: '+375291234567',
  city: 'Минск',
  address: 'ул. Ленина, д. 10, кв. 5',
  paymentMethod: 'card',
  type: 'shipping',
  promocode: 'SUMMER2024'  // Add promocode here
};

const response = await fetch('https://your-api.com/api/payments/initiate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(orderData)
});

const result = await response.json();
// Order will be created with promocode discount applied (if valid)
// If promocode is invalid, order will still be created without discount
```

### Example 7: Calculate Price with Promocode

```javascript
// Calculate price with promocode to show user the discount
const calculatePriceWithPromocode = async (cartItems, shippingType, promocode) => {
  const response = await fetch('https://your-api.com/api/orders/calculate-price', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      products: cartItems.map(item => ({
        productSlug: item.slug,
        quantity: item.quantity
      })),
      type: shippingType,
      promocode: promocode  // Optional promocode
    })
  });

  const result = await response.json();
  
  if (result.success) {
    const { data } = result;
    
    // Display price breakdown
    console.log('Subtotal:', data.subtotal, 'BYN');
    if (data.shippingCost > 0) {
      console.log('Shipping:', data.shippingCost, 'BYN');
    }
    if (data.discount.totalDiscount > 0) {
      console.log('Base Discount:', data.discount.totalDiscount, 'BYN');
    }
    if (data.promocode) {
      console.log(`Promocode ${data.promocode.name}: -${data.promocode.discountAmount} BYN`);
    }
    console.log('Total:', data.totalAmount, 'BYN');
    
    return data;
  }
};

// Usage in React component
const [priceData, setPriceData] = useState(null);
const [promocode, setPromocode] = useState('');

useEffect(() => {
  if (cartItems.length > 0) {
    calculatePriceWithPromocode(cartItems, shippingType, promocode)
      .then(data => setPriceData(data))
      .catch(error => console.error('Price calculation error:', error));
  }
}, [cartItems, shippingType, promocode]);

// Display promocode discount if applied
{priceData?.promocode && (
  <div className="promocode-discount">
    <span>Promocode {priceData.promocode.name}:</span>
    <span>-{priceData.promocode.discountAmount} BYN</span>
  </div>
)}
```

---

## Error Handling

### Common Errors and How to Handle Them

#### 1. Validation Errors (400 Bad Request)

```javascript
// Missing required fields
{
  "error": {
    "status": 400,
    "name": "BadRequestError",
    "message": "For individuals, fullName, email, phone, city, and address are required"
  }
}

// Invalid payment method
{
  "error": {
    "status": 400,
    "name": "BadRequestError",
    "message": "For individuals, paymentMethod must be ERIP or card"
  }
}

// Invalid product quantity
{
  "error": {
    "status": 400,
    "name": "BadRequestError",
    "message": "Product quantity must be greater than 0"
  }
}
```

**Frontend Handling:**
```javascript
if (response.status === 400) {
  const error = await response.json();
  showValidationError(error.error.message);
  // Display to user and allow them to fix the form
}
```

#### 2. Server Errors (500 Internal Server Error)

```javascript
{
  "error": {
    "status": 500,
    "name": "InternalServerError",
    "message": "Failed to initiate payment"
  }
}
```

**Frontend Handling:**
```javascript
if (response.status === 500) {
  const error = await response.json();
  showErrorMessage('Произошла ошибка на сервере. Пожалуйста, попробуйте позже.');
  // Log error for debugging
  console.error('Server error:', error);
}
```

#### 3. Network Errors

```javascript
try {
  const response = await fetch(/* ... */);
  // Handle response
} catch (error) {
  // Network error or fetch failed
  showErrorMessage('Не удалось подключиться к серверу. Проверьте интернет-соединение.');
  console.error('Network error:', error);
}
```

---

## Payment Flow Diagrams

### Flow 1: Card Payment (Individual)

```
User Form → Frontend → Strapi API → AlphaBank API
                          ↓
                    Create Order
                    Create Payment
                          ↓
                    Return Payment Link
                          ↓
User → AlphaBank Payment Page → Payment Success/Failure
                                        ↓
                              Callback to Strapi
                                        ↓
                            Update Payment Status
                                        ↓
                        Redirect to Your Success Page
```

### Flow 2: ERIP / Payment Account

```
User Form → Frontend → Strapi API
                          ↓
                    Create Order
                    Create Payment
                          ↓
                    Return Order Info
                          ↓
            Show Payment Instructions
                          ↓
              User Pays Offline
                          ↓
            Admin Confirms in Strapi
```

---

## TypeScript Types

### Request Types

```typescript
// Product in cart
interface Product {
  productSlug: string;  // Product slug (e.g., "my-product-name")
  quantity: number;
}

// Base request (common fields)
interface BasePaymentRequest {
  products: Product[];
  isIndividual: boolean;
  paymentMethod: string;
  type?: 'shipping' | 'selfShipping';
  comment?: string;
  promocode?: string;  // Optional promocode name
}

// Individual customer request
interface IndividualPaymentRequest extends BasePaymentRequest {
  isIndividual: true;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  address: string;
  paymentMethod: 'card' | 'ERIP';
}

// Organization request
interface OrganizationPaymentRequest extends BasePaymentRequest {
  isIndividual: false;
  organization: string;
  fullName: string;
  UNP: string;
  paymentAccount: string;
  bankAdress: string;
  email: string;
  phone: string;
  city: string;
  legalAddress: string;  // Legal address for documents and invoices
  deliveryAddress: string;  // Delivery address for shipment
  paymentMethod: 'ERIP' | 'paymentAccount';
}

// Union type for all requests
type PaymentRequest = IndividualPaymentRequest | OrganizationPaymentRequest;

// Calculate price request
interface CalculatePriceRequest {
  products: Array<{
    productSlug: string;
    quantity: number;
  }>;
  type?: 'shipping' | 'selfShipping';
  promocode?: string;  // Optional promocode name
}
```

### Response Types

```typescript
// Calculate price response
interface CalculatePriceResponse {
  success: true;
  data: {
    products: Array<{
      slug: string;
      title: string;
      unitPrice: number;
      quantity: number;
      totalPrice: number;
    }>;
    subtotal: number;
    shippingCost: number;
    discount: {
      baseDiscount: number;
      selfShippingDiscount: number;
      totalDiscount: number;
      description: string;
    };
    promocode: {
      name: string;
      type: 'order' | 'shipping' | 'whole';
      percentDiscount: number;
      discountAmount: number;
    } | null;
    totalAmount: number;
    shippingType: 'shipping' | 'selfShipping';
  };
}

```typescript
// Success response with payment link (card payment)
interface CardPaymentResponse {
  success: true;
  orderId: number;
  orderNumber: number;
  hashId: string;
  paymentLink: string;
}

// Success response without payment link (other methods)
interface StandardPaymentResponse {
  success: true;
  orderId: number;
  orderNumber: number;
}

// Union type for success responses
type PaymentResponse = CardPaymentResponse | StandardPaymentResponse;

// Error response
interface ErrorResponse {
  error: {
    status: number;
    name: string;
    message: string;
    details?: any;
  };
}
```

### Type Guards

```typescript
// Check if response has payment link
function hasPaymentLink(response: PaymentResponse): response is CardPaymentResponse {
  return 'paymentLink' in response && 'hashId' in response;
}

// Usage
const result: PaymentResponse = await makePaymentRequest(data);
if (hasPaymentLink(result)) {
  // TypeScript knows result has paymentLink and hashId
  window.location.href = result.paymentLink;
} else {
  // Show success without redirect
  showSuccessMessage(result.orderNumber);
}
```

---

## Displaying Price Breakdown to Users

It's recommended to show users the pricing breakdown before they submit the order:

```typescript
interface PriceBreakdown {
  subtotal: number;
  shippingCost?: number;
  discount?: number;
  total: number;
}

function calculatePrice(cartItems: CartItem[], shippingType: 'shipping' | 'selfShipping'): PriceBreakdown {
  // Calculate subtotal from cart
  const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  let shippingCost: number | undefined;
  let discount: number | undefined;
  let total = subtotal;
  
  if (shippingType === 'shipping') {
    shippingCost = 20;
    total = subtotal + shippingCost;
  } else if (shippingType === 'selfShipping') {
    discount = subtotal * 0.03;
    total = subtotal - discount;
  }
  
  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    shippingCost,
    discount: discount ? parseFloat(discount.toFixed(2)) : undefined,
    total: parseFloat(total.toFixed(2)),
  };
}

// Display component
function PriceDisplay({ shippingType, cartItems }: { shippingType: 'shipping' | 'selfShipping', cartItems: CartItem[] }) {
  const price = calculatePrice(cartItems, shippingType);
  
  return (
    <div className="price-breakdown">
      <div className="price-row">
        <span>Сумма товаров:</span>
        <span>{price.subtotal} BYN</span>
      </div>
      
      {price.shippingCost && (
        <div className="price-row shipping">
          <span>Доставка:</span>
          <span>+{price.shippingCost} BYN</span>
        </div>
      )}
      
      {price.discount && (
        <div className="price-row discount">
          <span>Скидка на самовывоз (3%):</span>
          <span>-{price.discount} BYN</span>
        </div>
      )}
      
      <div className="price-row total">
        <strong>Итого:</strong>
        <strong>{price.total} BYN</strong>
      </div>
    </div>
  );
}
```

---

## Complete React Example

### Payment Form Component

```typescript
import React, { useState } from 'react';

interface PaymentFormProps {
  cartItems: Array<{ id: number; quantity: number }>;
}

export const PaymentForm: React.FC<PaymentFormProps> = ({ cartItems }) => {
  const [isIndividual, setIsIndividual] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Individual fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState(''); // предпочтительно для доставки

  // Organization fields (для юрлиц обязательны legalAddress и deliveryAddress)
  const [organization, setOrganization] = useState('');
  const [unp, setUnp] = useState('');
  const [paymentAccount, setPaymentAccount] = useState('');
  const [bankAdress, setBankAdress] = useState('');
  const [legalAddress, setLegalAddress] = useState('');
  const [orgDeliveryAddress, setOrgDeliveryAddress] = useState('');

  const [type, setType] = useState<'shipping' | 'selfShipping'>('shipping');
  const [promocode, setPromocode] = useState('');
  const [comment, setComment] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Build request based on customer type
      const requestData: any = {
        products: cartItems.map(item => ({
          productSlug: item.slug,
          quantity: item.quantity
        })),
        isIndividual,
        paymentMethod,
        fullName,
        email,
        phone,
        city,
        deliveryAddress: deliveryAddress || address, // предпочтительно deliveryAddress
        type,
        comment: comment || undefined,
        ...(promocode ? { promocode } : {})
      };

      // Add organization-specific fields (для юрлиц обязательны legalAddress и deliveryAddress)
      if (!isIndividual) {
        requestData.organization = organization;
        requestData.UNP = unp;
        requestData.paymentAccount = paymentAccount;
        requestData.bankAdress = bankAdress;
        requestData.legalAddress = legalAddress;
        requestData.deliveryAddress = orgDeliveryAddress;
      }

      const response = await fetch('https://your-api.com/api/payments/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Payment failed');
      }

      const result = await response.json();

      if (result.success) {
        // Check if we have a payment link (card payment)
        if (result.paymentLink) {
          // Redirect to payment gateway
          window.location.href = result.paymentLink;
        } else {
          // Show success message for offline payment
          alert(`Заказ #${result.orderNumber} создан успешно!`);
          // Redirect to success page or show instructions
          window.location.href = `/order-success?orderId=${result.orderId}`;
        }
      }
    } catch (err: any) {
      setError(err.message);
      console.error('Payment error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Customer Type Selection */}
      <div>
        <label>
          <input
            type="radio"
            checked={isIndividual}
            onChange={() => setIsIndividual(true)}
          />
          Физическое лицо
        </label>
        <label>
          <input
            type="radio"
            checked={!isIndividual}
            onChange={() => setIsIndividual(false)}
          />
          Юридическое лицо
        </label>
      </div>

      {/* Common Fields */}
      <input
        type="text"
        placeholder="ФИО"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        required
      />
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        type="tel"
        placeholder="Телефон"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        required
      />
      <input
        type="text"
        placeholder="Город"
        value={city}
        onChange={(e) => setCity(e.target.value)}
        required
      />
      <input
        type="text"
        placeholder="Адрес"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        required
      />

      {/* Organization-specific Fields */}
      {!isIndividual && (
        <>
          <input
            type="text"
            placeholder="Название организации"
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="УНП"
            value={unp}
            onChange={(e) => setUnp(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="Расчетный счет"
            value={paymentAccount}
            onChange={(e) => setPaymentAccount(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="Адрес банка"
            value={bankAdress}
            onChange={(e) => setBankAdress(e.target.value)}
            required
          />
        </>
      )}

      {/* Payment Method Selection */}
      <div>
        <label>Способ оплаты:</label>
        {isIndividual ? (
          <>
            <label>
              <input
                type="radio"
                value="card"
                checked={paymentMethod === 'card'}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
              Банковская карта
            </label>
            <label>
              <input
                type="radio"
                value="ERIP"
                checked={paymentMethod === 'ERIP'}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
              ЕРИП
            </label>
          </>
        ) : (
          <>
            <label>
              <input
                type="radio"
                value="paymentAccount"
                checked={paymentMethod === 'paymentAccount'}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
              Расчетный счет
            </label>
            <label>
              <input
                type="radio"
                value="ERIP"
                checked={paymentMethod === 'ERIP'}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
              ЕРИП
            </label>
          </>
        )}
      </div>

      {/* Comment */}
      <textarea
        placeholder="Комментарий к заказу (необязательно)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />

      {/* Error Display */}
      {error && <div className="error">{error}</div>}

      {/* Submit Button */}
      <button type="submit" disabled={loading}>
        {loading ? 'Обработка...' : 'Оформить заказ'}
      </button>
    </form>
  );
};
```

---

## Testing

### Test Cases to Implement

#### 1. Individual with Card Payment
```javascript
test('Individual card payment creates order and returns payment link', async () => {
  const response = await fetch('/api/payments/initiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      products: [{ productSlug: "test-product-slug", quantity: 1 }],
      isIndividual: true,
      fullName: 'Test User',
      email: 'test@test.com',
      phone: '+375291234567',
      city: 'Minsk',
      address: 'Test Street 1',
      paymentMethod: 'card'
    })
  });

  const data = await response.json();
  expect(data.success).toBe(true);
  expect(data.paymentLink).toBeDefined();
  expect(data.hashId).toBeDefined();
});
```

#### 2. Individual with ERIP Payment
```javascript
test('Individual ERIP payment creates order without payment link', async () => {
  const response = await fetch('/api/payments/initiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      products: [{ productSlug: "test-product-slug", quantity: 1 }],
      isIndividual: true,
      fullName: 'Test User',
      email: 'test@test.com',
      phone: '+375291234567',
      city: 'Minsk',
      address: 'Test Street 1',
      paymentMethod: 'ERIP'
    })
  });

  const data = await response.json();
  expect(data.success).toBe(true);
  expect(data.paymentLink).toBeUndefined();
  expect(data.hashId).toBeUndefined();
  expect(data.orderNumber).toBeDefined();
});
```

#### 3. Organization with Payment Account
```javascript
test('Organization payment account creates order', async () => {
  const response = await fetch('/api/payments/initiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      products: [{ productDocumentId: "test123abc456def789", quantity: 5 }],
      isIndividual: false,
      organization: 'Test Company',
      fullName: 'Test Manager',
      UNP: '123456789',
      paymentAccount: 'BY12ALFA12345678901234567890',
      bankAdress: 'Bank Street 1',
      email: 'company@test.com',
      phone: '+375171234567',
      city: 'Minsk',
      legalAddress: 'Legal Street 1, Office 101',
      deliveryAddress: 'Warehouse Street 5',
      paymentMethod: 'paymentAccount'
    })
  });

  const data = await response.json();
  expect(data.success).toBe(true);
  expect(data.paymentLink).toBeUndefined();
  expect(data.orderNumber).toBeDefined();
});
```

#### 4. Validation Error Handling
```javascript
test('Missing required fields returns validation error', async () => {
  const response = await fetch('/api/payments/initiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      products: [{ productSlug: "test-product-slug", quantity: 1 }],
      isIndividual: true,
      paymentMethod: 'card'
      // Missing required fields
    })
  });

  expect(response.status).toBe(400);
  const data = await response.json();
  expect(data.error).toBeDefined();
  expect(data.error.message).toContain('required');
});
```

---

## Environment Variables

Make sure these are configured in your Strapi `.env` file:

```bash
# AlphaBank Payment Gateway
PAYMENT_URL=https://payment.alfabank.by/payment/rest/
ALPHA_USERNAME=your_username
ALPHA_PASSWORD=your_password

# Callback URLs (where AlphaBank redirects after payment)
RETURN_URL=https://your-api.com/api/payments/success
FAILURE_URL=https://your-api.com/api/payments/failure

# Frontend URL (where users are redirected after payment processing)
BASE_CLIENT_URL=https://your-frontend.com
```

---

## Callback Pages Setup

### Success Page (`/payment-success`)

```typescript
// pages/payment-success.tsx
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function PaymentSuccess() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  const [orderDetails, setOrderDetails] = useState(null);

  useEffect(() => {
    if (orderId) {
      // Optionally fetch order details
      fetchOrderDetails(orderId);
    }
  }, [orderId]);

  return (
    <div>
      <h1>Оплата успешна!</h1>
      <p>Заказ #{orderId} успешно оплачен</p>
      <p>Спасибо за покупку!</p>
      {/* Show order details, next steps, etc. */}
    </div>
  );
}
```

### Failure Page (`/payment-failure`)

```typescript
// pages/payment-failure.tsx
import { useSearchParams } from 'next/navigation';

export default function PaymentFailure() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');

  return (
    <div>
      <h1>Ошибка оплаты</h1>
      <p>К сожалению, не удалось обработать платеж для заказа #{orderId}</p>
      <button onClick={() => window.location.href = '/checkout'}>
        Попробовать снова
      </button>
    </div>
  );
}
```

---

## Quick Reference

### Pricing Rules Summary

| Shipping Type | Calculation | Example (100 BYN subtotal) |
|--------------|-------------|----------------------------|
| `shipping` | Subtotal + 20 BYN | 100 + 20 = **120 BYN** |
| `selfShipping` | Subtotal - (Subtotal × 0.03) | 100 - 3 = **97 BYN** |

**Key Points:**
- Shipping adds a flat **20 BYN** fee
- Self-pickup gives **3% discount** on the subtotal
- Calculations are done on the backend automatically
- Display price breakdown to users before checkout

### Payment Method Matrix

| Customer Type | Allowed Payment Methods | AlphaBank Processing | Payment Link Returned |
|--------------|------------------------|---------------------|----------------------|
| Individual | `card` | ✅ Yes | ✅ Yes |
| Individual | `ERIP` | ❌ No | ❌ No |
| Organization | `paymentAccount` | ❌ No | ❌ No |
| Organization | `ERIP` | ❌ No | ❌ No |

### Decision Tree

```
Is customer individual?
├─ YES → Individual
│   ├─ Payment method = "card"
│   │   └─ Process through AlphaBank → Return payment link
│   └─ Payment method = "ERIP"
│       └─ Create order only → Show ERIP instructions
│
└─ NO → Organization
    ├─ Payment method = "paymentAccount"
    │   └─ Create order only → Show bank transfer details
    └─ Payment method = "ERIP"
        └─ Create order only → Show ERIP instructions
```

---

## Support and Troubleshooting

### Common Issues

1. **"Payment gateway request failed"**
   - Check AlphaBank credentials in `.env`
   - Verify `PAYMENT_URL` is correct
   - Check network connectivity to payment gateway

2. **"Missing required parameter"**
   - Verify all required fields are sent in request
   - Check field names match exactly (case-sensitive)
   - Ensure `isIndividual` is boolean, not string

3. **"Product not found"**
   - Verify `productSlug` exists in Strapi
   - Check product is published
   - Ensure product has a price set
   - Make sure product has a slug (use `/api/products/generate-slugs` to generate slugs)

4. **Payment callback not working**
   - Verify `RETURN_URL` and `FAILURE_URL` are accessible from internet
   - Check Strapi is running and accessible
   - Ensure callback routes are not blocked by authentication

---

## Contact

For questions or issues with integration, please contact the backend team or refer to the main Strapi documentation.

---

**Last Updated:** December 16, 2025
**API Version:** 1.2

### Changelog

**v1.2 (December 16, 2025)**
- Added promocode system with validation endpoint
- Integrated promocodes into price calculation and order creation
- Promocodes support three types: `order`, `shipping`, and `whole`
- Invalid promocodes are silently ignored (no errors thrown)

**v1.1 (December 16, 2025)**
- Added `/orders/calculate-price` endpoint for price calculation before checkout
- Updated all examples to use `productSlug` instead of `productDocumentId`

