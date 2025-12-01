/**
 * payment controller
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::payment.payment', ({ strapi }) => ({
  async initiatePayment(ctx) {
    try {
      const { products, address } = ctx.request.body;

      // Validate input
      if (!products || !Array.isArray(products) || products.length === 0) {
        return ctx.badRequest('Products array is required and cannot be empty');
      }

      if (!address) {
        return ctx.badRequest('Address is required');
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

      // Step 1: Create order (this creates order, order items, and address)
      const orderService = strapi.service('api::order.order');
      const orderResult = await orderService.createOrder({ products, address });

      // Step 2: Create payment and get payment link
      const paymentService = strapi.service('api::payment.payment');
      const paymentResult = await paymentService.createPaymentForOrder(orderResult.order.id);

      // Return response to frontend
      return ctx.send({
        success: true,
        hashId: paymentResult.hashId,
        paymentLink: paymentResult.paymentLink,
        orderId: orderResult.order.id,
        orderNumber: orderResult.order.orderNumber,
      });
    } catch (error: any) {
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
      await paymentService.updatePaymentStatus(orderId as string, 'success');

      // Redirect to client success page
      const baseClientUrl = process.env.BASE_CLIENT_URL || 'http://localhost:3000';
      return ctx.redirect(`${baseClientUrl}/payment-success?orderId=${orderId}`);
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
      await paymentService.updatePaymentStatus(orderId as string, 'declined');

      // Redirect to client failure page
      const baseClientUrl = process.env.BASE_CLIENT_URL || 'http://localhost:3000';
      return ctx.redirect(`${baseClientUrl}/payment-failure?orderId=${orderId}`);
    } catch (error: any) {
      strapi.log.error('Payment failure handler error:', error);
      const baseClientUrl = process.env.BASE_CLIENT_URL || 'http://localhost:3000';
      return ctx.redirect(
        `${baseClientUrl}/payment-error?message=${encodeURIComponent(error.message || 'Payment processing error')}`
      );
    }
  },
}));
