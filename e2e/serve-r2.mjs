/**
 * HTTP bridge for the Profile C e2e leg (ticket #103): serves the
 * bucket state written by `run-pipeline.mjs` through the REAL
 * `serveStatusV1` route from the compiled Worker module — the same
 * code path a Cloudflare deployment runs behind its custom domain.
 * Node's fetch primitives (Request/Response) stand in for the Workers
 * runtime; the route logic is byte-for-byte the shipped one.
 *
 * Usage: node e2e/serve-r2.mjs [state-file] [port]
 */
import http from 'node:http';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {FileBackedR2Bucket} from './r2-bucket.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const STATE_FILE =
  process.argv[2] ?? path.join(ROOT, 'fixtures', 'site', '.r2-bucket.json');
const PORT = Number(process.argv[3] ?? 39991);

const {default: worker} = require(path.join(ROOT, 'packages', 'probe', 'lib', 'worker.js'));

const bucket = FileBackedR2Bucket.loadFrom(STATE_FILE);
const env = {STATUS_BUCKET: bucket};

const server = http.createServer(async (req, res) => {
  try {
    const headers = {};
    for (const [name, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers[name] = value;
    }
    const request = new Request(`http://127.0.0.1:${PORT}${req.url}`, {
      method: req.method,
      headers,
    });
    const response = await worker.fetch(request, env);
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    const body = await response.arrayBuffer();
    res.end(body.byteLength > 0 ? Buffer.from(body) : undefined);
  } catch (error) {
    res.writeHead(500);
    res.end(String(error));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[serve-r2] serving ${STATE_FILE} on http://127.0.0.1:${PORT}`);
});
