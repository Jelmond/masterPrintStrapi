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
    
    // Строим where условие (БЕЗ isHidden - фильтруем на уровне приложения)
    const where: any = {};
    
    // Копируем пользовательские фильтры (но исключаем isHidden, если он есть)
    if (userFilters && typeof userFilters === 'object') {
      Object.assign(where, userFilters);
      // Удаляем isHidden из where, так как будем фильтровать вручную
      delete where.isHidden;
    }
    
    // Запрашиваем все продукты (фильтрацию isHidden делаем на уровне приложения)
    const products = await strapi.db.query('api::product.product').findMany({
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
    
    // Общий populate config для связанных сущностей
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
    
    // Если передан slug вместо id, ищем по slug
    const isNumericId = /^\d+$/.test(id.toString());
    let product;
    
    if (!isNumericId) {
      // Это slug, ищем через db.query
      product = await strapi.db.query('api::product.product').findOne({
        where: { 
          slug: id.toString()
        },
        populate: populateConfig,
      });
    } else {
      // Ищем по id через db.query
      const productId = typeof id === 'string' ? parseInt(id) : id;
      product = await strapi.db.query('api::product.product').findOne({
        where: { 
          id: productId
        },
        populate: populateConfig,
      });
    }
    
    if (!product) {
      return ctx.notFound('Product not found');
    }
    
    // Проверяем видимость продукта (поддерживаем оба варианта: isHidden и isActive)
    // isHidden: true = скрыт, isActive: false = скрыт (старая логика)
    const isHidden = (product as any).isHidden === true;
    const isActiveOld = (product as any).isActive === false;
    
    // Скрываем только если явно установлено isHidden: true или isActive: false
    if (isHidden || isActiveOld) {
      return ctx.notFound('Product not found');
    }
    
    return { data: product };
  },
}));
