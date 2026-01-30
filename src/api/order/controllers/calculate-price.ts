/**
 * calculate-price controller
 */

export default {
  async calculatePrice(ctx) {
    try {
      const { products, type, promocode } = ctx.request.body;

      // Validate products
      if (!products || !Array.isArray(products) || products.length === 0) {
        return ctx.badRequest('Products array is required and cannot be empty');
      }

      // Validate each product
      for (const product of products) {
        if (!product.productSlug || !product.quantity) {
          return ctx.badRequest('Each product must have productSlug and quantity');
        }
        if (product.quantity <= 0) {
          return ctx.badRequest('Product quantity must be greater than 0');
        }
      }

      // Validate shipping type
      const shippingType = type || 'shipping';
      if (shippingType !== 'shipping' && shippingType !== 'selfShipping') {
        return ctx.badRequest('Type must be either "shipping" or "selfShipping"');
      }

      // Step 1: Fetch products and calculate subtotal
      let subtotal = 0;
      const productDetails = [];

      for (const productInput of products) {
        // Fetch product by slug (then check isHidden in code)
        const product = await strapi.db.query('api::product.product').findOne({
          where: { slug: productInput.productSlug },
          populate: ['batch', 'designers', 'polishes', 'images', 'categories', 'tags'],
        });

        if (!product) {
          return ctx.notFound(`Product with slug "${productInput.productSlug}" not found`);
        }

        if (product.isHidden === true) {
          return ctx.badRequest(`Product "${productInput.productSlug}" is not available for ordering`);
        }

        if (!product.price) {
          return ctx.badRequest(`Product "${productInput.productSlug}" has no price`);
        }

        const unitPrice = parseFloat(product.price.toString());
        const quantity = productInput.quantity;
        const totalPrice = unitPrice * quantity;

        subtotal += totalPrice;

        productDetails.push({
          slug: product.slug,
          title: product.title,
          unitPrice,
          quantity,
          totalPrice,
        });
      }

      // Step 2: Calculate total amount based on shipping type and discount tiers
      let totalAmount = subtotal;
      let shippingCost = 0;
      let discount = 0;
      let baseDiscount = 0;
      let selfShippingDiscount = 0;
      let discountDescription = '';

      // Calculate base discount based on subtotal tiers
      if (subtotal >= 1500) {
        baseDiscount = subtotal * 0.20; // 20% discount
        discountDescription = '20% (≥1500 BYN)';
      } else if (subtotal >= 700) {
        baseDiscount = subtotal * 0.05; // 5% discount
        discountDescription = '5% (≥700 BYN)';
      } else {
        baseDiscount = 0; // 0% discount
        discountDescription = '0% (<700 BYN)';
      }

      if (shippingType === 'shipping') {
        // Calculate shipping cost based on subtotal
        if (subtotal >= 400) {
          shippingCost = 0; // Free shipping for orders >= 400 BYN
        } else {
          shippingCost = 20; // 20 BYN shipping cost for orders < 400 BYN
        }
        
        discount = baseDiscount;
        totalAmount = subtotal - discount + shippingCost;
      } else if (shippingType === 'selfShipping') {
        // Apply base discount + additional 3% for self-pickup
        selfShippingDiscount = subtotal * 0.03; // Additional 3% for self-pickup
        discount = baseDiscount + selfShippingDiscount;
        totalAmount = subtotal - discount;
      }

      // Step 3: Apply promocode if provided
      let promocodeDiscount = 0;
      let promocodeData = null;
      let promocodeApplied = false;

      if (promocode && typeof promocode === 'string' && promocode.trim()) {
        try {
          const promocodeEntity = await strapi.db.query('api::promocode.promocode').findOne({
            where: {
              name: promocode.trim(),
              publishedAt: { $notNull: true },
            },
            populate: ['usages'],
          });

          if (promocodeEntity && promocodeEntity.isActual) {
            // Check if promocode is still valid (validUntil check)
            let isExpired = false;
            if (promocodeEntity.validUntil) {
              const now = new Date();
              const validUntil = new Date(promocodeEntity.validUntil);
              isExpired = now >= validUntil;
            }
            
            const currentUsages = promocodeEntity.usages?.length || 0;
            if (!isExpired && currentUsages < promocodeEntity.availableUsages) {
              promocodeApplied = true;
              const percentDiscount = promocodeEntity.percentDiscount / 100;

              if (promocodeEntity.type === 'order') {
                // Discount on subtotal (before shipping)
                promocodeDiscount = subtotal * percentDiscount;
                totalAmount = totalAmount - promocodeDiscount;
              } else if (promocodeEntity.type === 'shipping') {
                // Discount on shipping cost
                if (shippingType === 'shipping' && shippingCost > 0) {
                  promocodeDiscount = shippingCost * percentDiscount;
                  totalAmount = totalAmount - promocodeDiscount;
                }
              } else if (promocodeEntity.type === 'whole') {
                // Discount on total amount (after all calculations)
                promocodeDiscount = totalAmount * percentDiscount;
                totalAmount = totalAmount - promocodeDiscount;
              }

              promocodeData = {
                name: promocodeEntity.name,
                type: promocodeEntity.type,
                percentDiscount: promocodeEntity.percentDiscount,
                discountAmount: parseFloat(promocodeDiscount.toFixed(2)),
              };
            }
          }
        } catch (promocodeError) {
          // Silently ignore promocode errors - don't break the price calculation
          strapi.log.warn('Ошибка валидации промокода (игнорируется):', promocodeError);
        }
      }

      return ctx.send({
        success: true,
        data: {
          products: productDetails,
          subtotal: parseFloat(subtotal.toFixed(2)),
          shippingCost: shippingType === 'shipping' ? parseFloat(shippingCost.toFixed(2)) : 0,
          freeShipping: shippingType === 'shipping' && subtotal >= 400, // Flag for free shipping
          discount: {
            baseDiscount: parseFloat(baseDiscount.toFixed(2)),
            selfShippingDiscount: shippingType === 'selfShipping' ? parseFloat(selfShippingDiscount.toFixed(2)) : 0,
            totalDiscount: parseFloat(discount.toFixed(2)),
            description: discountDescription,
          },
          promocode: promocodeApplied ? promocodeData : null,
          totalAmount: parseFloat(totalAmount.toFixed(2)),
          shippingType,
        },
      });
    } catch (err) {
      strapi.log.error('Calculate price error:', err);
      return ctx.internalServerError('An error occurred while calculating price');
    }
  },
};

