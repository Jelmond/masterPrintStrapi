/**
 * payment router
 */

export default {
  routes: [
    {
      method: 'POST',
      path: '/payments/initiate',
      handler: 'payment.initiatePayment',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/payments/success',
      handler: 'payment.handleSuccess',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/payments/failure',
      handler: 'payment.handleFailure',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/payments/telegram-callback',
      handler: 'payment.handleTelegramCallback',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/payments/setup-telegram-webhook',
      handler: 'payment.setupTelegramWebhook',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
