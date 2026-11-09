/**
 * Camada HTTP mínima para este projeto local.
 * Substitui dependências de servidor externas e mantém somente os métodos
 * efetivamente utilizados pelas rotas do B2B Inteligente.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};

function enhanceResponse(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.set = (key, value) => { res.setHeader(key, value); return res; };
  res.append = (key, value) => {
    const previous = res.getHeader(key);
    res.setHeader(key, previous === undefined ? value : [...(Array.isArray(previous) ? previous : [previous]), value]);
    return res;
  };
  res.type = (type) => {
    res.setHeader('Content-Type', MIME['.' + type] || (type.includes('/') ? type : `text/${type}; charset=utf-8`));
    return res;
  };
  res.send = (body) => {
    if (res.writableEnded) return res;
    if (!res.hasHeader('Content-Type')) res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(String(body));
    return res;
  };
  res.json = (payload) => {
    if (res.writableEnded) return res;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
    return res;
  };
  res.redirect = (url) => {
    res.statusCode = 302;
    res.setHeader('Location', url);
    res.end();
    return res;
  };
  res.sendFile = async (file) => {
    try {
      const content = await readFile(file);
      if (res.writableEnded) return;
      res.setHeader('Content-Type', MIME[extname(file).toLowerCase()] || 'application/octet-stream');
      res.end(content);
    } catch (error) {
      if (!res.writableEnded) res.status(500).send('Falha ao carregar arquivo.');
      console.error('Falha ao ler arquivo:', error.message);
    }
  };
}

function routePattern(pattern) {
  const keys = [];
  const chunks = pattern.split('/').map((chunk) => {
    if (chunk.startsWith(':')) { keys.push(chunk.slice(1)); return '([^/]+)'; }
    return chunk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  return { regex: new RegExp(`^${chunks.join('/')}/?$`), keys };
}

export default function httpApp() {
  const layers = [];
  const app = {
    disable() { return app; },
    set() { return app; },
    use(handler) { layers.push({ handler }); return app; },
    get(pattern, ...handlers) { addRoute('GET', pattern, handlers); return app; },
    post(pattern, ...handlers) { addRoute('POST', pattern, handlers); return app; },
    patch(pattern, ...handlers) { addRoute('PATCH', pattern, handlers); return app; },
    listen(port, host, callback) {
      const server = createServer((req, res) => {
        enhanceResponse(res);
        let path;
        try {
          const url = new URL(req.url, 'http://localhost');
          path = decodeURIComponent(url.pathname);
        } catch { res.status(400).send('Endereço inválido.'); return; }
        if (path.includes('\0') || path.includes('\\')) { res.status(400).send('Endereço inválido.'); return; }
        req.path = path;
        req.params = {};
        let index = 0;
        const next = (error) => {
          if (res.writableEnded) return;
          while (index < layers.length) {
            const layer = layers[index++];
            if (Boolean(error) !== (layer.handler.length === 4)) continue;
            if (layer.method && layer.method !== req.method) continue;
            if (layer.regex) {
              const match = layer.regex.exec(path);
              if (!match) continue;
              req.params = Object.fromEntries(layer.keys.map((key, i) => [key, match[i + 1]]));
            }
            try {
              const result = error ? layer.handler(error, req, res, next) : layer.handler(req, res, next);
              if (result && typeof result.then === 'function') result.catch(next);
            } catch (err) { next(err); }
            return;
          }
          if (!res.writableEnded) res.status(500).json({ error: error ? 'Erro interno.' : 'Rota não finalizada.' });
        };
        next();
      });
      return server.listen(port, host, callback);
    }
  };
  function addRoute(method, pattern, handlers) {
    const { regex, keys } = routePattern(pattern);
    // Middleware por rota: cada um pode chamar next() para continuar.
    for (const handler of handlers) layers.push({ method, regex, keys, handler });
  }
  return app;
}

httpApp.json = function json({ limit = '32kb' } = {}) {
  const maxBytes = parseInt(limit, 10) * (String(limit).toLowerCase().includes('kb') ? 1024 : 1);
  return async (req, res, next) => {
    if (!['POST', 'PATCH', 'PUT'].includes(req.method)) { req.body = {}; return next(); }
    if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
      return res.status(415).json({ error: 'Envie os dados como JSON.' });
    }
    const chunks = [];
    let size = 0;
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > maxBytes) return res.status(413).json({ error: 'Requisição muito grande.' });
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString('utf8');
      req.body = body ? JSON.parse(body) : {};
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({ error: 'O corpo JSON deve ser um objeto.' });
      }
      next();
    } catch {
      if (!res.writableEnded) res.status(400).json({ error: 'JSON inválido.' });
    }
  };
};

httpApp.static = function staticFiles(root, _options = {}) {
  const directory = resolve(root);
  return async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    let file = resolve(directory, '.' + req.path);
    if (req.path === '/') file = resolve(directory, 'index.html');
    if (file !== directory && !file.startsWith(directory + sep)) return next();
    if (req.path.split('/').some((segment) => segment.startsWith('.') && segment.length > 1)) return next();
    try {
      const info = await stat(file);
      if (!info.isFile()) return next();
      const content = await readFile(file);
      res.setHeader('Content-Type', MIME[extname(file).toLowerCase()] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-cache');
      if (req.method === 'HEAD') res.end();
      else res.end(content);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return next();
      next(error);
    }
  };
};

export function rateLimit({ windowMs, limit, message, standardHeaders = true } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.socket.remoteAddress || 'local';
    const item = hits.get(key);
    const current = !item || now >= item.reset ? { count: 0, reset: now + windowMs } : item;
    current.count++;
    hits.set(key, current);
    if (hits.size > 1000) for (const [ip, data] of hits) if (data.reset <= now) hits.delete(ip);
    if (standardHeaders) {
      res.setHeader('RateLimit-Limit', String(limit));
      res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - current.count)));
      res.setHeader('RateLimit-Reset', String(Math.ceil((current.reset - now) / 1000)));
    }
    if (current.count > limit) {
      res.setHeader('Retry-After', String(Math.ceil((current.reset - now) / 1000)));
      return res.status(429).json(message || { error: 'Limite de requisições excedido.' });
    }
    next();
  };
}
