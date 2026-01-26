/**
 * validate-promocode controller
 */

export default {
  async validatePromocode(ctx) {
    try {
      const { name } = ctx.request.body;

      if (!name || typeof name !== 'string') {
        return ctx.badRequest('Название промокода обязательно');
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
          message: 'Промокод не найден',
        });
      }

      // Check if promocode is actual
      if (!promocode.isActual) {
        return ctx.send({
          valid: false,
          message: 'Промокод неактивен',
        });
      }

      // Check if promocode is still valid (validUntil check)
      if (promocode.validUntil) {
        const now = new Date();
        const validUntil = new Date(promocode.validUntil);
        
        // МСК = UTC+3, но Date объекты в JavaScript уже в UTC
        // Если validUntil хранится в UTC, нужно учесть разницу
        // Для простоты сравниваем напрямую, так как Strapi обычно хранит в UTC
        if (now >= validUntil) {
          return ctx.send({
            valid: false,
            message: 'Срок действия промокода истек',
          });
        }
      }

      // Check available usages
      const currentUsages = promocode.usages?.length || 0;
      if (currentUsages >= promocode.availableUsages) {
        return ctx.send({
          valid: false,
          message: 'Промокод исчерпал лимит использований',
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
      strapi.log.error('Ошибка валидации промокода:', err);
      return ctx.internalServerError('Произошла ошибка при проверке промокода');
    }
  },
};

