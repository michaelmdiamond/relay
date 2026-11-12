const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTrustedIpc, isTrustedRendererUrl, externalBrowserUrl } = require('../dist/main/ipc-security');
test('only exact renderer document or dev origin is trusted', () => {
  assert.equal(isTrustedRendererUrl('file:///app/index.html#view', 'file:///app/index.html'), true);
  for (const url of ['https://evil.test', 'file:///other/index.html', 'file://evil/app/index.html']) assert.equal(isTrustedRendererUrl(url, 'file:///app/index.html'), false);
  assert.equal(isTrustedRendererUrl('http://localhost:5173/', 'http://localhost:5173/'), true);
  assert.equal(isTrustedRendererUrl('http://localhost:5174/', 'http://localhost:5173/'), false);
});
test('IPC checks window and main frame before invoking privileged work', () => {
  let handler, listener, calls = 0;
  const frame = { url: 'file:///app/index.html' };
  const contents = { mainFrame: frame };
  const window = { isDestroyed: () => false, webContents: contents };
  const ipc = createTrustedIpc({ handle: (_c, fn) => handler = fn, on: (_c, fn) => listener = fn }, () => window, frame.url);
  ipc.handle('privileged', (_event, value) => { calls++; return value; });
  ipc.on('terminal-input', () => { calls++; });
  assert.equal(handler({ sender: contents, senderFrame: frame }, 'valid'), 'valid');
  for (const event of [{ sender: {}, senderFrame: frame }, { sender: contents, senderFrame: { url: frame.url } }, { sender: contents, senderFrame: null }]) {
    assert.throws(() => handler(event), /Untrusted/); listener(event);
  }
  frame.url = 'https://foreign.test';
  assert.throws(() => handler({ sender: contents, senderFrame: frame }), /Untrusted/);
  assert.equal(calls, 1);
});

test('external web links work without permitting privileged protocols', () => {
  assert.equal(externalBrowserUrl('https://example.test/help'), 'https://example.test/help');
  for (const url of ['file:///private/data', 'javascript:alert(1)', 'https://user:password@example.test', 'custom:run']) assert.equal(externalBrowserUrl(url), null);
});
