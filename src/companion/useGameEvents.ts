import { useEffect } from 'react'
import { type Lang, type GameEventType, type Reaction, REACTIONS } from './locales'

interface GameEventDetail {
  type: GameEventType
  score?: number
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function useGameEvents(onSpeak: (reaction: Reaction) => void, lang: Lang) {
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<GameEventDetail>).detail
      const reactions = REACTIONS[lang][detail.type]
      if (reactions) onSpeak(pick(reactions))
    }
    window.addEventListener('game:event', handler)
    return () => window.removeEventListener('game:event', handler)
  }, [onSpeak, lang])
}
