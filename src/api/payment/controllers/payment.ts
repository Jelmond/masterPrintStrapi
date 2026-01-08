/**
 * payment controller
 */

import { factories } from '@strapi/strapi';
import { sendEmail, formatOrderCreatedEmailERIP, formatOrderCreatedEmailSelfPickup } from '../../../utils/sendEmail';

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
        fullName,
        email,
        phone,
        city,
        address,
        paymentMethod,
        organization,
        UNP,
        paymentAccount,
        bankAdress
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

      // Validate payment method based on isIndividual
      if (isIndividual) {
        if (!['ERIP', 'card'].includes(paymentMethod)) {
          return ctx.badRequest('For individuals, paymentMethod must be ERIP or card');
        }
        // Validate individual fields
        if (!fullName || !email || !phone || !city || !address) {
          return ctx.badRequest('For individuals, fullName, email, phone, city, and address are required');
        }
      } else {
        if (!['ERIP', 'paymentAccount'].includes(paymentMethod)) {
          return ctx.badRequest('For organizations, paymentMethod must be ERIP or paymentAccount');
        }
        // Validate organization fields
        if (!organization || !fullName || !UNP || !paymentAccount || !bankAdress || !email || !phone || !city || !address) {
          return ctx.badRequest('For organizations, organization, fullName, UNP, paymentAccount, bankAdress, email, phone, city, and address are required');
        }
      }

      // Validate products structure
      for (const product of products) {
        if (!product.productDocumentId || !product.quantity) {
          return ctx.badRequest('Each product must have productDocumentId and quantity');
        }
        if (product.quantity <= 0) {
          return ctx.badRequest('Product quantity must be greater than 0');
        }
      }

      // Prepare address data
      const addressData = {
        type: type || 'shipping',
        isIndividual,
        fullName,
        email,
        phone,
        city,
        address,
        ...(isIndividual ? {} : {
          organization,
          UNP,
          paymentAccount,
          bankAdress,
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
        skipTelegram: shouldProcessAlphaBank
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
          let emailContent;
          
          // Determine which email template to use
          if (type === 'selfShipping') {
            // Scenario 2: Self-pickup (cash/card on pickup)
            emailContent = formatOrderCreatedEmailSelfPickup(
              orderResult.order.orderNumber,
              orderResult.orderItems,
              orderResult.totalAmount,
              orderResult.subtotal,
              orderResult.discount
            );
          } else {
            // Scenario 1: ERIP or payment account (for organizations or individuals with ERIP)
            emailContent = formatOrderCreatedEmailERIP(
              orderResult.order.orderNumber,
              orderResult.orderItems,
              orderResult.totalAmount,
              orderResult.subtotal,
              orderResult.discount
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

        if (!payments || payments.length === 0) {
          strapi.log.warn(`Payment not found for order: ${orderIdNum} (documentId: ${orderDocumentId})`);
          // Try alternative: search by order id as fallback
          const paymentsById = await strapi.entityService.findMany('api::payment.payment', {
            filters: {
              order: {
                id: orderIdNum,
              },
            },
            populate: ['order'],
            limit: 1,
          });
          
          if (paymentsById && paymentsById.length > 0) {
            strapi.log.info(`Found payment using order id fallback`);
            const payment = paymentsById[0];
            const paymentStatus = status === 'success' ? 'success' : 'declined';
            
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
                const { sendTelegramMessage, formatPaymentSuccessMessage, formatPaymentFailureMessage } = await import('../../../utils/sendTelegramMessage');
                
                if (paymentStatus === 'success') {
                  const formattedMessage = formatPaymentSuccessMessage(updatedOrder, payment);
                  const message = `✅ <b>Платеж подтвержден через кнопку Telegram</b>\n\n${formattedMessage}`;
                  strapi.log.info('Sending success message to Telegram');
                  const result = await sendTelegramMessage(message);
                  if (result) {
                    strapi.log.info('✅ Telegram confirmation message sent successfully');
                  } else {
                    strapi.log.warn('⚠️ Telegram message sending returned false');
                  }
                } else {
                  const formattedMessage = formatPaymentFailureMessage(updatedOrder, payment);
                  const message = `❌ <b>Платеж отклонен через кнопку Telegram</b>\n\n${formattedMessage}`;
                  strapi.log.info('Sending failure message to Telegram');
                  const result = await sendTelegramMessage(message);
                  if (result) {
                    strapi.log.info('✅ Telegram confirmation message sent successfully');
                  } else {
                    strapi.log.warn('⚠️ Telegram message sending returned false');
                  }
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

        // If payment has hashId, use it; otherwise use payment ID
        if (payment.hashId) {
          // Payment service will handle order status update and Telegram notification
          await paymentService.updatePaymentStatus(payment.hashId, paymentStatus);
          
          // Get updated order for confirmation message
          const updatedOrder = await strapi.entityService.findOne('api::order.order', orderIdNum, {
            populate: ['order_items.product', 'address'],
          });
          
          if (updatedOrder) {
            // Send confirmation message to admin chat
            try {
              strapi.log.info('📱 Sending Telegram confirmation message...');
              const { sendTelegramMessage, formatPaymentSuccessMessage, formatPaymentFailureMessage } = await import('../../../utils/sendTelegramMessage');
              
              if (paymentStatus === 'success') {
                const formattedMessage = formatPaymentSuccessMessage(updatedOrder, payment);
                const message = `✅ <b>Платеж подтвержден через кнопку Telegram</b>\n\n${formattedMessage}`;
                strapi.log.info('Sending success message to Telegram');
                const result = await sendTelegramMessage(message);
                if (result) {
                  strapi.log.info('✅ Telegram confirmation message sent successfully');
                } else {
                  strapi.log.warn('⚠️ Telegram message sending returned false');
                }
              } else {
                const formattedMessage = formatPaymentFailureMessage(updatedOrder, payment);
                const message = `❌ <b>Платеж отклонен через кнопку Telegram</b>\n\n${formattedMessage}`;
                strapi.log.info('Sending failure message to Telegram');
                const result = await sendTelegramMessage(message);
                if (result) {
                  strapi.log.info('✅ Telegram confirmation message sent successfully');
                } else {
                  strapi.log.warn('⚠️ Telegram message sending returned false');
                }
              }
            } catch (error: any) {
              strapi.log.error('❌ Failed to send confirmation Telegram notification:', error);
              strapi.log.error('Error stack:', error.stack);
            }
          } else {
            strapi.log.warn('Updated order not found, cannot send Telegram message');
          }
        } else {
          // For payments without hashId, update directly
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
          
          // Restore stock when payment is cancelled/declined (for payments without hashId)
          if (paymentStatus === 'declined') {
            const orderWithItems = orderBeforeUpdate as any;
            await restoreStockForOrder(orderWithItems, orderIdNum, strapi);
          }
          
          // Get order with items for Telegram notification
          const updatedOrder = await strapi.entityService.findOne('api::order.order', orderIdNum, {
            populate: ['order_items.product', 'address'],
          });
          
          if (!updatedOrder) {
            strapi.log.warn(`Order not found after update: ${orderIdNum}`);
            return;
          }

          const orderWithItems = updatedOrder as any;
          
          if (paymentStatus === 'success') {
            // Items are already reserved (stock reduced) when order is created
            // When payment is marked as paid, items are considered sold
            strapi.log.info(`✅ Payment confirmed for order ${orderIdNum} - items were already reserved on order creation`);
          }

          // Send Telegram notification with full order info when marked as paid
          try {
            strapi.log.info('📱 Sending Telegram confirmation message (no hashId)...');
            const { sendTelegramMessage, formatPaymentSuccessMessage, formatPaymentFailureMessage } = await import('../../../utils/sendTelegramMessage');
            
            if (paymentStatus === 'success') {
              // Send confirmation message
              const formattedMessage = formatPaymentSuccessMessage(orderWithItems, payment);
              const message = `✅ <b>Платеж подтвержден через кнопку Telegram</b>\n\n${formattedMessage}`;
              strapi.log.info('Sending success message to Telegram');
              const result = await sendTelegramMessage(message);
              if (result) {
                strapi.log.info('✅ Telegram confirmation message sent successfully');
              } else {
                strapi.log.warn('⚠️ Telegram message sending returned false');
              }
            } else {
              const formattedMessage = formatPaymentFailureMessage(orderWithItems, payment);
              const message = `❌ <b>Платеж отклонен через кнопку Telegram</b>\n\n${formattedMessage}`;
              strapi.log.info('Sending failure message to Telegram');
              const result = await sendTelegramMessage(message);
              if (result) {
                strapi.log.info('✅ Telegram confirmation message sent successfully');
              } else {
                strapi.log.warn('⚠️ Telegram message sending returned false');
              }
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
