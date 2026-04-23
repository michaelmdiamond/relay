import * as net from 'net'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { SessionManager } from './session-manager'

const SOCKET_PATH = path.join(os.homedir(), '.sessionboard', 'agent.sock')

export function startIpcServer(manager: SessionManager): net.Server {
  // Clean up stale socket
  try { fs.unlinkSync(SOCKET_PATH) } catch {}

  const dir = path.dirname(SOCKET_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const server = net.createServer((socket) => {
    let buf = ''
    socket.on('data', (chunk) => {
      buf += chunk.toString()
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line)
          console.log('[IpcServer] received:', msg)
          handleMessage(manager, msg)
        } catch {}
      }
    })
  })

  server.listen(SOCKET_PATH)
  return server
}

function handleMessage(manager: SessionManager, msg: Record<string, unknown>): void {
  const pid = Number(msg.pid)
  const cwd = String(msg.cwd ?? '')

  switch (msg.type) {
    case 'register':
      manager.registerExternal(pid, cwd)
      break
    case 'deregister':
      manager.deregisterExternal(pid)
      break
    case 'update':
      manager.updateCwd(pid, cwd)
      break
    case 'notify':
      manager.notifySession(pid, String(msg.text ?? ''), cwd || undefined)
      break
  }
}
