export default {
    async getTagsForCategory(ctx) {
        const { id } = ctx.params;

        console.log('id', id)

        let tags;
        
        try {
            // Получаем все теги, у которых есть продукты с нужной категорией
            tags = await strapi.db.query('api::tag.tag').findMany({
                where: {
                    products: {
                        categories: {
                            id: id
                        }
                    }
                },
                populate: {
                    products: {
                        where: {
                            isHidden: false  // Only visible products
                        },
                        populate: ['images', 'tags', 'categories', 'batch', 'designers', 'polishes']
                    }
                }
            });
        } catch (error: any) {
            // Если ошибка из-за отсутствия колонки isHidden, пробуем без фильтра
            if (error.message && (error.message.includes('isHidden') || error.message.includes('no such column'))) {
                tags = await strapi.db.query('api::tag.tag').findMany({
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
            } else {
                throw error;
            }
        }

        // Оставляем только те продукты, которые относятся к нужной категории и видимы
        const data = tags.map(tag => ({
            title: tag.title,
            products: (tag.products || [])
                .filter(product => {
                    // Фильтруем по категории
                    const hasCategory = product.categories?.some(category => String(category.id) === String(id));
                    if (!hasCategory) return false;
                    
                    // Фильтруем скрытые продукты на уровне приложения (гарантированно)
                    // Если есть isHidden, проверяем его (isHidden: false = видим)
                    if (product.isHidden !== undefined) {
                        return product.isHidden === false;
                    }
                    // Если есть старое поле isActive, проверяем его (isActive: true = видим)
                    if (product.isActive !== undefined) {
                        return product.isActive === true;
                    }
                    // Если ни одно поле не существует, считаем продукт видимым (для совместимости)
                    return true;
                })
        }));

        return { data };
    }
}