/**
 * sale controller
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::sale.sale', ({ strapi }) => ({
  /**
   * Продукты в акции: isOnSale + связь с sale (у sale нет draft/publish, как у product).
   * Ответ: массив групп, отсортированных по sale.priority (меньше — выше, как у batch).
   */
  async groupedOnSale(ctx) {
    try {
      // Без isHidden в where — как в product/category (иначе продукты с isHidden null не попадают в выборку).
      const products = await strapi.db.query('api::product.product').findMany({
        where: {
          isOnSale: true,
        },
        populate: {
          sale: true,
          images: true,
          preview: true,
          categories: true,
          tags: true,
          batch: true,
          designers: true,
          polishes: true,
        },
        orderBy: { id: 'asc' },
      });

      const list = (products as any[]).filter((p) => {
        if (p.isHidden === true || p.isActive === false) return false;
        return p.sale && p.sale.id != null;
      });

      const bySale = new Map<
        number,
        { sale: { name: string; priority: number | null }; products: any[] }
      >();

      for (const p of list) {
        const s = p.sale;
        const sid = s.id as number;
        if (!bySale.has(sid)) {
          bySale.set(sid, {
            sale: {
              name: s.name,
              priority: typeof s.priority === 'number' ? s.priority : null,
            },
            products: [],
          });
        }
        bySale.get(sid)!.products.push(p);
      }

      const groups = Array.from(bySale.values()).sort((a, b) => {
        const ap = a.sale.priority ?? 2147483647;
        const bp = b.sale.priority ?? 2147483647;
        if (ap !== bp) return ap - bp;
        return String(a.sale.name ?? '').localeCompare(String(b.sale.name ?? ''), 'ru');
      });

      for (const g of groups) {
        g.products.sort((x, y) =>
          String(x.title ?? '').localeCompare(String(y.title ?? ''), 'ru')
        );
      }

      return { data: groups };
    } catch (error) {
      strapi.log.error('groupedOnSale error:', error);
      return ctx.internalServerError('An error occurred while fetching grouped sale products');
    }
  },
}));
