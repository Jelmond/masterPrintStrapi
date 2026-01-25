/**
 * category controller
 */

import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::category.category', ({ strapi }) => ({
  async find(ctx) {
    // Use db.query to filter products and their relations by publishedAt
    const categories = await strapi.db.query('api::category.category').findMany({
      where: {
        publishedAt: { $notNull: true }
      },
      populate: {
        image: true,
        products: {
          where: {
            // Products don't have draftAndPublish, so no filter needed
          },
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
          }
        },
      },
    });
    
    return { data: categories, meta: {} };
  },
  
  async findOne(ctx) {
    const { id } = ctx.params;
    
    const category = await strapi.db.query('api::category.category').findOne({
      where: {
        id: typeof id === 'string' ? parseInt(id) : id,
        publishedAt: { $notNull: true }
      },
      populate: {
        image: true,
        products: {
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
          }
        },
      },
    });
    
    if (!category) {
      return ctx.notFound('Category not found');
    }
    
    return { data: category };
  },
}));
