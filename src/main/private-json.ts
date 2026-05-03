import * as fs from 'fs'

export function writePrivateJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) ?? 'null', { mode: 0o600 })
  try {
    fs.chmodSync(filePath, 0o600)
  } catch {
    // Best effort: new files are created with 0600 above; chmod may fail on unusual filesystems.
  }
}
