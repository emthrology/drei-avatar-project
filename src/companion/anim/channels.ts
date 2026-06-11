// 채널 추상화 → VRM 본/표정 적용
//
// 스케줄러는 논리 채널(head.rotateX, chest.inhale, blink…)만 다루고, 여기서
// VRM 휴머노이드 본/expressionManager로 변환. 본은 축별 채널을 모아 1회 기록(쿼터니언).

import { VRM, VRMExpressionPresetName, VRMHumanBoneName } from '@pixiv/three-vrm'
import * as THREE from 'three'

// 채널 정지값(rest). live 초기값이자 클립 미기록 시 fallback. hold-last로 유지됨
export const BASELINE: Record<string, number> = {
  // idle 머리 델타 (0 기준 미세 진동)
  'head.rotateX': 0,
  'head.rotateY': 0,
  'head.rotateZ': 0,
  // 제스처 머리 델타 (idle 머리 위에 합성 — base+delta. 끄덕임/기울임/돌리기)
  'head.gx': 0,
  'head.gy': 0,
  'head.gz': 0,
  'chest.inhale': 0,
  // 제스처 몸통 동작 (Chest 델타 — 호흡 x에 leanX 가산, y=턴 z=린. 포즈 Spine과 별개 본)
  'chest.leanX': 0,
  'chest.turnY': 0,
  'chest.leanZ': 0,
  blink: 0,
  // 감정 표정 (VRM preset emotion — 무드 시스템. 0=무표정, 무드 전환 시 ramp)
  'emo.happy': 0,
  'emo.angry': 0,
  'emo.sad': 0,
  'emo.relaxed': 0,
  'emo.surprised': 0,
  // 직접 모프 강조 (angry/sad 변별 + surprised 부위 조합)
  'emo.browAngry': 0,
  'emo.browSorrow': 0,
  'emo.browSurprised': 0,
  'emo.eyeSurprised': 0,
  'emo.mthSurprised': 0,
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

// 감정 채널 → VRM preset emotion 매핑. 비VRoid 모델은 일부 누락 가능 → 생성자에서 감지
const EMOTION_PRESETS: Record<string, VRMExpressionPresetName> = {
  'emo.happy': VRMExpressionPresetName.Happy,
  'emo.angry': VRMExpressionPresetName.Angry,
  'emo.sad': VRMExpressionPresetName.Sad,
  'emo.relaxed': VRMExpressionPresetName.Relaxed,
  'emo.surprised': VRMExpressionPresetName.Surprised,
}

// 직접 모프 강조 채널 → Fcl_* (VRoid 명명). 미바인드 모프라 expressionManager.update()가
// 안 건드림 → 직접 쓴 값 생존 (viseme 자음과 동일 패턴).
// - 눈썹: preset(Fcl_ALL_*)만으론 angry/sad 구분 약해 변별 보강. viseme/blink와 비충돌
// - surprised: Fcl_ALL_Surprised는 입이 크게 벌어져 발화 viseme와 과중첩 → 부위 조합으로
//   분리. 눈썹·눈은 발화 중 유지, 입(mthSurprised)만 발화 중 억제(useAnimator)
const EMOTION_MORPHS: Record<string, string> = {
  'emo.browAngry': 'Fcl_BRW_Angry',
  'emo.browSorrow': 'Fcl_BRW_Sorrow',
  'emo.browSurprised': 'Fcl_BRW_Surprised',
  'emo.eyeSurprised': 'Fcl_EYE_Surprised',
  'emo.mthSurprised': 'Fcl_MTH_Surprised',
}

// 무드 전환 시 0으로 리셋해야 할 전체 감정 채널 (preset + 직접 모프)
export const EMOTION_CHANNELS = [
  ...Object.keys(EMOTION_PRESETS),
  ...Object.keys(EMOTION_MORPHS),
]

export class Channels {
  private head: THREE.Object3D | null
  private chest: THREE.Object3D | null
  private spine: THREE.Object3D | null
  private armL: THREE.Object3D | null
  private armR: THREE.Object3D | null
  private elbowL: THREE.Object3D | null
  private elbowR: THREE.Object3D | null
  private _euler = new THREE.Euler()
  // 이 모델에 실제 존재하는 감정 채널만 (비VRoid 누락 대비, 1회 감지)
  private emotions: [string, VRMExpressionPresetName][] = []
  // 눈썹 강조: 채널 → 해당 모프를 가진 메시/인덱스 목록 (직접 morphTargetInfluences)
  private emoMorphs: { ch: string; targets: { mesh: THREE.SkinnedMesh; index: number }[] }[] = []

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
    this.curlFingers()

    // 존재하는 감정 preset만 수집 → apply에서 누락 모델 안전
    const em = vrm.expressionManager
    this.emotions = Object.entries(EMOTION_PRESETS).filter(
      ([, preset]) => em?.getExpression(preset) != null,
    )

    // 눈썹 강조 모프 위치 수집 (존재하는 것만 — 비VRoid 모델은 조용히 스킵)
    for (const [ch, morphName] of Object.entries(EMOTION_MORPHS)) {
      const targets: { mesh: THREE.SkinnedMesh; index: number }[] = []
      vrm.scene.traverse((obj) => {
        if (obj instanceof THREE.SkinnedMesh && obj.morphTargetDictionary) {
          const index = obj.morphTargetDictionary[morphName]
          if (index !== undefined) targets.push({ mesh: obj, index })
        }
      })
      if (targets.length) this.emoMorphs.push({ ch, targets })
    }
  }

  // 전역 편안한 손: 네 손가락 proximal/intermediate를 손바닥쪽으로 살짝 말아둠 (로드 1회).
  // 손가락은 어떤 클립도 안 건드리므로 한 번 설정하면 유지됨. 좌=음수 z, 우=양수 z (거울상).
  private curlFingers(): void {
    const h = this.vrm.humanoid
    const B = VRMHumanBoneName
    const curls: [VRMHumanBoneName, number][] = [
      [B.LeftIndexProximal, -0.2], [B.LeftIndexIntermediate, -0.4],
      [B.LeftMiddleProximal, -0.2], [B.LeftMiddleIntermediate, -0.4],
      [B.LeftRingProximal, -0.25], [B.LeftRingIntermediate, -0.45],
      [B.LeftLittleProximal, -0.3], [B.LeftLittleIntermediate, -0.5],
      [B.RightIndexProximal, 0.2], [B.RightIndexIntermediate, 0.4],
      [B.RightMiddleProximal, 0.2], [B.RightMiddleIntermediate, 0.4],
      [B.RightRingProximal, 0.25], [B.RightRingIntermediate, 0.45],
      [B.RightLittleProximal, 0.3], [B.RightLittleIntermediate, 0.5],
    ]
    for (const [name, z] of curls) {
      const node = h.getNormalizedBoneNode(name)
      if (node) node.rotation.z = z
    }
  }

  // 스케줄러 출력 상태맵을 VRM에 기록
  apply(state: Record<string, number>): void {
    const v = (k: string) => state[k] ?? BASELINE[k] ?? 0

    if (this.head) {
      // idle 미동(rotate) + 제스처(g) 합성 — base+delta
      this._euler.set(
        v('head.rotateX') + v('head.gx'),
        v('head.rotateY') + v('head.gy'),
        v('head.rotateZ') + v('head.gz'),
      )
      this.head.quaternion.setFromEuler(this._euler)
    }
    if (this.spine) {
      this._euler.set(v('spine.x'), v('spine.y'), v('spine.z'))
      this.spine.quaternion.setFromEuler(this._euler)
    }
    if (this.chest && this.chest !== this.spine) {
      // x=호흡+제스처린(앞뒤), y=제스처턴, z=제스처린(좌우) — 한 본에 합성
      this._euler.set(
        v('chest.inhale') * CHEST_INHALE_SCALE + v('chest.leanX'),
        v('chest.turnY'),
        v('chest.leanZ'),
      )
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

    // 감정 표정 (존재하는 preset만 — 무드 전환 클립이 emo.* 채널을 ramp)
    for (const [ch, preset] of this.emotions) {
      this.vrm.expressionManager?.setValue(preset, v(ch))
    }
    // 눈썹 강조 (직접 모프 — angry/sad 변별 보강)
    for (const { ch, targets } of this.emoMorphs) {
      const w = v(ch)
      for (const { mesh, index } of targets) {
        if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = w
      }
    }
  }
}
