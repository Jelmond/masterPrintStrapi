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
        orderStatus = 'processing';
      } else if (status === 'declined') {
        orderStatus = 'canceled';
      } else if (status === 'refunded') {
        orderStatus = 'refunded';
      }

      const updatedOrder = await strapi.entityService.findOne('api::order.order', orderId, {
        populate: ['order_items.product', 'address'],
      });

      if (updatedOrder) {
        await strapi.entityService.update('api::order.order', orderId, {
          data: {
            orderStatus,
          },
        });

        // Send Telegram notification based on payment status
        try {
          if (status === 'success') {
            const message = formatPaymentSuccessMessage(updatedOrder, updatedPayment);
            await sendTelegramMessage(message);
          } else if (status === 'declined') {
            const message = formatPaymentFailureMessage(updatedOrder, updatedPayment);
            await sendTelegramMessage(message);
          }
        } catch (error: any) {
          // Don't fail payment update if Telegram fails
          strapi.log.warn('Failed to send Telegram notification for payment status update:', error.message);
        }
      }
    }

    return updatedPayment;
  },
}));
