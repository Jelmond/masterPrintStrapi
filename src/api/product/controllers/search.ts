/**
 * search controller for products and categories
 * Search by: product title, articul, material, size; category title; tag title
 */

function normalizeSearchTerm(raw: unknown): string {
  const str = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
  const s = String(str).trim();
  // Нормализация: схлопнуть пробелы, Unicode NFC (чтобы "е" и "е" из разных кодировок совпадали)
  return s.replace(/\s+/g, ' ').normalize('NFC');
}

/** Все варианты строки по регистру для независимого от кейса поиска (БД не всегда корректно обрабатывает $containsi). */
function caseVariants(term: string): string[] {
  const lower = term.toLowerCase();
  const upper = term.toUpperCase();
  const variants = [term, lower, upper];
  return [...new Set(variants)];
}

/** Условия для поиска по одному текстовому полю: без учёта регистра (несколько вариантов запроса) + для 1 символа ещё $startsWithi. */
function textMatchConditions(
  field: string,
  searchTerm: string
): Array<Record<string, { $containsi: string } | { $startsWithi: string }>> {
  const conditions: Array<Record<string, { $containsi: string } | { $startsWithi: string }>> = [];
  for (const variant of caseVariants(searchTerm)) {
    conditions.push({ [field]: { $containsi: variant } });
  }
  if (searchTerm.length === 1) {
    for (const variant of caseVariants(searchTerm)) {
      conditions.push({ [field]: { $startsWithi: variant } });
    }
  }
  return conditions;
}

export default {
  async search(ctx) {
    try {
      const rawQuery = ctx.query?.query ?? ctx.query?.q;
      const searchTerm = normalizeSearchTerm(rawQuery);

      if (!searchTerm) {
        return ctx.badRequest('Search query is required');
      }
      
      // Search categories (для 1 буквы — также $startsWithi)
      const categoryOrConditions = textMatchConditions('title', searchTerm);
      const categories = await strapi.db.query('api::category.category').findMany({
        where: {
          $or: categoryOrConditions
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

      // Search products: title, articul, material, size, slug (для 1 буквы — также $startsWithi)
      const productOrConditions = [
        ...textMatchConditions('title', searchTerm),
        ...textMatchConditions('articul', searchTerm),
        ...textMatchConditions('slug', searchTerm),
        ...textMatchConditions('material', searchTerm),
        ...textMatchConditions('size', searchTerm)
      ];
      const products = await strapi.db.query('api::product.product').findMany({
        where: {
          $or: productOrConditions,
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

      // Search tags (всегда через textMatchConditions — без учёта регистра + для 1 буквы $startsWithi)
      const tags = await strapi.db.query('api::tag.tag').findMany({
        where: { $or: textMatchConditions('title', searchTerm) },
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

      // Get products that have matching tags (несколько вариантов по регистру)
      const tagTitleConditions = caseVariants(searchTerm).map((variant) => ({
        tags: { title: { $containsi: variant } }
      }));
      const productsByTags = await strapi.db.query('api::product.product').findMany({
        where: {
          $or: tagTitleConditions,
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
