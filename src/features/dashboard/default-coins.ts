export const defaultCoins = [
  {
    logoUrl: '/coin-logos/sui.png',
    name: 'Sui',
    symbol: 'SUI',
  },
  {
    logoUrl: '/coin-logos/sol.png',
    name: 'Solana',
    symbol: 'SOL',
  },
  {
    logoUrl: '/coin-logos/btc.png',
    name: 'Bitcoin',
    symbol: 'BTC',
  },
  {
    logoUrl: '/coin-logos/bnb.png',
    name: 'BNB',
    symbol: 'BNB',
  },
  {
    logoUrl: '/coin-logos/aave.png',
    name: 'Aave',
    symbol: 'AAVE',
  },
  {
    logoUrl: '/coin-logos/link.png',
    name: 'Chainlink',
    symbol: 'LINK',
  },
  {
    logoUrl: '/coin-logos/eth.png',
    name: 'Ethereum',
    symbol: 'ETH',
  },
  {
    logoUrl: '/coin-logos/hype.jpg',
    name: 'Hyperliquid',
    symbol: 'HYPE',
  },
  {
    logoUrl: '/coin-logos/uni.png',
    name: 'Uniswap',
    symbol: 'UNI',
  },
  {
    logoUrl: '/coin-logos/inj.png',
    name: 'Injective',
    symbol: 'INJ',
  },
  {
    logoUrl: '/coin-logos/near.jpg',
    name: 'NEAR Protocol',
    symbol: 'NEAR',
  },
  {
    logoUrl: '/coin-logos/zec.png',
    name: 'Zcash',
    symbol: 'ZEC',
  },
  {
    logoUrl: '/coin-logos/xrp.png',
    name: 'XRP',
    symbol: 'XRP',
  },
] as const;

export type DefaultCoin = (typeof defaultCoins)[number];
