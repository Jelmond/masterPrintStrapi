/**
 * category controller
 */

import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::category.category', ({ strapi }) => ({
  async find(ctx) {
    // Always use the same populate structure
    ctx.query.populate = {
      products: {
        batch: true,
        designers: true,
        polishes: true,
        images: true,
        categories: true,
        tags: true,
      },
    };
    
    return await super.find(ctx);
  },
  
  async findOne(ctx) {
    // Always use the same populate structure
    ctx.query.populate = {
      products: {
        batch: true,
        designers: true,
        polishes: true,
        images: true,
        categories: true,
        tags: true,
      },
    };
    
    return await super.findOne(ctx);
  },
}));
