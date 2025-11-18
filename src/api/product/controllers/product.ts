/**
 * product controller
 */

import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::product.product', ({ strapi }) => ({
  async find(ctx) {
    // Merge default populates with query populates
    const defaultPopulate = {
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
    
    // Merge populates (query takes precedence for nested fields)
    const mergedPopulate = {
      ...defaultPopulate,
      ...queryPopulate,
    };
    
    ctx.query.populate = mergedPopulate;
    
    return await super.find(ctx);
  },
  
  async findOne(ctx) {
    // Merge default populates with query populates
    const defaultPopulate = {
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
    
    // Merge populates (query takes precedence for nested fields)
    const mergedPopulate = {
      ...defaultPopulate,
      ...queryPopulate,
    };
    
    ctx.query.populate = mergedPopulate;
    
    return await super.findOne(ctx);
  },
}));
