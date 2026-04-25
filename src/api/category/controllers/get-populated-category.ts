 export default { 
 async getPopulatedCategory(ctx) {
   const { slug } = ctx.params;

   if (!slug) {
    return ctx.badRequest('Category slug is required');
   }

   const isNumericId = /^\d+$/.test(String(slug));
   const where = isNumericId
    ? { id: typeof slug === 'string' ? parseInt(slug, 10) : slug }
    : { slug: String(slug) };

    const entity = await strapi.db.query('api::category.category').findOne({
      where,
      populate: {
        products: {
          // БЕЗ фильтра isHidden в where - фильтруем на уровне приложения
          populate: ['images', 'preview', 'categories', 'tags', 'batch', 'designers', 'polishes']
        }
      }
    });

    if (!entity) {
      return ctx.notFound('Category not found');
    }

    if (entity.products && Array.isArray(entity.products)) {
      const byId = new Map<number, any>();
      for (const product of entity.products) {
        if (product.isHidden === true || product.isActive === false) continue;
        byId.set(product.id, product);
      }
      entity.products = Array.from(byId.values());
    }

    return entity;
  },
  async custom(ctx) {
    try {
      // Add your custom logic here
      return {
        data: {
          message: 'This is a custom route response'
        }
      };
    } catch (err) {
      ctx.body = err;
    }
  }
 }