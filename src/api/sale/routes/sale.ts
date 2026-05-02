/**
 * Sale API — core REST (collection /sales, /sales/:id, …)
 */
import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::sale.sale');
