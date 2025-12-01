import { getAlphaOrderId } from "./getAlphaOrderId";
import { requestOptions } from "./getHeaders";

interface PaymentDescription {
    description?: string;
}

interface OrderInfo {
    id: number;
    price: number;
}

export interface PaymentLinkResponse {
    orderId: string;
    formUrl: string;
    errorCode?: string;
    errorMessage?: string;
}

export async function getPaymentLink(
    payment: PaymentDescription, 
    order: OrderInfo
): Promise<PaymentLinkResponse> {
    const paymentUrl = process.env.PAYMENT_URL || '';
    const userName = process.env.ALPHA_USERNAME || '';
    const password = process.env.ALPHA_PASSWORD || '';
    const successUrl = process.env.RETURN_URL || '';
    const failureUrl = process.env.FAILURE_URL || '';

    if (!paymentUrl || !userName || !password) {
        throw new Error('Payment configuration is missing. Please check environment variables.');
    }

    const shiftedOrderId = getAlphaOrderId(order.id);
    // Amount in Belarusian rubles (BYN) - send directly without cents conversion
    const amount = parseFloat(order.price.toFixed(2));

    const paymentInfo = await fetch(
        `${paymentUrl}register.do?amount=${amount}&userName=${userName}&password=${password}&orderNumber=${shiftedOrderId}&returnUrl=${encodeURIComponent(successUrl)}&failUrl=${encodeURIComponent(failureUrl)}&language=ru`,
        requestOptions
    );

    if (!paymentInfo.ok) {
        throw new Error(`Payment gateway request failed: ${paymentInfo.statusText}`);
    }

    const paymentResult: any = await paymentInfo.json();

    console.log('Payment result:', paymentResult);

    if (paymentResult.errorCode) {
        throw new Error(`Payment gateway error: ${paymentResult.errorMessage || paymentResult.errorCode}`);
    }

    if (!paymentResult.orderId || !paymentResult.formUrl) {
        throw new Error('Invalid payment response: missing orderId or formUrl');
    }

    return {
        orderId: paymentResult.orderId,
        formUrl: paymentResult.formUrl,
        errorCode: paymentResult.errorCode,
        errorMessage: paymentResult.errorMessage,
    };
}