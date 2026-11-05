import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleApiRequest } from './http.js';
import { isLocalRequest } from './local-access.js';

interface Options {
  path?: string;
  method?: string;
  body?: unknown;
  remoteAddress?: string;
  headers?: Record<string, string>;
}

function requestFor(options: Options = {}): IncomingMessage {
  const request = Readable.from(options.body === undefined ? [] : [JSON.stringify(options.body)]) as IncomingMessage;
  request.method = options.method ?? 'GET';
  request.url = options.path ?? '/api/not-found';
  request.headers = { host: '127.0.0.1:8787', 'content-type': 'application/json', ...options.headers };
  Object.defineProperty(request, 'socket', { value: { remoteAddress: options.remoteAddress ?? '127.0.0.1' } });
  return request;
}

async function call(options: Options = {}, publicAccess = false) {
  let status = 0;
  let payload = '';
  const response = {
    setHeader() {},
    writeHead(value: number) { status = value; },
    end(value: string) { payload = value; },
  } as unknown as ServerResponse;
  await handleApiRequest(requestFor(options), response, { publicAccess });
  return { status, payload: JSON.parse(payload) as { error?: { code?: string } } };
}

afterEach(() => { vi.unstubAllEnvs(); });

describe('localhost-only access', () => {
  it('accepts loopback clients with local hosts and development origins', () => {
    expect(isLocalRequest(requestFor())).toBe(true);
    expect(isLocalRequest(requestFor({ remoteAddress: '::1', headers: { host: 'localhost:5173', origin: 'http://localhost:5173' } }))).toBe(true);
    expect(isLocalRequest(requestFor({ headers: { origin: 'http://localhost:5173', 'sec-fetch-site': 'same-site' } }))).toBe(true);
  });

  const rejectedRequests: Options[] = [
    { remoteAddress: '192.0.2.10' },
    { headers: { host: 'public.example' } },
    { headers: { origin: 'https://public.example' } },
    { headers: { 'sec-fetch-site': 'cross-site' } },
    { headers: { 'x-forwarded-for': '192.0.2.10' } },
    { headers: { forwarded: 'for=192.0.2.10' } },
  ];
  it.each(rejectedRequests)('rejects remote, forwarded, DNS-rebinding and cross-site requests: %o', async (options) => {
    const response = await call({ ...options, path: '/api/not-found' });
    expect(response.status).toBe(403);
    expect(response.payload.error?.code).toBe('LOCAL_ACCESS_ONLY');
  });

  it('makes the API directly accessible without sign-in or session state', async () => {
    expect((await call()).status).toBe(404);
    expect((await call({ path: '/api/auth/status' })).status).toBe(404);
    expect((await call({ path: '/api/not-found', method: 'POST', body: {} })).status).toBe(405);
    expect((await call({ path: '/api/ai/smart-ladder', method: 'POST', body: {} })).status).toBe(405);
  });

  it('allows the public deployment entry point while still restricting HTTP methods', async () => {
    const remote = { remoteAddress: '192.0.2.10', headers: { host: 'app.example', 'x-forwarded-for': '192.0.2.10' } };
    expect((await call(remote, true)).status).toBe(404);
    expect((await call({ ...remote, method: 'POST' }, true)).status).toBe(405);
  });

  it('does not allow HOST to change the production server bind address', async () => {
    vi.stubEnv('HOST', '0.0.0.0');
    vi.resetModules();
    const { serverConfig } = await import('./config.js');
    expect(serverConfig.host).toBe('127.0.0.1');
  });

});
