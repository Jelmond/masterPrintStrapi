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

const EMAIL_AUTO_MESSAGE = `
<br><br>
<div style="background-color: #f0f0f0; border-left: 4px solid #ff6b6b; padding: 15px; margin: 20px 0; border-radius: 5px;">
  <p style="margin: 0; font-size: 14px; color: #333; line-height: 1.6;">
    <strong style="color: #ff6b6b; font-size: 15px;">⚠️ Это автоматическое письмо</strong><br>
    <strong>Пожалуйста, не отвечайте на него</strong><br><br>
    Если у вас возникли вопросы, мы с радостью поможем 😊<br>
    Свяжитесь с нами через сайт или по контактам ниже.
  </p>
</div>
`;

const EMAIL_FOOTER = `
<br><br>
С уважением, команда MPP.Shop<br>
г. Гродно, ул. Титова 24<br>
Время работы: Пн–Пт, 9:00–17:00<br>
Тел.: +375 44 749-54-65<br>
Сайт: <a href="https://mppshop.by">https://mppshop.by</a><br><br>
Мы готовы помочь вам по любым вопросам, связанным с оформлением и оплатой заказа.
`;

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
 * Format order items list for email
 */
function formatOrderItemsForEmail(orderItems: any[], subtotal: number = 0, discount: number = 0): string {
  const discountPercentage = subtotal > 0 && discount > 0
    ? discount / subtotal
    : 0;

  const itemsList = orderItems
    .map((item, index) => {
      const productName = item.product?.title || `Product #${item.product?.id || 'N/A'}`;
      
      // Calculate discounted prices per product
      let discountedUnitPrice = item.unitPrice;
      let discountedTotalPrice = item.totalPrice;
      
      if (discountPercentage > 0) {
        discountedUnitPrice = item.unitPrice * (1 - discountPercentage);
        discountedTotalPrice = discountedUnitPrice * item.quantity;
      }
      
      return `• ${productName} - ${item.quantity} шт. × ${discountedUnitPrice.toFixed(2)} BYN = ${discountedTotalPrice.toFixed(2)} BYN`;
    })
    .join('<br>');

  return itemsList || 'Нет товаров';
}

/**
 * Email template 1: Order created with ERIP or payment account
 */
export function formatOrderCreatedEmailERIP(
  orderNumber: number,
  orderItems: any[],
  totalAmount: number,
  subtotal: number,
  discount: number = 0
): { subject: string; html: string } {
  const itemsList = formatOrderItemsForEmail(orderItems, subtotal, discount);
  
  const html = `
    <p>Здравствуйте!</p>
    <p>Ваш заказ №${orderNumber} успешно создан. В ближайшее время менеджер подготовит и отправит вам письмо с данными для оплаты через ЕРИП или Расчётный счет.</p>
    <p><b>Детали заказа:</b></p>
    <p>${itemsList}</p>
    <p><b>Итоговая сумма:</b> ${totalAmount.toFixed(2)} BYN</p>
    ${EMAIL_AUTO_MESSAGE}
    ${EMAIL_FOOTER}
  `;

  return {
    subject: `Ваш заказ №${orderNumber} успешно оформлен`,
    html,
  };
}

/**
 * Email template 2: Order created with self-pickup (cash/card on pickup)
 */
export function formatOrderCreatedEmailSelfPickup(
  orderNumber: number,
  orderItems: any[],
  totalAmount: number,
  subtotal: number,
  discount: number = 0
): { subject: string; html: string } {
  const itemsList = formatOrderItemsForEmail(orderItems, subtotal, discount);
  
  const html = `
    <p>Здравствуйте!</p>
    <p>Ваш заказ №${orderNumber} успешно создан и принят в обработку. Оплата будет произведена наличными или банковской картой при получении товара в нашем пункте выдачи.</p>
    <p><b>Детали заказа:</b></p>
    <p>${itemsList}</p>
    <p><b>Итоговая сумма:</b> ${totalAmount.toFixed(2)} BYN</p>
    ${EMAIL_AUTO_MESSAGE}
    ${EMAIL_FOOTER}
  `;

  return {
    subject: `Ваш заказ №${orderNumber} успешно оформлен`,
    html,
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
  const itemsList = formatOrderItemsForEmail(orderItems, subtotal, discount);
  
  const html = `
    <p>Здравствуйте!</p>
    <p>Ваш платеж по заказу №${orderNumber} был успешно выполнен. Мы приняли заказ в работу и подготовим его к выдаче или отправке.</p>
    <p><b>Детали заказа:</b></p>
    <p>${itemsList}</p>
    <p><b>Итоговая сумма:</b> ${totalAmount.toFixed(2)} BYN</p>
    <p>Когда заказ будет готов, вы получите дополнительное уведомление.</p>
    ${EMAIL_AUTO_MESSAGE}
    ${EMAIL_FOOTER}
  `;

  return {
    subject: `Ваш заказ №${orderNumber} успешно оплачен`,
    html,
  };
}

