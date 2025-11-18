/**
 * tag controller
 */

import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::tag.tag', ({ strapi }) => ({
  async find(ctx) {
    // Merge default populates for products with query populates
    const defaultProductPopulate = {
      batch: true,
      designers: true,
      polishes: true,
      images: true,
      categories: true,
      tags: true,
    };
    
    // Parse existing populate from query or use default
    const queryPopulate = ctx.query.populate 
      ? (typeof ctx.query.populate === 'string' 
          ? JSON.parse(ctx.query.populate) 
          : ctx.query.populate)
      : {};
    
    // If products are being populated, merge default product populates
    if (queryPopulate.products || !ctx.query.populate) {
      const mergedPopulate = {
        ...queryPopulate,
        products: {
          ...defaultProductPopulate,
          ...(typeof queryPopulate.products === 'object' ? queryPopulate.products : {}),
        },
      };
      ctx.query.populate = mergedPopulate;
    } else {
      ctx.query.populate = queryPopulate;
    }
    
    return await super.find(ctx);
  },
  
  async findOne(ctx) {
    // Merge default populates for products with query populates
    const defaultProductPopulate = {
      batch: true,
      designers: true,
      polishes: true,
      images: true,
      categories: true,
      tags: true,
    };
    
    // Parse existing populate from query or use default
    const queryPopulate = ctx.query.populate 
      ? (typeof ctx.query.populate === 'string' 
          ? JSON.parse(ctx.query.populate) 
          : ctx.query.populate)
      : {};
    
    // If products are being populated, merge default product populates
    if (queryPopulate.products || !ctx.query.populate) {
      const mergedPopulate = {
        ...queryPopulate,
        products: {
          ...defaultProductPopulate,
          ...(typeof queryPopulate.products === 'object' ? queryPopulate.products : {}),
        },
      };
      ctx.query.populate = mergedPopulate;
    } else {
      ctx.query.populate = queryPopulate;
    }
    
    return await super.findOne(ctx);
  },
}));
