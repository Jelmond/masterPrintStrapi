/**
 * product controller
 * Fixed to filter only published related entities (categories, tags, batch, designers, polishes)
 */

import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::product.product', ({ strapi }) => ({
  async find(ctx) {
    // Use db.query to properly filter published related entities
    const products = await strapi.db.query('api::product.product').findMany({
      populate: {
        batch: {
          where: {
            publishedAt: { $notNull: true }
          }
        },
        designers: {
          where: {
            publishedAt: { $notNull: true }
          }
        },
        polishes: {
          where: {
            publishedAt: { $notNull: true }
          }
        },
        images: true,
        categories: {
          where: {
            publishedAt: { $notNull: true }
          }
        },
        tags: {
          where: {
            publishedAt: { $notNull: true }
          }
        },
      },
    });
    
    return { data: products, meta: {} };
  },
  
  async findOne(ctx) {
    const { id } = ctx.params;
    
    if (!id) {
      return ctx.badRequest('Product ID or slug is required');
    }
    
    // Настраиваем populate для связанных сущностей
    ctx.query.populate = {
      batch: {
        filters: {
          publishedAt: { $notNull: true }
        }
      },
      designers: {
        filters: {
          publishedAt: { $notNull: true }
        }
      },
      polishes: {
        filters: {
          publishedAt: { $notNull: true }
        }
      },
      images: true,
      categories: {
        filters: {
          publishedAt: { $notNull: true }
        }
      },
      tags: {
        filters: {
          publishedAt: { $notNull: true }
        }
      },
    };
    
    // Если передан slug вместо id, ищем по slug через db.query
    const isNumericId = /^\d+$/.test(id.toString());
    
    if (!isNumericId) {
      // Это slug, ищем через db.query
      const product = await strapi.db.query('api::product.product').findOne({
        where: { slug: id.toString() },
        populate: {
          batch: {
            where: {
              publishedAt: { $notNull: true }
            }
          },
          designers: {
            where: {
              publishedAt: { $notNull: true }
            }
          },
          polishes: {
            where: {
              publishedAt: { $notNull: true }
            }
          },
          images: true,
          categories: {
            where: {
              publishedAt: { $notNull: true }
            }
          },
          tags: {
            where: {
              publishedAt: { $notNull: true }
            }
          },
        },
      });
      
      if (!product) {
        return ctx.notFound('Product not found');
      }
      
      return { data: product };
    }
    
    // Иначе используем стандартный поиск по id через super.findOne
    return await super.findOne(ctx);
  },
}));
