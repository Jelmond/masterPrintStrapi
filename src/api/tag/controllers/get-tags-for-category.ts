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
                    populate: ['images', 'tags', 'categories', 'batch', 'designers', 'polishes']
                }
            }
        });

        // Оставляем только те продукты, которые относятся к нужной категории
        const data = tags.map(tag => ({
            title: tag.title,
            products: (tag.products || []).filter(product =>
                product.categories?.some(category => String(category.id) === String(id))
            )
        }));

        return { data };
    }
}