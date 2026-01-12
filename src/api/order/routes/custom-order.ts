/**
 * custom order routes
 */

export default {
  routes: [
    {
      method: 'POST',
      path: '/orders/calculate-price',
      handler: 'calculate-price.calculatePrice',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};

