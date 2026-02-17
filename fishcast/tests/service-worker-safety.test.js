import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadServiceWorker(fetchImpl = async () => new Response('ok', { status: 200 })) {
  const listeners = new Map();
  const context = {
    console,
    URL,
    Response,
    Request,
    fetch: fetchImpl,
    setTimeout,
    clearTimeout,
    self: {
      location: { origin: 'https://example.com', hostname: 'localhost' },
      addEventListener: (type, cb) => listeners.set(type, cb),
      skipWaiting: () => Promise.resolve(),
      clients: { claim: () => Promise.resolve() }
    },
    caches: {
      open: async () => ({ addAll: async () => {}, put: async () => {} }),
      keys: async () => [],
      delete: async () => true,
      match: async () => null
    }
  };

  vm.createContext(context);
  const swSource = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  vm.runInContext(swSource, context);
  return { listeners };
}

test('service worker returns 204 for /null requests', async () => {
  const { listeners } = loadServiceWorker();
  const fetchListener = listeners.get('fetch');
  let responsePromise;
  fetchListener({
    request: new Request('https://example.com/fishcast/null', { method: 'GET' }),
    respondWith: (promise) => { responsePromise = promise; }
  });

  const response = await responsePromise;
  assert.equal(response.status, 204);
});

test('service worker fetch wrapper never throws on network failure for non-navigation requests', async () => {
  const { listeners } = loadServiceWorker(async () => { throw new TypeError('Load failed'); });
  const fetchListener = listeners.get('fetch');
  let responsePromise;
  fetchListener({
    request: new Request('https://example.com/fishcast/styles/main.css', { method: 'GET' }),
    respondWith: (promise) => { responsePromise = promise; }
  });

  const response = await responsePromise;
  assert.equal(response.status, 204);
});
