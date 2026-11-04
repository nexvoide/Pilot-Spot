import { afterEach, describe, expect, it, vi } from 'vitest';
import { subscribeToTicker, subscribeToTickers } from '@/lib/binance/websocket';

class MockWebSocket {
  public static instances: MockWebSocket[] = [];
  public onclose: (() => void) | null = null;
  public onerror: (() => void) | null = null;
  public onmessage: ((event: MessageEvent<string>) => void) | null = null;
  public onopen: (() => void) | null = null;

  public constructor(public readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  public close = vi.fn();
}

describe('subscribeToTicker', () => {
  afterEach(() => {
    MockWebSocket.instances = [];
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('does not let a stale socket error close a newer reconnecting socket', () => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', MockWebSocket);
    const subscription = subscribeToTicker({
      onStatus: vi.fn(),
      onTicker: vi.fn(),
      symbol: 'BTCUSDT',
    });
    const firstSocket = MockWebSocket.instances[0];

    firstSocket.onclose?.();
    vi.advanceTimersByTime(1_000);
    const secondSocket = MockWebSocket.instances[1];

    firstSocket.onerror?.();

    expect(secondSocket.close).not.toHaveBeenCalled();
    subscription.close();
  });

  it('subscribes only to the selected public ticker and validates incoming prices', () => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    const onStatus = vi.fn();
    const onTicker = vi.fn();
    const subscription = subscribeToTicker({ onStatus, onTicker, symbol: 'BTCUSDT' });
    const socket = MockWebSocket.instances[0];

    expect(socket.url).toContain('/ws/btcusdt@ticker');
    expect(onStatus).toHaveBeenCalledWith('connecting');

    socket.onopen?.();
    socket.onmessage?.({
      data: JSON.stringify({ c: '50000.10', e: '24hrTicker', s: 'BTCUSDT' }),
    } as MessageEvent<string>);
    socket.onmessage?.({
      data: JSON.stringify({ c: 'invalid', e: '24hrTicker', s: 'BTCUSDT' }),
    } as MessageEvent<string>);

    expect(onStatus).toHaveBeenCalledWith('live');
    expect(onTicker).toHaveBeenCalledTimes(1);
    expect(onTicker).toHaveBeenCalledWith(
      expect.objectContaining({ price: 50000.1, symbol: 'BTCUSDT' }),
    );

    subscription.close();
    expect(onStatus).toHaveBeenLastCalledWith('disconnected');
  });

  it('uses one combined stream for the market watchlist', () => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    const onTicker = vi.fn();
    const subscription = subscribeToTickers({
      onStatus: vi.fn(),
      onTicker,
      symbols: ['BTCUSDT', 'SOLUSDT'],
    });
    const socket = MockWebSocket.instances[0];

    expect(socket.url).toContain('/stream?streams=btcusdt@ticker/solusdt@ticker');

    socket.onmessage?.({
      data: JSON.stringify({
        data: { c: '100.25', e: '24hrTicker', s: 'SOLUSDT' },
        stream: 'solusdt@ticker',
      }),
    } as MessageEvent<string>);

    expect(onTicker).toHaveBeenCalledWith(
      expect.objectContaining({ price: 100.25, symbol: 'SOLUSDT' }),
    );
    subscription.close();
  });
});
