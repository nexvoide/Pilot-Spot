import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  endpoint: string;
  requestId: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();
