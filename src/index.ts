import type { Core } from '@strapi/strapi';

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
    const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
      }),
    });

    const result = (await response.json()) as { ok: boolean; description?: string };

    if (result.ok) {
      strapi.log.info(`✅ Telegram webhook configured successfully: ${webhookUrl}`);
    } else {
      strapi.log.warn(`⚠️  Failed to configure Telegram webhook: ${result.description || 'Unknown error'}`);
    }
  } catch (error: any) {
    strapi.log.warn(`⚠️  Failed to setup Telegram webhook: ${error.message}`);
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
    // Setup Telegram webhook automatically on server start
    await setupTelegramWebhook(strapi);
  },
};
