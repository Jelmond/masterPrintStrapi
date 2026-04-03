/**
 * Поиск: продукты (title, articul, slug, material, size), категории, теги.
 *
 * Поведение:
 * — Регистр: $containsi / $startsWithi (LOWER в SQL).
 * — Несколько слов: (а) целая фраза как подстрока в любом из полей ИЛИ (б) каждое слово встречается где-то (AND по словам, OR по полям).
 *   Пример: «красная рубашка» найдёт и заголовок с подстрокой «красная рубашка», и «Рубашка … красная».
 * — Токены: пробелы, запятая, точка с запятой, дефисы/тире (часто в артикулах и названиях).
 * — Товары по тегам: без $and по relation в одном запросе (у Strapi это ненадёжно) — отдельные выборки по каждому слову + пересечение id; плюс отдельно фраза в названии тега.
 * — У продуктов только isHidden: false (без publishedAt).
 * — В populate убраны фильтры publishedAt у связей — у batch/category/tag draftAndPublish: false, фильтр мог обнулять связи на части БД.
 *
 * Отладка: GET …/search?q=...&debugSearch=1 — в ответе data.searchDebug (только при debugSearch=1).
 */

const PRODUCT_FIELDS = ['title', 'articul', 'slug', 'material', 'size'] as const;

function normalizeSearchTerm(raw: unknown): string {
  const str = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
  const s = String(str).trim();
  return s.replace(/\s+/g, ' ').normalize('NFC');
}

/** Символы % _ \ ломают SQL LIKE. */
function safeLikeToken(token: string): string {
  return token.replace(/[%_\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Слова запроса: пробелы, запятые, точки с запятой, слэши, плюсы, дефисы и типографские тире.
 */
function tokenizeSearch(term: string): string[] {
  return term
    .split(/[\s\u00A0,;|/\\+–—\-]+/u)
    .map((t) => t.normalize('NFC').trim())
    .filter(Boolean)
    .map(safeLikeToken)
    .filter(Boolean);
}

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

function hiddenFilter() {
  return { isHidden: false };
}

/** Одно слово / одно «слово» после сплита — только AND по токенам (часто один элемент). */
function buildProductWhereSingleToken(tokens: string[]): Record<string, unknown> {
  return {
    $and: [...tokens.map((token) => ({ $or: PRODUCT_FIELDS.flatMap((f) => tokenMatchOrForField(f, token)) })), hiddenFilter()],
  };
}

/**
 * Несколько токенов: фраза целиком (подстрока) ИЛИ все токены по отдельности (AND).
 */
function buildProductWhereMultiToken(searchTerm: string, tokens: string[]): Record<string, unknown> {
  const phrase = safeLikeToken(searchTerm);
  const phraseOr =
    phrase.length > 0 ? PRODUCT_FIELDS.flatMap((f) => tokenMatchOrForField(f, phrase)) : [];

  const tokenAnd = tokens.map((token) => ({
    $or: PRODUCT_FIELDS.flatMap((f) => tokenMatchOrForField(f, token)),
  }));

  if (!phraseOr.length) {
    return { $and: [...tokenAnd, hiddenFilter()] };
  }

  return {
    $or: [{ $and: [{ $or: phraseOr }, hiddenFilter()] }, { $and: [...tokenAnd, hiddenFilter()] }],
  };
}

function buildProductWhere(searchTerm: string, tokens: string[]): Record<string, unknown> {
  if (tokens.length <= 1) {
    return buildProductWhereSingleToken(tokens);
  }
  return buildProductWhereMultiToken(searchTerm, tokens);
}

function buildCategoryWhere(searchTerm: string, tokens: string[]): Record<string, unknown> {
  if (tokens.length <= 1) {
    return {
      $and: tokens.map((token) => ({ $or: tokenMatchOrForField('title', token) })),
    };
  }
  const phrase = safeLikeToken(searchTerm);
  const phraseOr = phrase ? tokenMatchOrForField('title', phrase) : [];
  const tokenAnd = tokens.map((token) => ({ $or: tokenMatchOrForField('title', token) }));
  if (!phraseOr.length) {
    return { $and: tokenAnd };
  }
  return {
    $or: [{ $and: [{ $or: phraseOr }] }, { $and: tokenAnd }],
  };
}

function buildTagWhere(searchTerm: string, tokens: string[]): Record<string, unknown> {
  return buildCategoryWhere(searchTerm, tokens);
}

/** id продуктов, у которых по каждому токену есть хотя бы один тег с таким подстрочным совпадением в title. */
async function productIdsMatchingAllTagTokens(tokens: string[]): Promise<number[]> {
  const effective = tokens.map(safeLikeToken).filter(Boolean);
  if (effective.length === 0) return [];

  const sets: Set<number>[] = [];
  for (const t of effective) {
    const rows = await strapi.db.query('api::product.product').findMany({
      where: {
        ...hiddenFilter(),
        tags: { title: { $containsi: t } },
      },
      select: ['id'],
    });
    sets.push(new Set(rows.map((r: { id: number }) => r.id)));
  }

  if (sets.length === 0) return [];

  let acc = sets[0]!;
  for (let i = 1; i < sets.length; i++) {
    const next = sets[i]!;
    acc = new Set([...acc].filter((id) => next.has(id)));
  }
  return [...acc];
}

/** Продукты, у которых один тег содержит всю фразу (подстрока в title тега). */
async function productIdsMatchingTagPhrase(phrase: string): Promise<number[]> {
  const p = safeLikeToken(phrase);
  if (!p) return [];

  const rows = await strapi.db.query('api::product.product').findMany({
    where: {
      ...hiddenFilter(),
      tags: { title: { $containsi: p } },
    },
    select: ['id'],
  });
  return rows.map((r: { id: number }) => r.id);
}

const productPopulate = {
  images: true,
  preview: true,
  categories: true,
  tags: true,
  batch: true,
  designers: true,
  polishes: true,
} as const;

export default {
  async search(ctx) {
    const t0 = Date.now();
    try {
      const rawQuery = ctx.query?.query ?? ctx.query?.q;
      const searchTerm = normalizeSearchTerm(rawQuery);
      const tokens = tokenizeSearch(searchTerm);
      const debug = ctx.query?.debugSearch === '1' || ctx.query?.debugSearch === 'true';

      if (!searchTerm || tokens.length === 0) {
        return ctx.badRequest('Search query is required');
      }

      const productWhere = buildProductWhere(searchTerm, tokens);
      const categoryWhere = buildCategoryWhere(searchTerm, tokens);
      const tagWhere = buildTagWhere(searchTerm, tokens);

      const [categories, products, tags, tagIdsByTokens, tagIdsByPhrase] = await Promise.all([
        strapi.db.query('api::category.category').findMany({
          where: categoryWhere,
          populate: {
            image: true,
            products: {
              where: hiddenFilter(),
              populate: {
                images: true,
                preview: true,
                categories: true,
                tags: true,
                batch: true,
                designers: true,
                polishes: true,
              },
            },
          },
        }),
        strapi.db.query('api::product.product').findMany({
          where: productWhere,
          populate: productPopulate,
        }),
        strapi.db.query('api::tag.tag').findMany({
          where: tagWhere,
          populate: {
            products: {
              where: hiddenFilter(),
              populate: {
                images: true,
                preview: true,
                categories: true,
                tags: true,
                batch: true,
                designers: true,
                polishes: true,
              },
            },
          },
        }),
        productIdsMatchingAllTagTokens(tokens),
        tokens.length > 1 ? productIdsMatchingTagPhrase(searchTerm) : Promise.resolve([] as number[]),
      ]);

      const tagProductIdSet = new Set<number>([...tagIdsByTokens, ...tagIdsByPhrase]);

      const productsByTags =
        tagProductIdSet.size > 0
          ? await strapi.db.query('api::product.product').findMany({
              where: {
                ...hiddenFilter(),
                id: { $in: [...tagProductIdSet] },
              },
              populate: productPopulate,
            })
          : [];

      const allProducts = [...products, ...productsByTags];
      const uniqueProducts = Array.from(new Map(allProducts.map((product) => [product.id, product])).values());

      const ms = Date.now() - t0;
      strapi.log.debug(
        `[search] term=${JSON.stringify(searchTerm)} tokens=${JSON.stringify(tokens)} directProducts=${products.length} tagIdHits=${tagProductIdSet.size} mergedProducts=${uniqueProducts.length} ${ms}ms`
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
            tags: tags?.length || 0,
          },
          ...(debug
            ? {
                searchDebug: {
                  tokens,
                  multiTokenMode: tokens.length > 1,
                  directProductCount: products.length,
                  tagMatchProductIdCount: tagProductIdSet.size,
                  tagIntersectCount: tagIdsByTokens.length,
                  tagPhraseCount: tagIdsByPhrase.length,
                  mergedProductCount: uniqueProducts.length,
                  ms,
                },
              }
            : {}),
        },
      };
    } catch (error) {
      strapi.log.error('Search error:', error);
      return ctx.internalServerError('An error occurred during search');
    }
  },
};
