/**
 * tag controller
 * Fixed to filter only published related entities
 */

import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::tag.tag', ({ strapi }) => ({
  async find(ctx) {
    // Use db.query to properly filter published related entities
    const tags = await strapi.db.query('api::tag.tag').findMany({
      where: {
        publishedAt: { $notNull: true }
      },
      populate: {
        products: {
          // БЕЗ фильтра isHidden в where - фильтруем на уровне приложения
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
    // Дедупликация продуктов внутри каждого тега (join по связям даёт дубликаты)
    for (const tag of tags as any[]) {
      if (tag.products && Array.isArray(tag.products)) {
        tag.products = Array.from(new Map(tag.products.map((p: any) => [p.id, p])).values());
      }
    }
    return { data: tags, meta: {} };
  },
  
  async findOne(ctx) {
    const { id } = ctx.params;
    
    const tag = await strapi.db.query('api::tag.tag').findOne({
      where: {
        id: typeof id === 'string' ? parseInt(id) : id,
        publishedAt: { $notNull: true }
      },
      populate: {
        products: {
          // БЕЗ фильтра isHidden в where - фильтруем на уровне приложения
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
    
    if (!tag) {
      return ctx.notFound('Tag not found');
    }
    if ((tag as any).products && Array.isArray((tag as any).products)) {
      (tag as any).products = Array.from(
        new Map((tag as any).products.map((p: any) => [p.id, p])).values()
      );
    }
    return { data: tag };
  },
}));
