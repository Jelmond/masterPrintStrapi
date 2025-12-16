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
    // Amount in kopecks (BYN cents) - AlphaBank requires amount in smallest currency unit
    // 164.90 BYN = 16490 kopecks
    const amountInRubles = parseFloat(order.price.toFixed(2));
    const amountInKopecks = Math.round(amountInRubles * 100);

    console.log('═'.repeat(80));
    console.log('🏦 ALPHABANK PAYMENT REGISTRATION');
    console.log('═'.repeat(80));
    console.log('Order ID:', order.id);
    console.log('Shifted Order ID:', shiftedOrderId);
    console.log('Amount in Rubles:', amountInRubles, 'BYN');
    console.log('Amount in Kopecks:', amountInKopecks, 'kopecks');
    console.log('Success URL:', successUrl);
    console.log('Failure URL:', failureUrl);
    console.log('═'.repeat(80));

    const paymentInfo = await fetch(
        `${paymentUrl}register.do?amount=${amountInKopecks}&userName=${userName}&password=${password}&orderNumber=${shiftedOrderId}&returnUrl=${encodeURIComponent(successUrl)}&failUrl=${encodeURIComponent(failureUrl)}&language=ru`,
        requestOptions
    );

    if (!paymentInfo.ok) {
        console.log('❌ AlphaBank HTTP Error:', paymentInfo.status, paymentInfo.statusText);
        throw new Error(`Payment gateway request failed: ${paymentInfo.statusText}`);
    }

    const paymentResult: any = await paymentInfo.json();

    console.log('═'.repeat(80));
    console.log('📥 ALPHABANK RESPONSE:');
    console.log('═'.repeat(80));
    console.log(JSON.stringify(paymentResult, null, 2));
    console.log('═'.repeat(80));

    if (paymentResult.errorCode) {
        console.log('❌ AlphaBank Error Code:', paymentResult.errorCode);
        console.log('❌ AlphaBank Error Message:', paymentResult.errorMessage);
        throw new Error(`Payment gateway error: ${paymentResult.errorMessage || paymentResult.errorCode}`);
    }

    if (!paymentResult.orderId || !paymentResult.formUrl) {
        console.log('❌ Invalid response - missing orderId or formUrl');
        throw new Error('Invalid payment response: missing orderId or formUrl');
    }

    console.log('✅ Payment registered successfully');
    console.log('   Order ID (Hash):', paymentResult.orderId);
    console.log('   Payment URL:', paymentResult.formUrl);
    console.log('═'.repeat(80));
    console.log('\n');

    return {
        orderId: paymentResult.orderId,
        formUrl: paymentResult.formUrl,
        errorCode: paymentResult.errorCode,
        errorMessage: paymentResult.errorMessage,
    };
}