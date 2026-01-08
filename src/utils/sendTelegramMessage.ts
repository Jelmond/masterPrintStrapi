/**
 * Utility function to send messages to Telegram bot
 */

interface TelegramMessageOptions {
  chatId?: string;
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  replyMarkup?: {
    inline_keyboard: Array<Array<{
      text: string;
      callback_data: string;
    }>>;
  };
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
        ...(options.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Telegram API error:', errorData);
      console.error('Response status:', response.status);
      console.error('Response statusText:', response.statusText);
      return false;
    }

    const result = (await response.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (result.ok) {
      console.log('✅ Telegram message sent successfully');
      return true;
    } else {
      console.error('Telegram API returned error:', result);
      return false;
    }
  } catch (error: any) {
    console.error('Failed to send Telegram message:', error.message);
    console.error('Error stack:', error.stack);
    return false;
  }
}

/**
 * Format payment method name for display
 */
function formatPaymentMethodName(paymentMethod: string): string {
  const methodMap: { [key: string]: string } = {
    'ERIP': 'ЕРИП',
    'card': 'Карта (AlphaBank)',
    'paymentAccount': 'Расчетный счет',
    'pickupPayment': 'Самовывоз (наличные/карта)',
    'selfShipping': 'Самовывоз (наличные/карта)',
  };
  return methodMap[paymentMethod] || paymentMethod;
}

/**
 * Format order information for Telegram message
 */
export function formatOrderMessage(
  order: any, 
  orderItems: any[] = [], 
  shippingCost: number = 0, 
  discount: number = 0,
  paymentMethod?: string
): string {
  // Calculate discount percentage if discount exists
  const discountPercentage = order.subtotal > 0 && discount > 0 
    ? discount / order.subtotal 
    : 0;

  const itemsList = orderItems
    .map((item, index) => {
      const productName = item.product?.title || `Product #${item.product?.id || 'N/A'}`;
      const articul = item.product?.articul || 'N/A';
      
      // Calculate discounted prices per product
      let discountedUnitPrice = item.unitPrice;
      let discountedTotalPrice = item.totalPrice;
      
      if (discountPercentage > 0) {
        // Apply discount to each product proportionally
        discountedUnitPrice = item.unitPrice * (1 - discountPercentage);
        discountedTotalPrice = discountedUnitPrice * item.quantity;
      }
      
      return `${index + 1}. ${productName} (Артикул: ${articul}) - ${item.quantity} шт. × ${discountedUnitPrice.toFixed(2)} BYN = ${discountedTotalPrice.toFixed(2)} BYN`;
    })
    .join('\n');

  // Build pricing breakdown - format all values to 2 decimal places to avoid floating point issues
  const formattedSubtotal = parseFloat(order.subtotal.toString()).toFixed(2);
  let pricingDetails = `<b>Сумма товаров:</b> ${formattedSubtotal} BYN`;
  
  if (shippingCost > 0) {
    pricingDetails += `\n<b>Доставка:</b> +${parseFloat(shippingCost.toString()).toFixed(2)} BYN`;
  }
  
  if (discount > 0) {
    // Determine discount description based on subtotal and shipping type
    const subtotalNum = parseFloat(order.subtotal.toString());
    let discountDesc = '';
    
    if (subtotalNum >= 1500) {
      discountDesc = '20% (≥1500 BYN)';
    } else if (subtotalNum >= 700) {
      discountDesc = '5% (≥700 BYN)';
    } else {
      discountDesc = '0% (<700 BYN)';
    }
    
    // Check if it's self-pickup (has discount but no shipping cost)
    const isSelfPickup = shippingCost === 0 && discount > 0;
    
    if (isSelfPickup && subtotalNum >= 700) {
      // Show both base discount and self-pickup discount separately
      const baseDiscount = subtotalNum >= 1500 ? subtotalNum * 0.20 : subtotalNum * 0.05;
      const selfPickupDiscount = subtotalNum * 0.03;
      pricingDetails += `\n<b>Скидка (${discountDesc}):</b> -${parseFloat(baseDiscount.toString()).toFixed(2)} BYN`;
      pricingDetails += `\n<b>Скидка (самовывоз 3%):</b> -${parseFloat(selfPickupDiscount.toString()).toFixed(2)} BYN`;
    } else if (isSelfPickup) {
      // Only self-pickup discount (subtotal < 700)
      pricingDetails += `\n<b>Скидка (самовывоз 3%):</b> -${parseFloat(discount.toString()).toFixed(2)} BYN`;
    } else {
      // Only base discount (delivery)
      pricingDetails += `\n<b>Скидка (${discountDesc}):</b> -${parseFloat(discount.toString()).toFixed(2)} BYN`;
    }
  }
  
  pricingDetails += `\n<b>Итого:</b> ${parseFloat(order.totalAmount.toString()).toFixed(2)} BYN`;

  // Build address/user information
  const address = order.address || {};
  let addressInfo = `<b>Информация о клиенте:</b>\n`;
  
  if (address.fullName) {
    addressInfo += `<b>ФИО:</b> ${address.fullName}\n`;
  }
  
  if (address.email) {
    addressInfo += `<b>Email:</b> ${address.email}\n`;
  }
  
  if (address.phone) {
    addressInfo += `<b>Телефон:</b> ${address.phone}\n`;
  }
  
  if (address.city) {
    addressInfo += `<b>Город:</b> ${address.city}\n`;
  }
  
  if (address.address) {
    addressInfo += `<b>Адрес:</b> ${address.address}\n`;
  }
  
  if (address.postalCode) {
    addressInfo += `<b>Почтовый индекс:</b> ${address.postalCode}\n`;
  }
  
  if (address.type) {
    const shippingType = address.type === 'selfShipping' ? 'Самовывоз' : 'Доставка';
    addressInfo += `<b>Тип доставки:</b> ${shippingType}\n`;
  }
  
  if (address.isIndividual !== undefined) {
    addressInfo += `<b>Тип клиента:</b> ${address.isIndividual ? 'Физическое лицо' : 'Юридическое лицо'}\n`;
  }
  
  // Organization information (if not individual)
  if (!address.isIndividual) {
    if (address.organization) {
      addressInfo += `<b>Организация:</b> ${address.organization}\n`;
    }
    if (address.UNP) {
      addressInfo += `<b>УНП:</b> ${address.UNP}\n`;
    }
    if (address.paymentAccount) {
      addressInfo += `<b>Расчетный счет:</b> ${address.paymentAccount}\n`;
    }
    if (address.bankAdress) {
      addressInfo += `<b>Адрес банка:</b> ${address.bankAdress}\n`;
    }
  }

  // Add payment method info if provided
  let paymentMethodInfo = '';
  if (paymentMethod) {
    paymentMethodInfo = `\n<b>Способ оплаты:</b> ${formatPaymentMethodName(paymentMethod)}`;
  }

  return `
<b>🛒 Новый заказ создан</b>

<b>Номер заказа:</b> #${order.orderNumber}
<b>Статус:</b> ${order.orderStatus}
<b>Дата:</b> ${new Date(order.orderDate).toLocaleString('ru-RU')}${paymentMethodInfo}

${addressInfo}

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

