/**
 * bestsellers controller
 */

export default {
  async find(ctx) {
    try {
      const products = await strapi.db.query('api::product.product').findMany({
        where: {
          isBestseller: true,
          publishedAt: {
            $notNull: true
          }
        },
        populate: {
          images: true,
          categories: true,
          tags: true,
          batch: true,
          designers: true,
          polishes: true
        }
      });

      return { data: products || [] };
    } catch (error) {
      strapi.log.error('Bestsellers error:', error);
      return ctx.internalServerError('An error occurred while fetching bestsellers');
    }
  }
};

