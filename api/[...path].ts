import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleApiRequest } from '../server/http.js';

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  await handleApiRequest(request, response);
}
