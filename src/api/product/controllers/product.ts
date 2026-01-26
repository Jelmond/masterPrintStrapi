/**
 * product controller
 * Fixed to filter only published related entities (categories, tags, batch, designers, polishes)
 */

import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::product.product', ({ strapi }) => ({
  async find(ctx) {
    // Используем db.query для явной фильтрации
    // Сначала получаем фильтры из query string (если есть)
    const userFilters: any = ctx.query.filters || {};
    
    // Строим where условие
    const where: any = {};
    
    // Копируем пользовательские фильтры
    if (userFilters && typeof userFilters === 'object') {
      Object.assign(where, userFilters);
    }
    
    // Пробуем добавить фильтр isHidden, но если колонка не существует, запрос все равно выполнится
    // и мы отфильтруем результаты вручную
    where.isHidden = false;
    
    let products;
    try {
      products = await strapi.db.query('api::product.product').findMany({
        where,
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
    } catch (error: any) {
      // Если ошибка из-за отсутствия колонки isHidden, пробуем без фильтра
      if (error.message && (error.message.includes('isHidden') || error.message.includes('no such column'))) {
        products = await strapi.db.query('api::product.product').findMany({
          where: userFilters,
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
        throw error;
      }
    }
    
    // Фильтруем результаты на уровне приложения (гарантированно скрываем isHidden: true)
    const visibleProducts = products.filter((product: any) => {
      // Если isHidden явно установлен в true - скрываем
      if (product.isHidden === true) {
        return false;
      }
      // Если есть старое поле isActive и оно false - скрываем
      if (product.isActive === false) {
        return false;
      }
      // Во всех остальных случаях (undefined, null, false для isHidden, true для isActive) - показываем
      return true;
    });
    
    return { data: visibleProducts, meta: {} };
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
      // Сначала ищем продукт без фильтра isHidden (на случай, если колонка еще не создана)
      const populateConfig = {
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
      };
      
      // Ищем продукт по slug
      const product = await strapi.db.query('api::product.product').findOne({
        where: { 
          slug: id.toString()
        },
        populate: populateConfig,
      });
      
      if (!product) {
        return ctx.notFound('Product not found');
      }
      
      // Проверяем видимость продукта (поддерживаем оба варианта: isHidden и isActive)
      // isHidden: true = скрыт, isActive: false = скрыт (старая логика)
      const isHidden = (product as any).isHidden === true;
      const isActiveOld = (product as any).isActive === false; // Старое поле: false = скрыт
      
      // Скрываем только если явно установлено isHidden: true или isActive: false
      if (isHidden || isActiveOld) {
        return ctx.notFound('Product not found');
      }
      
      return { data: product };
    }
    
    // Добавляем фильтр isHidden для поиска по id
    if (!ctx.query.filters) {
      ctx.query.filters = {};
    }
    (ctx.query.filters as any).isHidden = { $eq: false };
    
    // Иначе используем стандартный поиск по id через super.findOne
    return await super.findOne(ctx);
  },
}));
