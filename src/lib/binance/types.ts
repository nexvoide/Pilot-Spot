export type KlineInterval = '15m' | '1h' | '4h' | '1d';

export interface BinanceSymbol {
  baseAsset: string;
  quoteAsset: string;
  status: string;
  symbol: string;
}

export interface MarketCandle {
  close: number;
  closeTime: number;
  high: number;
  low: number;
  open: number;
  openTime: number;
  volume: number;
}

export interface MarketSnapshot {
  candles: Record<'15m' | '1h' | '4h', MarketCandle[]> & { '1d'?: MarketCandle[] };
  currentPrice: number;
  symbol: string;
}
