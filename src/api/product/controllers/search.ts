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
      
      // Search categories
      const categories = await strapi.entityService.findMany('api::category.category', {
        filters: {
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
            populate: {
              images: true,
              categories: true,
              tags: true
            }
          }
        }
      });

      // Search products
      const products = await strapi.entityService.findMany('api::product.product', {
        filters: {
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
          ]
        },
        populate: {
          images: true,
          categories: true,
          tags: true
        }
      });

      // Search tags that match the query
      const tags = await strapi.entityService.findMany('api::tag.tag', {
        filters: {
          title: {
            $containsi: searchTerm
          }
        },
        populate: {
          products: {
            populate: {
              images: true,
              categories: true
            }
          }
        }
      });

      // Get products that have matching tags
      const productsByTags = await strapi.entityService.findMany('api::product.product', {
        filters: {
          tags: {
            title: {
              $containsi: searchTerm
            }
          }
        },
        populate: {
          images: true,
          categories: true,
          tags: true
        }
      });

      // Combine and deduplicate products
      const allProducts = [...products, ...productsByTags];
      const uniqueProducts = allProducts.filter((product, index, self) => 
        index === self.findIndex(p => p.id === product.id)
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
