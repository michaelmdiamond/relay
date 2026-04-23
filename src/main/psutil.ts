import { execSync } from 'child_process'

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export function getCwd(pid: number): string | null {
  try {
    // macOS
    const out = execSync(`lsof -p ${pid} -a -d cwd -Fn 2>/dev/null`, {
      encoding: 'utf8',
      timeout: 1000,
    })
    const match = out.match(/\nn(.+)/)
    return match ? match[1].trim() : null
  } catch {
    return null
  }
}
