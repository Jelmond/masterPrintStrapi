/**
 * search controller for products and categories
 * Search by: product title, articul, material, size; category title; tag title
 *
 * — Регистронезависимо: Strapi $containsi / $startsWithi (LOWER в SQL).
 * — Фразы: запрос режется по пробелам; каждое слово должно матчиться (AND), в любом из полей (OR).
 *   Так «рубашка красная» найдёт заголовок «Красная рубашка».
 * — У продуктов нет фильтра publishedAt (draftAndPublish: false — иначе часть записей отваливается).
 */

const PRODUCT_FIELDS = ['title', 'articul', 'slug', 'material', 'size'] as const;

function normalizeSearchTerm(raw: unknown): string {
  const str = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
  const s = String(str).trim();
  return s.replace(/\s+/g, ' ').normalize('NFC');
}

/** Символы % _ \ ломают SQL LIKE — убираем. */
function safeLikeToken(token: string): string {
  const cleaned = token.replace(/[%_\\]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned;
}

/**
 * Токены для поиска: слова по пробелам, каждое нормализовано.
 */
function tokenizeSearch(term: string): string[] {
  return term
    .split(/\s+/)
    .map((t) => t.normalize('NFC').trim())
    .filter(Boolean)
    .map(safeLikeToken)
    .filter(Boolean);
}

/**
 * Условия OR по одному полю и одному токену: $containsi (+ для артикула вариант без пробелов; для 1 символа ещё $startsWithi).
 */
function tokenMatchOrForField(
  field: (typeof PRODUCT_FIELDS)[number] | 'title',
  token: string
): Array<Record<string, { $containsi: string } | { $startsWithi: string }>> {
  const t = safeLikeToken(token);
  if (!t) return [];

  const out: Array<Record<string, { $containsi: string } | { $startsWithi: string }>> = [
    { [field]: { $containsi: t } },
  ];

  if (field === 'articul') {
    const compact = t.replace(/\s/g, '');
    if (compact && compact !== t) {
      out.push({ articul: { $containsi: compact } });
    }
  }

  if (t.length === 1) {
    out.push({ [field]: { $startsWithi: t } });
  }

  return out;
}

function productWhereFromTokens(tokens: string[]): Record<string, unknown> {
  return {
    $and: tokens.map((token) => ({
      $or: PRODUCT_FIELDS.flatMap((field) => tokenMatchOrForField(field, token)),
    })),
    isHidden: false,
  };
}

function categoryWhereFromTokens(tokens: string[]): Record<string, unknown> {
  return {
    $and: tokens.map((token) => ({
      $or: tokenMatchOrForField('title', token),
    })),
  };
}

function tagWhereFromTokens(tokens: string[]): Record<string, unknown> {
  return {
    $and: tokens.map((token) => ({
      $or: tokenMatchOrForField('title', token),
    })),
  };
}

function productsByTagsWhereFromTokens(tokens: string[]): Record<string, unknown> {
  return {
    $and: tokens.map((token) => {
      const t = safeLikeToken(token);
      const or: Array<Record<string, unknown>> = [{ tags: { title: { $containsi: t } } }];
      if (t.length === 1) {
        or.push({ tags: { title: { $startsWithi: t } } });
      }
      return { $or: or };
    }),
    isHidden: false,
  };
}

const productPopulate = {
  images: true,
  preview: true,
  categories: {
    where: { publishedAt: { $notNull: true } },
  },
  tags: {
    where: { publishedAt: { $notNull: true } },
  },
  batch: {
    where: { publishedAt: { $notNull: true } },
  },
  designers: {
    where: { publishedAt: { $notNull: true } },
  },
  polishes: {
    where: { publishedAt: { $notNull: true } },
  },
} as const;

export default {
  async search(ctx) {
    try {
      const rawQuery = ctx.query?.query ?? ctx.query?.q;
      const searchTerm = normalizeSearchTerm(rawQuery);
      const tokens = tokenizeSearch(searchTerm);

      if (!searchTerm || tokens.length === 0) {
        return ctx.badRequest('Search query is required');
      }

      const categories = await strapi.db.query('api::category.category').findMany({
        where: categoryWhereFromTokens(tokens),
        populate: {
          image: true,
          products: {
            where: {
              isHidden: false,
            },
            populate: {
              images: true,
              preview: true,
              categories: {
                where: { publishedAt: { $notNull: true } },
              },
              tags: {
                where: { publishedAt: { $notNull: true } },
              },
              batch: {
                where: { publishedAt: { $notNull: true } },
              },
              designers: {
                where: { publishedAt: { $notNull: true } },
              },
              polishes: {
                where: { publishedAt: { $notNull: true } },
              },
            },
          },
        },
      });

      const products = await strapi.db.query('api::product.product').findMany({
        where: productWhereFromTokens(tokens),
        populate: productPopulate,
      });

      const tags = await strapi.db.query('api::tag.tag').findMany({
        where: tagWhereFromTokens(tokens),
        populate: {
          products: {
            populate: {
              images: true,
              preview: true,
              categories: {
                where: { publishedAt: { $notNull: true } },
              },
              tags: {
                where: { publishedAt: { $notNull: true } },
              },
              batch: {
                where: { publishedAt: { $notNull: true } },
              },
              designers: {
                where: { publishedAt: { $notNull: true } },
              },
              polishes: {
                where: { publishedAt: { $notNull: true } },
              },
            },
          },
        },
      });

      const productsByTags = await strapi.db.query('api::product.product').findMany({
        where: productsByTagsWhereFromTokens(tokens),
        populate: productPopulate,
      });

      const allProducts = [...products, ...productsByTags];
      const uniqueProducts = Array.from(new Map(allProducts.map((product) => [product.id, product])).values());

      return {
        data: {
          categories: categories || [],
          products: uniqueProducts || [],
          tags: tags || [],
          searchTerm,
          totalResults: {
            categories: categories?.length || 0,
            products: uniqueProducts?.length || 0,
            tags: tags?.length || 0,
          },
        },
      };
    } catch (error) {
      strapi.log.error('Search error:', error);
      return ctx.internalServerError('An error occurred during search');
    }
  },
};
