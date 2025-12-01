/**
 * order service
 */

import { factories } from '@strapi/strapi';
import { calculateOrderTotal } from '../../../utils/getOrderPrice';
import { sendTelegramMessage, formatOrderMessage } from '../../../utils/sendTelegramMessage';

interface ProductInput {
  productDocumentId: number;
  quantity: number;
}

interface AddressInput {
  type?: 'selfShipping' | 'shipping';
  firstName?: string;
  lastName?: string;
  organization?: string;
  address?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
}

interface CreateOrderInput {
  products: ProductInput[];
  address: AddressInput;
}

export default factories.createCoreService('api::order.order', ({ strapi }) => ({
  async createOrder(input: CreateOrderInput) {
    const { products, address: addressInput } = input;

    // Validate products
    if (!products || products.length === 0) {
      throw new Error('Products array is required and cannot be empty');
    }

    // Step 1: Fetch products and create order items
    const orderItemsData = [];
    let subtotal = 0;

    for (const productInput of products) {
      const product = await strapi.entityService.findOne('api::product.product', productInput.productDocumentId, {
        populate: ['batch', 'designers', 'polishes', 'images', 'categories', 'tags'],
      });

      if (!product) {
        throw new Error(`Product with ID ${productInput.productDocumentId} not found`);
      }

      if (!product.price) {
        throw new Error(`Product with ID ${productInput.productDocumentId} has no price`);
      }

      const unitPrice = parseFloat(product.price.toString());
      const quantity = productInput.quantity;
      const totalPrice = unitPrice * quantity;

      orderItemsData.push({
        quantity,
        unitPrice,
        totalPrice,
        product: productInput.productDocumentId,
      });

      subtotal += totalPrice;
    }

    // Step 2: Create address
    const address = await strapi.entityService.create('api::address.address', {
      data: {
        type: addressInput.type || 'shipping',
        firstName: addressInput.firstName || null,
        lastName: addressInput.lastName || null,
        organization: addressInput.organization || null,
        address: addressInput.address || null,
        postalCode: addressInput.postalCode || null,
        phone: addressInput.phone || null,
        email: addressInput.email || null,
      },
    });

    // Step 3: Generate order number (using timestamp or auto-increment)
    const orderNumber = Date.now();

    // Step 4: Create order
    const order = await strapi.entityService.create('api::order.order', {
      data: {
        orderNumber,
        orderStatus: 'pending',
        orderDate: new Date(),
        subtotal,
        totalAmount: subtotal, // Can be adjusted with taxes/shipping later
        address: address.id,
        hashId: null, // Will be set after payment creation
      },
    });

    // Step 5: Create order items
    const createdOrderItems = [];
    for (const itemData of orderItemsData) {
      const orderItem = await strapi.entityService.create('api::order-item.order-item', {
        data: {
          ...itemData,
          order: order.id,
        },
        populate: ['product'],
      });
      createdOrderItems.push(orderItem);
    }

    // Step 6: Send Telegram notification
    try {
      const orderWithItems = await strapi.entityService.findOne('api::order.order', order.id, {
        populate: ['order_items.product', 'address'],
      });
      const message = formatOrderMessage(orderWithItems, createdOrderItems);
      await sendTelegramMessage(message);
    } catch (error: any) {
      // Don't fail order creation if Telegram fails
      strapi.log.warn('Failed to send Telegram notification for order creation:', error.message);
    }

    return {
      order,
      orderItems: createdOrderItems,
      address,
      subtotal,
      totalAmount: subtotal,
    };
  },
}));
