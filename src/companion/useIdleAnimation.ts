// 눈 깜빡임 + 호흡 idle 애니메이션
// vrm.expressionManager + vrm.humanoid 직접 제어

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { VRM, VRMExpressionPresetName, VRMHumanBoneName } from '@pixiv/three-vrm'
import * as THREE from 'three'

const _euler = new THREE.Euler()
const _quat = new THREE.Quaternion()

export function useIdleAnimation(vrmRef: React.RefObject<VRM | null>) {
  const timeRef = useRef(0)
  const nextBlinkRef = useRef(3) // 첫 깜빡임: 3초 후
  const blinkStateRef = useRef<'open' | 'closing' | 'opening'>('open')
  const blinkProgressRef = useRef(0)

  useFrame((_, delta) => {
    const vrm = vrmRef.current
    if (!vrm?.humanoid) return

    timeRef.current += delta

    // ── 호흡: Chest ────────────────────────────────────────────
    const breathe = Math.sin(timeRef.current * 0.8) * 0.015

    const chestBone = vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Chest)
    if (chestBone) {
      _euler.set(breathe, 0, 0)
      _quat.setFromEuler(_euler)
      chestBone.quaternion.slerp(_quat, 0.12)
    }

    // ── 눈 깜빡임 ────────────────────────────────────────────────
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
