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
    // Если передан slug вместо id, ищем по slug
    const { id } = ctx.params;
    const productId = id && !/^\d+$/.test(id) ? null : (typeof id === 'string' ? parseInt(id) : id);
    
    let product;
    
    if (id && !/^\d+$/.test(id)) {
      // Это не числовой id, значит это slug
      product = await strapi.db.query('api::product.product').findOne({
        where: { slug: id },
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
    } else {
      // Ищем по id
      product = await strapi.db.query('api::product.product').findOne({
        where: { id: productId },
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
    }
    
    if (!product) {
      return ctx.notFound('Product not found');
    }
    
    return { data: product };
  },
}));
