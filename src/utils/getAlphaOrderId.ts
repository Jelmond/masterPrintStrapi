export function getAlphaOrderId(orderId: number) {
    return orderId + Number(process.env.SHIFT_ORDER_ID || 1000)
}