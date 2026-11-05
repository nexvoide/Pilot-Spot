import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { serverConfig } from './config.js';
import { handleApiRequest } from './http.js';
import { isLocalRequest } from './local-access.js';
const staticRoot = resolve(process.cwd(), 'dist');
const server = createServer(async (request, response) => {
    if (!isLocalRequest(request)) {
        response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Local access only.');
        return;
    }
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (pathname.startsWith('/api/')) {
        await handleApiRequest(request, response);
        return;
    }
    await serveStatic(request.url ?? '/', response);
});
server.listen(serverConfig.port, serverConfig.host, () => {
    process.stdout.write(`${JSON.stringify({ host: serverConfig.host, level: 'info', port: serverConfig.port, service: 'market-data-api', message: 'server_started' })}\n`);
});
async function serveStatic(requestUrl, response) {
    const requestedPath = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname);
    const relativePath = requestedPath === '/' ? 'index.html' : requestedPath.replace(/^\/+/, '');
    const candidate = normalize(join(staticRoot, relativePath));
    const safePath = candidate.startsWith(staticRoot) ? candidate : join(staticRoot, 'index.html');
    const filePath = existsSync(safePath) && (await stat(safePath)).isFile()
        ? safePath
        : join(staticRoot, 'index.html');
    if (!existsSync(filePath)) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Application build is unavailable. Run npm run build first.');
        return;
    }
    response.writeHead(200, {
        'Cache-Control': filePath.endsWith('index.html')
            ? 'no-store'
            : 'public, max-age=31536000, immutable',
        'Content-Type': contentType(filePath),
    });
    createReadStream(filePath).pipe(response);
}
function contentType(filePath) {
    const types = {
        '.css': 'text/css; charset=utf-8',
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
        '.webmanifest': 'application/manifest+json',
    };
    return types[extname(filePath)] ?? 'application/octet-stream';
}
