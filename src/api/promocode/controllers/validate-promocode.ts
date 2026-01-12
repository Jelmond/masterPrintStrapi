/**
 * validate-promocode controller
 */

export default {
  async validatePromocode(ctx) {
    try {
      const { name } = ctx.request.body;

      if (!name || typeof name !== 'string') {
        return ctx.badRequest('Promocode name is required');
      }

      // Find promocode by name
      const promocode = await strapi.db.query('api::promocode.promocode').findOne({
        where: {
          name: name.trim(),
          publishedAt: { $notNull: true },
        },
        populate: ['usages'],
      });

      if (!promocode) {
        return ctx.send({
          valid: false,
          message: 'Promocode not found',
        });
      }

      // Check if promocode is actual
      if (!promocode.isActual) {
        return ctx.send({
          valid: false,
          message: 'Promocode is not active',
        });
      }

      // Check available usages
      const currentUsages = promocode.usages?.length || 0;
      if (currentUsages >= promocode.availableUsages) {
        return ctx.send({
          valid: false,
          message: 'Promocode has reached maximum usages',
        });
      }

      // Return valid promocode info
      return ctx.send({
        valid: true,
        data: {
          name: promocode.name,
          type: promocode.type,
          percentDiscount: promocode.percentDiscount,
          availableUsages: promocode.availableUsages,
          currentUsages: currentUsages,
          remainingUsages: promocode.availableUsages - currentUsages,
        },
      });
    } catch (err) {
      strapi.log.error('Validate promocode error:', err);
      return ctx.internalServerError('An error occurred while validating promocode');
    }
  },
};

