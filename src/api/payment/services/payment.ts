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
  async createPaymentForOrder(orderId: number) {
    // Fetch order with populated data
    const order = await strapi.entityService.findOne('api::order.order', orderId, {
      populate: ['order_items', 'address'],
    });

    if (!order) {
      throw new Error(`Order with ID ${orderId} not found`);
    }

    // Check if payment already exists
    const existingPayment = await strapi.entityService.findMany('api::payment.payment', {
      filters: {
        order: {
          id: orderId,
        },
      },
      limit: 1,
    });

    if (existingPayment && existingPayment.length > 0) {
      const payment = existingPayment[0];
      if (payment.hashId && payment.paymentStatus === 'pending') {
        // Return existing payment link
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

    // Get payment link from Alfa Bank
    const orderIdNumber = typeof order.id === 'string' ? parseInt(order.id) : order.id;
    const paymentLinkResponse = await getPaymentLink(
      { description: `Order #${order.orderNumber}` },
      { id: orderIdNumber, price: parseFloat(order.totalAmount.toString()) }
    );

    // Create payment record
    const payment = await strapi.entityService.create('api::payment.payment', {
      data: {
        paymentMethod: 'card', // Default to card, can be changed
        amount: order.totalAmount,
        paymentStatus: 'pending',
        hashId: paymentLinkResponse.orderId,
        paymentDate: null, // Will be set when payment is completed
        refundDate: null,
        order: orderId,
      },
    });

    // Update order with hashId
    await strapi.entityService.update('api::order.order', orderId, {
      data: {
        hashId: paymentLinkResponse.orderId,
      },
    });

    return {
      payment,
      paymentLink: paymentLinkResponse.formUrl,
      hashId: paymentLinkResponse.orderId,
    };
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
