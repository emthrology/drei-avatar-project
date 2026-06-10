// 채널 추상화 → VRM 본/표정 적용
//
// 스케줄러는 논리 채널(head.rotateX, chest.inhale, blink…)만 다루고, 여기서
// VRM 휴머노이드 본/expressionManager로 변환. 본은 축별 채널을 모아 1회 기록(쿼터니언).

import { VRM, VRMExpressionPresetName, VRMHumanBoneName } from '@pixiv/three-vrm'
import * as THREE from 'three'

// 채널 baseline (idle 정지 상태값). 클립이 이 위에 절대값을 덮어씀
export const BASELINE: Record<string, number> = {
  'head.rotateX': 0,
  'head.rotateY': 0,
  'head.rotateZ': 0,
  'chest.inhale': 0,
  blink: 0,
  // 팔내리기: T포즈(0) → 대기(±1.3). 시작 시 settle 클립이 0→baseline 이징
  'armL.z': -1.3,
  'armR.z': 1.3,
}

// chest.inhale(0~1) → 가슴 본 X회전 스케일 (기존 useIdleAnimation 0.015 진폭 보존)
const CHEST_INHALE_SCALE = 0.03

export class Channels {
  private head: THREE.Object3D | null
  private chest: THREE.Object3D | null
  private armL: THREE.Object3D | null
  private armR: THREE.Object3D | null
  private _euler = new THREE.Euler()

  constructor(private vrm: VRM) {
    const h = vrm.humanoid
    this.head = h.getNormalizedBoneNode(VRMHumanBoneName.Head)
    this.chest =
      h.getNormalizedBoneNode(VRMHumanBoneName.Chest) ??
      h.getNormalizedBoneNode(VRMHumanBoneName.Spine)
    this.armL = h.getNormalizedBoneNode(VRMHumanBoneName.LeftUpperArm)
    this.armR = h.getNormalizedBoneNode(VRMHumanBoneName.RightUpperArm)
  }

  // 스케줄러 출력 상태맵을 VRM에 기록
  apply(state: Record<string, number>): void {
    const v = (k: string) => state[k] ?? BASELINE[k] ?? 0

    if (this.head) {
      this._euler.set(v('head.rotateX'), v('head.rotateY'), v('head.rotateZ'))
      this.head.quaternion.setFromEuler(this._euler)
    }
    if (this.chest) {
      this._euler.set(v('chest.inhale') * CHEST_INHALE_SCALE, 0, 0)
      this.chest.quaternion.setFromEuler(this._euler)
    }
    if (this.armL) {
      this._euler.set(0, 0, v('armL.z'))
      this.armL.quaternion.setFromEuler(this._euler)
    }
    if (this.armR) {
      this._euler.set(0, 0, v('armR.z'))
      this.armR.quaternion.setFromEuler(this._euler)
    }

    const blink = v('blink')
    this.vrm.expressionManager?.setValue(VRMExpressionPresetName.BlinkLeft, blink)
    this.vrm.expressionManager?.setValue(VRMExpressionPresetName.BlinkRight, blink)
  }
}
