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
}

// 프레임당 재사용 (샘플링이 useFrame 에서 도므로 할당 금지)
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

function localPos(node: THREE.Object3D, ref: THREE.Object3D): [number, number, number] {
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
  const shoulder = h.getNormalizedBoneNode(side === 'L' ? B.LeftUpperArm : B.RightUpperArm);
  const elbow = h.getNormalizedBoneNode(side === 'L' ? B.LeftLowerArm : B.RightLowerArm);
  const hand = h.getNormalizedBoneNode(side === 'L' ? B.LeftHand : B.RightHand);
  const ref = h.getNormalizedBoneNode(B.Hips);
  if (!shoulder || !elbow || !hand || !ref) return null;

  // 손끝: 중지 말단부터 내려오며 있는 것을 쓴다 (부분 리그 모델 안전)
  const tipBone =
    h.getNormalizedBoneNode(side === 'L' ? B.LeftMiddleDistal : B.RightMiddleDistal) ??
    h.getNormalizedBoneNode(side === 'L' ? B.LeftMiddleIntermediate : B.RightMiddleIntermediate) ??
    h.getNormalizedBoneNode(side === 'L' ? B.LeftMiddleProximal : B.RightMiddleProximal);

  const indexBone = h.getNormalizedBoneNode(side === 'L' ? B.LeftIndexProximal : B.RightIndexProximal);
  const littleBone = h.getNormalizedBoneNode(side === 'L' ? B.LeftLittleProximal : B.RightLittleProximal);

  shoulder.getWorldQuaternion(_q);
  return {
    t,
    shoulder: localPos(shoulder, ref),
    elbow: localPos(elbow, ref),
    hand: localPos(hand, ref),
    armQuat: [_q.x, _q.y, _q.z, _q.w],
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
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const apx = p[0] - a[0], apy = p[1] - a[1], apz = p[2] - a[2];
  const len2 = abx * abx + aby * aby + abz * abz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / len2));
  const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
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
    };
  }

  // 한 점의 궤적 → 축별 이동폭 + 주축. 주축은 최대 성분이 나머지보다 1.5배 이상 커야 인정
  const spanOf = (pick: (s: ArmSample) => [number, number, number]) => {
    const axis = (i: number) => {
      const vs = samples.map((s) => pick(s)[i]);
      return Math.max(...vs) - Math.min(...vs);
    };
    const span = { x: axis(0), y: axis(1), z: axis(2) };
    const ranked = ([['horizontal', span.x], ['vertical', span.y], ['depth', span.z]] as const)
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
    clearance: Math.min(...samples.map((s) => pointSegDist(s.hand, s.shoulder, s.elbow))),
    tipSpan: tip.span,
    tipSwingAxis: tip.swingAxis,
    // 하완 중점의 몸 중심축 수평거리 (Hips 로컬이라 축이 곧 x=z=0 수직선)
    torsoClearance: Math.min(
      ...samples.map((s) => Math.hypot((s.hand[0] + s.elbow[0]) / 2, (s.hand[2] + s.elbow[2]) / 2)),
    ),
    palmOut: mean(samples.map((s) => palmNormal(s)[0])),
    palmFwd: mean(samples.map((s) => palmNormal(s)[1])),
  };
}

/** 손바닥 법선 → [바깥향(측면), 정면향] 코사인. 손가락 본이 없으면 [0,0] */
function palmNormal(s: ArmSample): [number, number] {
  if (!s.indexBase || !s.littleBase) return [0, 0];
  const a = [s.indexBase[0] - s.hand[0], s.indexBase[1] - s.hand[1], s.indexBase[2] - s.hand[2]];
  const b = [s.littleBase[0] - s.hand[0], s.littleBase[1] - s.hand[1], s.littleBase[2] - s.hand[2]];
  // 외적 = 손바닥 평면의 법선
  const n = [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const len = Math.hypot(n[0], n[1], n[2]);
  if (len < 1e-9) return [0, 0];
  // 바깥 = 팔이 달린 쪽(어깨의 x 부호). 정면 = +z (아바타가 바라보는 방향 = 카메라 쪽).
  const outward = Math.sign(s.shoulder[0]) || 1;
  return [(n[0] / len) * outward, n[2] / len];
}

/** 지표 → 합격/불합격 판정. 실패한 체크의 이름이 곧 어느 실패 모드인지 알려준다. */
export function evaluateArm(samples: ArmSample[], targets: ArmTargets = WAVE_TARGETS): ArmVerdict {
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
    { name: '이동폭', pass: majorSpan >= t.minSpan, value: +majorSpan.toFixed(4), want: `≥${t.minSpan}` },
    { name: '상완 정지도', pass: m.armSwing <= t.maxArmSwing, value: +m.armSwing.toFixed(4), want: `≤${t.maxArmSwing} rad` },
    { name: '하완 전방', pass: m.forearmFront >= t.minForearmFront, value: +m.forearmFront.toFixed(4), want: `≥${t.minForearmFront}` },
    { name: '손 높이', pass: m.handHeight >= t.minHandHeight, value: +m.handHeight.toFixed(4), want: `≥${t.minHandHeight}` },
    { name: '상완 이격', pass: m.clearance >= t.minClearance, value: +m.clearance.toFixed(4), want: `≥${t.minClearance}` },
  ];

  return { ...m, checks, pass: checks.every((c) => c.pass) };
}
