import { useCallback, useEffect, useState } from 'react'
import { migrate, newGame, tick } from '../game/engine'
import type { GameState } from '../game/types'

const SAVE_KEY = 'tycoon-save'
/** Durée d'une journée de jeu (ms) pour chaque vitesse. */
export const SPEEDS = [0, 1500, 600, 200]

function load(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    return migrate(JSON.parse(raw) as GameState)
  } catch {
    return null
  }
}

export function useGame() {
  const [state, setState] = useState<GameState>(() => load() ?? newGame())
  const [speed, setSpeed] = useState(0)

  useEffect(() => {
    if (!speed || state.gameOver) return
    const id = setInterval(() => setState(tick), SPEEDS[speed])
    return () => clearInterval(id)
  }, [speed, state.gameOver])

  useEffect(() => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state))
    } catch {
      // Sauvegarde indisponible (navigation privée) : la partie continue sans.
    }
  }, [state])

  /** Applique une action du moteur : act(setPrice, businessId, productId, 3.5). */
  const act = useCallback(<A extends unknown[]>(fn: (s: GameState, ...args: A) => GameState, ...args: A) => {
    setState((s) => fn(s, ...args))
  }, [])

  const restart = useCallback(() => {
    setSpeed(0)
    setState(newGame())
  }, [])

  return { state, act, speed, setSpeed, restart }
}

export type Act = ReturnType<typeof useGame>['act']
