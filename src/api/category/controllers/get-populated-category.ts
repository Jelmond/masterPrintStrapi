 export default { 
 async getPopulatedCategory(ctx) {
    console.log('ctx', ctx.params)

    const { id } = ctx.params;

    console.log('id', id)

    const entity = await strapi.db.query('api::category.category').findOne({
      where: { id },
      populate: {
        products: {
          // БЕЗ фильтра isHidden в where - фильтруем на уровне приложения
          populate: ['images', 'preview', 'category', 'tags', 'batch', 'designers', 'polishes']
        }
      }
    });

    console.log('entity', entity);

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