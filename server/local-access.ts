import type { IncomingMessage } from 'node:http';

const localAddresses = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const localHost = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i;

/** Reject remote clients, proxy forwarding, DNS rebinding and cross-site requests. */
export function isLocalRequest(request: IncomingMessage): boolean {
  if (!request.socket?.remoteAddress || !localAddresses.has(request.socket.remoteAddress)) return false;
  if (!request.headers.host || !localHost.test(request.headers.host)) return false;
  if (request.headers.forwarded || request.headers['x-forwarded-for'] || request.headers['x-forwarded-host'] || request.headers['x-real-ip']) return false;
  if (request.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = request.headers.origin;
  if (origin) {
    try {
      const parsed = new URL(origin);
      if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !localHost.test(parsed.host) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) return false;
    } catch { return false; }
  }
  return true;
}
