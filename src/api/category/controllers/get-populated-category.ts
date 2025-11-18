 export default { 
 async getPopulatedCategory(ctx) {
    console.log('ctx', ctx.params)

    const { id } = ctx.params;

    console.log('id', id)

    const entity = await strapi.db.query('api::category.category').findOne({
      where: { id },
      populate: {
        products: {
          populate: ['images', 'category', 'tags', 'batch', 'designers', 'polishes']
        }
      }
    });

    console.log('entity', entity);

    if (!entity) {
      return ctx.notFound('Category not found');
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