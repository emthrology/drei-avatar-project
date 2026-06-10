// 눈 깜빡임 + 호흡 + 대기 포즈 (팔 내리기 + 머리 미세 움직임)

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { VRM, VRMExpressionPresetName, VRMHumanBoneName } from '@pixiv/three-vrm'
import * as THREE from 'three'

const _euler = new THREE.Euler()
const _quat = new THREE.Quaternion()

// T포즈(팔 수평)에서 자연스럽게 팔을 내린 대기 포즈
const REST_L_UPPER_ARM = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -1.3))
const REST_R_UPPER_ARM = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 1.3))

export function useIdleAnimation(vrmRef: React.RefObject<VRM | null>) {
  const timeRef = useRef(0)
  const nextBlinkRef = useRef(3)
  const blinkStateRef = useRef<'open' | 'closing' | 'opening'>('open')
  const blinkProgressRef = useRef(0)

  useFrame((_, delta) => {
    const vrm = vrmRef.current
    if (!vrm?.humanoid) return

    timeRef.current += delta

    // ── 팔 내리기: 매 프레임 slerp → 약 1초에 걸쳐 자연스럽게 정착 ──
    const lArm = vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.LeftUpperArm)
    const rArm = vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.RightUpperArm)
    if (lArm) lArm.quaternion.slerp(REST_L_UPPER_ARM, 0.08)
    if (rArm) rArm.quaternion.slerp(REST_R_UPPER_ARM, 0.08)

    // ── 호흡: Chest ────────────────────────────────────────────────
    const breathe = Math.sin(timeRef.current * 0.8) * 0.015
    const chestBone = vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Chest)
    if (chestBone) {
      _euler.set(breathe, 0, 0)
      _quat.setFromEuler(_euler)
      chestBone.quaternion.slerp(_quat, 0.12)
    }

    // ── 머리 미세 움직임: 살아있는 느낌 ────────────────────────────
    const headBone = vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Head)
    if (headBone) {
      const headY = Math.sin(timeRef.current * 0.27) * 0.04        // 좌우 (매우 느림)
      const headX = Math.sin(timeRef.current * 0.53 + 0.7) * 0.02  // 끄덕 (극소)
      _euler.set(headX, headY, 0)
      _quat.setFromEuler(_euler)
      headBone.quaternion.slerp(_quat, 0.05)
    }

    // ── 눈 깜빡임 ───────────────────────────────────────────────────
    if (!vrm.expressionManager) return

    nextBlinkRef.current -= delta

    if (blinkStateRef.current === 'open' && nextBlinkRef.current <= 0) {
      blinkStateRef.current = 'closing'
      blinkProgressRef.current = 0
    }

    if (blinkStateRef.current === 'closing') {
      blinkProgressRef.current += delta / 0.07
      const v = Math.min(blinkProgressRef.current, 1)
      vrm.expressionManager.setValue(VRMExpressionPresetName.BlinkLeft, v)
      vrm.expressionManager.setValue(VRMExpressionPresetName.BlinkRight, v)
      if (v >= 1) {
        blinkStateRef.current = 'opening'
        blinkProgressRef.current = 0
      }
    } else if (blinkStateRef.current === 'opening') {
      blinkProgressRef.current += delta / 0.1
      const v = 1 - Math.min(blinkProgressRef.current, 1)
      vrm.expressionManager.setValue(VRMExpressionPresetName.BlinkLeft, v)
      vrm.expressionManager.setValue(VRMExpressionPresetName.BlinkRight, v)
      if (blinkProgressRef.current >= 1) {
        blinkStateRef.current = 'open'
        nextBlinkRef.current = 2 + Math.random() * 3
      }
    }
  })
}
