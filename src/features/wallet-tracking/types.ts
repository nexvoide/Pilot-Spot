export interface WalletPosition {
  coin: string;
  size: number;
  entryPrice: number | null;
  positionValue: number | null;
  unrealizedPnl: number | null;
  returnOnEquity: number | null;
  liquidationPrice: number | null;
  marginUsed: number | null;
  leverage: number | null;
  marginMode: string | null;
  fundingSinceOpen: number | null;
}

export interface WalletOrder {
  id: number;
  coin: string;
  side: "Buy" | "Sell";
  size: number;
  limitPrice: number | null;
  orderType: string;
  reduceOnly: boolean;
}

export interface WalletDetails {
  updatedAt: number;
  account: {
    accountValue: number | null;
    marginUsed: number | null;
    positionValue: number | null;
    withdrawable: number | null;
    positions: WalletPosition[];
  } | null;
  portfolio: { dayPnl: number | null; allTimePnl: number | null } | null;
  orders: WalletOrder[] | null;
}

export interface WalletExtras {
  updatedAt: number;
  portfolio: WalletDetails["portfolio"];
  orders: WalletDetails["orders"];
}

export interface WalletWinRates {
  updatedAt: number;
  historyLimited: boolean;
  requestWeight?: number;
  periods: Record<
    "7d" | "30d",
    { wins: number; losses: number; breakeven: number; winRate: number | null }
  >;
}
