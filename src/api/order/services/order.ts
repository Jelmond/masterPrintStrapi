/**
 * order service
 */

import { factories } from '@strapi/strapi';
import { calculateOrderTotal } from '../../../utils/getOrderPrice';
import { sendTelegramMessage, formatOrderMessage } from '../../../utils/sendTelegramMessage';

interface ProductInput {
  productSlug: string; // Using slug instead of documentId
  quantity: number;
}

interface AddressInput {
  type?: 'selfShipping' | 'shipping' | 'belpochta';
  isIndividual?: boolean;
  isSelfEmployed?: boolean;
  fullName?: string;
  email?: string;
  phone?: string;
  city?: string;
  address?: string; // Deprecated - use deliveryAddress instead
  legalAddress?: string; // Юридический адрес (для юр. лиц)
  deliveryAddress?: string; // Адрес доставки
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
  skipTelegram?: boolean; // Skip Telegram notification (for AlphaBank - send only after payment)
  paymentMethod?: string; // Payment method for Telegram message
  promocode?: string; // Optional promocode name
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
      console.log(`   📌 Looking up product by slug: ${productInput.productSlug}`);
      
      // Fetch product by slug (then check isHidden in code to avoid DB column issues)
      const product = await strapi.db.query('api::product.product').findOne({
        where: { slug: productInput.productSlug },
        populate: ['batch', 'designers', 'polishes', 'images', 'categories', 'tags'],
      });

      if (!product) {
        console.error(`   ❌ Product with slug ${productInput.productSlug} not found`);
        throw new Error(`Product with slug ${productInput.productSlug} not found`);
      }

      // Only visible products can be ordered (check in code for backward compatibility)
      if (product.isHidden === true) {
        console.error(`   ❌ Product with slug ${productInput.productSlug} is hidden`);
        throw new Error(`Product with slug ${productInput.productSlug} is not available for ordering`);
      }

      if (!product.price) {
        console.error(`   ❌ Product with slug ${productInput.productSlug} has no price`);
        throw new Error(`Product with slug ${productInput.productSlug} has no price`);
      }

      const unitPrice = parseFloat(product.price.toString());
      const quantity = productInput.quantity;
      const totalPrice = unitPrice * quantity;

      console.log(`   ✅ Found: ${product.title || 'Unnamed Product'}`);
      console.log(`   📌 Product ID: ${product.id}`);
      console.log(`   📄 Product DocumentID: ${product.documentId}`);
      console.log(`   🔗 Product Slug: ${product.slug}`);
      console.log(`   💵 Unit Price: ${unitPrice} BYN`);
      console.log(`   🔢 Quantity: ${quantity}`);
      console.log(`   💰 Line Total: ${unitPrice} × ${quantity} = ${totalPrice.toFixed(2)} BYN`);

      // Reserve items: reduce stock when order is created
      if (product.stock !== null && product.stock !== undefined) {
        const currentStock = parseInt(product.stock.toString());
        const newStock = Math.max(0, currentStock - quantity);
        
        console.log(`   📦 Stock: ${currentStock} → ${newStock} (reserved ${quantity})`);
        
        // Update product stock
        await strapi.entityService.update('api::product.product', product.id, {
          data: {
            stock: newStock,
          },
        });
        
        console.log(`   ✅ Stock updated for product ${product.id}`);
      } else {
        console.log(`   ⚠️  Product has no stock field, skipping stock reservation`);
      }

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
    console.log('Address (deprecated):', addressInput.address || 'N/A');
    console.log('Delivery Address:', addressInput.deliveryAddress || 'N/A');
    if (addressInput.organization) {
      console.log('Organization:', addressInput.organization);
      console.log('UNP:', addressInput.UNP || 'N/A');
      console.log('Legal Address:', addressInput.legalAddress || 'N/A');
    }
    console.log('-'.repeat(80));

    const addressType = (addressInput.type || 'shipping') as 'selfShipping' | 'shipping' | 'belpochta';
    const address = await strapi.entityService.create('api::address.address', {
      data: {
        type: addressType,
        isIndividual: addressInput.isSelfEmployed ? false : (addressInput.isIndividual !== undefined ? addressInput.isIndividual : true),
        isSelfEmployed: addressInput.isSelfEmployed === true,
        fullName: addressInput.fullName || null,
        email: addressInput.email || null,
        phone: addressInput.phone || null,
        city: addressInput.city || null,
        address: addressInput.address || null, // Deprecated - for backward compatibility
        legalAddress: addressInput.legalAddress || null, // Юридический адрес
        deliveryAddress: addressInput.deliveryAddress || null, // Адрес доставки
        organization: addressInput.organization || null,
        UNP: addressInput.UNP || null,
        paymentAccount: addressInput.paymentAccount || null,
        bankAdress: addressInput.bankAdress || null,
        postalCode: addressInput.postalCode || null,
      },
    });

    console.log('✅ Address created with ID:', address.id);
    console.log('   Address DocumentID:', address.documentId);

    // Step 3: Calculate total amount based on shipping type and discount tiers
    console.log('\n🚚 SHIPPING/DISCOUNT CALCULATION:');
    console.log('-'.repeat(80));
    
    let totalAmount = subtotal;
    let shippingCost = 0;
    let discount = 0;
    let baseDiscount = 0;
    let selfShippingDiscount = 0;
    let discountDescription = '';

    const shippingType = addressInput.type || 'shipping';
    const isLegalEntity = addressInput.isIndividual === false || addressInput.isSelfEmployed === true;

    // Calculate base discount based on subtotal tiers
    if (subtotal >= 1500) {
      baseDiscount = subtotal * 0.20; // 20% discount
      discountDescription = '20% (≥1500 BYN)';
    } else if (subtotal >= 700) {
      baseDiscount = subtotal * 0.05; // 5% discount
      discountDescription = '5% (≥700 BYN)';
    } else {
      baseDiscount = 0; // 0% discount
      discountDescription = '0% (<700 BYN)';
    }

    if (shippingType === 'shipping') {
      // DPD: для юрлиц/ИП всегда 0; для физлиц 0 при ≥400 BYN, иначе 20 BYN
      if (isLegalEntity) {
        shippingCost = 0;
        if (subtotal < 200) {
          throw new Error('Доставка DPD для юридических лиц и ИП доступна при сумме заказа от 200 BYN');
        }
      } else {
        if (subtotal >= 400) {
          shippingCost = 0;
        } else {
          shippingCost = 20;
        }
      }
      discount = baseDiscount;
      totalAmount = subtotal - discount + shippingCost;

      console.log('📦 Shipping Type: DELIVERY (DPD)');
      console.log(`   Subtotal:      ${subtotal.toFixed(2)} BYN`);
      if (discount > 0) {
        console.log(`   Скидка (${discountDescription}): -${discount.toFixed(2)} BYN`);
      }
      if (shippingCost === 0) {
        console.log(`   Доставка:      0 BYN${isLegalEntity ? ' (юрлицо/ИП)' : ' (≥400 BYN)'}`);
      } else {
        console.log(`   Shipping Cost: +${shippingCost.toFixed(2)} BYN`);
      }
      console.log(`   ─────────────────────────────────`);
      console.log(`   TOTAL:         ${totalAmount.toFixed(2)} BYN ✅`);

      strapi.log.info(`Shipping type: shipping - Base discount: ${discount.toFixed(2)} BYN (${discountDescription}), Shipping: ${shippingCost} BYN. Subtotal: ${subtotal}, Total: ${totalAmount}`);
    } else if (shippingType === 'selfShipping') {
      // Apply base discount + additional 3% for self-pickup
      selfShippingDiscount = subtotal * 0.03; // Additional 3% for self-pickup
      discount = baseDiscount + selfShippingDiscount;
      totalAmount = subtotal - discount;

      console.log('🏪 Shipping Type: SELF-PICKUP');
      console.log(`   Subtotal:      ${subtotal.toFixed(2)} BYN`);
      if (baseDiscount > 0) {
        console.log(`   Скидка (${discountDescription}): -${baseDiscount.toFixed(2)} BYN`);
      }
      if (selfShippingDiscount > 0) {
        console.log(`   Скидка (самовывоз 3%): -${selfShippingDiscount.toFixed(2)} BYN`);
      }
      console.log(`   Общая скидка:  -${discount.toFixed(2)} BYN`);
      console.log(`   ─────────────────────────────────`);
      console.log(`   TOTAL:         ${totalAmount.toFixed(2)} BYN ✅`);

      strapi.log.info(`Shipping type: selfShipping - Base discount: ${baseDiscount.toFixed(2)} BYN (${discountDescription}), Self-pickup discount: ${selfShippingDiscount.toFixed(2)} BYN, Total discount: ${discount.toFixed(2)} BYN. Subtotal: ${subtotal}, Total: ${totalAmount}`);
    } else if (shippingType === 'belpochta') {
      // Белпочта: доставка 0 (оплата при получении), скидка 3% не применяется
      shippingCost = 0;
      discount = baseDiscount;
      totalAmount = subtotal - discount;

      console.log('📮 Shipping Type: БЕЛПОЧТА');
      console.log(`   Subtotal:      ${subtotal.toFixed(2)} BYN`);
      if (discount > 0) {
        console.log(`   Скидка (${discountDescription}): -${discount.toFixed(2)} BYN`);
      }
      console.log(`   Доставка:      0 BYN (оплата при получении)`);
      console.log(`   ─────────────────────────────────`);
      console.log(`   TOTAL:         ${totalAmount.toFixed(2)} BYN ✅`);

      strapi.log.info(`Shipping type: belpochta - Base discount: ${discount.toFixed(2)} BYN (${discountDescription}), Shipping: 0. Subtotal: ${subtotal}, Total: ${totalAmount}`);
    }
    console.log('='.repeat(80));

    // Step 3.5: Apply promocode if provided
    let promocodeDiscount = 0;
    let promocodeEntity = null;
    let promocodeApplied = false;

    if (input.promocode && typeof input.promocode === 'string' && input.promocode.trim()) {
      try {
        promocodeEntity = await strapi.db.query('api::promocode.promocode').findOne({
          where: {
            name: input.promocode.trim(),
            publishedAt: { $notNull: true },
          },
          populate: ['usages'],
        });

        if (promocodeEntity && promocodeEntity.isActual) {
          // Check if promocode is still valid (validUntil check)
          let isExpired = false;
          if (promocodeEntity.validUntil) {
            const now = new Date();
            const validUntil = new Date(promocodeEntity.validUntil);
            isExpired = now >= validUntil;
          }
          
          const currentUsages = promocodeEntity.usages?.length || 0;
          if (!isExpired && currentUsages < promocodeEntity.availableUsages) {
            promocodeApplied = true;
            const percentDiscount = promocodeEntity.percentDiscount / 100;

            console.log(`\n🎟️  PROMOCODE APPLIED: ${promocodeEntity.name}`);
            console.log(`   Type: ${promocodeEntity.type}`);
            console.log(`   Discount: ${promocodeEntity.percentDiscount}%`);

            if (promocodeEntity.type === 'order') {
              // Discount on subtotal (before shipping)
              promocodeDiscount = subtotal * percentDiscount;
              totalAmount = totalAmount - promocodeDiscount;
              console.log(`   Discount Amount: -${promocodeDiscount.toFixed(2)} BYN (on subtotal)`);
            } else if (promocodeEntity.type === 'shipping') {
              // Discount on shipping cost
              if (shippingType === 'shipping' && shippingCost > 0) {
                promocodeDiscount = shippingCost * percentDiscount;
                totalAmount = totalAmount - promocodeDiscount;
                console.log(`   Discount Amount: -${promocodeDiscount.toFixed(2)} BYN (on shipping)`);
              }
            } else if (promocodeEntity.type === 'whole') {
              // Discount on total amount (after all calculations)
              promocodeDiscount = totalAmount * percentDiscount;
              totalAmount = totalAmount - promocodeDiscount;
              console.log(`   Discount Amount: -${promocodeDiscount.toFixed(2)} BYN (on total)`);
            }

            console.log(`   New Total: ${totalAmount.toFixed(2)} BYN`);
            console.log('='.repeat(80));
          } else {
            console.log(`\n⚠️  Промокод ${input.promocode} исчерпал лимит использований`);
          }
        } else {
          console.log(`\n⚠️  Промокод ${input.promocode} недействителен или неактивен (игнорируется)`);
        }
      } catch (promocodeError) {
        // Silently ignore promocode errors - don't break order creation
        console.log(`\n⚠️  Ошибка валидации промокода (игнорируется):`, promocodeError);
        strapi.log.warn('Ошибка валидации промокода (игнорируется):', promocodeError);
      }
    }

    // Step 4: Generate order number (using base36 encoding for shorter number)
    // Convert timestamp to base36 for a shorter alphanumeric order number
    const timestamp = Math.floor(Date.now() / 1000);
    const orderNumber = timestamp.toString(36).toUpperCase();

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
    const orderData: any = {
      orderNumber,
      orderStatus: 'pending',
      orderDate: new Date(),
      subtotal,
      totalAmount: parseFloat(totalAmount.toFixed(2)), // Round to 2 decimal places
      address: address.documentId, // Use documentId for Strapi v5 relations
      hashId: null, // Will be set after payment creation
      comment: comment || null,
    };

    const order = await strapi.entityService.create('api::order.order', {
      data: orderData,
    });

    // Step 5.5: Link promocode to order if applied
    if (promocodeApplied && promocodeEntity) {
      try {
        const orderDocumentId = order.documentId || order.id;
        const promocodeDocumentId = promocodeEntity.documentId || promocodeEntity.id;
        
        console.log(`🔗 Linking promocode ${promocodeEntity.name} (${promocodeDocumentId}) to order ${order.id} (${orderDocumentId})`);
        
        // Get current promocode with usages using documents API
        const currentPromocode = await strapi.documents('api::promocode.promocode').findOne({
          documentId: promocodeDocumentId,
          populate: ['usages'],
        });
        
        if (currentPromocode) {
          // Check if order is already linked
          const existingUsages = currentPromocode.usages || [];
          const existingUsageDocumentIds = existingUsages.map((u: any) => u.documentId || u.id).filter(Boolean);
          
          console.log(`   Текущие использования промокода: ${existingUsageDocumentIds.length}`);
          console.log(`   Существующие documentIds: ${JSON.stringify(existingUsageDocumentIds)}`);
          
          if (!existingUsageDocumentIds.includes(orderDocumentId)) {
            console.log(`   Связываю заказ ${orderDocumentId} с промокодом...`);
            
            // In Strapi v5, for oneToMany relations without mappedBy,
            // Strapi uses a join table: promocodes_usages_lnk (not "links")
            // We need to insert directly into this join table using Knex
            const connection = strapi.db.connection;
            const tableName = 'promocodes_usages_lnk';
            
            // Get numeric IDs for the join table
            const promocodeId = promocodeEntity.id;
            const orderId = order.id;
            
            // Check if relation already exists
            const existing = await connection(tableName)
              .where({ promocode_id: promocodeId, order_id: orderId })
              .first();
            
            if (!existing) {
              // Insert the relation into join table
              // Table structure: id, promocode_id, order_id, order_ord
              await connection(tableName).insert({
                promocode_id: promocodeId,
                order_id: orderId,
                order_ord: null, // Optional ordering field
              });
              
              console.log(`✅ Связь добавлена в join-таблицу ${tableName}`);
              
              // Decrease availableUsages by 1
              const currentAvailableUsages = promocodeEntity.availableUsages || 0;
              const newAvailableUsages = Math.max(0, currentAvailableUsages - 1);
              
              // Update promocode's availableUsages using entityService
              await strapi.entityService.update('api::promocode.promocode', promocodeId, {
                data: {
                  availableUsages: newAvailableUsages,
                },
              });
              
              console.log(`✅ availableUsages обновлено: ${currentAvailableUsages} → ${newAvailableUsages}`);
            } else {
              console.log(`⚠️  Связь уже существует в join-таблице`);
            }
            
            console.log(`✅ Промокод ${promocodeEntity.name} привязан к заказу ${order.id}`);
            
            // Get updated promocode to show current usage count
            const updatedPromocode = await strapi.documents('api::promocode.promocode').findOne({
              documentId: promocodeDocumentId,
              populate: ['usages'],
            });
            const currentUsages = updatedPromocode?.usages?.length || 0;
            const updatedAvailableUsages = updatedPromocode?.availableUsages || 0;
            console.log(`   Текущее количество использований: ${currentUsages}/${updatedAvailableUsages}`);
            console.log(`   Обновленные documentIds: ${JSON.stringify((updatedPromocode?.usages || []).map((u: any) => u.documentId || u.id))}`);
          } else {
            console.log(`⚠️  Промокод ${promocodeEntity.name} уже связан с заказом ${order.id}`);
          }
        } else {
          console.log(`⚠️  Промокод не найден по documentId: ${promocodeDocumentId}`);
        }
      } catch (promocodeLinkError) {
        // Don't fail order creation if promocode linking fails
        console.log(`⚠️  Не удалось привязать промокод к заказу (некритично):`, promocodeLinkError);
        strapi.log.warn('Не удалось привязать промокод к заказу:', promocodeLinkError);
        strapi.log.error('Детали ошибки:', promocodeLinkError);
      }
    }

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

    // Step 7: Send Telegram notification (skip for AlphaBank - will be sent after payment)
    if (!input.skipTelegram) {
      console.log('\n📱 SENDING TELEGRAM NOTIFICATION:');
      console.log('-'.repeat(80));
      
      try {
        const orderWithItems = await strapi.entityService.findOne('api::order.order', order.id, {
          populate: ['order_items.product', 'address'],
        });
        
        // Prepare promocode info for Telegram message
        const promocodeInfo = promocodeApplied && promocodeEntity ? {
          name: promocodeEntity.name,
          type: promocodeEntity.type,
          percentDiscount: promocodeEntity.percentDiscount,
          discountAmount: promocodeDiscount,
        } : null;
        
        const message = formatOrderMessage(orderWithItems, createdOrderItems, shippingCost, discount, input.paymentMethod, promocodeInfo);
        // Add inline keyboard buttons for payment status
        const replyMarkup = {
          inline_keyboard: [
            [
              { text: '✅ Оплачен', callback_data: `payment_success_${order.id}` },
              { text: '❌ Не оплачен', callback_data: `payment_declined_${order.id}` }
            ]
          ]
        };
        await sendTelegramMessage(message, { replyMarkup });
        console.log('✅ Telegram notification sent successfully');
      } catch (error: any) {
        // Don't fail order creation if Telegram fails
        console.log('⚠️  Telegram notification failed:', error.message);
        strapi.log.warn('Failed to send Telegram notification for order creation:', error.message);
      }
    } else {
      console.log('\n📱 SKIPPING TELEGRAM NOTIFICATION (will be sent after payment for AlphaBank)');
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
