/**
 * category controller
 */

import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::category.category', ({ strapi }) => ({
  async find(ctx) {
    // Use db.query to filter products and their relations by publishedAt
    let categories;
    
    try {
      categories = await strapi.db.query('api::category.category').findMany({
        where: {
          publishedAt: { $notNull: true }
        },
        populate: {
          image: true,
          products: {
            where: {
              isHidden: false  // Only visible products
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
    } catch (error: any) {
      // Если ошибка из-за отсутствия колонки isHidden, пробуем без фильтра
      if (error.message && (error.message.includes('isHidden') || error.message.includes('no such column'))) {
        categories = await strapi.db.query('api::category.category').findMany({
          where: {
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
      } else {
        throw error;
      }
    }
    
    // Фильтруем скрытые продукты на уровне приложения
    const filteredCategories = categories.map((category: any) => {
      if (category.products && Array.isArray(category.products)) {
        category.products = category.products.filter((product: any) => {
          // Скрываем только если явно isHidden: true или isActive: false
          if (product.isHidden === true) {
            return false;
          }
          if (product.isActive === false) {
            return false;
          }
          // Во всех остальных случаях показываем
          return true;
        });
      }
      return category;
    });
    
    return { data: filteredCategories, meta: {} };
  },
  
  async findOne(ctx) {
    const { id } = ctx.params;
    
    let category;
    
    try {
      category = await strapi.db.query('api::category.category').findOne({
        where: {
          id: typeof id === 'string' ? parseInt(id) : id,
          publishedAt: { $notNull: true }
        },
        populate: {
          image: true,
          products: {
            where: {
              isHidden: false  // Only visible products
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
    } catch (error: any) {
      // Если ошибка из-за отсутствия колонки isHidden, пробуем без фильтра
      if (error.message && (error.message.includes('isHidden') || error.message.includes('no such column'))) {
        category = await strapi.db.query('api::category.category').findOne({
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
      } else {
        throw error;
      }
    }
    
    if (!category) {
      return ctx.notFound('Category not found');
    }
    
    // Фильтруем скрытые продукты на уровне приложения
    if (category.products && Array.isArray(category.products)) {
      category.products = category.products.filter((product: any) => {
        // Скрываем только если явно isHidden: true или isActive: false
        if (product.isHidden === true) {
          return false;
        }
        if (product.isActive === false) {
          return false;
        }
        // Во всех остальных случаях показываем
        return true;
      });
    }
    
    return { data: category };
  },
}));
