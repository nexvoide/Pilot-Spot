import { Decimal } from 'decimal.js';

// Precision applies to significant digits; rounding is performed explicitly for exchange increments.
Decimal.set({ precision: 80, rounding: Decimal.ROUND_HALF_UP });

export default Decimal;
