/**
 * Mock endpoints for the pipeline fixture harness (ticket #66).
 * alpha → 200 with small latency; beta → 500 on every check.
 */
import http from 'node:http';

export function startMockServer(port = 39990) {
  const server = http.createServer((req, res) => {
    if (req.url?.startsWith('/alpha')) {
      setTimeout(() => {
        res.writeHead(200, {'content-type': 'application/json'});
        res.end('{"ok":true}');
      }, 25);
      return;
    }
    if (req.url?.startsWith('/beta')) {
      res.writeHead(500, {'content-type': 'application/json'});
      res.end('{"ok":false}');
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}
