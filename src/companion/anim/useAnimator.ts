// 절차 애니메이션 R3F 훅 — 스케줄러를 매 프레임 구동하여 VRM에 기록
//
// useIdleAnimation을 대체. 호흡/머리미동/눈깜빡임/팔내리기를 선언적 무드 템플릿으로 흡수.
// 립싱크(입)·lookAt(눈)은 채널이 겹치지 않으므로 별도 훅 유지.

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { VRM } from '@pixiv/three-vrm'
import { AnimScheduler, type StateName } from './scheduler'
import { Channels, BASELINE } from './channels'
import { MOODS } from './moods'

export function useAnimator(
  vrmRef: React.RefObject<VRM | null>,
  stateRef: React.RefObject<StateName>,
) {
  const schedulerRef = useRef<AnimScheduler | null>(null)
  const channelsRef = useRef<Channels | null>(null)
  const builtVrmRef = useRef<VRM | null>(null)
  const prevStateRef = useRef<StateName>('idle')

  const GESTURE_PROB = 0.6 // 발화당 제스처 발동 확률

  useFrame((_, delta) => {
    const vrm = vrmRef.current
    if (!vrm?.humanoid) return

    // VRM 교체 시 스케줄러/채널 재구성
    if (builtVrmRef.current !== vrm) {
      builtVrmRef.current = vrm
      const scheduler = new AnimScheduler(BASELINE)
      MOODS.neutral.loops.forEach((t) => scheduler.add(t, true))
      schedulerRef.current = scheduler
      channelsRef.current = new Channels(vrm)
    }

    const scheduler = schedulerRef.current!
    const curState = stateRef.current ?? 'idle'
    scheduler.stateName = curState

    // idle→speaking 전환 시 세트에서 1개 랜덤 제스처 발동 (확률 + 중복 방지)
    const gestures = MOODS.neutral.gestures
    if (
      curState === 'speaking' &&
      prevStateRef.current !== 'speaking' &&
      gestures.length > 0 &&
      !scheduler.has('gesture') &&
      Math.random() < GESTURE_PROB
    ) {
      const g = gestures[Math.floor(Math.random() * gestures.length)]
      scheduler.add(g, false)
    }
    prevStateRef.current = curState

    const state = scheduler.tick(delta * 1000) // 초 → ms
    channelsRef.current!.apply(state)
  })
}
