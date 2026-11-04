import { describe, expect, it } from 'vitest';
import { UpstreamError } from './errors.js';
import { mapError } from './http.js';

describe('market-data API error mapping', () => {
  it.each([418, 429])('maps upstream rate-limit response %i to a safe API error', (status) => {
    const error = mapError(new UpstreamError('Rate limited', 'primary', status, 5));

    expect(error).toMatchObject({
      code: 'UPSTREAM_RATE_LIMITED',
      retryAfterSeconds: 5,
      status: 503,
    });
  });

  it('does not leak provider failure details to API consumers', () => {
    const error = mapError(new UpstreamError('Internal upstream detail', 'fallback', 504));

    expect(error).toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
      status: 502,
    });
    expect(error.message).not.toContain('Internal upstream detail');
  });
});
