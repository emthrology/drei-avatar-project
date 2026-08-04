// 채널 추상화 → VRM 본/표정 적용
//
// 스케줄러는 논리 채널(head.rotateX, chest.inhale, blink…)만 다루고, 여기서
// VRM 휴머노이드 본/expressionManager로 변환. 본은 축별 채널을 모아 1회 기록(쿼터니언).

import {
  VRM,
  VRMExpressionPresetName,
  VRMHumanBoneName,
} from '@pixiv/three-vrm';
import * as THREE from 'three';

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
  // happy 분해: 입·눈썹 미소는 held, 눈(eyeJoy)은 진입 시 일회성(말하는 내내 눈감김 방지)
  'emo.mthJoy': 0,
  'emo.browJoy': 0,
  'emo.eyeJoy': 0,
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
  // ★뼈 자기 축(길이축) 기준 롤 — 상완 내/외회전, 하완 회내/회외(supination).
  // euler XYZ 로는 표현 불가: R=Rx·Ry·Rz 라 굴곡(z)이 가장 안쪽에 적용되고 x·y 는 그 뒤에
  // **부모 고정축** 기준으로 돌아, 팔꿈치를 접은 뒤엔 하완을 '휘두를' 뿐 축 회전이 아니다.
  // → euler 뒤에 뼈 길이축 axis-angle 을 post-multiply 해서 로컬 프레임 롤로 적용한다.
  // 기본 0 = 회전 없음(비퇴행).
  'armL.twist': 0,
  'armR.twist': 0,
  'elbowL.twist': 0,
  'elbowR.twist': 0,
  // 손목(Hand). 손인사 좌우 흔들기는 실제로 손목 flick 이 주도한다 — 상완/팔꿈치만으로
  // 만들려다 커플링으로 5회 실패(docs/wave-gesture-attempts.md). 기본 0 = 영향 없음.
  'handL.x': 0,
  'handL.y': 0,
  'handL.z': 0,
  'handR.x': 0,
  'handR.y': 0,
  'handR.z': 0,
};

// chest.inhale(0~1) → 가슴 본 X회전 스케일 (기존 useIdleAnimation 0.015 진폭 보존)
const CHEST_INHALE_SCALE = 0.03;

// idle micro-drift (2번): hold(제스처 정지·포즈 유지) 구간에도 팔·몸통이 미세하게 살아있도록
// 최종 회전에 초저주파 sine을 상시 가산. apply-레이어라 스케줄러 채널 단일 소유와 무관하고,
// state 맵은 비훼손(tick 반환=scheduler.live 참조 → mutate 금지, euler 로컬에만 더함).
// 활성 모션 땐 진폭에 묻히고 hold 때만 보임 → hold 감지 불필요. 머리(이미 미동)·얼굴(표정 동기)·
// 호흡(chest.inhale, 이미 진동)은 제외. 서로 안 맞아떨어지는 주기(≈5~12s)로 반복감 제거.
// DRIFT_AMP=0이면 완전 무영향(비퇴행). 진폭은 육안 튜닝값.
const DRIFT_AMP = 1; // 전역 배율 (0=off)
const DRIFT: Record<string, [number, number, number]> = {
  // 채널: [주파수 rad/s, 위상, 진폭 rad(≈0.3~0.5°)]
  'spine.y': [0.53, 0.0, 0.008],
  'spine.z': [0.61, 2.1, 0.007],
  'chest.leanX': [0.71, 1.0, 0.005],
  'chest.leanZ': [0.83, 3.0, 0.005],
  'armL.z': [0.67, 0.4, 0.008],
  'armR.z': [0.73, 2.9, 0.008],
  'armL.x': [0.97, 0.5, 0.006],
  'armR.x': [1.03, 3.6, 0.006],
  'elbowL.z': [1.09, 1.2, 0.005],
  'elbowR.z': [1.19, 4.0, 0.005],
};

// happy 눈감김 목표 비율(완전감김 Fcl_EYE_Close 대비). male 실측 ~0.64 → boost 0(비퇴행)
const HAPPY_EYE_TARGET = 0.62;

// 감정 채널 → VRM preset emotion 매핑. 비VRoid 모델은 일부 누락 가능 → 생성자에서 감지
const EMOTION_PRESETS: Record<string, VRMExpressionPresetName> = {
  'emo.happy': VRMExpressionPresetName.Happy,
  'emo.angry': VRMExpressionPresetName.Angry,
  'emo.sad': VRMExpressionPresetName.Sad,
  'emo.relaxed': VRMExpressionPresetName.Relaxed,
  'emo.surprised': VRMExpressionPresetName.Surprised,
};

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
  // happy 분해 — preset Fcl_ALL_Joy(입+눈+눈썹 결합) 대신 부위 분리: 입·눈썹은 held,
  // 눈(eyeJoy)은 useAnimator 일회성 클립이 구동(말하는 내내 눈감김 방지). viseme/blink와 비충돌.
  'emo.mthJoy': 'Fcl_MTH_Joy',
  'emo.browJoy': 'Fcl_BRW_Joy',
  'emo.eyeJoy': 'Fcl_EYE_Joy',
};

// morph target 정점 최대 변위 (모델 인지 보강 측정용). geometry morphAttributes에서 직접 계산.
function morphMaxDisp(mesh: THREE.SkinnedMesh, morphName: string): number {
  const idx = mesh.morphTargetDictionary?.[morphName];
  if (idx === undefined) return 0;
  const attr = mesh.geometry.morphAttributes?.position?.[idx];
  if (!attr) return 0;
  let max = 0;
  for (let i = 0; i < attr.count; i++) {
    const m = Math.hypot(attr.getX(i), attr.getY(i), attr.getZ(i));
    if (m > max) max = m;
  }
  return max;
}

// 무드 전환 시 0으로 리셋해야 할 전체 감정 채널 (preset + 직접 모프)
export const EMOTION_CHANNELS = [
  ...Object.keys(EMOTION_PRESETS),
  ...Object.keys(EMOTION_MORPHS),
];

export class Channels {
  private head: THREE.Object3D | null;
  private chest: THREE.Object3D | null;
  private spine: THREE.Object3D | null;
  private armL: THREE.Object3D | null;
  private armR: THREE.Object3D | null;
  private elbowL: THREE.Object3D | null;
  private elbowR: THREE.Object3D | null;
  private handL: THREE.Object3D | null;
  private handR: THREE.Object3D | null;
  private _euler = new THREE.Euler();
  private _q = new THREE.Quaternion();
  // 각 뼈의 로컬 길이축 (자식 뼈의 로컬 위치 방향) — 롤 회전축. 리그 비의존으로 실측한다.
  private axes = new Map<THREE.Object3D, THREE.Vector3>();
  // 이 모델에 실제 존재하는 감정 채널만 (비VRoid 누락 대비, 1회 감지)
  private emotions: [string, VRMExpressionPresetName][] = [];
  // 눈썹 강조: 채널 → 해당 모프를 가진 메시/인덱스 목록 (직접 morphTargetInfluences)
  private emoMorphs: {
    ch: string;
    targets: { mesh: THREE.SkinnedMesh; index: number }[];
  }[] = [];
  // happy 눈감김 보강 (모델 인지): Fcl_EYE_Close 메시/인덱스 + 부족분 가산 비율
  private happyEyeTargets: { mesh: THREE.SkinnedMesh; index: number }[] = [];
  private happyEyeBoost = 0;
  private happyEyeSig = ''; // 얼굴 구성·가시성 시그니처 (변화 시에만 boost 재측정)
  private happyEyeActive = false; // happy 보강 기록 중 여부 (비활성 전환 시 1회 클리어용)

  constructor(private vrm: VRM) {
    const h = vrm.humanoid;
    this.head = h.getNormalizedBoneNode(VRMHumanBoneName.Head);
    // 호흡(Chest)과 포즈(Spine)는 다른 본 → 충돌 없음. Chest 없으면 호흡이 Spine로 fallback
    this.chest =
      h.getNormalizedBoneNode(VRMHumanBoneName.Chest) ??
      h.getNormalizedBoneNode(VRMHumanBoneName.Spine);
    this.spine = h.getNormalizedBoneNode(VRMHumanBoneName.Spine);
    this.armL = h.getNormalizedBoneNode(VRMHumanBoneName.LeftUpperArm);
    this.armR = h.getNormalizedBoneNode(VRMHumanBoneName.RightUpperArm);
    this.elbowL = h.getNormalizedBoneNode(VRMHumanBoneName.LeftLowerArm);
    this.elbowR = h.getNormalizedBoneNode(VRMHumanBoneName.RightLowerArm);
    this.handL = h.getNormalizedBoneNode(VRMHumanBoneName.LeftHand);
    this.handR = h.getNormalizedBoneNode(VRMHumanBoneName.RightHand);
    // 롤 축 = 자식 뼈의 로컬 위치 방향 (그 뼈가 뻗은 방향 = 길이축)
    this.setAxis(this.armL, this.elbowL);
    this.setAxis(this.armR, this.elbowR);
    this.setAxis(this.elbowL, this.handL);
    this.setAxis(this.elbowR, this.handR);
    this.curlFingers();

    // 존재하는 감정 preset만 수집 → apply에서 누락 모델 안전
    const em = vrm.expressionManager;
    this.emotions = Object.entries(EMOTION_PRESETS).filter(
      ([, preset]) => em?.getExpression(preset) != null,
    );

    // 눈썹 강조 모프 위치 수집 (존재하는 것만 — 비VRoid 모델은 조용히 스킵)
    for (const [ch, morphName] of Object.entries(EMOTION_MORPHS)) {
      const targets: { mesh: THREE.SkinnedMesh; index: number }[] = [];
      vrm.scene.traverse((obj) => {
        if (obj instanceof THREE.SkinnedMesh && obj.morphTargetDictionary) {
          const index = obj.morphTargetDictionary[morphName];
          if (index !== undefined) targets.push({ mesh: obj, index });
        }
      });
      if (targets.length) this.emoMorphs.push({ ch, targets });
    }
    // happy 눈감김 보강은 얼굴 교체 후에도 정확해야 하므로 생성 시 고정하지 않고 lazy 재산출
    // (refreshHappyEye) — 얼굴별 모프 저작 편차/로드 타이밍에 따른 불일치 방지.
  }

  // happy 눈감김 보강(모델·얼굴 인지) — 현재 '보이는' 얼굴 기준으로 재산출. 얼굴 교체 시 모프
  // 저작이 달라지므로 매번 보이는 얼굴에서 측정해 목표 비율로 끌어올린다(생성 시 1회 고정 금지).
  // VRoid 'happy'(Fcl_ALL_Joy) 속 Fcl_EYE_Joy(웃는 눈)가 일부 얼굴에선 눈을 덜 감게 저작됨
  // (male ~64% vs female ~45~51%, 완전감김 대비). 부족분만큼 Fcl_EYE_Close(완전감김)를 happy
  // 비율로 가산. 이미 충분히 감기면 boost=0(비퇴행). EYE_Close 본체는 blink(Close_L/R)·viseme 비충돌.
  // sig(메시 uuid+가시성)로 변화 없으면 정점 재측정 스킵 → 매 프레임 비용 회피.
  private refreshHappyEye(): void {
    const meshes: {
      mesh: THREE.SkinnedMesh;
      index: number;
      visible: boolean;
    }[] = [];
    let sig = '';
    this.vrm.scene.traverse((obj) => {
      if (!(obj instanceof THREE.SkinnedMesh) || !obj.morphTargetDictionary)
        return;
      const closeIdx = obj.morphTargetDictionary['Fcl_EYE_Close'];
      if (closeIdx === undefined) return;
      meshes.push({ mesh: obj, index: closeIdx, visible: obj.visible });
      sig += `${obj.uuid}:${obj.visible ? 1 : 0},`;
    });
    if (sig === this.happyEyeSig) return; // 얼굴 구성·가시성 불변 → 재측정 불필요
    this.happyEyeSig = sig;
    // 기록 대상은 EYE_Close 보유 전 메시(base+교체) — 미러(faceRef.sync)가 base→교체 복사하므로
    // 양쪽 동일 기록으로 순서 무관 일관(emoMorphs와 동일 패턴).
    this.happyEyeTargets = meshes.map(({ mesh, index }) => ({ mesh, index }));
    // boost는 '보이는' 얼굴(교체가 base 가림)에서 측정 — 실제 표시되는 눈매 기준.
    let joyDisp = 0;
    let closeDisp = 0;
    for (const { mesh, visible } of meshes) {
      if (!visible) continue;
      joyDisp = Math.max(joyDisp, morphMaxDisp(mesh, 'Fcl_EYE_Joy'));
      closeDisp = Math.max(closeDisp, morphMaxDisp(mesh, 'Fcl_EYE_Close'));
    }
    this.happyEyeBoost =
      closeDisp > 0
        ? THREE.MathUtils.clamp(
            (HAPPY_EYE_TARGET * closeDisp - joyDisp) / closeDisp,
            0,
            1,
          )
        : 0;
  }

  // 길이축 등록: 자식의 로컬 위치가 곧 이 뼈가 뻗은 방향. 길이 0(겹친 뼈)이면 롤 불가 → 미등록.
  private setAxis(bone: THREE.Object3D | null, child: THREE.Object3D | null): void {
    if (!bone || !child) return;
    const axis = child.position.clone();
    if (axis.lengthSq() < 1e-12) return;
    this.axes.set(bone, axis.normalize());
  }

  // euler 회전 뒤에 길이축 롤을 **post-multiply** → 뼈의 로컬 프레임에서 도는 진짜 비틀기.
  // (pre-multiply 하면 부모 축 기준이라 지금까지처럼 팔이 휘둘린다.)
  private twist(bone: THREE.Object3D | null, angle: number): void {
    if (!bone || !angle) return;
    const axis = this.axes.get(bone);
    if (!axis) return;
    bone.quaternion.multiply(this._q.setFromAxisAngle(axis, angle));
  }

  // 전역 편안한 손: 네 손가락 proximal/intermediate를 손바닥쪽으로 살짝 말아둠 (로드 1회).
  // 손가락은 어떤 클립도 안 건드리므로 한 번 설정하면 유지됨. 좌=음수 z, 우=양수 z (거울상).
  private curlFingers(): void {
    const h = this.vrm.humanoid;
    const B = VRMHumanBoneName;
    const curls: [VRMHumanBoneName, number][] = [
      [B.LeftIndexProximal, -0.2],
      [B.LeftIndexIntermediate, -0.4],
      [B.LeftMiddleProximal, -0.2],
      [B.LeftMiddleIntermediate, -0.4],
      [B.LeftRingProximal, -0.25],
      [B.LeftRingIntermediate, -0.45],
      [B.LeftLittleProximal, -0.3],
      [B.LeftLittleIntermediate, -0.5],
      [B.RightIndexProximal, 0.2],
      [B.RightIndexIntermediate, 0.4],
      [B.RightMiddleProximal, 0.2],
      [B.RightMiddleIntermediate, 0.4],
      [B.RightRingProximal, 0.25],
      [B.RightRingIntermediate, 0.45],
      [B.RightLittleProximal, 0.3],
      [B.RightLittleIntermediate, 0.5],
    ];
    for (const [name, z] of curls) {
      const node = h.getNormalizedBoneNode(name);
      if (node) node.rotation.z = z;
    }
  }

  // 스케줄러 출력 상태맵을 VRM에 기록. t=누적 시간(초) — idle micro-drift 위상용(0=drift 없음).
  apply(state: Record<string, number>, t = 0): void {
    const v = (k: string) => state[k] ?? BASELINE[k] ?? 0;
    // micro-drift: 채널별 초저주파 sine (state 비훼손 — euler 로컬에만 가산). DRIFT_AMP=0이면 0.
    const d = (k: string) => {
      const c = DRIFT[k];
      return c ? Math.sin(t * c[0] + c[1]) * c[2] * DRIFT_AMP : 0;
    };

    if (this.head) {
      // idle 미동(rotate) + 제스처(g) 합성 — base+delta (머리는 이미 미동 → drift 제외)
      this._euler.set(
        v('head.rotateX') + v('head.gx'),
        v('head.rotateY') + v('head.gy'),
        v('head.rotateZ') + v('head.gz'),
      );
      this.head.quaternion.setFromEuler(this._euler);
    }
    if (this.spine) {
      this._euler.set(
        v('spine.x'),
        v('spine.y') + d('spine.y'),
        v('spine.z') + d('spine.z'),
      );
      this.spine.quaternion.setFromEuler(this._euler);
    }
    if (this.chest && this.chest !== this.spine) {
      // x=호흡+제스처린(앞뒤), y=제스처턴, z=제스처린(좌우) — 한 본에 합성
      this._euler.set(
        v('chest.inhale') * CHEST_INHALE_SCALE + v('chest.leanX') + d('chest.leanX'),
        v('chest.turnY'),
        v('chest.leanZ') + d('chest.leanZ'),
      );
      this.chest.quaternion.setFromEuler(this._euler);
    }
    if (this.armL) {
      this._euler.set(
        v('armL.x') + d('armL.x'),
        v('armL.y'),
        v('armL.z') + d('armL.z'),
      );
      this.armL.quaternion.setFromEuler(this._euler);
      this.twist(this.armL, v('armL.twist'));
    }
    if (this.armR) {
      this._euler.set(
        v('armR.x') + d('armR.x'),
        v('armR.y'),
        v('armR.z') + d('armR.z'),
      );
      this.armR.quaternion.setFromEuler(this._euler);
      this.twist(this.armR, v('armR.twist'));
    }
    if (this.elbowL) {
      this._euler.set(
        v('elbowL.x'),
        v('elbowL.y'),
        v('elbowL.z') + d('elbowL.z'),
      );
      this.elbowL.quaternion.setFromEuler(this._euler);
      this.twist(this.elbowL, v('elbowL.twist'));
    }
    if (this.elbowR) {
      this._euler.set(
        v('elbowR.x'),
        v('elbowR.y'),
        v('elbowR.z') + d('elbowR.z'),
      );
      this.elbowR.quaternion.setFromEuler(this._euler);
      this.twist(this.elbowR, v('elbowR.twist'));
    }
    // 손목 — normalized 리그의 rest 는 identity 라 전 채널 0이면 기록해도 무변화(비퇴행).
    // drift 미적용(손목 미세진동은 상완 drift가 FK로 이미 전달).
    if (this.handL) {
      this._euler.set(v('handL.x'), v('handL.y'), v('handL.z'));
      this.handL.quaternion.setFromEuler(this._euler);
    }
    if (this.handR) {
      this._euler.set(v('handR.x'), v('handR.y'), v('handR.z'));
      this.handR.quaternion.setFromEuler(this._euler);
    }

    const blink = v('blink');
    this.vrm.expressionManager?.setValue(
      VRMExpressionPresetName.BlinkLeft,
      blink,
    );
    this.vrm.expressionManager?.setValue(
      VRMExpressionPresetName.BlinkRight,
      blink,
    );

    // 감정 표정 (존재하는 preset만 — 무드 전환 클립이 emo.* 채널을 ramp)
    for (const [ch, preset] of this.emotions) {
      this.vrm.expressionManager?.setValue(preset, v(ch));
    }
    // 눈썹 강조 (직접 모프 — angry/sad 변별 보강)
    for (const { ch, targets } of this.emoMorphs) {
      const w = v(ch);
      for (const { mesh, index } of targets) {
        if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = w;
      }
    }
    // happy 눈감김 보강 (현재 보이는 얼굴 기준 boost · 일회성 emo.eyeJoy 따라 ramp). eyeJoy(웃는 눈)
    // 펄스에 EYE_Close(완전감김)를 비례 가산해 진입 시 확실히 감겼다 뜨게 한다(held 아님 → 발화 중
    // 눈뜸 유지). eyeJoy 활성 동안만 lazy 갱신(얼굴 교체 반영, sig 불변 시 재측정 스킵) → idle 비용
    // 회피. 비활성 전환 시 1회 0 기록으로 잔상 제거. boost=0(male류)이면 사실상 무영향(비퇴행).
    const eyeJoy = v('emo.eyeJoy');
    if (eyeJoy > 0 || this.happyEyeActive) {
      this.refreshHappyEye();
      const w = this.happyEyeBoost * eyeJoy;
      for (const { mesh, index } of this.happyEyeTargets) {
        if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = w;
      }
      this.happyEyeActive = eyeJoy > 0 && this.happyEyeBoost > 0;
    }
  }
}
