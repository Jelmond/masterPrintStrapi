/**
 * Отдельный файл: Strapi регистрирует каждый файл в routes/ как отдельный бандл.
 * Путь с 3 сегментами, чтобы не пересекаться с GET /api/sales/:id
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/sales/grouped/products',
      handler: 'sale.groupedOnSale',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};
