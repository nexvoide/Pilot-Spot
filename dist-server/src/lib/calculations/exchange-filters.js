import Decimal from './financial-decimal.js';
function positive(value) {
    const result = new Decimal(value);
    if (!result.isFinite() || result.lte(0))
        throw new Error('Expected a positive finite value.');
    return result;
}
export function quantizePrice(value, tick, side) {
    const increment = positive(tick);
    return positive(value)
        .div(increment)
        .toDecimalPlaces(0, side === 'buy' ? Decimal.ROUND_FLOOR : Decimal.ROUND_CEIL)
        .mul(increment);
}
export function quantizeQuantity(value, step) {
    const increment = positive(step);
    return positive(value).div(increment).floor().mul(increment);
}
export function validateOrder(price, quantity, filters) {
    const notional = price.mul(quantity);
    if (!price.isFinite() || price.lte(0) || !quantity.isFinite() || quantity.lte(0))
        return 'Price and quantity must be positive.';
    if (!price.mod(positive(filters.tickSize)).isZero() ||
        !quantity.mod(positive(filters.stepSize)).isZero())
        return 'Price or quantity does not meet the exchange increment.';
    if (quantity.lt(filters.minQty))
        return 'Quantity is below the exchange minimum.';
    if (new Decimal(filters.maxQty).gt(0) && quantity.gt(filters.maxQty))
        return 'Quantity exceeds the exchange maximum.';
    if (filters.minNotional !== null && notional.lt(filters.minNotional))
        return 'Order value is below the exchange minimum.';
    if (filters.maxNotional !== null &&
        new Decimal(filters.maxNotional).gt(0) &&
        notional.gt(filters.maxNotional))
        return 'Order value exceeds the exchange maximum.';
    return null;
}
