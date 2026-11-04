import { spawn } from 'node:child_process';

const api = spawn('npx', ['tsx', 'watch', 'server/index.ts'], { stdio: 'inherit' });
const client = spawn('npx', ['vite'], { stdio: 'inherit' });

function stop() {
  api.kill('SIGTERM');
  client.kill('SIGTERM');
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
api.on('exit', (code) => {
  if (code !== 0) {
    stop();
    process.exitCode = code ?? 1;
  }
});
client.on('exit', (code) => {
  if (code !== 0) {
    stop();
    process.exitCode = code ?? 1;
  }
});
