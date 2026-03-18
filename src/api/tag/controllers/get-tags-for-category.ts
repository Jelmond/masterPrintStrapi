export default {
    async getTagsForCategory(ctx) {
        const { id } = ctx.params;

        console.log('id', id)

        // Получаем все теги, у которых есть продукты с нужной категорией
        const tags = await strapi.db.query('api::tag.tag').findMany({
            where: {
                products: {
                    categories: {
                        id: id
                    }
                }
            },
            populate: {
                products: {
                    // БЕЗ фильтра isHidden в where - фильтруем на уровне приложения
                    populate: ['images', 'preview', 'tags', 'categories', 'batch', 'designers', 'polishes']
                }
            }
        });

        // Оставляем только те продукты, которые относятся к нужной категории и видимы; дедупликация по id
        const data = tags.map((tag: any) => {
            const filtered = (tag.products || []).filter((product: any) => {
                const hasCategory = product.categories?.some((c: any) => String(c.id) === String(id));
                if (!hasCategory) return false;
                if (product.isHidden === true || product.isActive === false) return false;
                return true;
            });
            const byId = new Map();
            for (const p of filtered) byId.set(p.id, p);
            return { title: tag.title, products: Array.from(byId.values()) };
        });

        // Уникальные продукты по id — для группировки по батчу без дублей на фронте
        const uniqueById = new Map<number, any>();
        for (const group of data) {
            for (const p of group.products) uniqueById.set(p.id, p);
        }

        return { data, uniqueProducts: Array.from(uniqueById.values()) };
    }
}