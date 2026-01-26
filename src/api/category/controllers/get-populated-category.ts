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
          populate: ['images', 'category', 'tags', 'batch', 'designers', 'polishes']
        }
      }
    });

    console.log('entity', entity);

    if (!entity) {
      return ctx.notFound('Category not found');
    }

    // Фильтруем скрытые продукты на уровне приложения (гарантированно)
    if (entity.products && Array.isArray(entity.products)) {
      entity.products = entity.products.filter((product: any) => {
        // Скрываем только если явно isHidden: true или isActive: false
        if (product.isHidden === true) {
          return false;
        }
        if (product.isActive === false) {
          return false;
        }
        // Во всех остальных случаях показываем
        return true;
      });
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