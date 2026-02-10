/**
 * batch controller
 * Список batch всегда возвращается отсортированным по priority (меньше — выше).
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::batch.batch', ({ strapi }) => ({
  async find(ctx) {
    const batches = await strapi.db.query('api::batch.batch').findMany({
      orderBy: [{ priority: 'asc' }, { id: 'asc' }],
    });
    return { data: batches, meta: {} };
  },
}));
