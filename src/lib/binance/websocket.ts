import { environment } from '@/lib/config/environment';

export type LiveConnectionStatus =
  'connecting' | 'disconnected' | 'live' | 'reconnecting' | 'stale';

export interface LiveTicker {
  highPrice?: number;
  lowPrice?: number;
  price: number;
  priceChangePercent?: number;
  receivedAt: number;
  symbol: string;
}

interface BinanceTickerMessage {
  c?: string;
  e?: string;
  h?: string;
  l?: string;
  P?: string;
  s?: string;
}

interface BinanceCombinedTickerMessage {
  data?: BinanceTickerMessage;
}

export interface LiveTickerSubscription {
  close: () => void;
}

export function subscribeToTicker(options: {
  onStatus: (status: LiveConnectionStatus) => void;
  onTicker: (ticker: LiveTicker) => void;
  symbol: string;
}): LiveTickerSubscription {
  const symbol = options.symbol.trim().toUpperCase();

  if (!/^[A-Z0-9]{5,20}$/.test(symbol)) {
    options.onStatus('disconnected');
    return { close: () => undefined };
  }

  let socket: WebSocket | null = null;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let reconnectAttempts = 0;

  const connect = () => {
    if (closed) {
      return;
    }

    options.onStatus(reconnectAttempts === 0 ? 'connecting' : 'reconnecting');
    const connection = new WebSocket(
      `${environment.binanceWebSocketBaseUrl}/ws/${symbol.toLowerCase()}@ticker`,
    );
    socket = connection;

    connection.onopen = () => {
      if (closed || socket !== connection) {
        return;
      }
      reconnectAttempts = 0;
      options.onStatus('live');
    };

    connection.onmessage = (event: MessageEvent<string>) => {
      if (closed || socket !== connection) {
        return;
      }
      const ticker = parseTickerMessage(event.data);

      if (ticker !== null && ticker.symbol === symbol) {
        options.onTicker(ticker);
      }
    };

    connection.onclose = () => {
      if (closed || socket !== connection) {
        return;
      }

      socket = null;
      reconnectAttempts += 1;
      options.onStatus('reconnecting');
      reconnectTimer = setTimeout(connect, reconnectDelay(reconnectAttempts));
    };

    connection.onerror = () => {
      if (!closed && socket === connection) {
        connection.close();
      }
    };
  };

  connect();

  return {
    close: () => {
      closed = true;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
      }
      if (closeTimer !== null) {
        clearTimeout(closeTimer);
      }
      const activeSocket = socket;
      socket = null;
      closeTimer = setTimeout(() => activeSocket?.close(), 30_000);
      options.onStatus('disconnected');
    },
  };
}

export function subscribeToTickers(options: {
  onStatus: (status: LiveConnectionStatus) => void;
  onTicker: (ticker: LiveTicker) => void;
  symbols: string[];
}): LiveTickerSubscription {
  const symbols = [...new Set(options.symbols.map((symbol) => symbol.trim().toUpperCase()))].filter(
    (symbol) => /^[A-Z0-9]{5,20}$/.test(symbol),
  );

  if (symbols.length === 0) {
    options.onStatus('disconnected');
    return { close: () => undefined };
  }

  let socket: WebSocket | null = null;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let reconnectAttempts = 0;
  const streamNames = symbols.map((symbol) => `${symbol.toLowerCase()}@ticker`).join('/');

  const connect = () => {
    if (closed) {
      return;
    }

    options.onStatus(reconnectAttempts === 0 ? 'connecting' : 'reconnecting');
    const connection = new WebSocket(
      `${environment.binanceWebSocketBaseUrl}/stream?streams=${streamNames}`,
    );
    socket = connection;

    connection.onopen = () => {
      if (closed || socket !== connection) {
        return;
      }
      reconnectAttempts = 0;
      options.onStatus('live');
    };

    connection.onmessage = (event: MessageEvent<string>) => {
      if (closed || socket !== connection) {
        return;
      }

      const ticker = parseCombinedTickerMessage(event.data);
      if (ticker !== null && symbols.includes(ticker.symbol)) {
        options.onTicker(ticker);
      }
    };

    connection.onclose = () => {
      if (closed || socket !== connection) {
        return;
      }

      socket = null;
      reconnectAttempts += 1;
      options.onStatus('reconnecting');
      reconnectTimer = setTimeout(connect, reconnectDelay(reconnectAttempts));
    };

    connection.onerror = () => {
      if (!closed && socket === connection) {
        connection.close();
      }
    };
  };

  connect();

  return {
    close: () => {
      closed = true;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
      }
      if (closeTimer !== null) {
        clearTimeout(closeTimer);
      }
      const activeSocket = socket;
      socket = null;
      closeTimer = setTimeout(() => activeSocket?.close(), 30_000);
      options.onStatus('disconnected');
    },
  };
}

function parseTickerMessage(payload: string): LiveTicker | null {
  try {
    const message = JSON.parse(payload) as BinanceTickerMessage;
    return parseTickerPayload(message);
  } catch {
    return null;
  }
}

function parseCombinedTickerMessage(payload: string): LiveTicker | null {
  try {
    const message = JSON.parse(payload) as BinanceCombinedTickerMessage;
    return message.data === undefined ? null : parseTickerPayload(message.data);
  } catch {
    return null;
  }
}

function parseTickerPayload(message: BinanceTickerMessage): LiveTicker | null {
  const price = Number(message.c);

  if (message.e !== '24hrTicker' || !message.s || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  const highPrice = message.h === undefined ? null : Number(message.h);
  const lowPrice = message.l === undefined ? null : Number(message.l);
  const priceChangePercent = message.P === undefined ? null : Number(message.P);

  return {
    price,
    receivedAt: Date.now(),
    symbol: message.s,
    ...(highPrice !== null && Number.isFinite(highPrice) && highPrice > 0 ? { highPrice } : {}),
    ...(lowPrice !== null && Number.isFinite(lowPrice) && lowPrice > 0 ? { lowPrice } : {}),
    ...(priceChangePercent !== null && Number.isFinite(priceChangePercent)
      ? { priceChangePercent }
      : {}),
  };
}

function reconnectDelay(attempt: number): number {
  return Math.min(1_000 * 2 ** Math.min(attempt - 1, 4), 15_000);
}
