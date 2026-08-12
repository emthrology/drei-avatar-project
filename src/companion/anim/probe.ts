// 손동작 수치 검증 프로브 — 육안 피드백을 측정 가능한 술어로 대체.
//
// 배경: 손인사(wave)를 FK로 만들다 5회 실패했는데(docs/wave-gesture-attempts.md), 실패가 전부
// "위아래 flap", "팔 전체 덜렁덜렁", "하완이 상완과 겹침" 같은 육안 표현으로만 남아 재현·검증이
// 불가능했다. 값을 바꿀 때마다 사람이 보고 알려주는 루프였고, 그래서 수렴하지 못했다.
// 여기서는 팔 본의 기하를 뽑아 술어로 판정한다 → 값 조정의 성패를 스스로 확인할 수 있다.
//
// 좌표계: **Hips 로컬**(아바타 기준). +z=앞, +y=위, x=좌우.
//   Hips 를 고른 이유 — 카메라·루트 변환과 무관하고, 호흡(Chest)·포즈(Spine)가 Hips 를 회전시키지
//   않아 기준계가 안 흔들린다. Chest 를 쓰면 호흡이 hand.z 에 노이즈로 섞인다.
//
// 측정 대상은 **normalized 본**(channels.ts 가 쓰는 것과 동일 계층) — 우리가 제어하는 값과 측정이
// 같은 좌표계에 있어야 "값을 얼마 바꾸면 손이 어디로" 가 성립한다.

import * as THREE from 'three';
import { VRMHumanBoneName, type VRM } from '@pixiv/three-vrm';

export type Side = 'L' | 'R';

/** 한 프레임의 팔 기하 스냅샷. 위치는 전부 Hips 로컬. */
export interface ArmSample {
  t: number; // 녹화 시작 기준 경과 초
  shoulder: [number, number, number]; // UpperArm 관절 위치
  elbow: [number, number, number]; // LowerArm 관절 위치
  hand: [number, number, number]; // Hand 관절 위치
  armQuat: [number, number, number, number]; // UpperArm world quaternion (상완 정지도용)
  /**
   * 손끝(중지 말단) 위치. **손목 회전은 Hand 관절 원점을 못 움직인다** — 회전하는 건 자식(손가락)
   * 뿐이라 `hand` 만 재면 손목 flick 이 통째로 안 보인다(이동폭 0). 손인사는 손목이 주도하므로
   * 말단 점이 있어야 흔들기를 관측할 수 있다. 손가락 본이 없는 모델은 undefined → hand 로 대체.
   */
  tip?: [number, number, number];
  /** 검지·소지 밑마디. 손바닥 평면을 정의한다(손바닥 법선 = 두 벡터의 외적) */
  indexBase?: [number, number, number];
  littleBase?: [number, number, number];
  /**
   * Hips 월드 yaw(도) — 몸이 정면(0°)에서 얼마나 돌아갔는가.
   * 다른 지표는 전부 Hips 로컬이라 **몸통 자체의 방향은 구조적으로 안 보인다.**
   * VRMA 클립이 비스듬한 자세로 저작된 경우(VRMA_03 은 −22°) 재생 후 그 각도가 남는지
   * 확인하려면 이 값이 필요하다 — 절차 레이어는 Hips 를 쓰지 않으므로 아무도 되돌리지 않는다.
   */
  hipsYaw?: number;
}

// 프레임당 재사용 (샘플링이 useFrame 에서 도므로 할당 금지)
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

function localPos(
  node: THREE.Object3D,
  ref: THREE.Object3D,
): [number, number, number] {
  node.getWorldPosition(_v);
  ref.worldToLocal(_v);
  return [_v.x, _v.y, _v.z];
}

/**
 * 현재 프레임의 팔 기하를 뽑는다. `vrm.update(delta)` **이후**에 호출할 것
 * (스프링본·표정이 반영된 최종 자세를 재야 한다).
 * 필요한 본이 없으면 null — 비VRoid/부분 리그 모델 안전.
 */
export function sampleArm(vrm: VRM, side: Side, t: number): ArmSample | null {
  const h = vrm.humanoid;
  const B = VRMHumanBoneName;
  const shoulder = h.getNormalizedBoneNode(
    side === 'L' ? B.LeftUpperArm : B.RightUpperArm,
  );
  const elbow = h.getNormalizedBoneNode(
    side === 'L' ? B.LeftLowerArm : B.RightLowerArm,
  );
  const hand = h.getNormalizedBoneNode(side === 'L' ? B.LeftHand : B.RightHand);
  const ref = h.getNormalizedBoneNode(B.Hips);
  if (!shoulder || !elbow || !hand || !ref) return null;

  // 손끝: 중지 말단부터 내려오며 있는 것을 쓴다 (부분 리그 모델 안전)
  const tipBone =
    h.getNormalizedBoneNode(
      side === 'L' ? B.LeftMiddleDistal : B.RightMiddleDistal,
    ) ??
    h.getNormalizedBoneNode(
      side === 'L' ? B.LeftMiddleIntermediate : B.RightMiddleIntermediate,
    ) ??
    h.getNormalizedBoneNode(
      side === 'L' ? B.LeftMiddleProximal : B.RightMiddleProximal,
    );

  const indexBone = h.getNormalizedBoneNode(
    side === 'L' ? B.LeftIndexProximal : B.RightIndexProximal,
  );
  const littleBone = h.getNormalizedBoneNode(
    side === 'L' ? B.LeftLittleProximal : B.RightLittleProximal,
  );

  // Hips 월드 yaw — Y축 twist 성분만 뽑아 각도로
  ref.getWorldQuaternion(_q);
  const hipsYaw = 2 * Math.atan2(_q.y, _q.w) * (180 / Math.PI);

  shoulder.getWorldQuaternion(_q);
  return {
    t,
    shoulder: localPos(shoulder, ref),
    elbow: localPos(elbow, ref),
    hand: localPos(hand, ref),
    armQuat: [_q.x, _q.y, _q.z, _q.w],
    hipsYaw: ((hipsYaw + 180) % 360) - 180,
    ...(tipBone ? { tip: localPos(tipBone, ref) } : {}),
    ...(indexBone ? { indexBase: localPos(indexBone, ref) } : {}),
    ...(littleBone ? { littleBase: localPos(littleBone, ref) } : {}),
  };
}

// ── 이하 순수 로직 (VRM 비의존 → 유닛 테스트 대상) ──────────────────────

export interface ArmMetrics {
  /** 손 이동 범위 (Hips 로컬). 흔들림 주축 판정용 */
  span: { x: number; y: number; z: number };
  /** 흔들림 주축 — 좌우(horizontal)여야 "손 흔들기". 위아래면 flap(시도1 실패 모드) */
  swingAxis: 'horizontal' | 'vertical' | 'depth' | 'none';
  /** 상완 최대 각변화(rad). 클수록 팔 전체가 덜렁거림(시도2·3 실패 모드) */
  armSwing: number;
  /** 하완 전방도(m) = mean(hand.z − elbow.z). >0 이어야 하완이 상완 '앞'(시도4·5 실패 모드) */
  forearmFront: number;
  /** 손 높이(m) = mean(hand.y − shoulder.y). 0 이상이면 손이 어깨 위 */
  handHeight: number;
  /** 손↔상완 선분 최소거리(m). 작을수록 하완이 상완에 포개짐(시도4 실패 모드) */
  clearance: number;
  /** 손끝 이동 범위. 손목 flick 은 여기서만 보인다(hand 관절은 안 움직임) */
  tipSpan: { x: number; y: number; z: number };
  /** 손끝 기준 흔들림 주축 */
  tipSwingAxis: 'horizontal' | 'vertical' | 'depth' | 'none';
  /**
   * 하완이 몸통에서 떨어진 정도(m) — 하완 중점의 **몸 중심축(Hips 수직선) 수평거리** 최솟값.
   * 작으면 하완이 몸통 실루엣에 파묻혀 "뭉개져" 보인다(팔꿈치를 깊게 접을수록 심함).
   * `clearance`(손↔상완)와 다른 실패 모드 — 그쪽은 팔끼리 포개짐, 이쪽은 팔이 몸통에 붙음.
   */
  torsoClearance: number;
  /**
   * 손바닥이 몸 **바깥**을 향하는 정도 (−1~1, 1=완전히 바깥). 손인사는 손바닥을 상대에게
   * 보여야 하므로 바깥/앞을 향해야 한다. 손등이 보이면 음수.
   * 손바닥 법선 = (검지밑 − 손목) × (소지밑 − 손목), 바깥 방향 = 팔이 달린 쪽(어깨 x 부호).
   * 손가락 본이 없으면 0(판정 보류).
   */
  palmOut: number;
  /**
   * 손바닥이 **정면(보는 사람 쪽, +z)** 을 향하는 정도 (−1~1). 인사는 손바닥을 상대에게
   * 보여야 하므로 이쪽이 실제 목표다 — `palmOut`(측면)만 최대화하면 손이 날로 서서
   * 카메라에선 손등도 손바닥도 안 보인다(실측 palmOut 0.99일 때 화면상 edge-on).
   */
  palmFwd: number;
  /**
   * Hips 월드 yaw 의 [최소, 최대, 마지막] (도). 몸이 정면에서 얼마나 돌아갔는지.
   * VRMA 클립이 비스듬한 자세로 저작되면 재생 중 몸이 돌아가는데, **절차 레이어는 Hips 를
   * 안 쓰므로 아무도 되돌리지 않는다** → 제스처 후에도 남았는지 `last` 로 확인한다.
   */
  hipsYaw: { min: number; max: number; last: number };
}

export interface Check {
  name: string;
  pass: boolean;
  value: number | string;
  want: string;
}

export interface ArmVerdict extends ArmMetrics {
  checks: Check[];
  pass: boolean;
}

/** 판정 임계값. 전부 초기 추정치 — 실측 후 재보정 대상 */
export interface ArmTargets {
  swingAxis?: 'horizontal' | 'vertical' | 'depth';
  maxArmSwing?: number; // rad. 상완이 이보다 더 움직이면 "덜렁거림"
  minForearmFront?: number; // m. 하완이 상완보다 이만큼 앞
  minHandHeight?: number; // m. 손이 어깨 대비 이 높이 이상
  minClearance?: number; // m. 손이 상완에서 이만큼 떨어짐(포개짐 방지)
  minSpan?: number; // m. 주축 이동폭이 이보다 작으면 "거의 안 움직임"
}

/**
 * 손인사(wave) 기준 — 실패 기록 5건을 그대로 술어화한 값.
 *
 * ⚠️ `minSpan`·`swingAxis`는 **손끝**에서 잰다(2026-08-04 변경, 사용자 승인).
 * 손목 관절 기준이던 것을 옮겼다 — 손목을 회전시키면 움직이는 건 자식(손가락)뿐이고 관절
 * 원점은 제자리라, 손목 주도 흔들기에서 손목 span 은 **구조적으로 0**(실측 0.002)이었다.
 * 즉 어떤 손인사도 통과할 수 없는 기준이었다 = 측정기의 오류.
 * **임계값 0.08 은 낮추지 않고 그대로 유지**했다(손끝 실측 0.10~0.13 — 여유는 있으나 공짜 아님).
 * 나머지 4개(상완 정지도·하완 전방·손 높이·상완 이격)는 손목/관절 기준 그대로.
 */
export const WAVE_TARGETS: Required<ArmTargets> = {
  swingAxis: 'horizontal',
  maxArmSwing: 0.15, // ≈8.6° — 상완은 거의 정지, 손목/팔꿈치가 흔든다
  minForearmFront: 0.02,
  minHandHeight: 0.0, // 손이 어깨 높이 이상
  minClearance: 0.06,
  minSpan: 0.08, // 좌우로 최소 8cm 는 흔들려야 "인사"로 보임
};

function quatAngle(a: ArmSample['armQuat'], b: ArmSample['armQuat']): number {
  // |dot| 로 이중피복(q ≡ −q) 처리 → 두 회전 사이 최소 각
  const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return 2 * Math.acos(Math.min(1, d));
}

/** 점 p 와 선분 ab 사이 최소거리 */
function pointSegDist(p: number[], a: number[], b: number[]): number {
  const abx = b[0] - a[0],
    aby = b[1] - a[1],
    abz = b[2] - a[2];
  const apx = p[0] - a[0],
    apy = p[1] - a[1],
    apz = p[2] - a[2];
  const len2 = abx * abx + aby * aby + abz * abz;
  const t =
    len2 === 0
      ? 0
      : Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / len2));
  const dx = apx - abx * t,
    dy = apy - aby * t,
    dz = apz - abz * t;
  return Math.hypot(dx, dy, dz);
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

/**
 * 샘플 시계열 → 기하 지표. **순수 함수** (VRM·three 비의존 계산).
 * 상완 각변화는 **중앙 샘플 기준 최대편차** — 누적합은 샘플링 레이트에 비례해 커져서
 * 프레임률이 다르면 값이 달라진다(비교 불가). 편차는 레이트 독립.
 */
export function measureArm(samples: ArmSample[]): ArmMetrics {
  if (samples.length === 0) {
    return {
      span: { x: 0, y: 0, z: 0 },
      swingAxis: 'none',
      armSwing: 0,
      forearmFront: 0,
      handHeight: 0,
      clearance: 0,
      tipSpan: { x: 0, y: 0, z: 0 },
      tipSwingAxis: 'none',
      torsoClearance: 0,
      palmOut: 0,
      palmFwd: 0,
      hipsYaw: { min: 0, max: 0, last: 0 },
    };
  }

  // 한 점의 궤적 → 축별 이동폭 + 주축. 주축은 최대 성분이 나머지보다 1.5배 이상 커야 인정
  const spanOf = (pick: (s: ArmSample) => [number, number, number]) => {
    const axis = (i: number) => {
      const vs = samples.map((s) => pick(s)[i]);
      return Math.max(...vs) - Math.min(...vs);
    };
    const span = { x: axis(0), y: axis(1), z: axis(2) };
    const ranked = (
      [
        ['horizontal', span.x],
        ['vertical', span.y],
        ['depth', span.z],
      ] as const
    )
      .slice()
      .sort((a, b) => b[1] - a[1]);
    const swingAxis: ArmMetrics['swingAxis'] =
      ranked[0][1] > ranked[1][1] * 1.5 ? ranked[0][0] : 'none';
    return { span, swingAxis };
  };

  const { span, swingAxis } = spanOf((s) => s.hand);
  // 손끝 본이 없는 모델은 hand 로 대체 → 기존 동작과 동일한 값(비퇴행)
  const tip = spanOf((s) => s.tip ?? s.hand);

  const ref = samples[Math.floor(samples.length / 2)].armQuat;
  const armSwing = Math.max(...samples.map((s) => quatAngle(s.armQuat, ref)));

  return {
    span,
    swingAxis,
    armSwing,
    forearmFront: mean(samples.map((s) => s.hand[2] - s.elbow[2])),
    handHeight: mean(samples.map((s) => s.hand[1] - s.shoulder[1])),
    clearance: Math.min(
      ...samples.map((s) => pointSegDist(s.hand, s.shoulder, s.elbow)),
    ),
    tipSpan: tip.span,
    tipSwingAxis: tip.swingAxis,
    // 하완 중점의 몸 중심축 수평거리 (Hips 로컬이라 축이 곧 x=z=0 수직선)
    torsoClearance: Math.min(
      ...samples.map((s) =>
        Math.hypot((s.hand[0] + s.elbow[0]) / 2, (s.hand[2] + s.elbow[2]) / 2),
      ),
    ),
    palmOut: mean(samples.map((s) => palmNormal(s)[0])),
    palmFwd: mean(samples.map((s) => palmNormal(s)[1])),
    hipsYaw: {
      min: Math.min(...samples.map((s) => s.hipsYaw ?? 0)),
      max: Math.max(...samples.map((s) => s.hipsYaw ?? 0)),
      last: samples[samples.length - 1].hipsYaw ?? 0,
    },
  };
}

/** 손바닥 평면의 단위 법선 (Hips 로컬). 손가락 본이 없으면 null */
function palmNormalVec(s: ArmSample): [number, number, number] | null {
  if (!s.indexBase || !s.littleBase) return null;
  const a = [
    s.indexBase[0] - s.hand[0],
    s.indexBase[1] - s.hand[1],
    s.indexBase[2] - s.hand[2],
  ];
  const b = [
    s.littleBase[0] - s.hand[0],
    s.littleBase[1] - s.hand[1],
    s.littleBase[2] - s.hand[2],
  ];
  // 외적 = 손바닥 평면의 법선
  const n: [number, number, number] = [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const len = Math.hypot(n[0], n[1], n[2]);
  if (len < 1e-9) return null;
  return [n[0] / len, n[1] / len, n[2] / len];
}

/** 손바닥 법선 → [바깥향(측면), 정면향] 코사인. 손가락 본이 없으면 [0,0] */
function palmNormal(s: ArmSample): [number, number] {
  const n = palmNormalVec(s);
  if (!n) return [0, 0];
  // 바깥 = 팔이 달린 쪽(어깨의 x 부호). 정면 = +z (아바타가 바라보는 방향 = 카메라 쪽).
  const outward = Math.sign(s.shoulder[0]) || 1;
  return [n[0] * outward, n[2]];
}

// ── 양손 동작(박수) ────────────────────────────────────────────────────────
//
// 왜 별도 지표인가: 기존 `ArmMetrics` 는 **한쪽 팔의 자세**를 잰다. 박수의 성패는 자세가 아니라
// **두 손의 관계**(붙었나 · 손바닥끼리인가 · 몇 번인가)라서 단일 팔로는 구조적으로 안 보인다.
//
// ⚠️ 그리고 이게 손인사에 없던 위험이다 — **접촉은 위치 제약인데 VRMA 는 회전만 담는다.**
// 리타게팅은 회전을 옮길 뿐 손 위치를 보장하지 않아서, 팔 길이가 다르면 한 캐릭터에서 맞은 손이
// 다른 캐릭터에선 허공이거나 관통이다(실측 근거: 같은 30° 에서 손끝 이동폭 남자1 0.131 /
// 여자1 0.096). 손인사에선 진폭 차이로 끝나 무해했다. **그래서 양 캐릭터 측정이 필수다.**

/** 한 프레임의 **양손 관계** 스냅샷. 위치는 전부 Hips 로컬. */
export interface ClapSample {
  t: number;
  /**
   * 양 **손바닥 중심** 거리(m) = 접촉의 진짜 척도. 중심 = mean(손목, 검지밑, 소지밑).
   *
   * ⚠️ **손목 거리로 접촉을 재면 안 된다** (2026-08-11, 육안 반증으로 교체). Hand 본 원점은
   * 손바닥 **안쪽**에 있어서, 두 손바닥이 실제로 맞닿으면 손목 원점끼리는 거의 일치하거나
   * 살짝 교차한다. 그걸 "관통"으로 보고 상완을 벌렸더니 **손바닥이 4~6cm 떠서 허공을 치는데도
   * 프로브는 PASS** 했다(실측: 손목 간격 남자1 +0.081 / 여자1 +0.040 인데 육안은 "갖다 대지도
   * 않는다"). 손바닥 중심은 손바닥 한가운데라 이 왜곡이 없고, 맞닿으면 손 두께만큼만 떨어진다.
   */
  palmGap: number;
  /** 양 손목 거리(m) — 진단용 참고치. **판정에는 쓰지 않는다**(위 주석) */
  gap: number;
  /** 두 손 중점 높이·전방 (Hips 기준) — 프레이밍 판정용 */
  midY: number;
  midZ: number;
  /**
   * 손바닥 법선과 **접촉축**(왼손→오른손)의 정렬. |·|≈1 이면 손바닥이 서로를 정면으로 향한다
   * = 박수. 손이 만나기만 하고 손바닥이 비스듬하면 작다(실측: 진짜 박수 0.87~1.00 vs
   * VRMA_07 의 "손이 스치는" 접촉 0.14~0.43). 손가락 본이 없으면 0.
   *
   * ⚠️ **손이 거의 붙은 프레임에서는 이 값이 무의미하다** — 축이 `(R−L)/|R−L|` 라서 간격이
   * 0 으로 가면 방향이 잔차에 지배되고, 손목이 교차하는 순간 **부호가 뒤집힌다**.
   * 실측(male1): 간격 0.08 이상에서 0.76~0.86 으로 안정적인데 0.04 미만에서 0.25 로 무너지고
   * 8프레임(130ms) 만에 −0.58 → +0.71 → −0.28 로 진동한다(손바닥이 그렇게 돌 수는 없다).
   * → 판정은 `alignGapMin` 이상인 **접근 구간**에서만 한다.
   */
  alignL: number;
  alignR: number;
  /**
   * 두 손의 **부호 있는** 좌우 간격(왼손 x − 오른손 x). 손이 교차하면 부호가 뒤집힌다
   * = 손바닥이 서로를 통과했다는 뜻. 거리 하한(추정치)보다 직접적인 관통 판정이다.
   */
  sepX: number;
}

/** 현재 프레임의 양손 관계. `vrm.update(delta)` **이후**에 호출할 것. */
export function sampleClap(vrm: VRM, t: number): ClapSample | null {
  const L = sampleArm(vrm, 'L', t);
  const R = sampleArm(vrm, 'R', t);
  if (!L || !R) return null;

  const d = [R.hand[0] - L.hand[0], R.hand[1] - L.hand[1], R.hand[2] - L.hand[2]];
  const gap = Math.hypot(d[0], d[1], d[2]);

  // 손바닥 중심 = 손목·검지밑·소지밑의 평균. 손가락 본이 없으면 손목으로 대체(값이 손목 거리와
  // 같아지지만, 그런 모델은 애초에 손바닥 판정 대상이 아니다)
  const palmCenter = (s: ArmSample): [number, number, number] =>
    s.indexBase && s.littleBase
      ? [
          (s.hand[0] + s.indexBase[0] + s.littleBase[0]) / 3,
          (s.hand[1] + s.indexBase[1] + s.littleBase[1]) / 3,
          (s.hand[2] + s.indexBase[2] + s.littleBase[2]) / 3,
        ]
      : s.hand;
  const pL = palmCenter(L);
  const pR = palmCenter(R);
  const palmGap = Math.hypot(pR[0] - pL[0], pR[1] - pL[1], pR[2] - pL[2]);
  const axis = gap < 1e-9 ? [0, 0, 0] : [d[0] / gap, d[1] / gap, d[2] / gap];
  const nL = palmNormalVec(L);
  const nR = palmNormalVec(R);
  const proj = (n: [number, number, number] | null) =>
    n ? n[0] * axis[0] + n[1] * axis[1] + n[2] * axis[2] : 0;

  return {
    t,
    palmGap,
    gap,
    midY: (L.hand[1] + R.hand[1]) / 2,
    midZ: (L.hand[2] + R.hand[2]) / 2,
    alignL: proj(nL),
    alignR: proj(nR),
    sepX: L.hand[0] - R.hand[0],
  };
}

export interface ClapMetrics {
  /** 최소 **손바닥 중심** 거리(m) — 접촉 판정의 주 지표. 크면 허공, 너무 작으면 겹침 */
  minPalmGap: number;
  /** 최대 손바닥 중심 거리(m). 작으면 붙어만 있고 치지 않는다 */
  maxPalmGap: number;
  /** 최소 손목 간격(m) — 진단용 참고치 */
  minGap: number;
  /** 최대 손목 간격(m) — 진단용 참고치 */
  maxGap: number;
  /** 접촉 횟수 (히스테리시스 — 아래 countClaps) */
  claps: number;
  /**
   * 최소 **부호 있는** 좌우 간격(m). 벌어진 자세의 부호를 기준으로 정렬해서 재므로,
   * 음수면 두 손이 교차했다 = 관통.
   */
  minSep: number;
  /** **접근 구간**(gap ∈ [alignGapMin, releaseGap])의 손바닥 정렬 |·| (양손 중 나쁜 쪽) */
  align: number;
  /** 두 손 중점의 평균 높이·전방 (Hips 기준) — 프레임 이탈·얼굴 가림 판정 */
  handY: number;
  handZ: number;
}

/**
 * 접촉 횟수 — 단순 임계 통과 카운트가 아니라 **히스테리시스**를 쓴다.
 * 임계 하나로 세면 접촉 근방에서 값이 떨릴 때 한 번의 박수가 여러 번으로 세어진다.
 * `contact` 이하로 내려가면 1회 세고, 다시 `release` 이상으로 벌어져야 다음 회를 센다.
 */
export function countClaps(
  gaps: number[],
  contact: number,
  release: number,
): number {
  let n = 0;
  let closed = false;
  for (const g of gaps) {
    if (!closed && g <= contact) {
      n++;
      closed = true;
    } else if (closed && g >= release) {
      closed = false;
    }
  }
  return n;
}

export interface ClapTargets {
  /** 접촉으로 인정할 **손바닥 중심** 거리 상한(m) */
  contactGap: number;
  /** 다음 접촉을 세기 위해 벌어져야 하는 손바닥 중심 거리(m) */
  releaseGap: number;
  /**
   * 손바닥 정렬을 재기 시작할 최소 **손목** 간격(m). 이보다 붙으면 접촉축이 퇴화해 값이
   * 무의미하다(ClapSample.alignL 주석의 실측 참조). 여기만 손목 거리를 쓴다 — 퇴화하는 축이
   * 손목 기준이기 때문.
   */
  alignGapMin: number;
  /**
   * 정렬 측정 구간의 상한(손목 간격, m). 위 하한과 짝. 너무 벌어진 프레임(블렌드 중 idle 쪽
   * 팔)까지 넣으면 박수와 무관한 손 방향이 섞인다. **`releaseGap` 과 스케일이 다르므로
   * (저쪽은 손바닥 중심 기준) 재사용하지 않는다.**
   */
  alignGapMax: number;
  /** 손바닥이 서로 파고들지 않을 최소 중심 거리(m). 손 두께보다 작으면 메시가 겹친다 */
  minPalmGapFloor: number;
  /** 박수로 보이려면 이만큼은 벌어져야 */
  minMaxGap: number;
  /** 측정 창에서 최소 접촉 횟수 */
  minClaps: number;
  /** 손바닥끼리 마주쳐야 함 */
  minAlign: number;
  /** 두 손 중점 높이 범위 (Hips 기준) — 아래면 배꼽 밑, 위면 얼굴을 가린다 */
  minHandY: number;
  maxHandY: number;
}

/**
 * 박수 기준 — **물리적 의미에서 정한 값**이지 실측에 맞춘 값이 아니다.
 * (예산을 실측에 붙여 조이지 않는다 — [[budgets-are-guardrails-not-ratchets]])
 *
 * 소스 리그(clap.vrma 저작 리그) FK 실측은 참고용: 접촉 0.074~0.12 · 분리 0.17~0.24 ·
 * 정렬 0.87~1.00 · 8~9회/2.3s. 리타게팅 후 우리 캐릭터에서 얼마가 나올지는 **미지수이고,
 * 그게 이 프로브를 만든 이유다.** 미달이 나오면 임계를 내리지 말고 모션 파라미터를 고칠 것.
 */
export const CLAP_TARGETS: ClapTargets = {
  // 손바닥 **중심** 기준이라 손목 기준이던 옛 값(0.12/0.15)과 스케일이 다르다.
  // 손 두께가 ~0.02~0.03m 이므로 중심끼리 0.05m 안이면 손바닥이 닿은 상태다.
  contactGap: 0.05,
  releaseGap: 0.08,
  alignGapMin: 0.08,
  alignGapMax: 0.25,
  minPalmGapFloor: 0.02, // 손 두께 스케일 — 이보다 가까우면 손바닥 메시가 파고든다
  minMaxGap: 0.12,
  minClaps: 3,
  minAlign: 0.7,
  minHandY: 0.1,
  maxHandY: 0.55,
};

export interface ClapVerdict extends ClapMetrics {
  checks: Check[];
  pass: boolean;
}

export function measureClap(
  samples: ClapSample[],
  targets: ClapTargets = CLAP_TARGETS,
): ClapMetrics {
  if (samples.length === 0)
    return {
      minPalmGap: 0,
      maxPalmGap: 0,
      minGap: 0,
      maxGap: 0,
      claps: 0,
      minSep: 0,
      align: 0,
      handY: 0,
      handZ: 0,
    };

  const palmGaps = samples.map((s) => s.palmGap);
  const gaps = samples.map((s) => s.gap);
  // 양손 중 **나쁜 쪽**을 본다 — 한 손만 손바닥을 대고 다른 손이 비스듬하면 박수가 아니다
  const worstAlign = (s: ClapSample) =>
    Math.min(Math.abs(s.alignL), Math.abs(s.alignR));
  // 접근 구간에서만 정렬을 잰다(붙은 프레임은 축이 퇴화 — ClapSample.alignL 주석)
  const approach = samples.filter(
    (s) => s.gap >= targets.alignGapMin && s.gap <= targets.alignGapMax,
  );
  const alignFrom = approach.length ? approach : samples;

  // 교차 판정은 **벌어진 자세의 부호**를 기준으로 한다 — 어느 쪽이 +x 인지는 리그마다 다르다
  const widest = samples.reduce((a, b) => (b.gap > a.gap ? b : a));
  const openSign = Math.sign(widest.sepX) || 1;

  return {
    minPalmGap: Math.min(...palmGaps),
    maxPalmGap: Math.max(...palmGaps),
    minGap: Math.min(...gaps),
    maxGap: Math.max(...gaps),
    claps: countClaps(palmGaps, targets.contactGap, targets.releaseGap),
    minSep: Math.min(...samples.map((s) => s.sepX * openSign)),
    align: mean(alignFrom.map(worstAlign)),
    handY: mean(samples.map((s) => s.midY)),
    handZ: mean(samples.map((s) => s.midZ)),
  };
}

export function evaluateClap(
  samples: ClapSample[],
  targets: ClapTargets = CLAP_TARGETS,
): ClapVerdict {
  const t = { ...CLAP_TARGETS, ...targets };
  const m = measureClap(samples, t);

  const checks: Check[] = [
    {
      name: '접촉',
      pass: m.minPalmGap <= t.contactGap,
      value: +m.minPalmGap.toFixed(4),
      want: `≤${t.contactGap}`,
    },
    {
      name: '비관통',
      pass: m.minPalmGap >= t.minPalmGapFloor,
      value: +m.minPalmGap.toFixed(4),
      want: `≥${t.minPalmGapFloor}`,
    },
    {
      name: '벌림폭',
      pass: m.maxPalmGap >= t.minMaxGap,
      value: +m.maxPalmGap.toFixed(4),
      want: `≥${t.minMaxGap}`,
    },
    {
      name: '박수 횟수',
      pass: m.claps >= t.minClaps,
      value: m.claps,
      want: `≥${t.minClaps}`,
    },
    {
      name: '손바닥 정렬',
      pass: m.align >= t.minAlign,
      value: +m.align.toFixed(3),
      want: `≥${t.minAlign}`,
    },
    {
      name: '손 높이',
      pass: m.handY >= t.minHandY && m.handY <= t.maxHandY,
      value: +m.handY.toFixed(3),
      want: `${t.minHandY}~${t.maxHandY}`,
    },
  ];

  return { ...m, checks, pass: checks.every((c) => c.pass) };
}

/** 지표 → 합격/불합격 판정. 실패한 체크의 이름이 곧 어느 실패 모드인지 알려준다. */
export function evaluateArm(
  samples: ArmSample[],
  targets: ArmTargets = WAVE_TARGETS,
): ArmVerdict {
  const m = measureArm(samples);
  const t = { ...WAVE_TARGETS, ...targets };
  // 흔들기 판정은 손끝 기준 (손목 관절은 손목 회전으로 안 움직임 — WAVE_TARGETS 주석 참조)
  const majorSpan =
    m.tipSwingAxis === 'vertical'
      ? m.tipSpan.y
      : m.tipSwingAxis === 'depth'
        ? m.tipSpan.z
        : m.tipSpan.x;

  const checks: Check[] = [
    {
      name: '흔들림 주축',
      pass: m.tipSwingAxis === t.swingAxis,
      value: m.tipSwingAxis,
      want: t.swingAxis,
    },
    {
      name: '이동폭',
      pass: majorSpan >= t.minSpan,
      value: +majorSpan.toFixed(4),
      want: `≥${t.minSpan}`,
    },
    {
      name: '상완 정지도',
      pass: m.armSwing <= t.maxArmSwing,
      value: +m.armSwing.toFixed(4),
      want: `≤${t.maxArmSwing} rad`,
    },
    {
      name: '하완 전방',
      pass: m.forearmFront >= t.minForearmFront,
      value: +m.forearmFront.toFixed(4),
      want: `≥${t.minForearmFront}`,
    },
    {
      name: '손 높이',
      pass: m.handHeight >= t.minHandHeight,
      value: +m.handHeight.toFixed(4),
      want: `≥${t.minHandHeight}`,
    },
    {
      name: '상완 이격',
      pass: m.clearance >= t.minClearance,
      value: +m.clearance.toFixed(4),
      want: `≥${t.minClearance}`,
    },
  ];

  return { ...m, checks, pass: checks.every((c) => c.pass) };
}
