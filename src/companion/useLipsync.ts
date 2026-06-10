// word timing → phoneme-level viseme 스케줄 → VRM expressionManager + morphTargetInfluences
// 영어: lipsyncEn 글자 기반 음소 분해 → Oculus 15 viseme
// 자음(PP/FF/SS 등): Fcl_MTH_Close 등 직접 조작 (preset expression 미관리 모프)
// 비VRoid 모델: 자음 모프 없으면 자동 fallback (모음 5개만 동작)

import { useRef, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import { VRM } from '@pixiv/three-vrm'
import { type SpeakPayload, playAudio } from './tts'
import { wordToVisemes, type OculusViseme } from './lipsyncEn'
import { buildMorphMap, applyViseme, clearVisemes, type MorphMap } from './visemeApplier'

// TalkingHead 관행: 입술 완전 닫힘 계열은 강하게, 나머지는 중간
const WEIGHT: Record<string, number> = { PP: 0.9, FF: 0.9 }
function visemeWeight(v: OculusViseme): number {
  return WEIGHT[v] ?? 0.6
}

interface LipsyncFrame {
  viseme: OculusViseme
  startMs: number
  endMs: number
}

interface LipsyncState {
  schedule: LipsyncFrame[]
  startTime: number | null
  speaking: boolean
}

function buildSchedule(
  words: string[],
  wtimes: number[],
  wdurations: number[],
): LipsyncFrame[] {
  const frames: LipsyncFrame[] = []
  for (let wi = 0; wi < words.length; wi++) {
    const phonemes = wordToVisemes(words[wi])
    const wStart = wtimes[wi]
    const wDur = wdurations[wi]
    for (let pi = 0; pi < phonemes.length; pi++) {
      const pStart = wStart + phonemes[pi].fraction * wDur
      const pEnd =
        pi < phonemes.length - 1
          ? wStart + phonemes[pi + 1].fraction * wDur
          : wStart + wDur
      frames.push({ viseme: phonemes[pi].viseme, startMs: pStart, endMs: pEnd })
    }
  }
  return frames
}

export function useLipsync(vrmRef: React.RefObject<VRM | null>) {
  const state = useRef<LipsyncState>({ schedule: [], startTime: null, speaking: false })
  const morphMapRef = useRef<MorphMap>(new Map())
  const morphMapVrmRef = useRef<VRM | null>(null)

  const speak = useCallback((payload: SpeakPayload) => {
    state.current = {
      schedule: buildSchedule(payload.words, payload.wtimes, payload.wdurations),
      startTime: null,
      speaking: true,
    }
    playAudio(payload)
  }, [])

  useFrame(() => {
    const vrm = vrmRef.current
    if (!vrm?.expressionManager) return

    // VRM 교체 시 morphMap 재빌드
    if (morphMapVrmRef.current !== vrm) {
      morphMapVrmRef.current = vrm
      morphMapRef.current = buildMorphMap(vrm.scene)
    }

    const s = state.current
    if (!s.speaking) return

    if (s.startTime === null) s.startTime = performance.now()
    const elapsed = performance.now() - s.startTime

    const lastEnd = s.schedule[s.schedule.length - 1]?.endMs ?? 0
    if (elapsed > lastEnd + 300) {
      clearVisemes(morphMapRef.current, vrm)
      s.speaking = false
      return
    }

    const active = s.schedule.find((f) => elapsed >= f.startMs && elapsed < f.endMs)
    clearVisemes(morphMapRef.current, vrm)
    if (active) applyViseme(morphMapRef.current, vrm, active.viseme, visemeWeight(active.viseme))
    // expressionManager.update()는 CompanionAvatar의 vrm.update(delta)가 호출함 — 중복 제거
  })

  return { speak }
}
