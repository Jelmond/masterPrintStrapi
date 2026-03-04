/**
 * payment controller
 */

import { factories } from '@strapi/strapi';
import { sendEmail, formatOrderCreatedEmailERIP, formatOrderCreatedEmailSelfPickup, formatOrderCreatedEmailPayOnReceipt } from '../../../utils/sendEmail';

/**
 * Helper function to restore stock for a cancelled order
 */
async function restoreStockForOrder(orderWithItems: any, orderId: number, strapi: any) {
  try {
    strapi.log.info(`\n📦 RESTORING STOCK FOR CANCELLED ORDER ${orderId}:`);
    strapi.log.info('-'.repeat(80));
    
    if (!orderWithItems.order_items || orderWithItems.order_items.length === 0) {
      strapi.log.warn(`No order items found for order ${orderId}`);
      return;
    }
    
    strapi.log.info(`Found ${orderWithItems.order_items.length} order items`);
    
    for (const orderItem of orderWithItems.order_items) {
      const product = orderItem.product;
      if (!product) {
        strapi.log.warn(`Order item ${orderItem.id} has no product`);
        continue;
      }
      
      if (!product.id) {
        strapi.log.warn(`Product has no ID for order item ${orderItem.id}`);
        continue;
      }
      
      const currentStock = product.stock !== null && product.stock !== undefined 
        ? parseInt(product.stock.toString()) 
        : null;
      
      if (currentStock === null) {
        strapi.log.warn(`Product ${product.id} (${product.title || 'N/A'}) has no stock field`);
        continue;
      }
      
      const quantity = orderItem.quantity || 0;
      if (quantity === 0) {
        strapi.log.warn(`Order item ${orderItem.id} has quantity 0, skipping`);
        continue;
      }
      
      const restoredStock = currentStock + quantity;
      
      strapi.log.info(`Product ${product.id} (${product.title || 'N/A'}):`);
      strapi.log.info(`   Current stock: ${currentStock}`);
      strapi.log.info(`   Restoring: +${quantity}`);
      strapi.log.info(`   New stock: ${restoredStock}`);
      
      // Restore product stock
      await strapi.entityService.update('api::product.product', product.id, {
        data: {
          stock: restoredStock,
        },
      });
      
      strapi.log.info(`   ✅ Stock updated for product ${product.id}`);
    }
    strapi.log.info('-'.repeat(80));
    strapi.log.info(`✅ Stock restoration completed for order ${orderId}`);
  } catch (error: any) {
    strapi.log.error('Failed to restore stock:', error);
    strapi.log.error('Error stack:', error.stack);
  }
}

export default factories.createCoreController('api::payment.payment', ({ strapi }) => ({
  async initiatePayment(ctx) {
    try {
      console.log('\n' + '█'.repeat(80));
      console.log('🚀 PAYMENT INITIATION REQUEST RECEIVED');
      console.log('█'.repeat(80));
      console.log('📥 Request Body:', JSON.stringify(ctx.request.body, null, 2));
      console.log('█'.repeat(80));
      
      const { 
        products, 
        type,
        comment,
        isIndividual,
        isSelfEmployed,
        fullName,
        email,
        phone,
        city,
        address,
        legalAddress,
        deliveryAddress,
        paymentMethod,
        organization,
        UNP,
        paymentAccount,
        bankAdress,
        promocode
      } = ctx.request.body;

      console.log('\n🔍 PARSED REQUEST DATA:');
      console.log('-'.repeat(80));
      console.log('Products Count:', products?.length || 0);
      console.log('Is Individual:', isIndividual);
      console.log('Payment Method:', paymentMethod);
      console.log('Type:', type);
      console.log('Comment:', comment || 'N/A');
      console.log('-'.repeat(80));

      // Validate input
      if (!products || !Array.isArray(products) || products.length === 0) {
        return ctx.badRequest('Products array is required and cannot be empty');
      }

      if (typeof isIndividual !== 'boolean') {
        return ctx.badRequest('isIndividual field is required and must be a boolean');
      }

      if (!paymentMethod) {
        return ctx.badRequest('paymentMethod is required');
      }

      // Самозанятый: способы оплаты и доставки как у юрлиц (ERIP, paymentAccount)
      const isSelfEmployedBool = isSelfEmployed === true;

      // Validate payment method: физлицо / юрлицо / самозанятый
      if (isSelfEmployedBool) {
        if (!['ERIP', 'paymentAccount'].includes(paymentMethod)) {
          return ctx.badRequest('For self-employed, paymentMethod must be ERIP or paymentAccount');
        }
        if (!fullName || !UNP || !paymentAccount || !bankAdress || !email || !phone || !city || !legalAddress || !deliveryAddress) {
          return ctx.badRequest('For self-employed, fullName, UNP, paymentAccount, bankAdress, email, phone, city, legalAddress, and deliveryAddress are required');
        }
      } else if (isIndividual) {
        if (!['ERIP', 'card', 'pickupPayment', 'cash'].includes(paymentMethod)) {
          return ctx.badRequest('For individuals, paymentMethod must be ERIP, card, pickupPayment, or cash');
        }
        if (!fullName || !email || !phone || !city || (!address && !deliveryAddress)) {
          return ctx.badRequest('For individuals, fullName, email, phone, city, and address (or deliveryAddress) are required');
        }
        if (paymentMethod === 'pickupPayment' && type !== 'selfShipping') {
          return ctx.badRequest('pickupPayment is only available for selfShipping (self-pickup)');
        }
      } else {
        if (!['ERIP', 'paymentAccount'].includes(paymentMethod)) {
          return ctx.badRequest('For organizations, paymentMethod must be ERIP or paymentAccount');
        }
        if (!fullName || !UNP || !paymentAccount || !bankAdress || !email || !phone || !city || !legalAddress || !deliveryAddress) {
          return ctx.badRequest('For organizations, fullName, UNP, paymentAccount, bankAdress, email, phone, city, legalAddress, and deliveryAddress are required');
        }
      }

      // Validate products structure
      for (const product of products) {
        if (!product.productSlug || !product.quantity) {
          return ctx.badRequest('Each product must have productSlug and quantity');
        }
        if (product.quantity <= 0) {
          return ctx.badRequest('Product quantity must be greater than 0');
        }
      }

      // Prepare address data (юрлицо и самозанятый — одни и те же поля)
      const addressData = {
        type: type || 'shipping',
        isIndividual: isSelfEmployedBool ? false : isIndividual,
        isSelfEmployed: isSelfEmployedBool,
        fullName,
        email,
        phone,
        city,
        address: address || null,
        deliveryAddress: deliveryAddress || address || null,
        ...(isIndividual && !isSelfEmployedBool ? {} : {
          organization,
          UNP,
          paymentAccount,
          bankAdress,
          legalAddress,
        }),
      };

      // Step 1: Create order (this creates order, order items, and address)
      const orderService = strapi.service('api::order.order');
      const shouldProcessAlphaBank = paymentMethod === 'card' && isIndividual;
      
      // Skip Telegram notification for AlphaBank - will be sent after payment success
      const orderResult = await orderService.createOrder({ 
        products, 
        address: addressData,
        comment,
        skipTelegram: shouldProcessAlphaBank,
        paymentMethod: paymentMethod, // Pass payment method for Telegram message
        promocode: promocode || undefined // Pass promocode if provided (will be ignored if invalid)
      });

      strapi.log.info(`Order created with ID: ${orderResult.order.id}, order number: ${orderResult.order.orderNumber}`);

      // Step 2: Check if we need to process AlphaBank payment (already determined above)

      console.log('\n💳 PAYMENT PROCESSING DECISION:');
      console.log('-'.repeat(80));
      console.log(`Payment Method: ${paymentMethod}`);
      console.log(`Is Individual: ${isIndividual}`);
      console.log(`Should Process AlphaBank: ${shouldProcessAlphaBank ? '✅ YES' : '❌ NO'}`);
      console.log('-'.repeat(80));

      strapi.log.info(`Should process AlphaBank: ${shouldProcessAlphaBank}, payment method: ${paymentMethod}, isIndividual: ${isIndividual}`);

      // Step 3: Create payment
      console.log('\n💰 CREATING PAYMENT RECORD...');
      const paymentService = strapi.service('api::payment.payment');
      const paymentResult = await paymentService.createPaymentForOrder(
        orderResult.order.id, 
        paymentMethod,
        shouldProcessAlphaBank
      );

      // Step 4: Send email notification based on payment method and shipping type
      console.log('\n📧 SENDING EMAIL NOTIFICATION:');
      console.log('-'.repeat(80));
      try {
        // Fetch order with items for email
        const orderWithItems = await strapi.entityService.findOne('api::order.order', orderResult.order.id, {
          populate: ['order_items.product', 'address'],
        });

        if (email && orderWithItems) {
          const orderDate = (orderWithItems as any)?.orderDate ?? (orderResult.order as any)?.orderDate;
          let emailContent;
          
          // Шаблон письма: 1–2 = наличный/карта при получении (без текста про ЕРИП/счёт), 3–4 = предоплата (ЕРИП/карта онлайн)
          if (type === 'selfShipping' && paymentMethod === 'pickupPayment') {
            // Самовывоз, оплата при получении — письмо со сроком 2 банковских дня
            emailContent = formatOrderCreatedEmailSelfPickup(
              orderResult.order.orderNumber,
              orderResult.orderItems,
              orderResult.totalAmount,
              orderResult.subtotal,
              orderResult.discount,
              orderDate
            );
          } else if (paymentMethod === 'cash' || paymentMethod === 'pickupPayment') {
            // Наличный или картой при получении — письмо без ЕРИП/расчётный счёт
            emailContent = formatOrderCreatedEmailPayOnReceipt(
              orderResult.order.orderNumber,
              orderResult.orderItems,
              orderResult.totalAmount,
              orderResult.subtotal,
              orderResult.discount,
              orderDate
            );
          } else {
            // ERIP или карта онлайн (предоплата) — письмо с текстом про ЕРИП/счёт/онлайн
            emailContent = formatOrderCreatedEmailERIP(
              orderResult.order.orderNumber,
              orderResult.orderItems,
              orderResult.totalAmount,
              orderResult.subtotal,
              orderResult.discount,
              orderDate
            );
          }

          await sendEmail({
            to: email,
            subject: emailContent.subject,
            html: emailContent.html,
          });
          console.log(`✅ Email sent successfully to ${email}`);
        } else {
          console.log('⚠️  Email not sent: email address not provided or order not found');
        }
      } catch (error: any) {
        // Don't fail payment initiation if email fails
        console.log('⚠️  Email notification failed:', error.message);
        strapi.log.warn('Failed to send email notification for order creation:', error.message);
      }

      // Return response to frontend
      const response: any = {
        success: true,
        orderId: orderResult.order.id,
        orderNumber: orderResult.order.orderNumber,
      };

      // Only include payment link and hashId if AlphaBank was processed
      if (shouldProcessAlphaBank) {
        response.hashId = paymentResult.hashId;
        response.paymentLink = paymentResult.paymentLink;
      }

      console.log('\n' + '█'.repeat(80));
      console.log('✅ PAYMENT INITIATION SUCCESSFUL');
      console.log('█'.repeat(80));
      console.log('📤 RESPONSE TO FRONTEND:');
      console.log(JSON.stringify(response, null, 2));
      console.log('█'.repeat(80));
      console.log('\n');

      return ctx.send(response);
    } catch (error: any) {
      console.log('\n' + '█'.repeat(80));
      console.log('❌ PAYMENT INITIATION FAILED');
      console.log('█'.repeat(80));
      console.log('Error Message:', error.message);
      console.log('Error Stack:', error.stack);
      console.log('█'.repeat(80));
      console.log('\n');
      
      strapi.log.error('Payment initiation error:', error);
      return ctx.internalServerError(error.message || 'Failed to initiate payment');
    }
  },

  async handleSuccess(ctx) {
    try {
      const { orderId } = ctx.query;

      if (!orderId) {
        return ctx.badRequest('Missing required parameter: orderId');
      }

      const paymentService = strapi.service('api::payment.payment');
      const payment = await paymentService.updatePaymentStatus(orderId as string, 'success');

      // Get actual order ID from payment
      const orderIdForRedirect = payment?.order?.id || payment?.order;

      // Redirect to client success page
      const baseClientUrl = process.env.BASE_CLIENT_URL || 'http://localhost:3000';
      return ctx.redirect(`${baseClientUrl}/payment-success?orderId=${orderIdForRedirect}`);
    } catch (error: any) {
      strapi.log.error('Payment success handler error:', error);
      const baseClientUrl = process.env.BASE_CLIENT_URL || 'http://localhost:3000';
      return ctx.redirect(
        `${baseClientUrl}/payment-error?message=${encodeURIComponent(error.message || 'Payment processing error')}`
      );
    }
  },

  async handleFailure(ctx) {
    try {
      const { orderId } = ctx.query;

      if (!orderId) {
        return ctx.badRequest('Missing required parameter: orderId');
      }

      const paymentService = strapi.service('api::payment.payment');
      const payment = await paymentService.updatePaymentStatus(orderId as string, 'declined');

      // Get actual order ID from payment
      const orderIdForRedirect = payment?.order?.id || payment?.order;

      // Redirect to client failure page
      const baseClientUrl = process.env.BASE_CLIENT_URL || 'http://localhost:3000';
      return ctx.redirect(`${baseClientUrl}/payment-failure?orderId=${orderIdForRedirect}`);
    } catch (error: any) {
      strapi.log.error('Payment failure handler error:', error);
      const baseClientUrl = process.env.BASE_CLIENT_URL || 'http://localhost:3000';
      return ctx.redirect(
        `${baseClientUrl}/payment-error?message=${encodeURIComponent(error.message || 'Payment processing error')}`
      );
    }
  },

  async handleTelegramCallback(ctx) {
    // Telegram requires a quick response (within 60 seconds)
    // Send 200 OK immediately, then process asynchronously
    ctx.status = 200;
    ctx.body = { ok: true };
    
    // Process asynchronously
    setImmediate(async () => {
      try {
        // Log incoming request for debugging
        strapi.log.info('Telegram webhook received:', JSON.stringify(ctx.request.body, null, 2));
        
        // Telegram sends updates in format: { update_id, callback_query: {...} }
        // Handle both direct callback_query and wrapped in update
        const update = ctx.request.body;
        const callback_query = update.callback_query || update;
        
        if (!callback_query || !callback_query.data) {
          strapi.log.warn('Invalid callback query received:', JSON.stringify(update));
          return;
        }

        strapi.log.info(`Processing callback: ${callback_query.data}`);
        const callbackData = callback_query.data;
        
        // Parse callback data: payment_success_61 or payment_declined_61
        const parts = callbackData.split('_');
        if (parts.length < 3) {
          strapi.log.warn(`Invalid callback data format: ${callbackData}`);
          return;
        }
        
        const action = parts[0];
        const status = parts[1];
        const orderId = parts.slice(2).join('_'); // In case orderId has underscores (unlikely but safe)
        
        strapi.log.info(`Parsed callback: action=${action}, status=${status}, orderId=${orderId}`);

        if (action !== 'payment' || !['success', 'declined'].includes(status) || !orderId) {
          strapi.log.warn(`Invalid callback data: ${callbackData} (action=${action}, status=${status}, orderId=${orderId})`);
          return;
        }

        const orderIdNum = parseInt(orderId);
        if (isNaN(orderIdNum)) {
          strapi.log.warn(`Invalid order ID (not a number): ${orderId}`);
          return;
        }

        // Find payment by order ID
        const order = await strapi.entityService.findOne('api::order.order', orderIdNum, {
          populate: ['order_items', 'address'],
        });

        if (!order) {
          strapi.log.warn(`Order not found: ${orderIdNum} (parsed from: ${callbackData})`);
          // Answer callback query with error message
          const botToken = process.env.TELEGRAM_BOT_TOKEN;
          if (botToken && callback_query.id) {
            try {
              await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  callback_query_id: callback_query.id,
                  text: `❌ Заказ #${orderIdNum} не найден`,
                  show_alert: true,
                }),
              });
            } catch (error: any) {
              strapi.log.warn('Failed to answer callback query:', error);
            }
          }
          return;
        }

        // In Strapi v5, relations use documentId, not id
        const orderDocumentId = order.documentId;
        strapi.log.info(`Looking for payment with order documentId: ${orderDocumentId}, order id: ${order.id}`);

        // Find payment for this order
        // In Strapi v5, when payment is created with order: orderDocumentId, 
        // we need to query using the document query API or check the relation
        let payments: any[] = [];
        
        // Try to find using document query (Strapi v5 way)
        try {
          const allPayments = await strapi.documents('api::payment.payment').findMany({
            populate: ['order'],
          });
          
          // Filter payments where order matches
          payments = allPayments.filter((p: any) => {
            const paymentOrder = p.order;
            if (!paymentOrder) return false;
            // Check if order matches by id or documentId
            if (typeof paymentOrder === 'object') {
              return paymentOrder.id === orderIdNum || 
                     paymentOrder.documentId === orderDocumentId;
            }
            return paymentOrder === orderDocumentId || paymentOrder === orderIdNum;
          });
        } catch (error: any) {
          strapi.log.warn('Error using document query, trying entityService:', error.message);
          // Fallback to entityService
          const allPayments = await strapi.entityService.findMany('api::payment.payment', {
            populate: ['order'],
          });
          
          payments = allPayments.filter((p: any) => {
            const paymentOrder = p.order;
            if (!paymentOrder) return false;
            if (typeof paymentOrder === 'object') {
              return paymentOrder.id === orderIdNum || 
                     paymentOrder.documentId === orderDocumentId;
            }
            return paymentOrder === orderDocumentId || paymentOrder === orderIdNum;
          });
        }

        strapi.log.info(`Found ${payments.length} payment(s) for order ${orderIdNum}`);
        
        if (!payments || payments.length === 0) {
          strapi.log.warn(`Payment not found for order: ${orderIdNum} (documentId: ${orderDocumentId})`);
          // Try alternative: search by order id as fallback
          strapi.log.info(`Trying fallback search for payment with order id: ${orderIdNum}`);
          const paymentsById = await strapi.entityService.findMany('api::payment.payment', {
            filters: {
              order: {
                id: orderIdNum,
              },
            },
            populate: ['order'],
            limit: 1,
          });
          
          strapi.log.info(`Fallback search found ${paymentsById.length} payment(s)`);
          
          if (paymentsById && paymentsById.length > 0) {
            strapi.log.info(`Found payment using order id fallback`);
            const payment = paymentsById[0];
            const paymentStatus = status === 'success' ? 'success' : 'declined';
            
            // Check if payment already has this status
            const currentPaymentStatus = payment.paymentStatus;
            strapi.log.info(`Current payment status: ${currentPaymentStatus}, requested status: ${paymentStatus}`);
            
            if (currentPaymentStatus === paymentStatus) {
              // Payment already has this status, just send notification
              strapi.log.info(`Payment already has status ${paymentStatus}, sending notification only`);
              
              const updatedOrder = await strapi.entityService.findOne('api::order.order', orderIdNum, {
                populate: ['order_items.product', 'address'],
              });
              
              if (updatedOrder) {
                const orderNumber = updatedOrder.orderNumber || updatedOrder.id;
                const statusText = paymentStatus === 'success' ? 'оплачен' : 'отменен';
                const emoji = paymentStatus === 'success' ? '✅' : '❌';
                const message = `${emoji} Заказ <b>#${orderNumber}</b> уже был помечен как <b>${statusText}</b>`;
                
                try {
                  const { sendTelegramMessage } = await import('../../../utils/sendTelegramMessage');
                  await sendTelegramMessage(message);
                  strapi.log.info('✅ Notification sent: order already has this status');
                } catch (error: any) {
                  strapi.log.error('Failed to send notification:', error);
                }
              }
              
              // Answer callback query
              const botToken = process.env.TELEGRAM_BOT_TOKEN;
              if (botToken && callback_query.id) {
                try {
                  await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      callback_query_id: callback_query.id,
                      text: `Заказ уже помечен как ${paymentStatus === 'success' ? 'оплачен' : 'отменен'}`,
                      show_alert: true,
                    }),
                  });
                } catch (error: any) {
                  strapi.log.warn('Failed to answer callback query:', error);
                }
              }
              
              return;
            }
            
            // Check if trying to reverse the status
            if ((currentPaymentStatus === 'success' && paymentStatus === 'declined') ||
                (currentPaymentStatus === 'declined' && paymentStatus === 'success')) {
              // Don't allow reversing status, just send notification
              strapi.log.info(`Attempted to reverse status from ${currentPaymentStatus} to ${paymentStatus}, sending notification only`);
              
              const updatedOrder = await strapi.entityService.findOne('api::order.order', orderIdNum, {
                populate: ['order_items.product', 'address'],
              });
              
              if (updatedOrder) {
                const orderNumber = updatedOrder.orderNumber || updatedOrder.id;
                const currentStatusText = currentPaymentStatus === 'success' ? 'оплачен' : 'отменен';
                const requestedStatusText = paymentStatus === 'success' ? 'оплачен' : 'отменен';
                const emoji = '⚠️';
                const message = `${emoji} Заказ <b>#${orderNumber}</b> уже был помечен как <b>${currentStatusText}</b>. Нельзя изменить статус на <b>${requestedStatusText}</b>.`;
                
                try {
                  const { sendTelegramMessage } = await import('../../../utils/sendTelegramMessage');
                  await sendTelegramMessage(message);
                  strapi.log.info('✅ Notification sent: cannot reverse order status');
                } catch (error: any) {
                  strapi.log.error('Failed to send notification:', error);
                }
              }
              
              // Answer callback query
              const botToken = process.env.TELEGRAM_BOT_TOKEN;
              if (botToken && callback_query.id) {
                try {
                  await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      callback_query_id: callback_query.id,
                      text: `Заказ уже помечен как ${currentPaymentStatus === 'success' ? 'оплачен' : 'отменен'}. Нельзя изменить статус.`,
                      show_alert: true,
                    }),
                  });
                } catch (error: any) {
                  strapi.log.warn('Failed to answer callback query:', error);
                }
              }
              
              return;
            }
            
            // Update payment status
            await strapi.entityService.update('api::payment.payment', payment.id, {
              data: {
                paymentStatus: paymentStatus,
                ...(paymentStatus === 'success' ? { paymentDate: new Date() } : {}),
              },
            });

            // Update order status
            const orderStatus = paymentStatus === 'success' ? 'success' : 'canceled';
            await strapi.entityService.update('api::order.order', orderIdNum, {
              data: { orderStatus },
            });
            
            // Restore stock when payment is cancelled
            if (paymentStatus === 'declined') {
              try {
                const updatedOrder = await strapi.entityService.findOne('api::order.order', orderIdNum, {
                  populate: ['order_items.product', 'address'],
                });
                
                if (updatedOrder) {
                  const orderWithItems = updatedOrder as any;
                  console.log('\n📦 RESTORING STOCK FOR CANCELLED ORDER (fallback path):');
                  console.log('-'.repeat(80));
                  
                  if (orderWithItems.order_items) {
                    for (const orderItem of orderWithItems.order_items) {
                      const product = orderItem.product;
                      if (product && product.id) {
                        const currentStock = product.stock !== null && product.stock !== undefined 
                          ? parseInt(product.stock.toString()) 
                          : null;
                        
                        if (currentStock !== null) {
                          const quantity = orderItem.quantity || 0;
                          const restoredStock = currentStock + quantity;
                          
                          console.log(`   Product ${product.id}: ${currentStock} → ${restoredStock} (+${quantity})`);
                          
                          await strapi.entityService.update('api::product.product', product.id, {
                            data: {
                              stock: restoredStock,
                            },
                          });
                        }
                      }
                    }
                    strapi.log.info(`✅ Stock restored for order ${orderId}`);
                  }
                }
              } catch (error: any) {
                strapi.log.error('Failed to restore stock:', error);
              }
            }
            
            // Send Telegram notification
            try {
              strapi.log.info('📱 Sending Telegram confirmation message (fallback path)...');
              const updatedOrder = await strapi.entityService.findOne('api::order.order', orderIdNum, {
                populate: ['order_items.product', 'address'],
              });
              
              if (updatedOrder) {
                const { sendTelegramMessage } = await import('../../../utils/sendTelegramMessage');
                
                const orderNumber = updatedOrder.orderNumber || updatedOrder.id;
                const statusText = paymentStatus === 'success' ? 'оплачен' : 'отменен';
                const emoji = paymentStatus === 'success' ? '✅' : '❌';
                
                const message = `${emoji} Для заказа <b>#${orderNumber}</b> статус сменился на <b>${statusText}</b>`;
                
                strapi.log.info(`Sending status change message to Telegram: ${message}`);
                const result = await sendTelegramMessage(message);
                if (result) {
                  strapi.log.info('✅ Telegram confirmation message sent successfully');
                } else {
                  strapi.log.warn('⚠️ Telegram message sending returned false');
                }
              } else {
                strapi.log.warn('Updated order not found in fallback path, cannot send Telegram message');
              }
            } catch (error: any) {
              strapi.log.error('❌ Failed to send Telegram notification:', error);
              strapi.log.error('Error stack:', error.stack);
            }

            // Answer callback
            const botToken = process.env.TELEGRAM_BOT_TOKEN;
            if (botToken && callback_query.id) {
              const message = paymentStatus === 'success' 
                ? '✅ Платеж отмечен как оплачен' 
                : '❌ Платеж отмечен как не оплачен';
              
              try {
                await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    callback_query_id: callback_query.id,
                    text: message,
                    show_alert: true, // Show as alert so user sees it
                  }),
                });
                strapi.log.info(`✅ Callback query answered: ${message}`);
              } catch (error: any) {
                strapi.log.warn('Failed to answer callback query:', error);
              }
            }

            strapi.log.info(`✅ Payment status updated successfully: ${paymentStatus} for order ${orderIdNum}`);
            return;
          }
          return;
        }

        const payment = payments[0];
        const paymentStatus = status === 'success' ? 'success' : 'declined';
        
        // Check if payment already has this status
        const currentPaymentStatus = payment.paymentStatus;
        strapi.log.info(`Current payment status: ${currentPaymentStatus}, requested status: ${paymentStatus}`);
        
        if (currentPaymentStatus === paymentStatus) {
          // Payment already has this status, just send notification
          strapi.log.info(`Payment already has status ${paymentStatus}, sending notification only`);
          
          const orderNumber = order.orderNumber || order.id;
          const statusText = paymentStatus === 'success' ? 'оплачен' : 'отменен';
          const emoji = paymentStatus === 'success' ? '✅' : '❌';
          const message = `${emoji} Заказ <b>#${orderNumber}</b> уже был помечен как <b>${statusText}</b>`;
          
          try {
            const { sendTelegramMessage } = await import('../../../utils/sendTelegramMessage');
            await sendTelegramMessage(message);
            strapi.log.info('✅ Notification sent: order already has this status');
          } catch (error: any) {
            strapi.log.error('Failed to send notification:', error);
          }
          
          // Answer callback query
          const botToken = process.env.TELEGRAM_BOT_TOKEN;
          if (botToken && callback_query.id) {
            try {
              await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  callback_query_id: callback_query.id,
                  text: `Заказ уже помечен как ${statusText}`,
                  show_alert: true,
                }),
              });
            } catch (error: any) {
              strapi.log.warn('Failed to answer callback query:', error);
            }
          }
          
          return;
        }
        
        // Check if trying to reverse the status (e.g., mark as declined when already success)
        if ((currentPaymentStatus === 'success' && paymentStatus === 'declined') ||
            (currentPaymentStatus === 'declined' && paymentStatus === 'success')) {
          // Don't allow reversing status, just send notification
          strapi.log.info(`Attempted to reverse status from ${currentPaymentStatus} to ${paymentStatus}, sending notification only`);
          
          const orderNumber = order.orderNumber || order.id;
          const currentStatusText = currentPaymentStatus === 'success' ? 'оплачен' : 'отменен';
          const requestedStatusText = paymentStatus === 'success' ? 'оплачен' : 'отменен';
          const emoji = '⚠️';
          const message = `${emoji} Заказ <b>#${orderNumber}</b> уже был помечен как <b>${currentStatusText}</b>. Нельзя изменить статус на <b>${requestedStatusText}</b>.`;
          
          try {
            const { sendTelegramMessage } = await import('../../../utils/sendTelegramMessage');
            await sendTelegramMessage(message);
            strapi.log.info('✅ Notification sent: cannot reverse order status');
          } catch (error: any) {
            strapi.log.error('Failed to send notification:', error);
          }
          
          // Answer callback query
          const botToken = process.env.TELEGRAM_BOT_TOKEN;
          if (botToken && callback_query.id) {
            try {
              await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  callback_query_id: callback_query.id,
                  text: `Заказ уже помечен как ${currentStatusText}. Нельзя изменить статус.`,
                  show_alert: true,
                }),
              });
            } catch (error: any) {
              strapi.log.warn('Failed to answer callback query:', error);
            }
          }
          
          return;
        }

        // Update payment status using the payment service
        const paymentService = strapi.service('api::payment.payment');
        
        // Get order with items BEFORE updating payment status (for stock restoration)
        const orderBeforeUpdate = await strapi.entityService.findOne('api::order.order', orderIdNum, {
          populate: ['order_items.product', 'address'],
        });
        
        if (!orderBeforeUpdate) {
          strapi.log.warn(`Order not found: ${orderIdNum}`);
          return;
        }

        // Get the actual order ID from the payment's order relation
        const paymentOrderId = typeof payment.order === 'object' ? payment.order.id : orderIdNum;
        strapi.log.info(`Payment order ID: ${paymentOrderId}, Callback order ID: ${orderIdNum}`);
        
        // Use the order ID from payment if it differs from callback
        const actualOrderId = paymentOrderId || orderIdNum;
        strapi.log.info(`Using order ID: ${actualOrderId} for status update`);
        
        // If payment has hashId, use it; otherwise use payment ID
        if (payment.hashId) {
          // Payment service will handle order status update and Telegram notification
          strapi.log.info(`Updating payment status via service for hashId: ${payment.hashId}`);
          await paymentService.updatePaymentStatus(payment.hashId, paymentStatus);
          
          // Get updated order for confirmation message - use actual order ID
          strapi.log.info(`Fetching updated order with ID: ${actualOrderId}`);
          const updatedOrder = await strapi.entityService.findOne('api::order.order', actualOrderId, {
            populate: ['order_items.product', 'address'],
          });
          
          if (updatedOrder) {
            strapi.log.info(`✅ Updated order found: ID=${updatedOrder.id}, orderNumber=${updatedOrder.orderNumber}`);
            // Send confirmation message to admin chat
            try {
              strapi.log.info('📱 Sending Telegram confirmation message...');
              const { sendTelegramMessage } = await import('../../../utils/sendTelegramMessage');
              
              const orderNumber = updatedOrder.orderNumber || updatedOrder.id;
              const statusText = paymentStatus === 'success' ? 'оплачен' : 'отменен';
              const emoji = paymentStatus === 'success' ? '✅' : '❌';
              
              const message = `${emoji} Для заказа <b>#${orderNumber}</b> статус сменился на <b>${statusText}</b>`;
              
              strapi.log.info(`Sending status change message to Telegram: ${message}`);
              const result = await sendTelegramMessage(message);
              if (result) {
                strapi.log.info('✅ Telegram confirmation message sent successfully');
              } else {
                strapi.log.warn('⚠️ Telegram message sending returned false');
              }
            } catch (error: any) {
              strapi.log.error('❌ Failed to send confirmation Telegram notification:', error);
              strapi.log.error('Error stack:', error.stack);
            }
          } else {
            strapi.log.warn(`Updated order not found for ID: ${actualOrderId}, cannot send Telegram message`);
            // Try to find by documentId as fallback
            if (typeof payment.order === 'object' && payment.order.documentId) {
              strapi.log.info(`Trying to find order by documentId: ${payment.order.documentId}`);
              const orderByDocId = await strapi.documents('api::order.order').findOne({
                documentId: payment.order.documentId,
                populate: ['order_items.product', 'address'],
              });
              if (orderByDocId) {
                strapi.log.info(`✅ Found order by documentId: ID=${orderByDocId.id}`);
                const orderNumber = orderByDocId.orderNumber || orderByDocId.id;
                const statusText = paymentStatus === 'success' ? 'оплачен' : 'отменен';
                const emoji = paymentStatus === 'success' ? '✅' : '❌';
                const message = `${emoji} Для заказа <b>#${orderNumber}</b> статус сменился на <b>${statusText}</b>`;
                const { sendTelegramMessage } = await import('../../../utils/sendTelegramMessage');
                await sendTelegramMessage(message);
              }
            }
          }
        } else {
          // For payments without hashId, update directly
          await strapi.entityService.update('api::payment.payment', payment.id, {
            data: {
              paymentStatus: paymentStatus,
              ...(paymentStatus === 'success' ? { paymentDate: new Date() } : {}),
            },
          });

          // Get the actual order ID from the payment's order relation
          const paymentOrderId = typeof payment.order === 'object' ? payment.order.id : orderIdNum;
          strapi.log.info(`Payment order ID: ${paymentOrderId}, Callback order ID: ${orderIdNum}`);
          
          // Use the order ID from payment if it differs from callback
          const actualOrderId = paymentOrderId || orderIdNum;
          strapi.log.info(`Using order ID: ${actualOrderId} for status update`);
          
          // Update order status
          const orderStatus = paymentStatus === 'success' ? 'success' : 'canceled';
          strapi.log.info(`Updating order ${actualOrderId} status to: ${orderStatus}`);
          await strapi.entityService.update('api::order.order', actualOrderId, {
            data: { orderStatus },
          });
          
          // Restore stock when payment is cancelled/declined (for payments without hashId)
          if (paymentStatus === 'declined') {
            const orderWithItems = orderBeforeUpdate as any;
            await restoreStockForOrder(orderWithItems, actualOrderId, strapi);
          }
          
          // Get order with items for Telegram notification
          strapi.log.info(`Fetching updated order with ID: ${actualOrderId}`);
          const updatedOrder = await strapi.entityService.findOne('api::order.order', actualOrderId, {
            populate: ['order_items.product', 'address'],
          });
          
          if (!updatedOrder) {
            strapi.log.warn(`Order not found after update: ${actualOrderId}`);
            // Try to find by documentId as fallback
            if (typeof payment.order === 'object' && payment.order.documentId) {
              strapi.log.info(`Trying to find order by documentId: ${payment.order.documentId}`);
              const orderByDocId = await strapi.documents('api::order.order').findOne({
                documentId: payment.order.documentId,
                populate: ['order_items.product', 'address'],
              });
              if (orderByDocId) {
                strapi.log.info(`✅ Found order by documentId: ID=${orderByDocId.id}`);
                const orderNumber = orderByDocId.orderNumber || orderByDocId.id;
                const statusText = paymentStatus === 'success' ? 'оплачен' : 'отменен';
                const emoji = paymentStatus === 'success' ? '✅' : '❌';
                const message = `${emoji} Для заказа <b>#${orderNumber}</b> статус сменился на <b>${statusText}</b>`;
                const { sendTelegramMessage } = await import('../../../utils/sendTelegramMessage');
                await sendTelegramMessage(message);
                return;
              }
            }
            return;
          }
          
          strapi.log.info(`✅ Updated order found: ID=${updatedOrder.id}, orderNumber=${updatedOrder.orderNumber}`);

          const orderWithItems = updatedOrder as any;
          
          if (paymentStatus === 'success') {
            // Items are already reserved (stock reduced) when order is created
            // When payment is marked as paid, items are considered sold
            strapi.log.info(`✅ Payment confirmed for order ${orderIdNum} - items were already reserved on order creation`);
          }

          // Send Telegram notification with status change message
          try {
            strapi.log.info('📱 Sending Telegram confirmation message (no hashId)...');
            const { sendTelegramMessage } = await import('../../../utils/sendTelegramMessage');
            
            const orderNumber = orderWithItems.orderNumber || orderWithItems.id;
            const statusText = paymentStatus === 'success' ? 'оплачен' : 'отменен';
            const emoji = paymentStatus === 'success' ? '✅' : '❌';
            
            const message = `${emoji} Для заказа <b>#${orderNumber}</b> статус сменился на <b>${statusText}</b>`;
            
            strapi.log.info(`Sending status change message to Telegram: ${message}`);
            const result = await sendTelegramMessage(message);
            if (result) {
              strapi.log.info('✅ Telegram confirmation message sent successfully');
            } else {
              strapi.log.warn('⚠️ Telegram message sending returned false');
            }
          } catch (error: any) {
            strapi.log.error('❌ Failed to send Telegram notification:', error);
            strapi.log.error('Error stack:', error.stack);
          }
        }

        // Answer the callback query to remove loading state
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (botToken && callback_query.id) {
          const message = paymentStatus === 'success' 
            ? '✅ Платеж отмечен как оплачен' 
            : '❌ Платеж отмечен как не оплачен';
          
          try {
            await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                callback_query_id: callback_query.id,
                text: message,
                show_alert: true, // Show as alert so user sees it
              }),
            });
            strapi.log.info(`✅ Callback query answered: ${message}`);
          } catch (error: any) {
            strapi.log.warn('Failed to answer callback query:', error);
          }
        }

        strapi.log.info(`✅ Payment status updated successfully: ${paymentStatus} for order ${orderIdNum}`);
      } catch (error: any) {
        strapi.log.error('Telegram callback handler error:', error);
        strapi.log.error('Error stack:', error.stack);
      }
    });
    
    return;
  },

  async setupTelegramWebhook(ctx) {
    try {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (!botToken) {
        return ctx.badRequest('TELEGRAM_BOT_TOKEN is not set');
      }

      // Get webhook URL from query or environment
      const webhookUrl = ctx.query.url || process.env.TELEGRAM_WEBHOOK_URL;
      if (!webhookUrl) {
        return ctx.badRequest('Webhook URL is required. Provide ?url=https://your-domain.com/api/payments/telegram-callback');
      }

      // Set webhook with Telegram
      const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
        }),
      });

      const result = (await response.json()) as { ok: boolean; description?: string; result?: any };

      if (result.ok) {
        return ctx.send({
          success: true,
          message: 'Webhook set successfully',
          webhookUrl,
          result,
        });
      } else {
        return ctx.badRequest({
          success: false,
          message: 'Failed to set webhook',
          error: result.description || 'Unknown error',
        });
      }
    } catch (error: any) {
      strapi.log.error('Webhook setup error:', error);
      return ctx.internalServerError(error.message || 'Failed to set up webhook');
    }
  },
}));
