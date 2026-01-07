/**
 * payment service
 */

import { factories } from '@strapi/strapi';
import { getPaymentLink } from '../../../utils/processAlfaBankPayment';
import {
  sendTelegramMessage,
  formatPaymentSuccessMessage,
  formatPaymentFailureMessage,
} from '../../../utils/sendTelegramMessage';
import { sendEmail, formatOrderPaidEmailAlphaBank } from '../../../utils/sendEmail';

export default factories.createCoreService('api::payment.payment', ({ strapi }) => ({
  async createPaymentForOrder(orderId: number, paymentMethod: string, shouldProcessAlphaBank: boolean = false) {
    // Ensure orderId is valid
    if (!orderId || isNaN(orderId)) {
      throw new Error(`Invalid order ID: ${orderId}`);
    }

    strapi.log.info(`Creating payment for order ID: ${orderId}, payment method: ${paymentMethod}, shouldProcessAlphaBank: ${shouldProcessAlphaBank}`);

    // Fetch order with populated data
    const order = await strapi.entityService.findOne('api::order.order', orderId, {
      populate: ['order_items', 'address'],
    });

    if (!order) {
      strapi.log.error(`Order with ID ${orderId} not found in database`);
      throw new Error(`Order with ID ${orderId} not found`);
    }

    strapi.log.info(`Order found: ${JSON.stringify({ id: order.id, orderNumber: order.orderNumber })}`);

    // Get the actual order ID and documentId from the fetched order
    const actualOrderId = typeof order.id === 'string' ? parseInt(order.id) : order.id;
    const orderDocumentId = order.documentId;

    strapi.log.info(`Order details - ID: ${actualOrderId}, DocumentID: ${orderDocumentId}`);

    // Check if payment already exists (oneToOne relation means only one payment per order)
    // Use documentId if available, otherwise use id
    const orderIdentifier = orderDocumentId || actualOrderId;
    strapi.log.info(`Checking for existing payment with order identifier: ${orderIdentifier}`);
    
    const existingPayments = await strapi.entityService.findMany('api::payment.payment', {
      filters: {
        order: {
          [orderDocumentId ? 'documentId' : 'id']: orderIdentifier,
        },
      },
      limit: 1,
    });

    // If payment already exists, return it or throw error
    if (existingPayments && existingPayments.length > 0) {
      const payment = existingPayments[0] as any;
      
      strapi.log.info(`Payment already exists for order ${orderId}, returning existing payment`);
      
      // If payment exists and we need AlphaBank processing
      if (shouldProcessAlphaBank) {
        // If payment has a hashId and is pending, return the existing payment link
        if (payment.hashId && payment.paymentStatus === 'pending') {
          const orderIdNumber = typeof order.id === 'string' ? parseInt(order.id) : order.id;
          const paymentLinkResponse = await getPaymentLink(
            { description: `Order #${order.orderNumber}` },
            { id: orderIdNumber, price: parseFloat(order.totalAmount.toString()) }
          );
          return {
            payment,
            paymentLink: paymentLinkResponse.formUrl,
            hashId: payment.hashId,
          };
        }
      }
      
      // Payment already exists, return it without creating a new one
      const result: any = {
        payment,
      };
      
      if (payment.hashId && payment.paymentLink) {
        result.paymentLink = payment.paymentLink;
        result.hashId = payment.hashId;
      }
      
      return result;
    }

    // In Strapi v5, relations use documentId (string) not numeric id
    if (!orderDocumentId) {
      throw new Error(`Order documentId is missing for order ${orderId}`);
    }

    strapi.log.info(`Using order relation DocumentID: ${orderDocumentId} (type: ${typeof orderDocumentId})`);

    let paymentData: any = {
      paymentMethod: paymentMethod,
      amount: order.totalAmount,
      paymentStatus: 'pending',
      paymentDate: null,
      refundDate: null,
      order: orderDocumentId,  // Use documentId for Strapi v5 relations
    };

    let paymentLinkResponse: any = null;

    // Only process AlphaBank payment if shouldProcessAlphaBank is true (card payment for individual)
    if (shouldProcessAlphaBank) {
      // Get payment link from Alfa Bank
      const orderIdNumber = typeof order.id === 'string' ? parseInt(order.id) : order.id;
      paymentLinkResponse = await getPaymentLink(
        { description: `Order #${order.orderNumber}` },
        { id: orderIdNumber, price: parseFloat(order.totalAmount.toString()) }
      );

      paymentData.hashId = paymentLinkResponse.orderId;

      // Update order with hashId (use the original orderId passed to the function)
      strapi.log.info(`Updating order ${orderId} with hashId: ${paymentLinkResponse.orderId}`);
      await strapi.entityService.update('api::order.order', orderId, {
        data: {
          hashId: paymentLinkResponse.orderId,
        },
      });
    } else {
      // For non-card payments or organization payments, no hashId is needed
      paymentData.hashId = null;
    }

    // Create payment record
    strapi.log.info(`Creating payment with data: ${JSON.stringify(paymentData)}`);
    
    let payment;
    try {
      payment = await strapi.entityService.create('api::payment.payment', {
        data: paymentData,
      });
      
      strapi.log.info(`Payment created successfully with ID: ${payment.id}`);
    } catch (error: any) {
      strapi.log.error(`Failed to create payment: ${error.message}`);
      strapi.log.error(`Error details: ${JSON.stringify(error)}`);
      throw new Error(`Failed to create payment for order ${orderId}: ${error.message}`);
    }

    const result: any = {
      payment,
    };

    // Only include payment link and hashId if AlphaBank was processed
    if (shouldProcessAlphaBank && paymentLinkResponse) {
      result.paymentLink = paymentLinkResponse.formUrl;
      result.hashId = paymentLinkResponse.orderId;
    }

    return result;
  },

  async updatePaymentStatus(hashId: string, status: 'pending' | 'declined' | 'success' | 'refunded') {
    const payments = await strapi.entityService.findMany('api::payment.payment', {
      filters: {
        hashId,
      },
      populate: ['order'],
      limit: 1,
    });

    if (!payments || payments.length === 0) {
      throw new Error(`Payment with hashId ${hashId} not found`);
    }

    const payment = payments[0] as any;
    const updateData: any = {
      paymentStatus: status,
    };

    if (status === 'success') {
      updateData.paymentDate = new Date();
    } else if (status === 'refunded') {
      updateData.refundDate = new Date();
    }

    const updatedPayment = await strapi.entityService.update('api::payment.payment', payment.id, {
      data: updateData,
    });

    // Update order status based on payment status
    if (payment.order) {
      const orderId = typeof payment.order === 'object' ? payment.order.id : payment.order;
      let orderStatus: 'pending' | 'processing' | 'canceled' | 'refunded' | 'success' = 'pending';

      if (status === 'success') {
        orderStatus = 'success';
      } else if (status === 'declined') {
        orderStatus = 'canceled';
      } else if (status === 'refunded') {
        orderStatus = 'refunded';
      }

      const updatedOrder = await strapi.entityService.findOne('api::order.order', orderId, {
        populate: {
          order_items: {
            populate: ['product'],
          },
          address: true,
        },
      });

      if (updatedOrder) {
        await strapi.entityService.update('api::order.order', orderId, {
          data: {
            orderStatus,
          },
        });

        // Restore stock when payment is declined/cancelled
        if (status === 'declined') {
          try {
            const orderWithItems = updatedOrder as any;
            strapi.log.info(`\n📦 RESTORING STOCK FOR CANCELLED ORDER ${orderId}:`);
            strapi.log.info('-'.repeat(80));
            
            if (!orderWithItems.order_items || orderWithItems.order_items.length === 0) {
              strapi.log.warn(`No order items found for order ${orderId}`);
            } else {
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
            }
          } catch (error: any) {
            strapi.log.error('Failed to restore stock:', error);
            strapi.log.error('Error stack:', error.stack);
          }
        }

        // Send Telegram notification based on payment status
        try {
          if (status === 'success') {
            // For AlphaBank payments, send full order information to Telegram
            if (updatedPayment.hashId) {
              // This is an AlphaBank payment - send full order details with payment buttons
              const { formatOrderMessage, sendTelegramMessage } = await import('../../../utils/sendTelegramMessage');
              
              // Get order items for the message
              const orderWithItems = updatedOrder as any;
              const orderItems = orderWithItems.order_items || [];
              
              // Calculate shipping and discount from order
              const shippingCost = orderWithItems.totalAmount && orderWithItems.subtotal 
                ? (orderWithItems.totalAmount > orderWithItems.subtotal ? orderWithItems.totalAmount - orderWithItems.subtotal : 0)
                : 0;
              const discount = orderWithItems.subtotal && orderWithItems.totalAmount
                ? (orderWithItems.subtotal - (orderWithItems.totalAmount - (shippingCost > 0 ? shippingCost : 0)))
                : 0;
              
              const message = formatOrderMessage(
                orderWithItems, 
                orderItems, 
                shippingCost,
                discount
              );
              
              // Add payment success info
              const paymentInfo = `\n\n<b>✅ Платеж успешно выполнен</b>\n<b>Сумма:</b> ${updatedPayment.amount} BYN\n<b>Способ оплаты:</b> ${updatedPayment.paymentMethod === 'card' ? 'Карта (AlphaBank)' : updatedPayment.paymentMethod}`;
              
              // Add buttons for payment status (already paid, but buttons for reference)
              const replyMarkup = {
                inline_keyboard: [
                  [
                    { text: '✅ Оплачен', callback_data: `payment_success_${orderWithItems.id}` },
                    { text: '❌ Не оплачен', callback_data: `payment_declined_${orderWithItems.id}` }
                  ]
                ]
              };
              
              await sendTelegramMessage(message + paymentInfo, { replyMarkup });
            } else {
              // Regular payment success notification
              const message = formatPaymentSuccessMessage(updatedOrder, updatedPayment);
              await sendTelegramMessage(message);
            }
          } else if (status === 'declined') {
            const message = formatPaymentFailureMessage(updatedOrder, updatedPayment);
            await sendTelegramMessage(message);
          }
        } catch (error: any) {
          // Don't fail payment update if Telegram fails
          strapi.log.warn('Failed to send Telegram notification for payment status update:', error.message);
        }

        // Send email notification for successful AlphaBank payment (Scenario 3)
        if (status === 'success' && updatedPayment.hashId) {
          try {
            const orderWithAddress = updatedOrder as any;
            const userEmail = orderWithAddress.address?.email;
            if (userEmail) {
              // Get order items for email
              const orderItems = orderWithAddress.order_items || [];
              // Calculate subtotal from order items
              const subtotal = orderItems.reduce((sum: number, item: any) => sum + (item.totalPrice || 0), 0);
              const emailContent = formatOrderPaidEmailAlphaBank(
                orderWithAddress.orderNumber,
                orderItems,
                orderWithAddress.totalAmount,
                subtotal,
                0 // Discount already applied in order creation
              );

              await sendEmail({
                to: userEmail,
                subject: emailContent.subject,
                html: emailContent.html,
              });
              strapi.log.info(`Email sent successfully to ${userEmail} for order ${orderWithAddress.orderNumber}`);
            }
          } catch (error: any) {
            // Don't fail payment update if email fails
            strapi.log.warn('Failed to send email notification for payment success:', error.message);
          }
        }
      }
    }

    return updatedPayment;
  },
}));
