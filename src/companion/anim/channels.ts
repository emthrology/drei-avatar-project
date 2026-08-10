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
export const CHEST_INHALE_SCALE = 0.03;

// ── 자세 동요 (postural sway) — 리뉴얼 4단계에서 micro-drift 를 승격한 것 ──────────
//
// 무엇: 본별 최종 회전에 상시 가산하는 저주파 진동. **키는 채널이 아니라 본의 축**(`<본>.<축>`)
// 이고, boneEulers 가 파생까지 끝낸 뒤 마지막에 더한다 → 어느 클립이 돌든 무관하게 항상 산다.
// apply-레이어라 스케줄러의 채널 단일 소유·hold-last 계약과 무관하고, state 맵도 비훼손이다
// (tick 반환 = scheduler.live 참조 → mutate 금지. euler 로컬에만 더한다).
//
// 왜 이 형태인가 (4단계 = 정적 제거):
// - 원래 목적은 hold 구간의 '얼어붙음' 완화였는데, 속도가 인지 문턱(0.5°/s)의 절반이라 **못 가렸다.**
//   루프가 `delay 대기 → 램프 → 대기`라 채널이 구조적으로 수 초씩 상수가 되는 게 근본 원인.
// - ⚠️ **sine 하나로는 문턱을 못 넘긴다** — 속도 = 진폭×각주파수×|cos| 라 반주기마다 0을 지난다.
//   진폭을 키워도 정지 구간이 짧아질 뿐 사라지지 않는다(그리고 커지면 '물 위에 뜬' 느낌이 난다).
//   → **축마다 서로 안 맞아떨어지는 4성분을 합성**한다. 속도 0 지점이 겹칠 일이 드물어 합이
//   문턱 위에 머물고, 축이 2개 이상인 본은 축끼리 또 직교 합성돼 더 안정적이다.
// - **성분 수보다 축별 속도 크기가 지배적이다**(실측: 성분을 2→4로 늘리면서 진폭을 1/√f 로
//   깔았더니 최장 정지가 3.75→5.97s 로 오히려 나빠졌다). 그래서 진폭을 `a ∝ 1/f` 로 배분해
//   **성분마다 속도 기여를 균등**하게 만들고, 축별 최대 속도를 문턱의 2.4~3배로 잡는다.
// - ⚠️ **속도를 얻으려고 주파수만 올리지 않는다.** 진폭 0.1° 짜리 빠른 성분을 넣으면 지표는
//   통과하지만 눈에는 아무것도 안 보인다 = 측정기를 속이는 것(문턱 0.5°/s 는 애초에 **인지**
//   기준이다). 대역을 0.5~2.6 rad/s(주기 2.4~12.6s)로 묶어 두는 이유.
//
// DRIFT_AMP=0 이면 완전 무영향(비퇴행) — 부유감이 나면 여기부터 0으로 내려 원인을 가른다.
// 얼굴(표정 동기)·손목(상완 동요가 FK 로 전달)·chest.inhale(이미 진동)은 대상 아님.
export const DRIFT_AMP = 1; // 전역 배율 (0=off)

/** 성분 [주파수 rad/s, 위상, 진폭 rad] */
export type DriftComp = [number, number, number];

export const DRIFT: Record<string, DriftComp[]> = {
  // 축당 4성분(느림→빠름), 진폭 `a ∝ 1/f` 로 속도 기여 균등. 축별 최대 속도 1.2~1.5°/s
  // (문턱의 2.4~3배), **축당 총 진폭 0.95~1.41°** — 자세 동요로 보일 크기이자, 이보다 키우면
  // 부유감이 나기 시작하는 선. 눈으로 부유감이 나면 진폭부터 내린다(속도가 아니라).
  // 주파수는 축마다 전부 다르게 흩어 놨다 — 같은 주파수를 공유하면 위상이 달라도 상대
  // 위상이 고정돼 온몸이 한 덩어리로 규칙적으로 흔들린다(가장 티 나는 실패 모드).
  // 값은 생성물이라 손으로 미세조정하기보다 그룹 목표 속도/진폭을 바꿔 다시 까는 편이 낫다.
  'head.x': [
    [0.6, 3.7, 0.0087],
    [1.06, 6.1, 0.0049],
    [1.6, 0.0, 0.0033],
    [2.17, 0.7, 0.0024],
  ],
  'head.y': [
    [0.75, 5.3, 0.007],
    [1.29, 3.1, 0.0041],
    [1.69, 1.8, 0.0031],
    [2.31, 5.8, 0.0023],
  ],
  'head.z': [
    [0.57, 4.9, 0.0092],
    [1.14, 6.0, 0.0046],
    [1.76, 1.4, 0.003],
    [2.31, 1.7, 0.0023],
  ],
  'neck.x': [
    [0.73, 6.2, 0.0078],
    [1.31, 0.3, 0.0043],
    [1.7, 0.8, 0.0033],
    [2.37, 6.1, 0.0024],
  ],
  'neck.y': [
    [0.62, 5.9, 0.0091],
    [1.23, 1.9, 0.0046],
    [1.63, 1.9, 0.0035],
    [2.35, 3.0, 0.0024],
  ],
  'neck.z': [
    [0.51, 2.0, 0.0111],
    [1.18, 1.5, 0.0048],
    [1.75, 1.6, 0.0032],
    [2.36, 1.1, 0.0024],
  ],
  'spine.x': [
    [0.72, 3.4, 0.0091],
    [1.17, 0.7, 0.0056],
    [1.73, 4.2, 0.0038],
    [2.21, 4.1, 0.003],
  ],
  'spine.y': [
    [0.59, 4.7, 0.0111],
    [1.32, 6.1, 0.005],
    [1.85, 1.5, 0.0035],
    [2.27, 1.2, 0.0029],
  ],
  'spine.z': [
    [0.74, 2.6, 0.0088],
    [1.25, 2.2, 0.0052],
    [1.87, 2.8, 0.0035],
    [2.28, 1.0, 0.0029],
  ],
  'upperChest.x': [
    [0.8, 5.6, 0.0076],
    [1.09, 2.7, 0.0056],
    [1.66, 1.7, 0.0037],
    [2.28, 1.9, 0.0027],
  ],
  'upperChest.y': [
    [0.54, 5.5, 0.0113],
    [1.35, 2.9, 0.0045],
    [1.68, 3.0, 0.0036],
    [2.28, 2.8, 0.0027],
  ],
  'upperChest.z': [
    [0.59, 0.4, 0.0104],
    [1.35, 3.1, 0.0045],
    [1.83, 1.4, 0.0033],
    [2.22, 4.9, 0.0028],
  ],
  'chest.x': [
    [0.5, 4.1, 0.0118],
    [1.18, 2.4, 0.005],
    [1.79, 1.4, 0.0033],
    [2.17, 1.5, 0.0027],
  ],
  'chest.z': [
    [0.7, 0.9, 0.0084],
    [1.19, 2.0, 0.0049],
    [1.85, 3.1, 0.0032],
    [2.37, 3.7, 0.0025],
  ],
  'shoulderL.x': [
    [0.5, 2.5, 0.0131],
    [1.27, 4.1, 0.0052],
    [1.9, 5.3, 0.0034],
    [2.29, 0.0, 0.0029],
  ],
  'shoulderL.z': [
    [0.62, 0.6, 0.0106],
    [1.16, 1.9, 0.0056],
    [1.81, 2.3, 0.0036],
    [2.38, 3.3, 0.0027],
  ],
  'shoulderR.x': [
    [0.68, 3.4, 0.0096],
    [1.09, 0.9, 0.006],
    [1.8, 3.8, 0.0036],
    [2.19, 5.9, 0.003],
  ],
  'shoulderR.z': [
    [0.6, 4.8, 0.0109],
    [1.26, 5.8, 0.0052],
    [1.77, 3.9, 0.0037],
    [2.26, 1.2, 0.0029],
  ],
  'armL.x': [
    [0.8, 5.8, 0.0082],
    [1.35, 3.7, 0.0048],
    [1.82, 4.0, 0.0036],
    [2.4, 3.2, 0.0027],
  ],
  'armL.z': [
    [0.71, 5.3, 0.0092],
    [1.19, 2.8, 0.0055],
    [1.77, 5.8, 0.0037],
    [2.23, 1.3, 0.0029],
  ],
  'armR.x': [
    [0.56, 0.2, 0.0117],
    [1.3, 2.0, 0.005],
    [1.7, 3.2, 0.0038],
    [2.21, 4.9, 0.003],
  ],
  'armR.z': [
    [0.73, 1.1, 0.009],
    [1.16, 3.2, 0.0056],
    [1.8, 2.6, 0.0036],
    [2.27, 3.8, 0.0029],
  ],
  'elbowL.x': [
    [0.6, 1.0, 0.0105],
    [1.29, 1.0, 0.0049],
    [1.87, 1.7, 0.0034],
    [2.23, 1.2, 0.0028],
  ],
  'elbowL.z': [
    [0.75, 5.0, 0.0084],
    [1.22, 4.3, 0.0052],
    [1.8, 2.3, 0.0035],
    [2.33, 6.1, 0.0027],
  ],
  'elbowR.x': [
    [0.57, 5.5, 0.0111],
    [1.21, 5.6, 0.0052],
    [1.71, 5.7, 0.0037],
    [2.45, 5.4, 0.0026],
  ],
  'elbowR.z': [
    [0.66, 2.9, 0.0096],
    [1.12, 3.2, 0.0056],
    [1.9, 2.3, 0.0033],
    [2.19, 4.1, 0.0029],
  ],
};

// 본 축 key 의 t초 시점 drift. apply()와 모션 프로파일러(motionProfile.ts)가 **같은 함수**를
// 쓴다 — 프로파일러가 이 표를 복사해 가면 항목이 늘 때 사본만 조용히 낡는다.
export function driftAt(key: string, t: number): number {
  const comps = DRIFT[key];
  if (!comps) return 0;
  let sum = 0;
  for (const [freq, phase, amp] of comps)
    sum += Math.sin(t * freq + phase) * amp;
  return sum * DRIFT_AMP;
}

/** 본 축 key 의 이론상 최대 각속도 (deg/s) — 성분 속도의 합. 예산 테스트가 쓴다 */
export function driftPeakSpeed(key: string): number {
  const comps = DRIFT[key];
  if (!comps) return 0;
  const rad = comps.reduce((a, [freq, , amp]) => a + amp * freq, 0);
  return rad * DRIFT_AMP * (180 / Math.PI);
}

// ── 본 파생 (리뉴얼 3단계 — 본 커버리지) ──────────────────────────────────────
// 개별 클립을 다시 저작하지 않고 **기존 채널 값에서 새 본 회전을 만들어** 전 동작에 소급한다
// (모션 레이어 = 데이터 무변경 소급 적용). 원칙은 **총 회전량 유지**: 새 본이 가져간 몫만큼
// 원래 본에서 뺀다 → 실루엣(손 위치·시선 방향)은 그대로고, 한 관절이 담당하던 회전이 여러
// 관절로 **분절**된다. 머리가 목 없이 두개골 바닥에서 통째로 도는 게 로봇 같아 보이던 지점.
// 계수 0 = 파생 없음 → 기존 출력 바이트 동일(비퇴행). useAnimator 만 DERIVE_DEFAULT 로 켠다.
export interface DeriveConfig {
  /** head 총 회전 중 Neck 이 가져가는 몫 */
  neck: number;
  /** 상완의 baseline(차렷 ±1.3) 대비 **편차** 중 Shoulder 가 가져가는 몫 */
  shoulder: number;
  /** spine 회전 중 UpperChest 가 가져가는 몫 */
  upperChest: number;
}
export const DERIVE_OFF: DeriveConfig = { neck: 0, shoulder: 0, upperChest: 0 };
// 출발점은 VRMA_03(실측상 가장 정적인 클립 = idle 에 가장 가까움)의 관절 간 각속도 비율.
// docs/motion-renewal-plan.md 3단계 표: head:neck = 0.66:0.34 · shoulder/upperArm = 0.26.
// 비율이 클립마다 다르므로(VRMA_05 는 목 0.49:0.51) 단일 정답 계수는 없다 — 프로파일로 조정한다.
// - neck 0.35     : VRMA_03 실측 그대로
// - shoulder 0.33 : VRMA_03 을 총량 대비로 환산하면 0.26/1.26 ≈ 0.21 인데, 그 값이면 파생된
//                   어깨가 시간의 80%를 인지 문턱(0.5°/s) 아래에 머문다 = 본만 늘고 안 움직인다.
//                   해부학의 견갑상완 리듬(scapulohumeral rhythm) 2:1 = 견갑골이 총 거상의 1/3 을
//                   담당한다는 상한을 택했다. 어깨 최장 정지 16.1→12.1s, 상완은 무변화(10.3s).
// - upperChest 0.25: VRMA_03 에선 UpperChest 가 아예 안 쓰여(0) 실측 근거가 없다 → 보수적으로.
export const DERIVE_DEFAULT: DeriveConfig = {
  neck: 0.35,
  shoulder: 0.33,
  upperChest: 0.25,
};

/** 본 키 → 로컬 오일러 [x,y,z]. 키는 채널 접두어와 같은 이름을 쓴다(head/spine/armL…). */
export type BoneEulers = Record<string, [number, number, number]>;

// 채널 상태맵 → 본별 최종 오일러 (드리프트·파생 포함). apply() 와 모션 프로파일러
// (motionProfile.ts)가 **같은 함수**를 쓴다 — 프로파일러가 이 계산을 복사해 가면 채널·파생이
// 늘 때 사본만 조용히 낡는다(driftAt 과 같은 이유).
// t=누적 시간(초, micro-drift 위상용). cfg 는 호출부가 **모델에 실제로 있는 본만** 켜서 넘긴다
// (없는 본에 몫을 떼주면 그만큼 회전이 증발한다 → Channels 생성자가 결측 본 계수를 0으로 낮춘다).
export function boneEulers(
  state: Record<string, number>,
  cfg: DeriveConfig = DERIVE_OFF,
  t = 0,
): BoneEulers {
  const v = (k: string) => state[k] ?? BASELINE[k] ?? 0;
  const o: BoneEulers = {};
  // 자세 동요를 **본 단위로, 파생이 끝난 뒤** 가산한다. 채널에 더하면 분배 계수만큼 쪼개져
  // (예: spine drift 의 25%가 UpperChest 로) 본별 신호의 독립성이 사라진다.
  const set = (bone: string, x: number, y: number, z: number) => {
    o[bone] = [
      x + driftAt(`${bone}.x`, t),
      y + driftAt(`${bone}.y`, t),
      z + driftAt(`${bone}.z`, t),
    ];
  };

  // 머리 — idle 미동(rotate) + 제스처(g) 합성. base+delta
  const hx = v('head.rotateX') + v('head.gx');
  const hy = v('head.rotateY') + v('head.gy');
  const hz = v('head.rotateZ') + v('head.gz');
  if (cfg.neck > 0) {
    const k = cfg.neck;
    set('neck', hx * k, hy * k, hz * k);
    set('head', hx * (1 - k), hy * (1 - k), hz * (1 - k));
  } else {
    set('head', hx, hy, hz);
  }

  // 몸통 포즈 (Spine 절대 회전 — 상반신 체중이동)
  const px = v('spine.x');
  const py = v('spine.y');
  const pz = v('spine.z');
  if (cfg.upperChest > 0) {
    const k = cfg.upperChest;
    set('upperChest', px * k, py * k, pz * k);
    set('spine', px * (1 - k), py * (1 - k), pz * (1 - k));
  } else {
    set('spine', px, py, pz);
  }

  // 가슴 — x=호흡+제스처린(앞뒤), y=제스처턴, z=제스처린(좌우)을 한 본에 합성
  set(
    'chest',
    v('chest.inhale') * CHEST_INHALE_SCALE + v('chest.leanX'),
    v('chest.turnY'),
    v('chest.leanZ'),
  );

  // 팔 — 어깨는 baseline(차렷) 대비 **편차**만 나눠 진다. 정적 자세(팔 내림)에서 어깨가
  // 딸려 올라가면 안 되므로 baseline 자체는 상완에 남긴다.
  for (const s of ['L', 'R'] as const) {
    const ax = v(`arm${s}.x`);
    const ay = v(`arm${s}.y`);
    const az = v(`arm${s}.z`);
    if (cfg.shoulder > 0) {
      const k = cfg.shoulder;
      const dz = az - BASELINE[`arm${s}.z`];
      set(`shoulder${s}`, ax * k, 0, dz * k);
      set(`arm${s}`, ax * (1 - k), ay, BASELINE[`arm${s}.z`] + dz * (1 - k));
    } else {
      set(`arm${s}`, ax, ay, az);
    }
    set(`elbow${s}`, v(`elbow${s}.x`), v(`elbow${s}.y`), v(`elbow${s}.z`));
    // 손목 — normalized 리그의 rest 는 identity 라 전 채널 0이면 기록해도 무변화(비퇴행).
    // drift 대상 아님(손목 미세진동은 상완 drift 가 FK 로 이미 전달).
    o[`hand${s}`] = [v(`hand${s}.x`), v(`hand${s}.y`), v(`hand${s}.z`)];
  }
  return o;
}

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
  // 본 키(boneEulers 반환 키) → 노드. 파생 본이 늘어도 apply() 는 이 표만 돈다.
  private nodes: [string, THREE.Object3D][] = [];
  // 이 모델에 실제로 존재하는 본만 켠 파생 계수 (결측 본에 몫을 떼면 회전이 증발한다)
  private cfg: DeriveConfig;
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

  constructor(
    private vrm: VRM,
    derive: DeriveConfig = DERIVE_OFF,
  ) {
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

    // 파생 본 — 없는 모델(VRM 에서 Neck/UpperChest/Shoulder 는 선택 본)이면 그 계수만 0으로
    // 낮춘다. 몫을 떼줄 곳이 없는데 원 본에서 빼면 그만큼 회전이 사라진다.
    const neck = h.getNormalizedBoneNode(VRMHumanBoneName.Neck);
    const upperChest = h.getNormalizedBoneNode(VRMHumanBoneName.UpperChest);
    const shoulderL = h.getNormalizedBoneNode(VRMHumanBoneName.LeftShoulder);
    const shoulderR = h.getNormalizedBoneNode(VRMHumanBoneName.RightShoulder);
    this.cfg = {
      neck: neck ? derive.neck : 0,
      shoulder: shoulderL && shoulderR ? derive.shoulder : 0,
      upperChest: upperChest ? derive.upperChest : 0,
    };

    // apply() 가 도는 본 표. 계수 0 인 파생 본은 **아예 넣지 않는다** — 기록조차 안 해야
    // 기존 출력과 바이트 동일이고, VRMA 레이어의 「소유 판별」(useVrmaLayer.ts)도 안 바뀐다.
    const pairs: [string, THREE.Object3D | null][] = [
      ['head', this.head],
      ['neck', this.cfg.neck > 0 ? neck : null],
      ['spine', this.spine],
      ['upperChest', this.cfg.upperChest > 0 ? upperChest : null],
      // Chest 결측 시 spine 으로 fallback 하지만, 그 경우 spine 기록이 이기므로 제외한다
      ['chest', this.chest !== this.spine ? this.chest : null],
      ['shoulderL', this.cfg.shoulder > 0 ? shoulderL : null],
      ['shoulderR', this.cfg.shoulder > 0 ? shoulderR : null],
      ['armL', this.armL],
      ['armR', this.armR],
      ['elbowL', this.elbowL],
      ['elbowR', this.elbowR],
      ['handL', this.handL],
      ['handR', this.handR],
    ];
    this.nodes = pairs.filter((p): p is [string, THREE.Object3D] => !!p[1]);

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
  private setAxis(
    bone: THREE.Object3D | null,
    child: THREE.Object3D | null,
  ): void {
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

    // 본 회전 = 채널 → 오일러 변환(드리프트·파생 포함)을 boneEulers 가 전담. 여기선 기록만 한다.
    const eu = boneEulers(state, this.cfg, t);
    for (const [key, node] of this.nodes) {
      const e = eu[key];
      if (!e) continue;
      this._euler.set(e[0], e[1], e[2]);
      node.quaternion.setFromEuler(this._euler);
    }
    // 길이축 롤은 오일러 뒤에 post-multiply (euler 로 표현 불가 — 파일 상단 주석 참조)
    this.twist(this.armL, v('armL.twist'));
    this.twist(this.armR, v('armR.twist'));
    this.twist(this.elbowL, v('elbowL.twist'));
    this.twist(this.elbowR, v('elbowR.twist'));

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
