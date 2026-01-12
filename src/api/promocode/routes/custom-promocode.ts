/**
 * custom promocode routes
 */

export default {
  routes: [
    {
      method: 'POST',
      path: '/promocodes/validate',
      handler: 'validate-promocode.validatePromocode',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};

