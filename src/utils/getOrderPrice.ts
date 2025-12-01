/**
 * Calculate order total from order items
 * This function calculates the total price based on order items
 */
export function calculateOrderTotal(orderItems: Array<{ quantity: number; unitPrice: number }>): number {
    return orderItems.reduce((total, item) => {
        return total + (item.quantity * item.unitPrice);
    }, 0);
}
