export default {
    async getSimilarProducts(ctx) {
        const { slug } = ctx.params;
        console.log('slug', slug)

        // If slug is 'random', return random products
        if (slug === 'random') {
            // First, let's check how many products we have in total
            const totalCount = await strapi.db.query('api::product.product').count();
            console.log('Total products in database:', totalCount);

            const products = await strapi.db.query('api::product.product').findMany({
                where: { publishedAt: { $notNull: true } },
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

            console.log('Products found:', products.length);
            console.log('Product slugs:', products.map(p => p.slug));

            // Shuffle and limit to 12 products
            const shuffled = products.sort(() => 0.5 - Math.random());
            const result = shuffled.slice(0, 12);
            
            console.log('Final result count:', result.length);
            console.log('Final result slugs:', result.map(p => p.slug));

            return { data: result };
        }

        // Parse the slug parameter which can be a single slug or comma-separated slugs
        const productSlugs = slug.split(',').map(s => s.trim()).filter(s => s.length > 0);
        
        if (productSlugs.length === 0) {
            return ctx.badRequest('No valid product slugs provided');
        }

        // Get the source products to find their categories and tags (only published)
        const sourceProducts = await strapi.db.query('api::product.product').findMany({
            where: {
                slug: {
                    $in: productSlugs
                }
            },
            populate: {
                categories: {
                    where: { publishedAt: { $notNull: true } }
                },
                tags: {
                    where: { publishedAt: { $notNull: true } }
                }
            }
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

        // Get slugs of source products to exclude them
        const sourceProductSlugs = sourceProducts.map(p => p.slug);

        // Find similar products that share categories or tags
        const similarProducts = await strapi.db.query('api::product.product').findMany({
            where: {
                $and: [
                    {
                        slug: {
                            $notIn: sourceProductSlugs // Exclude the source products
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

        // Ensure uniqueness by slug
        const uniqueProducts = Array.from(
            new Map(similarProducts.map(product => [product.slug, product])).values()
        );

        // Shuffle and limit to 12 products
        const shuffled = uniqueProducts.sort(() => 0.5 - Math.random());
        return { data: shuffled.slice(0, 12) };
    }
}