/**
 * order service
 */

import { factories } from '@strapi/strapi';
import { calculateOrderTotal } from '../../../utils/getOrderPrice';
import { sendTelegramMessage, formatOrderMessage } from '../../../utils/sendTelegramMessage';

interface ProductInput {
  productDocumentId: string; // Now using actual documentId (string) instead of numeric id
  quantity: number;
}

interface AddressInput {
  type?: 'selfShipping' | 'shipping';
  isIndividual?: boolean;
  fullName?: string;
  email?: string;
  phone?: string;
  city?: string;
  address?: string;
  organization?: string;
  UNP?: string;
  paymentAccount?: string;
  bankAdress?: string;
  postalCode?: string;
}

interface CreateOrderInput {
  products: ProductInput[];
  address: AddressInput;
  comment?: string;
}

export default factories.createCoreService('api::order.order', ({ strapi }) => ({
  async createOrder(input: CreateOrderInput) {
    const { products, address: addressInput, comment } = input;

    console.log('='.repeat(80));
    console.log('📦 ORDER CREATION STARTED');
    console.log('='.repeat(80));
    console.log('📥 Products received from frontend:', JSON.stringify(products, null, 2));
    console.log(`📊 Total number of products: ${products.length}`);
    console.log('-'.repeat(80));

    // Validate products
    if (!products || products.length === 0) {
      throw new Error('Products array is required and cannot be empty');
    }

    // Step 1: Fetch products and create order items
    const orderItemsData = [];
    let subtotal = 0;

    console.log('💰 PRODUCT CALCULATIONS:');
    console.log('-'.repeat(80));

    for (let i = 0; i < products.length; i++) {
      const productInput = products[i];
      
      console.log(`\n🛍️  Product ${i + 1}/${products.length}:`);
      console.log(`   Input:`, JSON.stringify(productInput, null, 2));
      console.log(`   📌 Looking up product by documentId: ${productInput.productDocumentId}`);
      
      // Fetch product using documentId (Strapi v5 uses documentId as primary identifier)
      const product = await strapi.documents('api::product.product').findOne({
        documentId: productInput.productDocumentId,
        populate: ['batch', 'designers', 'polishes', 'images', 'categories', 'tags'],
      });

      if (!product) {
        console.error(`   ❌ Product with documentId ${productInput.productDocumentId} not found`);
        throw new Error(`Product with documentId ${productInput.productDocumentId} not found`);
      }

      if (!product.price) {
        console.error(`   ❌ Product with documentId ${productInput.productDocumentId} has no price`);
        throw new Error(`Product with documentId ${productInput.productDocumentId} has no price`);
      }

      const unitPrice = parseFloat(product.price.toString());
      const quantity = productInput.quantity;
      const totalPrice = unitPrice * quantity;

      console.log(`   ✅ Found: ${product.title || 'Unnamed Product'}`);
      console.log(`   📌 Product ID: ${product.id}`);
      console.log(`   📄 Product DocumentID: ${product.documentId}`);
      console.log(`   💵 Unit Price: ${unitPrice} BYN`);
      console.log(`   🔢 Quantity: ${quantity}`);
      console.log(`   💰 Line Total: ${unitPrice} × ${quantity} = ${totalPrice.toFixed(2)} BYN`);

      // Store the product relation using documentId (Strapi v5 uses documentId for relations)
      orderItemsData.push({
        quantity,
        unitPrice,
        totalPrice,
        product: product.documentId, // Use documentId for Strapi v5 relations
      });

      console.log(`   🔗 Will link order item to product documentId: ${product.documentId}`);

      subtotal += totalPrice;
      console.log(`   📊 Running Subtotal: ${subtotal.toFixed(2)} BYN`);
    }

    console.log('\n' + '='.repeat(80));
    console.log(`💵 SUBTOTAL (before shipping/discount): ${subtotal.toFixed(2)} BYN`);
    console.log('='.repeat(80));

    // Step 2: Create address
    console.log('\n📍 ADDRESS INFORMATION:');
    console.log('-'.repeat(80));
    console.log('Type:', addressInput.type || 'shipping');
    console.log('Is Individual:', addressInput.isIndividual !== undefined ? addressInput.isIndividual : true);
    console.log('Full Name:', addressInput.fullName || 'N/A');
    console.log('Email:', addressInput.email || 'N/A');
    console.log('Phone:', addressInput.phone || 'N/A');
    console.log('City:', addressInput.city || 'N/A');
    console.log('Address:', addressInput.address || 'N/A');
    if (addressInput.organization) {
      console.log('Organization:', addressInput.organization);
      console.log('UNP:', addressInput.UNP || 'N/A');
    }
    console.log('-'.repeat(80));

    const address = await strapi.entityService.create('api::address.address', {
      data: {
        type: addressInput.type || 'shipping',
        isIndividual: addressInput.isIndividual !== undefined ? addressInput.isIndividual : true,
        fullName: addressInput.fullName || null,
        email: addressInput.email || null,
        phone: addressInput.phone || null,
        city: addressInput.city || null,
        address: addressInput.address || null,
        organization: addressInput.organization || null,
        UNP: addressInput.UNP || null,
        paymentAccount: addressInput.paymentAccount || null,
        bankAdress: addressInput.bankAdress || null,
        postalCode: addressInput.postalCode || null,
      },
    });

    console.log('✅ Address created with ID:', address.id);
    console.log('   Address DocumentID:', address.documentId);

    // Step 3: Calculate total amount based on shipping type
    console.log('\n🚚 SHIPPING/DISCOUNT CALCULATION:');
    console.log('-'.repeat(80));
    
    let totalAmount = subtotal;
    let shippingCost = 0;
    let discount = 0;

    const shippingType = addressInput.type || 'shipping';

    if (shippingType === 'shipping') {
      // Add 20 rubles for shipping
      shippingCost = 20;
      totalAmount = subtotal + shippingCost;
      
      console.log('📦 Shipping Type: DELIVERY');
      console.log(`   Subtotal:      ${subtotal.toFixed(2)} BYN`);
      console.log(`   Shipping Cost: +${shippingCost.toFixed(2)} BYN`);
      console.log(`   ─────────────────────────────────`);
      console.log(`   TOTAL:         ${totalAmount.toFixed(2)} BYN ✅`);
      
      strapi.log.info(`Shipping type: shipping - Added 20 BYN shipping cost. Subtotal: ${subtotal}, Total: ${totalAmount}`);
    } else if (shippingType === 'selfShipping') {
      // Apply 3% discount for self-pickup
      discount = subtotal * 0.03;
      totalAmount = subtotal - discount;
      
      console.log('🏪 Shipping Type: SELF-PICKUP');
      console.log(`   Subtotal:      ${subtotal.toFixed(2)} BYN`);
      console.log(`   Discount (3%): -${discount.toFixed(2)} BYN`);
      console.log(`   ─────────────────────────────────`);
      console.log(`   TOTAL:         ${totalAmount.toFixed(2)} BYN ✅`);
      
      strapi.log.info(`Shipping type: selfShipping - Applied 3% discount (${discount.toFixed(2)} BYN). Subtotal: ${subtotal}, Total: ${totalAmount}`);
    }
    console.log('='.repeat(80));

    // Step 4: Generate order number (using timestamp or auto-increment)
    const orderNumber = Date.now();

    console.log('\n📝 CREATING ORDER:');
    console.log('-'.repeat(80));
    console.log(`Order Number: ${orderNumber}`);
    console.log(`Order Status: pending`);
    console.log(`Subtotal: ${subtotal.toFixed(2)} BYN`);
    console.log(`Total Amount: ${totalAmount.toFixed(2)} BYN`);
    console.log(`Comment: ${comment || 'N/A'}`);
    console.log(`🔗 Linking to Address DocumentID: ${address.documentId}`);
    console.log('-'.repeat(80));

    // Step 5: Create order
    const order = await strapi.entityService.create('api::order.order', {
      data: {
        orderNumber,
        orderStatus: 'pending',
        orderDate: new Date(),
        subtotal,
        totalAmount: parseFloat(totalAmount.toFixed(2)), // Round to 2 decimal places
        address: address.documentId, // Use documentId for Strapi v5 relations
        hashId: null, // Will be set after payment creation
        comment: comment || null,
      },
    });

    console.log(`✅ Order created with ID: ${order.id}`);
    console.log(`   Order ID: ${order.id}`);
    console.log(`   Order DocumentID: ${order.documentId}`);
    console.log(`   Address Relation: ${address.documentId}`);

    // Step 6: Create order items
    console.log('\n📦 CREATING ORDER ITEMS:');
    console.log('-'.repeat(80));
    
    const createdOrderItems = [];
    for (let i = 0; i < orderItemsData.length; i++) {
      const itemData = orderItemsData[i];
      console.log(`Creating item ${i + 1}/${orderItemsData.length}:`);
      console.log(`   Quantity: ${itemData.quantity}`);
      console.log(`   Unit Price: ${itemData.unitPrice}`);
      console.log(`   Total Price: ${itemData.totalPrice}`);
      console.log(`   🔗 Product DocumentID: ${itemData.product}`);
      console.log(`   🔗 Order DocumentID: ${order.documentId}`);
      
      const orderItem = await strapi.entityService.create('api::order-item.order-item', {
        data: {
          quantity: itemData.quantity,
          unitPrice: itemData.unitPrice,
          totalPrice: itemData.totalPrice,
          product: itemData.product, // documentId
          order: order.documentId,   // documentId for Strapi v5
        },
        populate: ['product', 'order'],
      });
      createdOrderItems.push(orderItem);
      console.log(`   ✅ Order item created with ID: ${orderItem.id}`);
      console.log(`      Product relation: ${(orderItem as any).product?.id || 'NOT SET'}`);
      console.log(`      Order relation: ${(orderItem as any).order?.id || (orderItem as any).order || 'NOT SET'}`);
    }

    // Verify relations were created
    console.log('\n🔍 VERIFYING RELATIONS:');
    console.log('-'.repeat(80));
    const verifyOrder: any = await strapi.entityService.findOne('api::order.order', order.id, {
      populate: ['order_items', 'address'],
    });
    console.log(`Order ${order.id} has:`);
    console.log(`   Address: ${verifyOrder.address?.id ? '✅ Connected (ID: ' + verifyOrder.address.id + ')' : '❌ Not connected'}`);
    console.log(`   Order Items: ${verifyOrder.order_items?.length || 0} items ${verifyOrder.order_items?.length > 0 ? '✅' : '❌'}`);
    console.log('-'.repeat(80));

    // Step 7: Send Telegram notification
    console.log('\n📱 SENDING TELEGRAM NOTIFICATION:');
    console.log('-'.repeat(80));
    
    try {
      const orderWithItems = await strapi.entityService.findOne('api::order.order', order.id, {
        populate: ['order_items.product', 'address'],
      });
      const message = formatOrderMessage(orderWithItems, createdOrderItems, shippingCost, discount);
      await sendTelegramMessage(message);
      console.log('✅ Telegram notification sent successfully');
    } catch (error: any) {
      // Don't fail order creation if Telegram fails
      console.log('⚠️  Telegram notification failed:', error.message);
      strapi.log.warn('Failed to send Telegram notification for order creation:', error.message);
    }

    // Final summary
    console.log('\n' + '='.repeat(80));
    console.log('✅ ORDER CREATION COMPLETED SUCCESSFULLY');
    console.log('='.repeat(80));
    console.log('📋 ORDER SUMMARY:');
    console.log(`   Order ID:       ${order.id}`);
    console.log(`   Document ID:    ${order.documentId || 'N/A'}`);
    console.log(`   Order Number:   ${orderNumber}`);
    console.log(`   Total Items:    ${createdOrderItems.length}`);
    console.log(`   Subtotal:       ${subtotal.toFixed(2)} BYN`);
    if (shippingCost > 0) {
      console.log(`   Shipping:       +${shippingCost.toFixed(2)} BYN`);
    }
    if (discount > 0) {
      console.log(`   Discount:       -${discount.toFixed(2)} BYN`);
    }
    console.log(`   TOTAL:          ${totalAmount.toFixed(2)} BYN`);
    console.log('='.repeat(80));
    console.log('\n');

    // Log the created order details for debugging
    strapi.log.info(`Order created successfully. ID: ${order.id}, DocumentID: ${order.documentId}, Total: ${totalAmount.toFixed(2)} BYN`);

    return {
      order,
      orderItems: createdOrderItems,
      address,
      subtotal,
      shippingCost,
      discount,
      totalAmount: parseFloat(totalAmount.toFixed(2)),
    };
  },
}));
