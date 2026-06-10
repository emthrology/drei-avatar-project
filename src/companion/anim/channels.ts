// 채널 추상화 → VRM 본/표정 적용
//
// 스케줄러는 논리 채널(head.rotateX, chest.inhale, blink…)만 다루고, 여기서
// VRM 휴머노이드 본/expressionManager로 변환. 본은 축별 채널을 모아 1회 기록(쿼터니언).

import { VRM, VRMExpressionPresetName, VRMHumanBoneName } from '@pixiv/three-vrm'
import * as THREE from 'three'

// 채널 정지값(rest). live 초기값이자 클립 미기록 시 fallback. hold-last로 유지됨
export const BASELINE: Record<string, number> = {
  // idle 델타 (0 기준 미세 진동)
  'head.rotateX': 0,
  'head.rotateY': 0,
  'head.rotateZ': 0,
  'chest.inhale': 0,
  // 제스처 몸통 동작 (Chest y/z 델타 — 호흡 x·포즈 Spine과 다른 축이라 충돌 없음)
  'chest.turnY': 0,
  'chest.leanZ': 0,
  blink: 0,
  // 포즈 (Spine 절대 회전 — 상반신 체중이동. Head/팔은 FK 계층으로 따라옴)
  'spine.x': 0,
  'spine.y': 0,
  'spine.z': 0,
  // 팔내리기: 대기 자세 ±1.3 (정적 — 포즈는 Spine만 건드리므로 팔은 계층 상속)
  'armL.z': -1.3,
  'armR.z': 1.3,
  // 제스처 (발화 시 손 들기). UpperArm 다축 + LowerArm 팔꿈치. 기본 0 = 영향 없음
  'armL.x': 0,
  'armL.y': 0,
  'armR.x': 0,
  'armR.y': 0,
  'elbowL.x': 0,
  'elbowL.y': 0,
  'elbowL.z': 0,
  'elbowR.x': 0,
  'elbowR.y': 0,
  'elbowR.z': 0,
}

// chest.inhale(0~1) → 가슴 본 X회전 스케일 (기존 useIdleAnimation 0.015 진폭 보존)
const CHEST_INHALE_SCALE = 0.03

export class Channels {
  private head: THREE.Object3D | null
  private chest: THREE.Object3D | null
  private spine: THREE.Object3D | null
  private armL: THREE.Object3D | null
  private armR: THREE.Object3D | null
  private elbowL: THREE.Object3D | null
  private elbowR: THREE.Object3D | null
  private _euler = new THREE.Euler()

  constructor(private vrm: VRM) {
    const h = vrm.humanoid
    this.head = h.getNormalizedBoneNode(VRMHumanBoneName.Head)
    // 호흡(Chest)과 포즈(Spine)는 다른 본 → 충돌 없음. Chest 없으면 호흡이 Spine로 fallback
    this.chest =
      h.getNormalizedBoneNode(VRMHumanBoneName.Chest) ??
      h.getNormalizedBoneNode(VRMHumanBoneName.Spine)
    this.spine = h.getNormalizedBoneNode(VRMHumanBoneName.Spine)
    this.armL = h.getNormalizedBoneNode(VRMHumanBoneName.LeftUpperArm)
    this.armR = h.getNormalizedBoneNode(VRMHumanBoneName.RightUpperArm)
    this.elbowL = h.getNormalizedBoneNode(VRMHumanBoneName.LeftLowerArm)
    this.elbowR = h.getNormalizedBoneNode(VRMHumanBoneName.RightLowerArm)
  }

  // 스케줄러 출력 상태맵을 VRM에 기록
  apply(state: Record<string, number>): void {
    const v = (k: string) => state[k] ?? BASELINE[k] ?? 0

    if (this.head) {
      this._euler.set(v('head.rotateX'), v('head.rotateY'), v('head.rotateZ'))
      this.head.quaternion.setFromEuler(this._euler)
    }
    if (this.spine) {
      this._euler.set(v('spine.x'), v('spine.y'), v('spine.z'))
      this.spine.quaternion.setFromEuler(this._euler)
    }
    if (this.chest && this.chest !== this.spine) {
      // x=호흡, y=제스처 턴, z=제스처 린 — 한 본에 합성
      this._euler.set(v('chest.inhale') * CHEST_INHALE_SCALE, v('chest.turnY'), v('chest.leanZ'))
      this.chest.quaternion.setFromEuler(this._euler)
    }
    if (this.armL) {
      this._euler.set(v('armL.x'), v('armL.y'), v('armL.z'))
      this.armL.quaternion.setFromEuler(this._euler)
    }
    if (this.armR) {
      this._euler.set(v('armR.x'), v('armR.y'), v('armR.z'))
      this.armR.quaternion.setFromEuler(this._euler)
    }
    if (this.elbowL) {
      this._euler.set(v('elbowL.x'), v('elbowL.y'), v('elbowL.z'))
      this.elbowL.quaternion.setFromEuler(this._euler)
    }
    if (this.elbowR) {
      this._euler.set(v('elbowR.x'), v('elbowR.y'), v('elbowR.z'))
      this.elbowR.quaternion.setFromEuler(this._euler)
    }

    const blink = v('blink')
    this.vrm.expressionManager?.setValue(VRMExpressionPresetName.BlinkLeft, blink)
    this.vrm.expressionManager?.setValue(VRMExpressionPresetName.BlinkRight, blink)
  }
}
