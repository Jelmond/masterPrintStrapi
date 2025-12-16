/**
 * Utility function to send messages to Telegram bot
 */

interface TelegramMessageOptions {
  chatId?: string;
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
}

export async function sendTelegramMessage(
  message: string,
  options: TelegramMessageOptions = {}
): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const defaultChatId = process.env.TELEGRAM_CHAT_ID;
  const chatId = options.chatId || defaultChatId;

  if (!botToken) {
    console.warn('TELEGRAM_BOT_TOKEN is not set. Telegram notification skipped.');
    return false;
  }

  if (!chatId) {
    console.warn('TELEGRAM_CHAT_ID is not set. Telegram notification skipped.');
    return false;
  }

  try {
    const telegramApiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const parseMode = options.parseMode || 'HTML';

    const response = await fetch(telegramApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: parseMode,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Telegram API error:', errorData);
      return false;
    }

    return true;
  } catch (error: any) {
    console.error('Failed to send Telegram message:', error.message);
    return false;
  }
}

/**
 * Format order information for Telegram message
 */
export function formatOrderMessage(
  order: any, 
  orderItems: any[] = [], 
  shippingCost: number = 0, 
  discount: number = 0
): string {
  const itemsList = orderItems
    .map((item, index) => {
      const productName = item.product?.title || `Product #${item.product?.id || 'N/A'}`;
      return `${index + 1}. ${productName} - ${item.quantity} шт. × ${item.unitPrice} BYN = ${item.totalPrice} BYN`;
    })
    .join('\n');

  // Build pricing breakdown
  let pricingDetails = `<b>Сумма товаров:</b> ${order.subtotal} BYN`;
  
  if (shippingCost > 0) {
    pricingDetails += `\n<b>Доставка:</b> +${shippingCost} BYN`;
  }
  
  if (discount > 0) {
    pricingDetails += `\n<b>Скидка (самовывоз 3%):</b> -${discount.toFixed(2)} BYN`;
  }
  
  pricingDetails += `\n<b>Итого:</b> ${order.totalAmount} BYN`;

  return `
<b>🛒 Новый заказ создан</b>

<b>Номер заказа:</b> #${order.orderNumber}
<b>Статус:</b> ${order.orderStatus}
<b>Дата:</b> ${new Date(order.orderDate).toLocaleString('ru-RU')}

<b>Товары:</b>
${itemsList || 'Нет товаров'}

${pricingDetails}

<b>ID заказа:</b> ${order.id}
  `.trim();
}

/**
 * Format payment success message for Telegram
 */
export function formatPaymentSuccessMessage(order: any, payment: any): string {
  return `
<b>✅ Платеж успешно выполнен</b>

<b>Номер заказа:</b> #${order.orderNumber}
<b>Сумма платежа:</b> ${payment.amount} BYN
<b>Способ оплаты:</b> ${payment.paymentMethod === 'card' ? 'Карта' : payment.paymentMethod}
<b>Hash ID:</b> ${payment.hashId}
<b>Дата платежа:</b> ${payment.paymentDate ? new Date(payment.paymentDate).toLocaleString('ru-RU') : 'N/A'}

<b>Статус заказа:</b> ${order.orderStatus}
  `.trim();
}

/**
 * Format payment failure message for Telegram
 */
export function formatPaymentFailureMessage(order: any, payment: any): string {
  return `
<b>❌ Платеж не выполнен</b>

<b>Номер заказа:</b> #${order.orderNumber}
<b>Сумма платежа:</b> ${payment.amount} BYN
<b>Способ оплаты:</b> ${payment.paymentMethod === 'card' ? 'Карта' : payment.paymentMethod}
<b>Hash ID:</b> ${payment.hashId}
<b>Статус:</b> ${payment.paymentStatus}

<b>Статус заказа:</b> ${order.orderStatus}
  `.trim();
}

