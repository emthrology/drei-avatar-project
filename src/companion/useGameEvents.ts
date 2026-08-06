import { useEffect } from 'react';
import {
  type Lang,
  type GameEventType,
  type Reaction,
  type MoodName,
  REACTIONS,
  EVENT_MOODS,
} from './locales';

interface GameEventDetail {
  type: GameEventType;
  score?: number;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function useGameEvents(
  onSpeak: (reaction: Reaction, mood: MoodName) => void,
  lang: Lang,
) {
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<GameEventDetail>).detail;
      const reactions = REACTIONS[lang][detail.type];
      if (reactions)
        onSpeak(pick(reactions), EVENT_MOODS[detail.type] ?? 'neutral');
    };
    window.addEventListener('game:event', handler);
    return () => window.removeEventListener('game:event', handler);
  }, [onSpeak, lang]);
}
