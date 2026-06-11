// 5173(game-avatar-companion)의 locales.ts를 참고해 이식
// 5173 파일은 수정하지 않음

export type Lang = 'ko' | 'en'
export type Gender = 'male' | 'female' // TTS 음성 성별 (에디터에서 선택)
export type GameEventType = 'player_die' | 'level_clear' | 'near_miss' | 'jump' | 'start'

// 무드 이름 (MOODS 키와 일치). 표정+제스처 톤 전환에 사용
export type MoodName = 'neutral' | 'happy' | 'sad' | 'surprised' | 'angry'

// 게임 이벤트 → 무드 매핑. 발화 시 이 무드로 전환, 발화 후 neutral 복귀
export const EVENT_MOODS: Record<GameEventType, MoodName> = {
  player_die: 'sad',
  level_clear: 'happy',
  near_miss: 'surprised',
  jump: 'happy',
  start: 'happy',
}

export interface Reaction {
  text: string
  roman?: string // ko 전용: 로마자 발음 (lip sync용)
}

export const REACTIONS: Record<Lang, Record<GameEventType, Reaction[]>> = {
  ko: {
    player_die:  [
      { text: '아이고~!',              roman: 'aigo' },
      { text: '다시 해봐요!',           roman: 'dasi haebwayo' },
      { text: '괜찮아요, 할 수 있어요!', roman: 'gwaenchanayo hal su isseoyo' },
    ],
    level_clear: [
      { text: '우와! 대단해요!',  roman: 'uwa daedanhaeyo' },
      { text: '클리어! 최고예요!', roman: 'keullieeo choegoyeyo' },
      { text: '완벽해요!',        roman: 'wanbyeokhaeyo' },
    ],
    near_miss: [
      { text: '위험했다!',  roman: 'wiheomhaetda' },
      { text: '아슬아슬~!', roman: 'aseulaseul' },
    ],
    jump: [
      { text: '점프!',      roman: 'jeompeu' },
      { text: '날아올라요!', roman: 'naraollayo' },
    ],
    start: [
      { text: '시작해볼까요?', roman: 'sijakhaebollkkayo' },
      { text: '파이팅!',      roman: 'paiting' },
    ],
  },
  en: {
    player_die:  [
      { text: 'Oh no!' },
      { text: 'Try again, you got this!' },
      { text: "Don't give up!" },
    ],
    level_clear: [
      { text: 'Amazing! You cleared it!' },
      { text: 'Woohoo! Perfect run!' },
      { text: 'Incredible!' },
    ],
    near_miss: [
      { text: 'That was close!' },
      { text: 'Whoa, barely made it!' },
    ],
    jump:  [
      { text: 'Jump!' },
      { text: 'Nice jump!' },
    ],
    start: [
      { text: "Let's go!" },
      { text: 'Good luck!' },
    ],
  },
}

// lang × gender → Google TTS 음성. VRM엔 성별 필드가 없어 에디터에서 수동 선택
export const TTS_CONFIG: Record<Lang, Record<Gender, { languageCode: string; name: string }>> = {
  ko: {
    female: { languageCode: 'ko-KR', name: 'ko-KR-Wavenet-A' },
    male: { languageCode: 'ko-KR', name: 'ko-KR-Wavenet-C' },
  },
  en: {
    female: { languageCode: 'en-US', name: 'en-US-Wavenet-F' },
    male: { languageCode: 'en-US', name: 'en-US-Wavenet-D' },
  },
}
