import type { GameState, LogEntry } from './types'

const LOG_SIZE = 80

/** Générateur pseudo-aléatoire déterministe (mulberry32) stocké dans l'état pour des parties reproductibles. */
export function rand(s: GameState): number {
  let t = (s.seed = (s.seed + 0x6d2b79f5) | 0)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export const randRange = (s: GameState, min: number, max: number) => min + rand(s) * (max - min)
export const pick = <T>(s: GameState, arr: T[]): T => arr[Math.floor(rand(s) * arr.length)]
export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
export const round2 = (v: number) => Math.round(v * 100) / 100

export function update(s: GameState, fn: (d: GameState) => void): GameState {
  const d = structuredClone(s)
  fn(d)
  return d
}

export function log(s: GameState, text: string, tone: LogEntry['tone'] = 'info') {
  s.log.unshift({ day: s.day, text, tone })
  if (s.log.length > LOG_SIZE) s.log.length = LOG_SIZE
}

export const newId = (s: GameState, prefix: string) => `${prefix}${s.nextId++}`
