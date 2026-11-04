export class ApiError extends Error {
    status;
    code;
    retryAfterSeconds;
    constructor(message, status, code, retryAfterSeconds) {
        super(message);
        this.status = status;
        this.code = code;
        this.retryAfterSeconds = retryAfterSeconds;
        this.name = 'ApiError';
    }
}
export class UpstreamError extends Error {
    provider;
    status;
    retryAfterSeconds;
    constructor(message, provider, status, retryAfterSeconds) {
        super(message);
        this.provider = provider;
        this.status = status;
        this.retryAfterSeconds = retryAfterSeconds;
        this.name = 'UpstreamError';
    }
}
