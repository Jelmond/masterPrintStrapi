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
      const categories = await strapi.documents('api::category.category').findMany({
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
              tags: true,
              batch: true,
              designers: true,
              polishes: true
            }
          }
        }
      });

      // Search products
      const products = await strapi.documents('api::product.product').findMany({
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
          tags: true,
          batch: true,
          designers: true,
          polishes: true
        }
      });

      // Search tags that match the query
      const tags = await strapi.documents('api::tag.tag').findMany({
        filters: {
          title: {
            $containsi: searchTerm
          }
        },
        populate: {
          products: {
            populate: {
              images: true,
              categories: true,
              tags: true,
              batch: true,
              designers: true,
              polishes: true
            }
          }
        }
      });

      // Get products that have matching tags
      const productsByTags = await strapi.documents('api::product.product').findMany({
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
          tags: true,
          batch: true,
          designers: true,
          polishes: true
        }
      });

      // Combine and deduplicate products
      const allProducts = [...products, ...productsByTags];
      const uniqueProducts = allProducts.filter((product, index, self) => 
        index === self.findIndex(p => p.documentId === product.documentId)
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
