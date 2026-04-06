import type { Core } from '@strapi/strapi';

/**
 * SQLite's built-in lower() only handles ASCII, so $containsi breaks for Cyrillic.
 * We override it with a JS function that calls String#toLowerCase (full Unicode support).
 * This is a no-op on PostgreSQL/MySQL where the driver handles it natively.
 */
async function patchSqliteUnicodeLower(strapi: Core.Strapi) {
  const knex = strapi.db.connection as any;
  const clientName: string = knex?.client?.config?.client ?? '';
  if (!clientName.includes('sqlite')) return;

  try {
    const conn = await knex.client.acquireConnection();
    conn.function('lower', { deterministic: true }, (s: unknown) =>
      s == null ? null : String(s).toLowerCase()
    );
    knex.client.releaseConnection(conn);
    strapi.log.info('[sqlite] Registered Unicode-aware lower() — Cyrillic $containsi now works correctly');
  } catch (err: any) {
    strapi.log.warn('[sqlite] Could not register Unicode lower():', err?.message ?? err);
  }
}

async function setupTelegramWebhook(strapi: Core.Strapi) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;

  if (!botToken) {
    strapi.log.warn('TELEGRAM_BOT_TOKEN is not set. Telegram webhook will not be configured.');
    return;
  }

  if (!webhookUrl) {
    strapi.log.warn('TELEGRAM_WEBHOOK_URL is not set. Telegram webhook will not be configured automatically.');
    strapi.log.info('You can set it up manually by visiting: /api/payments/setup-telegram-webhook?url=YOUR_WEBHOOK_URL');
    return;
  }

  try {
    // Remove trailing dot if present (fix for mppshop.by.)
    const cleanWebhookUrl = webhookUrl.replace(/\.\/api/, '/api');
    
    strapi.log.info(`Setting up Telegram webhook: ${cleanWebhookUrl}`);
    
    const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: cleanWebhookUrl,
      }),
    });

    const result = (await response.json()) as { ok: boolean; description?: string; result?: any };

    if (result.ok) {
      strapi.log.info(`✅ Telegram webhook configured successfully: ${cleanWebhookUrl}`);
      // Also verify webhook info
      const infoResponse = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
      const info = await infoResponse.json();
      strapi.log.info(`Webhook info:`, JSON.stringify(info, null, 2));
    } else {
      strapi.log.error(`⚠️  Failed to configure Telegram webhook: ${result.description || 'Unknown error'}`);
      strapi.log.error(`Full response:`, JSON.stringify(result, null, 2));
    }
  } catch (error: any) {
    strapi.log.error(`⚠️  Failed to setup Telegram webhook: ${error.message}`);
    strapi.log.error(`Error stack:`, error.stack);
  }
}

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await patchSqliteUnicodeLower(strapi);
    // Setup Telegram webhook automatically on server start
    await setupTelegramWebhook(strapi);
  },
};
