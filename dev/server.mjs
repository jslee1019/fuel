import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import handler from '../api/compare.mjs';

const root = process.cwd();
const port = Number(process.env.PORT || 8768);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
http.createServer(async (req, res) => {
  if (req.url?.split('?')[0] === '/api/compare') {
    const chunks = [];
    for await (const chunk of req) { chunks.push(chunk); if (Buffer.concat(chunks).length > 5000) { res.writeHead(413).end(); return; } }
    req.body = Buffer.concat(chunks).toString('utf8');
    res.status = code => { res.statusCode = code; return res; };
    res.json = value => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(value)); return res; };
    return handler(req, res);
  }
  try {
    const url = new URL(req.url, 'http://localhost');
    const path = resolve(root, '.' + decodeURIComponent(url.pathname));
    if ((path !== root && !path.startsWith(root + sep)) || url.pathname.includes('..')) { res.writeHead(403).end(); return; }
    if (url.pathname.endsWith('/taxi/config.js')) {
      const content = await readFile(resolve(root, 'taxi/config.js'), 'utf8');
      res.writeHead(200, { 'Content-Type': types['.js'], 'Cache-Control': 'no-store' }).end(content + '\nwindow.TAXI_CONFIG = Object.freeze({...window.TAXI_CONFIG, routingEndpoint: "/api/compare"});');
      return;
    }
    const file = path + (url.pathname.endsWith('/') ? '/index.html' : '');
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(content);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Local preview: http://127.0.0.1:${port}/taxi/`));
