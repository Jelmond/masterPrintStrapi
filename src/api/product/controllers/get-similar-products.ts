export default {
    async getSimilarProducts(ctx) {
        const { id } = ctx.params;
        console.log('id', id)

        // If id is 1000000, return random products
        if (id === '1000000') {
            // First, let's check how many products we have in total
            const totalCount = await strapi.db.query('api::product.product').count();
            console.log('Total products in database:', totalCount);

            const products = await strapi.db.query('api::product.product').findMany({
                where: { publishedAt: { $notNull: true } },
                populate: { images: true, categories: true, tags: true, batch: true, designers: true, polishes: true }
            });

            console.log('Products found:', products.length);
            console.log('Product IDs:', products.map(p => p.id));

            // Shuffle and limit to 12 products
            const shuffled = products.sort(() => 0.5 - Math.random());
            const result = shuffled.slice(0, 12);
            
            console.log('Final result count:', result.length);
            console.log('Final result IDs:', result.map(p => p.id));

            return { data: result };
        }

        // Parse the id parameter which can be a single id or comma-separated ids
        const productIds = id.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
        
        if (productIds.length === 0) {
            return ctx.badRequest('No valid product IDs provided');
        }

        // Get the source products to find their categories and tags
        const sourceProducts = await strapi.db.query('api::product.product').findMany({
            where: {
                id: {
                    $in: productIds
                }
            },
            populate: ['categories', 'tags']
        });

        if (sourceProducts.length === 0) {
            return ctx.notFound('Source products not found');
        }

        // Collect all category and tag IDs from source products
        const categoryIds = sourceProducts.flatMap(product => 
            product.categories?.map(cat => cat.id) || []
        );
        const tagIds = sourceProducts.flatMap(product => 
            product.tags?.map(tag => tag.id) || []
        );

        // Find similar products that share categories or tags
        const similarProducts = await strapi.db.query('api::product.product').findMany({
            where: {
                $and: [
                    {
                        id: {
                            $notIn: productIds // Exclude the source products
                        }
                    },
                    {
                        $or: [
                            {
                                categories: {
                                    id: {
                                        $in: categoryIds
                                    }
                                }
                            },
                            {
                                tags: {
                                    id: {
                                        $in: tagIds
                                    }
                                }
                            }
                        ]
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

        // Ensure uniqueness by ID
        const uniqueProducts = Array.from(
            new Map(similarProducts.map(product => [product.id, product])).values()
        );

        // Shuffle and limit to 12 products
        const shuffled = uniqueProducts.sort(() => 0.5 - Math.random());
        return { data: shuffled.slice(0, 12) };
    }
}