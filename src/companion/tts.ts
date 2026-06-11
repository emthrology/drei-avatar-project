// Google TTS 호출 + word timing 계산

import { type Lang, type Gender, type Reaction, TTS_CONFIG } from './locales'

export interface SpeakPayload {
  audio: AudioBuffer
  words: string[]
  wtimes: number[]   // ms
  wdurations: number[] // ms
}

let sharedAudioCtx: AudioContext | null = null
function getAudioContext(): AudioContext {
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioContext()
  }
  return sharedAudioCtx
}

export async function googleTTS(
  reaction: Reaction,
  lang: Lang,
  gender: Gender,
  apiKey: string,
): Promise<SpeakPayload> {
  const voice = TTS_CONFIG[lang][gender]
  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text: reaction.text },
        voice,
        audioConfig: { audioEncoding: 'MP3' },
      }),
    },
  )
  const json = await res.json()
  if (json.error) throw new Error(`TTS error: ${json.error.message}`)
  if (!json.audioContent) throw new Error('TTS: no audioContent')

  const binary = atob(json.audioContent)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  const audioCtx = getAudioContext()
  const audio = await audioCtx.decodeAudioData(bytes.buffer.slice(0))

  // ko는 roman 발음, en은 text로 word timing 계산
  const wordSource = reaction.roman ?? reaction.text
  const words = wordSource.split(/\s+/).filter(Boolean)
  const totalMs = audio.duration * 1000
  const perWord = totalMs / Math.max(words.length, 1)

  return {
    audio,
    words,
    wtimes: words.map((_, i) => i * perWord),
    wdurations: words.map(() => perWord * 0.85),
  }
}

export function playAudio(payload: SpeakPayload): void {
  const audioCtx = getAudioContext()
  // context가 suspended면 resume 시도 (유저 제스처 없이 재생 시 브라우저 정책상 무시될 수 있음)
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
  const source = audioCtx.createBufferSource()
  source.buffer = payload.audio
  source.connect(audioCtx.destination)
  source.start()
}
