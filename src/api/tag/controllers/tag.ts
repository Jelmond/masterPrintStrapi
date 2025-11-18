/**
 * tag controller
 */

import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::tag.tag', ({ strapi }) => ({
  async find(ctx) {
    // Always use the same populate structure
    ctx.query.populate = {
      products: {
        populate: ['batch', 'designers', 'polishes', 'images', 'categories', 'tags'],
      },
    };
    
    return await super.find(ctx);
  },
  
  async findOne(ctx) {
    // Always use the same populate structure
    ctx.query.populate = {
      products: {
        populate: ['batch', 'designers', 'polishes', 'images', 'categories', 'tags'],
      },
    };
    
    return await super.findOne(ctx);
  },
}));
