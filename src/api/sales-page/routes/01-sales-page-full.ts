/**
 * Отдельный файл: Strapi регистрирует каждый файл в routes/ как отдельный бандл.
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/sales-page/full',
      handler: 'sales-page.full',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};
