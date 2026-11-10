export function redirectTarget(command: string): string {
  const m = /(?:^|\s)(?:&>>?|1?>>?)\s*([^\s;&|<>()]+)/.exec(command)
  return m?.[1] ?? ''
}

export function commandDir(command: string): string {
  return /^\s*cd\s+([^\s;&|]+)\s*&&/.exec(command)?.[1] ?? ''
}
