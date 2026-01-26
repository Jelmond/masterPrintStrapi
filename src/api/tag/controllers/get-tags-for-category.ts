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
                    populate: ['images', 'tags', 'categories', 'batch', 'designers', 'polishes']
                }
            }
        });

        // Оставляем только те продукты, которые относятся к нужной категории и видимы
        const data = tags.map(tag => ({
            title: tag.title,
            products: (tag.products || [])
                .filter(product => {
                    // Фильтруем по категории
                    const hasCategory = product.categories?.some(category => String(category.id) === String(id));
                    if (!hasCategory) return false;
                    
                    // Фильтруем скрытые продукты на уровне приложения (гарантированно)
                    // Скрываем только если явно isHidden: true или isActive: false
                    if (product.isHidden === true) {
                        return false;
                    }
                    if (product.isActive === false) {
                        return false;
                    }
                    // Во всех остальных случаях показываем
                    return true;
                })
        }));

        return { data };
    }
}