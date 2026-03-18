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
            preview: true,
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
    
    // Фильтруем скрытые продукты и дедуплицируем по id (join по manyToMany даёт дубликаты)
    const filteredCategories = categories.map((category: any) => {
      if (category.products && Array.isArray(category.products)) {
        const byId = new Map<number, any>();
        for (const product of category.products) {
          if (product.isHidden === true || product.isActive === false) continue;
          byId.set(product.id, product);
        }
        category.products = Array.from(byId.values());
      }
      return category;
    });
    
    return { data: filteredCategories, meta: {} };
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
            preview: true,
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
    
    if (category.products && Array.isArray(category.products)) {
      const byId = new Map<number, any>();
      for (const product of category.products) {
        if (product.isHidden === true || product.isActive === false) continue;
        byId.set(product.id, product);
      }
      category.products = Array.from(byId.values());
    }
    
    return { data: category };
  },
}));
