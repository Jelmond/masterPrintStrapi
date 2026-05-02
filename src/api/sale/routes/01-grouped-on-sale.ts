export default {
  routes: [
    {
      method: 'GET',
      path: '/grouped-on-sale',
      handler: 'sale.groupedOnSale',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};
