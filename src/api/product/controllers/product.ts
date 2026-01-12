/**
 * product controller
 */

import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::product.product', ({ strapi }) => ({
  async find(ctx) {
    // Always use the same populate structure
    ctx.query.populate = {
      batch: true,
      designers: true,
      polishes: true,
      images: true,
      categories: true,
      tags: true,
    };
    
    return await super.find(ctx);
  },
  
  async findOne(ctx) {
    // Always use the same populate structure
    ctx.query.populate = {
      batch: true,
      designers: true,
      polishes: true,
      images: true,
      categories: true,
      tags: true,
    };
    
    // Если передан slug вместо id, ищем по slug
    const { id } = ctx.params;
    if (id && !/^\d+$/.test(id)) {
      // Это не числовой id, значит это slug
      const product = await strapi.db.query('api::product.product').findOne({
        where: { slug: id },
        populate: {
          batch: true,
          designers: true,
          polishes: true,
          images: true,
          categories: true,
          tags: true,
        },
      });
      
      if (!product) {
        return ctx.notFound('Product not found');
      }
      
      return { data: product };
    }
    
    // Иначе используем стандартный поиск по id
    return await super.findOne(ctx);
  },
}));
