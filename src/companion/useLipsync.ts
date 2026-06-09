// word timing → VRM expressionManager viseme 매핑
// TalkingHead의 speakAudio 역할을 vrm.expressionManager로 재구현

import { useRef, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import { VRM, VRMExpressionPresetName } from '@pixiv/three-vrm'
import { type SpeakPayload, playAudio } from './tts'

// 영어 단어 첫 음절 → VRM viseme 대략 매핑
// 완벽하진 않지만 입 움직임 "있어 보이는" 수준
const VOWEL_TO_VISEME: Record<string, VRMExpressionPresetName> = {
  a: VRMExpressionPresetName.Aa,
  e: VRMExpressionPresetName.Ee,
  i: VRMExpressionPresetName.Ih,
  o: VRMExpressionPresetName.Oh,
  u: VRMExpressionPresetName.Ou,
}

function wordToViseme(word: string): VRMExpressionPresetName {
  const lower = word.toLowerCase()
  for (const char of lower) {
    if (char in VOWEL_TO_VISEME) return VOWEL_TO_VISEME[char]
  }
  return VRMExpressionPresetName.Aa // fallback
}

interface LipsyncSchedule {
  viseme: VRMExpressionPresetName
  startMs: number
  endMs: number
}

interface LipsyncState {
  schedule: LipsyncSchedule[]
  startTime: number | null
  speaking: boolean
}

export function useLipsync(vrmRef: React.RefObject<VRM | null>) {
  const state = useRef<LipsyncState>({ schedule: [], startTime: null, speaking: false })

  const speak = useCallback((payload: SpeakPayload) => {
    const schedule: LipsyncSchedule[] = payload.words.map((word, i) => ({
      viseme: wordToViseme(word),
      startMs: payload.wtimes[i],
      endMs: payload.wtimes[i] + payload.wdurations[i],
    }))

    state.current = { schedule, startTime: null, speaking: true }
    playAudio(payload)
  }, [])

  // 매 프레임: 현재 시간에 맞는 viseme 적용
  useFrame((_, delta) => {
    const vrm = vrmRef.current
    if (!vrm?.expressionManager) return

    const s = state.current
    if (!s.speaking) return

    if (s.startTime === null) s.startTime = performance.now()
    const elapsed = performance.now() - s.startTime

    // 발화 종료 체크
    const lastEnd = s.schedule[s.schedule.length - 1]?.endMs ?? 0
    if (elapsed > lastEnd + 300) {
      // 입 닫기
      vrm.expressionManager.setValue(VRMExpressionPresetName.Aa, 0)
      vrm.expressionManager.setValue(VRMExpressionPresetName.Ih, 0)
      vrm.expressionManager.setValue(VRMExpressionPresetName.Ou, 0)
      vrm.expressionManager.setValue(VRMExpressionPresetName.Ee, 0)
      vrm.expressionManager.setValue(VRMExpressionPresetName.Oh, 0)
      s.speaking = false
      return
    }

    // 현재 active viseme 찾기
    const active = s.schedule.find(
      (seg) => elapsed >= seg.startMs && elapsed < seg.endMs,
    )

    // 모든 viseme 초기화 후 active만 적용
    const allVisemes = [
      VRMExpressionPresetName.Aa,
      VRMExpressionPresetName.Ih,
      VRMExpressionPresetName.Ou,
      VRMExpressionPresetName.Ee,
      VRMExpressionPresetName.Oh,
    ]
    allVisemes.forEach((v) => vrm.expressionManager!.setValue(v, 0))
    if (active) vrm.expressionManager.setValue(active.viseme, 0.8)

    vrm.expressionManager.update()

    void delta // suppress unused warning
  })

  return { speak }
}
