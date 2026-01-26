/**
 * search controller for products and categories
 */

export default {
  async search(ctx) {
    try {
      const { query } = ctx.query;
      
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return ctx.badRequest('Search query is required');
      }

      const searchTerm = query.trim();
      
      // Search categories using db.query to get database IDs
      const categories = await strapi.db.query('api::category.category').findMany({
        where: {
          $or: [
            {
              title: {
                $containsi: searchTerm
              }
            }
          ]
        },
        populate: {
          image: true,
          products: {
            where: {
              isHidden: false  // Only visible products
            },
            populate: {
              images: true,
              categories: {
                where: { publishedAt: { $notNull: true } }
              },
              tags: {
                where: { publishedAt: { $notNull: true } }
              },
              batch: {
                where: { publishedAt: { $notNull: true } }
              },
              designers: {
                where: { publishedAt: { $notNull: true } }
              },
              polishes: {
                where: { publishedAt: { $notNull: true } }
              }
            }
          }
        }
      });

      // Search products using db.query to get database IDs (matches get-similar-products approach)
      const products = await strapi.db.query('api::product.product').findMany({
        where: {
          $or: [
            {
              title: {
                $containsi: searchTerm
              }
            },
            {
              material: {
                $containsi: searchTerm
              }
            },
            {
              size: {
                $containsi: searchTerm
              }
            }
          ],
          publishedAt: {
            $notNull: true
          },
          isHidden: false  // Only visible products
        },
        populate: {
          images: true,
          categories: {
            where: { publishedAt: { $notNull: true } }
          },
          tags: {
            where: { publishedAt: { $notNull: true } }
          },
          batch: {
            where: { publishedAt: { $notNull: true } }
          },
          designers: {
            where: { publishedAt: { $notNull: true } }
          },
          polishes: {
            where: { publishedAt: { $notNull: true } }
          }
        }
      });

      // Search tags that match the query
      const tags = await strapi.db.query('api::tag.tag').findMany({
        where: {
          title: {
            $containsi: searchTerm
          }
        },
        populate: {
          products: {
            populate: {
              images: true,
              categories: {
                where: { publishedAt: { $notNull: true } }
              },
              tags: {
                where: { publishedAt: { $notNull: true } }
              },
              batch: {
                where: { publishedAt: { $notNull: true } }
              },
              designers: {
                where: { publishedAt: { $notNull: true } }
              },
              polishes: {
                where: { publishedAt: { $notNull: true } }
              }
            }
          }
        }
      });

      // Get products that have matching tags
      const productsByTags = await strapi.db.query('api::product.product').findMany({
        where: {
          tags: {
            title: {
              $containsi: searchTerm
            }
          },
          publishedAt: {
            $notNull: true
          },
          isHidden: false  // Only visible products
        },
        populate: {
          images: true,
          categories: {
            where: { publishedAt: { $notNull: true } }
          },
          tags: {
            where: { publishedAt: { $notNull: true } }
          },
          batch: {
            where: { publishedAt: { $notNull: true } }
          },
          designers: {
            where: { publishedAt: { $notNull: true } }
          },
          polishes: {
            where: { publishedAt: { $notNull: true } }
          }
        }
      });

      // Combine and deduplicate products
      const allProducts = [...products, ...productsByTags];
      const uniqueProducts = Array.from(
        new Map(allProducts.map(product => [product.id, product])).values()
      );

      return {
        data: {
          categories: categories || [],
          products: uniqueProducts || [],
          tags: tags || [],
          searchTerm,
          totalResults: {
            categories: categories?.length || 0,
            products: uniqueProducts?.length || 0,
            tags: tags?.length || 0
          }
        }
      };
    } catch (error) {
      strapi.log.error('Search error:', error);
      return ctx.internalServerError('An error occurred during search');
    }
  }
};
