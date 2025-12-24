/**
 * payment controller
 */

import { factories } from '@strapi/strapi';
import { sendEmail, formatOrderCreatedEmailERIP, formatOrderCreatedEmailSelfPickup } from '../../../utils/sendEmail';

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
      const orderResult = await orderService.createOrder({ 
        products, 
        address: addressData,
        comment 
      });

      strapi.log.info(`Order created with ID: ${orderResult.order.id}, order number: ${orderResult.order.orderNumber}`);

      // Step 2: Check if we need to process AlphaBank payment
      const shouldProcessAlphaBank = paymentMethod === 'card' && isIndividual;

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
}));
