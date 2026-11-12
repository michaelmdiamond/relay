// Isolated runtime smoke: no user files, credentials, providers or scheduled work.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const { createTrustedIpc } = require('../dist/main/ipc-security');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-security-smoke-'));
app.setPath('userData', scratch);
const timeout = setTimeout(() => { console.error('Runtime smoke timed out'); app.exit(1); }, 20000);
app.whenReady().then(async () => {
  const file = path.resolve(__dirname, '../dist/renderer/index.html');
  const win = new BrowserWindow({ show: false, webPreferences: {
    preload: path.resolve(__dirname, '../dist/preload/index.js'),
    contextIsolation: true, nodeIntegration: false, sandbox: true,
  }});
  const safe = createTrustedIpc(ipcMain, () => win, pathToFileURL(file).href);
  for (const channel of ['get-api-key-status', 'get-gemini-key-status', 'get-deepseek-key-status', 'get-cursor-key-status']) safe.handle(channel, () => ({ configured: false }));
  safe.handle('get-openai-auth-status', () => ({ connected: false }));
  for (const channel of ['get-tasks', 'get-workspaces', 'get-conversations', 'get-workflow-definitions', 'get-workflow-runs', 'get-experiments', 'get-automation-catalog', 'get-agent-profiles', 'get-scheduled-automations', 'get-codex-models', 'terminal-list']) safe.handle(channel, () => []);
  for (const channel of ['get-codex-model', 'get-gemini-model', 'get-deepseek-model']) safe.handle(channel, () => 'test-model');
  safe.handle('get-ollama-status', () => ({ configured: false }));
  const failures = [];
  win.webContents.on('preload-error', (_event, _path, error) => failures.push(String(error)));
  await win.loadFile(file);
  const status = await win.webContents.executeJavaScript('window.api.getApiKeyStatus()');
  assert.equal(status.configured, false);
  await new Promise(resolve => setTimeout(resolve, 500));
  const state = await win.webContents.executeJavaScript('({ text: document.body.innerText, node: typeof require, csp: document.querySelector("meta[http-equiv=Content-Security-Policy]").content })');
  assert.equal(state.node, 'undefined');
  assert.ok(state.text.length > 40, 'Production React UI renders');
  assert.ok(state.csp.includes("script-src 'self'"));
  assert.deepEqual(failures, []);
  const other = new BrowserWindow({ show: false, webPreferences: { preload: path.resolve(__dirname, '../dist/preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }});
  const foreign = path.join(scratch, 'foreign.html');
  fs.writeFileSync(foreign, '<!doctype html><title>Untrusted fixture</title>');
  await other.loadFile(foreign);
  assert.match(await other.webContents.executeJavaScript('window.api.getApiKeyStatus().then(() => "bad", error => error.message)'), /Untrusted IPC sender/);
  const pty = require('node-pty');
  await new Promise((resolve, reject) => {
    let output = '';
    const child = pty.spawn('/bin/sh', ['-c', 'printf relay-native-ok'], { cwd: scratch, env: { PATH: '/usr/bin:/bin' } });
    child.onData(data => output += data);
    child.onExit(({exitCode}) => { try { assert.equal(exitCode, 0); assert.match(output, /relay-native-ok/); resolve(); } catch (e) { reject(e); } });
  });
  console.log('PASS: production UI, sandboxed preload, trusted IPC, foreign-window rejection and native terminal');
  other.destroy(); win.destroy(); clearTimeout(timeout); app.exit(0);
}).catch(error => { console.error(error); clearTimeout(timeout); app.exit(1); });
