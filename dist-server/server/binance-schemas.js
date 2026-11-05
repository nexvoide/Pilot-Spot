import { z } from 'zod';
export const exchangeInfoSchema = z.object({
    symbols: z.array(z.object({
        baseAsset: z.string().min(1),
        filters: z.array(z.object({ filterType: z.string() }).catchall(z.unknown())).optional(),
        isSpotTradingAllowed: z.boolean().optional(),
        quoteAsset: z.string().min(1),
        status: z.string().min(1),
        symbol: z.string().min(1),
    })),
});
export const tickerPriceSchema = z.object({
    price: z.string().regex(/^\d+(?:\.\d+)?$/),
    symbol: z.string().min(1),
});
export const ticker24HourSchema = z.object({
    highPrice: z.string().regex(/^\d+(?:\.\d+)?$/),
    lastPrice: z.string().regex(/^\d+(?:\.\d+)?$/),
    lowPrice: z.string().regex(/^\d+(?:\.\d+)?$/),
    priceChangePercent: z.string(),
    quoteVolume: z.string(),
    symbol: z.string().min(1),
    volume: z.string(),
});
export const klinesSchema = z.array(z.array(z.union([z.string(), z.number()])).min(7));
