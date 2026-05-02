/**
 * sales-page controller — Single Type с repeatable-компонентом sale (внутри relation на Sale).
 */

import { factories } from '@strapi/strapi';

const fullPopulate = {
  sale: {
    populate: {
      sale: true,
    },
  },
} as const;

export default factories.createCoreController('api::sales-page.sales-page', ({ strapi }) => ({
  /**
   * Всё содержимое SalesPage с вложенными sale → api::sale.sale.
   * GET /api/sales-page/full
   * Опционально: ?status=draft — черновик; по умолчанию опубликованная версия.
   */
  async full(ctx) {
    try {
      const wantDraft =
        ctx.query?.status === 'draft' || ctx.query?.publicationState === 'preview';

      let entity = await strapi.db.query('api::sales-page.sales-page').findOne(
        wantDraft
          ? { populate: fullPopulate }
          : {
              where: { publishedAt: { $notNull: true } },
              populate: fullPopulate,
            }
      );

      if (!entity) {
        return ctx.notFound('Sales page not found');
      }

      return { data: entity };
    } catch (error) {
      strapi.log.error('sales-page full error:', error);
      return ctx.internalServerError('An error occurred while fetching the sales page');
    }
  },
}));
