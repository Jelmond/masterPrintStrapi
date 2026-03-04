/**
 * Utility function to send emails using Resend
 */

import { Resend } from 'resend';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

// Цвета бренда для писем (inline styles для почтовых клиентов)
const BRAND = {
  primary: '#0f766e',
  primaryLight: '#e6fffa',
  text: '#1f2937',
  textMuted: '#6b7280',
  border: '#e5e7eb',
  bg: '#f9fafb',
  white: '#ffffff',
};

/**
 * Обёртка письма: контейнер 600px, шрифты, фон
 */
function emailLayout(content: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MPP.Shop</title>
</head>
<body style="margin:0; padding:0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.text}; background-color: #f3f4f6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%; background-color: ${BRAND.white}; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); overflow: hidden;">
          <tr>
            <td style="padding: 0;">
              ${content}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Шапка письма с названием магазина
 */
function emailHeader(): string {
  return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: linear-gradient(135deg, ${BRAND.primary} 0%, #134e4a 100%);">
  <tr>
    <td style="padding: 28px 32px; text-align: center;">
      <span style="font-size: 22px; font-weight: 700; color: ${BRAND.white}; letter-spacing: -0.5px;">MPP.Shop</span>
    </td>
  </tr>
</table>`;
}

/**
 * Блок «это автоматическое письмо»
 */
function emailAutoMessage(): string {
  return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top: 24px;">
  <tr>
    <td style="padding: 0 32px;">
      <div style="background-color: ${BRAND.primaryLight}; border-left: 4px solid ${BRAND.primary}; padding: 16px 20px; border-radius: 0 8px 8px 0;">
        <p style="margin: 0; font-size: 14px; color: ${BRAND.text}; line-height: 1.6;">
          <strong style="color: ${BRAND.primary};">Это автоматическое письмо.</strong> Пожалуйста, не отвечайте на него.<br>
          По вопросам пишите нам через сайт или по контактам ниже.
        </p>
      </div>
    </td>
  </tr>
</table>`;
}

/**
 * Подвал с контактами
 */
function emailFooter(): string {
  return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top: 32px; background-color: ${BRAND.bg};">
  <tr>
    <td style="padding: 24px 32px;">
      <p style="margin: 0 0 8px 0; font-size: 15px; font-weight: 600; color: ${BRAND.text};">С уважением, команда MPP.Shop</p>
      <p style="margin: 0; font-size: 14px; color: ${BRAND.textMuted}; line-height: 1.6;">
        г. Гродно, ул. Титова 24<br>
        Пн–Пт, 9:00–17:00<br>
        Тел.: <a href="tel:+375447495465" style="color: ${BRAND.primary}; text-decoration: none;">+375 44 749-54-65</a><br>
        Сайт: <a href="https://mppshop.by" style="color: ${BRAND.primary}; text-decoration: none;">mppshop.by</a>
      </p>
      <p style="margin: 16px 0 0 0; font-size: 13px; color: ${BRAND.textMuted};">
        По любым вопросам оформления и оплаты заказа — мы на связи.
      </p>
    </td>
  </tr>
</table>`;
}

// Initialize Resend client
let resendClient: Resend | null = null;

function getResendClient(): Resend | null {
  if (resendClient) {
    return resendClient;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY is not set. Email notification skipped.');
    return null;
  }

  resendClient = new Resend(apiKey);
  return resendClient;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const fromEmail = options.from || process.env.EMAIL_FROM;
  
  if (!fromEmail) {
    console.warn('EMAIL_FROM is not set. Email notification skipped.');
    return false;
  }

  if (!options.to) {
    console.warn('Recipient email is not provided. Email notification skipped.');
    return false;
  }

  const resend = getResendClient();
  if (!resend) {
    return false;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });

    if (error) {
      console.error('Resend API error:', error);
      strapi.log.error('Resend email sending error:', error);
      return false;
    }

    if (data) {
      console.log(`Email sent successfully via Resend. ID: ${data.id}`);
      return true;
    }

    return false;
  } catch (error: any) {
    console.error('Failed to send email:', error.message);
    strapi.log.error('Email sending error:', error);
    return false;
  }
}

/**
 * Формирует строки таблицы товаров для письма
 */
function formatOrderItemsTable(orderItems: any[], subtotal: number = 0, discount: number = 0): string {
  const discountPercentage = subtotal > 0 && discount > 0 ? discount / subtotal : 0;

  const rows = orderItems.map((item) => {
    const productName = item.product?.title || `Товар #${item.product?.id || '—'}`;
    let discountedUnitPrice = item.unitPrice;
    let discountedTotalPrice = item.totalPrice;
    if (discountPercentage > 0) {
      discountedUnitPrice = item.unitPrice * (1 - discountPercentage);
      discountedTotalPrice = discountedUnitPrice * item.quantity;
    }
    return `
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid ${BRAND.border}; color: ${BRAND.text};">${escapeHtml(productName)}</td>
        <td style="padding: 12px 16px; border-bottom: 1px solid ${BRAND.border}; text-align: center; color: ${BRAND.text};">${item.quantity}</td>
        <td style="padding: 12px 16px; border-bottom: 1px solid ${BRAND.border}; text-align: right; color: ${BRAND.text};">${discountedUnitPrice.toFixed(2)} BYN</td>
        <td style="padding: 12px 16px; border-bottom: 1px solid ${BRAND.border}; text-align: right; font-weight: 600; color: ${BRAND.text};">${discountedTotalPrice.toFixed(2)} BYN</td>
      </tr>`;
  }).join('');

  if (!rows) {
    return `<p style="margin: 0; color: ${BRAND.textMuted};">Нет товаров</p>`;
  }

  return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; font-size: 15px;">
  <thead>
    <tr style="background-color: ${BRAND.bg};">
      <th style="padding: 12px 16px; text-align: left; font-weight: 600; color: ${BRAND.textMuted}; border-bottom: 2px solid ${BRAND.border};">Товар</th>
      <th style="padding: 12px 16px; text-align: center; font-weight: 600; color: ${BRAND.textMuted}; border-bottom: 2px solid ${BRAND.border};">Кол-во</th>
      <th style="padding: 12px 16px; text-align: right; font-weight: 600; color: ${BRAND.textMuted}; border-bottom: 2px solid ${BRAND.border};">Цена</th>
      <th style="padding: 12px 16px; text-align: right; font-weight: 600; color: ${BRAND.textMuted}; border-bottom: 2px solid ${BRAND.border};">Сумма</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Формат даты для писем: дд.мм.гггг */
function formatOrderDate(date: Date | string | null | undefined): string {
  if (!date) return new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Стилизованный блок «важно» / сроки в письме */
function emailTermsBlock(html: string): string {
  return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top: 20px;">
  <tr>
    <td style="padding: 0 32px;">
      <div style="background-color: #fef3c7; border-left: 4px solid #d97706; padding: 16px 20px; border-radius: 0 8px 8px 0;">
        <p style="margin: 0; font-size: 14px; color: ${BRAND.text}; line-height: 1.6;">${html}</p>
      </div>
    </td>
  </tr>
</table>`;
}

/**
 * Блок тела письма: приветствие, текст, номер заказа, таблица товаров, итог, блоки сроков, авто-сообщение, подвал
 */
function emailBody(params: {
  greeting?: string;
  message: string;
  orderNumber: number;
  orderItems: any[];
  totalAmount: number;
  subtotal: number;
  discount: number;
  showAutoMessage: boolean;
  /** Дополнительные блоки HTML (сроки оплаты/доставки) — вставляются после итога, до авто-сообщения */
  termsBlocks?: string[];
}): string {
  const itemsTable = formatOrderItemsTable(params.orderItems, params.subtotal, params.discount);
  const greeting = params.greeting ?? 'Здравствуйте!';
  const termsHtml = (params.termsBlocks || []).join('');
  return `
${emailHeader()}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
  <tr>
    <td style="padding: 32px 32px 0 32px;">
      <p style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: ${BRAND.text};">${greeting}</p>
      <p style="margin: 0 0 24px 0; font-size: 15px; color: ${BRAND.text}; line-height: 1.6;">${params.message}</p>
      <p style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: ${BRAND.textMuted};">Заказ №${params.orderNumber}</p>
    </td>
  </tr>
  <tr>
    <td style="padding: 16px 32px 0 32px;">${itemsTable}</td>
  </tr>
  <tr>
    <td style="padding: 24px 32px 0 32px;">
      <p style="margin: 0; font-size: 17px; font-weight: 700; color: ${BRAND.primary};">
        Итого: ${params.totalAmount.toFixed(2)} BYN
      </p>
    </td>
  </tr>
  ${termsHtml}
  ${params.showAutoMessage ? emailAutoMessage() : ''}
  ${emailFooter()}
</table>`;
}

/**
 * Email template 1: Order created with ERIP or payment account (онлайн / по счёту)
 * В письме: номер заказа, состав заказа, порядок оплаты, срок оплаты (2 банковских дня), способы и сроки доставки.
 */
export function formatOrderCreatedEmailERIP(
  orderNumber: number,
  orderItems: any[],
  totalAmount: number,
  subtotal: number,
  discount: number = 0,
  orderDate?: Date | string | null
): { subject: string; html: string } {
  const dateStr = formatOrderDate(orderDate);
  const paymentTerms = emailTermsBlock(
    `Оплату (через ЕРИП / банковской картой (онлайн) / по выставленному счёту) необходимо произвести в течение 2 (двух) банковских дней с «${dateStr}». После истечения указанных сроков заказ аннулируется.`
  );
  const body = emailBody({
    message: 'Ваш заказ успешно создан. В письме указаны номер заказа, информация о товарах, порядок оплаты и способы доставки. В ближайшее время менеджер подготовит и отправит вам данные для оплаты через ЕРИП, банковскую карту (онлайн) или по выставленному счёту.',
    orderNumber,
    orderItems,
    totalAmount,
    subtotal,
    discount,
    showAutoMessage: true,
    termsBlocks: [paymentTerms],
  });
  return {
    subject: `Ваш заказ №${orderNumber} успешно оформлен`,
    html: emailLayout(body),
  };
}

/**
 * Email template: заказ создан, оплата при получении (наличными или картой) — без текста про ЕРИП/расчётный счёт.
 * Для физлиц: наличный расчёт или картой при получении (п.1 и п.2). Менеджер всё уточнит.
 */
export function formatOrderCreatedEmailPayOnReceipt(
  orderNumber: number,
  orderItems: any[],
  totalAmount: number,
  subtotal: number,
  discount: number = 0,
  orderDate?: Date | string | null
): { subject: string; html: string } {
  const body = emailBody({
    message: 'Ваш заказ успешно создан и принят в обработку. В письме указаны номер заказа и информация о товарах. Оплата — наличными или банковской картой при получении. Менеджер свяжется с вами при необходимости.',
    orderNumber,
    orderItems,
    totalAmount,
    subtotal,
    discount,
    showAutoMessage: true,
    termsBlocks: [],
  });
  return {
    subject: `Ваш заказ №${orderNumber} успешно оформлен`,
    html: emailLayout(body),
  };
}

/**
 * Email template 2: Order created with self-pickup (cash/card on pickup)
 * В письме: номер заказа, состав заказа, порядок оплаты (при получении), срок получения в пункте выдачи (2 банковских дня).
 */
export function formatOrderCreatedEmailSelfPickup(
  orderNumber: number,
  orderItems: any[],
  totalAmount: number,
  subtotal: number,
  discount: number = 0,
  orderDate?: Date | string | null
): { subject: string; html: string } {
  const dateStr = formatOrderDate(orderDate);
  const deliveryTerms = emailTermsBlock(
    `Получить товар в пункте выдачи необходимо в течение 2 (двух) банковских дней с «${dateStr}». В противном случае заказ аннулируется.`
  );
  const body = emailBody({
    message: 'Ваш заказ успешно создан и принят в обработку. В письме указаны номер заказа, информация о товарах и срок получения. Оплата — наличными или банковской картой при получении в нашем пункте выдачи.',
    orderNumber,
    orderItems,
    totalAmount,
    subtotal,
    discount,
    showAutoMessage: true,
    termsBlocks: [deliveryTerms],
  });
  return {
    subject: `Ваш заказ №${orderNumber} успешно оформлен`,
    html: emailLayout(body),
  };
}

/**
 * Email template 3: Order successfully paid via AlphaBank
 */
export function formatOrderPaidEmailAlphaBank(
  orderNumber: number,
  orderItems: any[],
  totalAmount: number,
  subtotal: number,
  discount: number = 0
): { subject: string; html: string } {
  const body = emailBody({
    message: 'Платёж по заказу успешно выполнен. Мы приняли заказ в работу и подготовим его к выдаче или отправке. Когда заказ будет готов, вы получите дополнительное уведомление.',
    orderNumber,
    orderItems,
    totalAmount,
    subtotal,
    discount,
    showAutoMessage: true,
  });
  return {
    subject: `Ваш заказ №${orderNumber} успешно оплачен`,
    html: emailLayout(body),
  };
}

