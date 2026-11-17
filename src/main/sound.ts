import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const RATE = 44_100
const NOTES: [number, number, number][] = [
  [783.99, 0, 0.5],
  [1174.66, 0.11, 0.45],
  [1567.98, 0.22, 0.6]
]

export function doneChime(): Buffer {
  const seconds = Math.max(...NOTES.map(([, at, len]) => at + len))
  const n = Math.round(seconds * RATE)
  const samples = new Float32Array(n)
  for (const [freq, at, len] of NOTES) {
    const start = Math.round(at * RATE)
    for (let i = 0; i < len * RATE && start + i < n; i++) {
      const t = i / RATE
      const env = Math.min(1, t / 0.006) * Math.exp(-t * 7)
      samples[start + i] = (samples[start + i] ?? 0) + env * (Math.sin(2 * Math.PI * freq * t) + 0.25 * Math.sin(4 * Math.PI * freq * t)) * 0.22
    }
  }
  const data = Buffer.alloc(n * 2)
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i] ?? 0)) * 32_767), i * 2)
  const head = Buffer.alloc(44)
  head.write('RIFF', 0)
  head.writeUInt32LE(36 + data.length, 4)
  head.write('WAVE', 8)
  head.write('fmt ', 12)
  head.writeUInt32LE(16, 16)
  head.writeUInt16LE(1, 20)
  head.writeUInt16LE(1, 22)
  head.writeUInt32LE(RATE, 24)
  head.writeUInt32LE(RATE * 2, 28)
  head.writeUInt16LE(2, 32)
  head.writeUInt16LE(16, 34)
  head.write('data', 36)
  head.writeUInt32LE(data.length, 40)
  return Buffer.concat([head, data])
}

export async function playDoneSound(dir: string, log: (m: string) => void = () => {}): Promise<void> {
  const file = join(dir, 'kokpit-done-v1.wav')
  try {
    if (!existsSync(file)) await writeFile(file, doneChime())
    execFile('afplay', [file], (err) => err && log(`done sound: ${err.message}`))
  } catch (err) {
    log(`done sound: ${(err as Error).message}`)
  }
}
