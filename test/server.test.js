import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.mjs';

test('servidor entrega o aplicativo e protege arquivos não públicos', async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(base);
    assert.equal(response.status, 200);
    assert.ok((await response.text()).includes('Estudo hídrico integrado'));
    assert.ok(response.headers.get('content-security-policy').includes("script-src 'self'"));
    for (const path of ['/src/app.js', '/src/model.js', '/src/style.css']) {
      const r = await fetch(base + path); assert.equal(r.status, 200);
      assert.ok((await r.text()).length > 0);
    }
    for (const path of ['/README.md', '/.git/config', '/package.json', '/nao-existe']) {
      assert.equal((await fetch(base + path)).status, 404);
    }
    assert.equal((await fetch(base, { method: 'POST' })).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
