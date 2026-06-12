// 무드별 애니메이션 템플릿. 현재는 neutral만 — 8무드 확장은 C/E 단계 영역.
//
// 각 템플릿은 루프 클립으로 큐에 등록되며, 완료 시 gaussian 재롤되어 무한 반복.
// idle/speaking 서브키로 발화 중 더 큰 머리 움직임 등 분기.

import type { AnimTemplate } from './scheduler';

// 호흡: 1.5초 지연 후 들숨(1.2s)→유지(0.5s)→날숨(1.0s) 반복
const breathing: AnimTemplate = {
  name: 'breathing',
  loop: true,
  delay: 1500,
  dt: [1200, 500, 1000],
  vs: { 'chest.inhale': [0.5, 0.5, 0] },
};

// 머리 미동: idle은 대부분 작은 미동, 가끔 크게 둘러보기(살아있는 느낌). speaking은 빈번.
const head: AnimTemplate = {
  name: 'head',
  loop: true,
  idle: {
    name: 'head',
    alt: [
      // 일상 미동 (대부분) — 기존보다 살짝 큼
      {
        name: 'head',
        p: 0.7,
        delay: [0, 800],
        dt: [[1000, 4000]],
        vs: {
          'head.rotateX': [[-0.03, 0.05]],
          'head.rotateY': [[-0.09, 0.09]],
          'head.rotateZ': [[-0.04, 0.04]],
        },
      },
      // 가끔 크게 둘러보기 — 머리를 확 돌렸다 hold-last로 잠시 유지
      {
        name: 'head',
        delay: [600, 2200],
        dt: [[700, 1500]],
        vs: {
          'head.rotateY': [[-0.22, 0.22]],
          'head.rotateZ': [[-0.07, 0.07]],
          'head.rotateX': [[-0.04, 0.06]],
        },
      },
    ],
  },
  speaking: {
    name: 'head',
    dt: [[300, 1200]],
    vs: {
      'head.rotateX': [[-0.03, 0.06]],
      'head.rotateY': [[-0.08, 0.08]],
      'head.rotateZ': [[-0.05, 0.05]],
    },
  },
};

// 포즈: 6종 상반신 체중이동을 랜덤 전환. Spine 회전(Head/팔/Chest는 FK 상속 → 전신 흔들림).
// 기존보다 진폭 크고 다양하며 더 자주 전환(3~10초) → 적극적인 idle. dt=전환 이징(gaussian).
const pose: AnimTemplate = {
  name: 'pose',
  loop: true,
  alt: [
    {
      name: 'pose',
      delay: [4000, 10000],
      dt: [[1400, 2400]],
      vs: { 'spine.x': [0.0], 'spine.y': [0.06], 'spine.z': [0.05] },
    },
    {
      name: 'pose',
      delay: [4000, 10000],
      dt: [[1400, 2400]],
      vs: { 'spine.x': [0.03], 'spine.y': [-0.08], 'spine.z': [-0.06] },
    },
    {
      name: 'pose',
      delay: [4000, 10000],
      dt: [[1400, 2400]],
      vs: { 'spine.x': [-0.02], 'spine.y': [0.1], 'spine.z': [0.04] },
    },
    {
      name: 'pose',
      delay: [4000, 9000],
      dt: [[1200, 2200]],
      vs: { 'spine.x': [0.05], 'spine.y': [0.0], 'spine.z': [-0.03] },
    },
    {
      name: 'pose',
      delay: [3000, 8000],
      dt: [[1000, 1800]],
      vs: { 'spine.x': [0.0], 'spine.y': [0.13], 'spine.z': [-0.04] },
    },
    {
      name: 'pose',
      delay: [3000, 8000],
      dt: [[1000, 1800]],
      vs: { 'spine.x': [0.01], 'spine.y': [-0.12], 'spine.z': [0.06] },
    },
    // 크게 비틀어 둘러보기 (좌/우) — Spine 큰 턴, 머리는 FK 상속. 빈도 ↑ (p 0.15씩=0.30)
    {
      name: 'pose',
      p: 0.15,
      delay: [3000, 7000],
      dt: [[1600, 2400]],
      vs: { 'spine.x': [0.02], 'spine.y': [0.35], 'spine.z': [-0.05] },
    },
    {
      name: 'pose',
      p: 0.15,
      delay: [3000, 7000],
      dt: [[1600, 2400]],
      vs: { 'spine.x': [0.02], 'spine.y': [-0.35], 'spine.z': [0.05] },
    },
  ],
};

// 눈깜빡임: 85% 단일 깜빡임, 15% 이중 깜빡임. delay 재롤로 2~8초 랜덤 간격
const blink: AnimTemplate = {
  name: 'blink',
  loop: true,
  alt: [
    {
      name: 'blink',
      p: 0.85,
      delay: [2000, 8000, 1, 2],
      dt: [50, [100, 200], 100],
      vs: { blink: [1, 1, 0] },
    },
    {
      name: 'blink',
      delay: [2000, 5000, 1, 2],
      dt: [50, [100, 150], 100, [10, 300, 0], 50, [100, 150], 100],
      vs: { blink: [1, 1, 0, 0, 1, 1, 0] },
    },
  ],
};

// ── idle 팔 포즈 (FK) ──────────────────────────────────────
// 차렷 고정이던 팔에 생활감 부여. armPose 루프가 idle 중 랜덤 전환(대부분 차렷+미세이동,
// 가끔 허리짚기/뒷짐). 발화 중(speaking)엔 rest로 양보 → 제스처가 팔 채널 소유(큐 후순위 승).
// 손끝 정밀도는 작은 오버레이서 안 보여 FK 근사로 충분(손가슴과 동일). 검증축: arm.z(들기),
// arm.x(±=앞뒤, 음수=앞), elbow.z(굽힘 좌− / 우+). 각 포즈는 양팔 전 채널 명시(잔상 방지).
//
// 디버그 버튼용으로 export — DebugPanel이 label로 트리거(companion:idlepose).
export const IDLE_ARM_POSES: AnimTemplate[] = [
  {
    name: 'armPose',
    label: '허리짚기L',
    p: 0.05, // 빈도 낮춤 (가끔만)
    ease: 2.8,
    delay: [4000, 9000],
    dt: [[800, 1300]],
    vs: {
      'armL.z': [-1.02],
      'armL.x': [-0.12],
      'elbowL.z': [-1.05],
      'armR.z': [1.3],
      'armR.x': [0],
      'elbowR.z': [0],
    },
  },
  {
    name: 'armPose',
    label: '허리짚기R',
    p: 0.05, // 빈도 낮춤 (가끔만)
    ease: 2.8,
    delay: [4000, 9000],
    dt: [[800, 1300]],
    vs: {
      'armR.z': [1.02],
      'armR.x': [-0.12],
      'elbowR.z': [1.05],
      'armL.z': [-1.3],
      'armL.x': [0],
      'elbowL.z': [0],
    },
  },
  {
    name: 'armPose',
    label: '뒷짐',
    ease: 2.8,
    delay: [4500, 9500],
    dt: [[900, 1400]],
    vs: {
      'armL.x': [0.26],
      'armR.x': [0.26],
      'elbowL.z': [-0.5],
      'elbowR.z': [0.5],
      'armL.z': [-1.28],
      'armR.z': [1.28],
    },
  },
];

// 차렷+미세 무게이동 (높은 확률, 길게 유지) — armL/R.z 작은 gaussian으로 상시 미동
const armRelaxed: AnimTemplate = {
  name: 'armPose',
  p: 0.72, // 차렷+미세이동 비중 ↑ (허리짚기 빈도 낮춤). 나머지: 허리짚기L/R 0.05, 뒷짐 ~0.18
  ease: 3,
  delay: [3000, 7000],
  dt: [[1400, 2200]],
  vs: {
    'armL.z': [[-1.33, -1.27]],
    'armR.z': [[1.27, 1.33]],
    'armL.x': [[-0.03, 0.03]],
    'armR.x': [[-0.03, 0.03]],
    'elbowL.z': [[-0.08, 0.02]],
    'elbowR.z': [[-0.02, 0.08]],
  },
};

// armPose 루프: idle은 차렷/포즈 랜덤 전환, speaking은 rest(제스처에 팔 양보)
const armPose: AnimTemplate = {
  name: 'armPose',
  loop: true,
  idle: {
    name: 'armPose',
    alt: [armRelaxed, ...IDLE_ARM_POSES],
  },
  speaking: {
    name: 'armPose',
    ease: 3,
    delay: [1500, 3000],
    dt: [[600, 1000]],
    vs: {
      'armL.z': [-1.3],
      'armR.z': [1.3],
      'armL.x': [0],
      'armR.x': [0],
      'elbowL.z': [0],
      'elbowR.z': [0],
    },
  },
};

// 제스처 세트: 발화 시작 시 1개 랜덤 발동(루프 아님). 각 제스처는 독립 템플릿.
//
// 구조: vs = [out, hold, rest]. 빠르게 동작(out) → 잠깐 머묾(hold) → 천천히 복귀(rest).
//   비대칭 타이밍(out < back) + dt gaussian 범위 → 매번 미묘히 달라져 기계적이지 않음.
//   factory가 선두 null(=live) 자동 추가 → live에서 out으로, rest로 복귀. ease=2.5 완만.
//
// 결을 다변화 — 팔 주도 / 머리 주도(끄덕·갸웃) / 다가서기·물러서기 / 몸통 기울임 / 손가슴.
// 검증된 축: armL/R.z(들기), armL.x(−=앞), elbow.z(굽힘), head.gx(+=숙임),
//   head.gz(+=기울임), chest.leanX(+=앞), chest.turnY/leanZ(몸통 턴/린).
const GESTURES: AnimTemplate[] = [
  // ── 팔 주도 ──────────────────────────────────────────
  {
    name: 'gesture',
    label: '왼손짓',
    ease: 2.5,
    dt: [
      [300, 420],
      [250, 450],
      [550, 750],
    ],
    vs: {
      'armL.z': [-1.15, -1.15, -1.3],
      'elbowL.z': [-0.3, -0.3, 0],
      'chest.turnY': [0.07, 0.07, 0],
      'chest.leanZ': [-0.04, -0.04, 0],
    },
  },
  {
    name: 'gesture',
    label: '오른손짓',
    ease: 2.5,
    dt: [
      [300, 420],
      [250, 450],
      [550, 750],
    ],
    vs: {
      'armR.z': [1.15, 1.15, 1.3],
      'elbowR.z': [0.3, 0.3, 0],
      'chest.turnY': [-0.07, -0.07, 0],
      'chest.leanZ': [0.04, 0.04, 0],
    },
  },
  {
    name: 'gesture',
    label: '양손 펼침',
    ease: 2.5,
    dt: [
      [350, 480],
      [300, 500],
      [600, 800],
    ],
    vs: {
      'armL.z': [-1.18, -1.18, -1.3],
      'armR.z': [1.18, 1.18, 1.3],
      'elbowL.z': [-0.22, -0.22, 0],
      'elbowR.z': [0.22, 0.22, 0],
      'chest.turnY': [0.04, 0.04, 0],
    },
  },
  // ── 머리 주도 (head.g* — idle 미동 위에 합성) ──────────
  {
    name: 'gesture',
    label: '끄덕',
    ease: 2.5,
    dt: [
      [200, 280],
      [150, 300],
      [400, 550],
    ],
    vs: {
      'head.gx': [0.14, 0.14, 0],
      'chest.leanX': [0.04, 0.04, 0],
    },
  },
  {
    name: 'gesture',
    label: '갸웃',
    ease: 2.5,
    dt: [
      [400, 550],
      [800, 1200],
      [550, 750],
    ],
    vs: {
      'head.gz': [0.3, 0.3, 0],
    },
  },
  // ── 다가서기 / 물러서기 (chest.leanX 앞뒤) ─────────────
  {
    name: 'gesture',
    label: '다가서기',
    ease: 2.5,
    dt: [
      [350, 480],
      [400, 700],
      [600, 800],
    ],
    vs: {
      'chest.leanX': [0.1, 0.1, 0],
      'head.gx': [0.05, 0.05, 0],
      'armL.z': [-1.2, -1.2, -1.3],
      'armR.z': [1.2, 1.2, 1.3],
      'elbowL.z': [-0.18, -0.18, 0],
      'elbowR.z': [0.18, 0.18, 0],
    },
  },
  {
    name: 'gesture',
    label: '물러서기',
    ease: 2.5,
    dt: [
      [250, 350],
      [300, 550],
      [550, 750],
    ],
    vs: {
      'chest.leanX': [-0.09, -0.09, 0],
      'head.gx': [-0.07, -0.07, 0],
    },
  },
  // ── 몸통 기울임 (기울여 강조, 팔 보조) ────────────────
  {
    name: 'gesture',
    label: '왼기울임',
    ease: 2.5,
    dt: [
      [350, 480],
      [300, 550],
      [600, 820],
    ],
    vs: {
      'chest.turnY': [0.1, 0.1, 0],
      'chest.leanZ': [-0.07, -0.07, 0],
      'armL.z': [-1.22, -1.22, -1.3],
      'elbowL.z': [-0.18, -0.18, 0],
    },
  },
  {
    name: 'gesture',
    label: '오른기울임',
    ease: 2.5,
    dt: [
      [350, 480],
      [300, 550],
      [600, 820],
    ],
    vs: {
      'chest.turnY': [-0.1, -0.1, 0],
      'chest.leanZ': [0.07, 0.07, 0],
      'armR.z': [1.22, 1.22, 1.3],
      'elbowR.z': [0.18, 0.18, 0],
    },
  },
  // ── 손을 가슴에 (진심 — 한 손 가슴쪽 + 고개 기울임) ────
  // 손가슴 = 팔을 앞으로(armL.x 음수=앞) + 팔꿈치 크게 굽혀 손을 가슴 중앙으로
  {
    name: 'gesture',
    label: '손가슴',
    ease: 2.5,
    dt: [
      [400, 550],
      [600, 1000],
      [650, 850],
    ],
    vs: {
      'armL.z': [-1.15, -1.15, -1.3],
      'armL.x': [-0.55, -0.55, 0],
      'elbowL.z': [-1.6, -1.7, 0],
      'head.gz': [0.12, 0.12, 0],
    },
  },
];

// ── 무드별 제스처 톤 ─────────────────────────────────────
// neutral은 위 GESTURES 10종. 나머지 무드는 톤을 달리한 curated 세트.
//   happy=경쾌(ease↓·진폭↑·빠름) / sad=느림·처짐(ease↑·고개 숙임) /
//   surprised=빠른 움찔·물러서기 / angry=날카로움·다가섬

const HAPPY_GESTURES: AnimTemplate[] = [
  {
    name: 'gesture',
    label: 'happy-양손번쩍',
    ease: 1.8,
    dt: [
      [200, 300],
      [200, 350],
      [450, 600],
    ],
    vs: {
      'armL.z': [-0.95, -0.95, -1.3],
      'armR.z': [0.95, 0.95, 1.3],
      'elbowL.z': [-0.3, -0.3, 0],
      'elbowR.z': [0.3, 0.3, 0],
      'chest.leanX': [0.06, 0.06, 0],
      'head.gx': [-0.05, -0.05, 0], // 살짝 위로 (들뜬 느낌)
    },
  },
  {
    name: 'gesture',
    label: 'happy-끄덕끄덕',
    ease: 1.8,
    dt: [
      [150, 220],
      [120, 250],
      [350, 480],
    ],
    vs: {
      'head.gx': [0.16, 0.16, 0],
      'chest.leanX': [0.05, 0.05, 0],
    },
  },
  {
    name: 'gesture',
    label: 'happy-손흔들기',
    ease: 1.8,
    dt: [
      [200, 300],
      [250, 400],
      [450, 600],
    ],
    vs: {
      'armR.z': [0.85, 0.85, 1.3],
      'elbowR.z': [0.5, 0.5, 0],
      'chest.turnY': [-0.06, -0.06, 0],
    },
  },
];

const SAD_GESTURES: AnimTemplate[] = [
  {
    name: 'gesture',
    label: 'sad-고개떨굼',
    ease: 3.5,
    dt: [
      [600, 800],
      [800, 1400],
      [800, 1100],
    ],
    vs: {
      'head.gx': [0.22, 0.22, 0], // 고개 숙임
      'chest.leanX': [-0.05, -0.05, 0],
      'chest.leanZ': [0.04, 0.04, 0],
    },
  },
  {
    name: 'gesture',
    label: 'sad-갸웃처짐',
    ease: 3.5,
    dt: [
      [600, 800],
      [900, 1500],
      [800, 1100],
    ],
    vs: {
      'head.gz': [0.18, 0.18, 0],
      'head.gx': [0.12, 0.12, 0],
    },
  },
];

const SURPRISED_GESTURES: AnimTemplate[] = [
  {
    name: 'gesture',
    label: 'surprised-움찔',
    ease: 1.5,
    dt: [
      [120, 180],
      [300, 500],
      [500, 700],
    ],
    vs: {
      'chest.leanX': [-0.1, -0.09, 0], // 뒤로 물러섬
      'head.gx': [-0.1, -0.08, 0],
      'armL.z': [-1.05, -1.1, -1.3],
      'armR.z': [1.05, 1.1, 1.3],
    },
  },
  {
    name: 'gesture',
    label: 'surprised-갸웃',
    ease: 1.6,
    dt: [
      [150, 220],
      [400, 700],
      [500, 700],
    ],
    vs: {
      'head.gz': [0.2, 0.18, 0],
      'head.gx': [-0.06, -0.06, 0],
    },
  },
];

const ANGRY_GESTURES: AnimTemplate[] = [
  {
    name: 'gesture',
    label: 'angry-다가섬',
    ease: 1.5,
    dt: [
      [180, 260],
      [300, 500],
      [450, 650],
    ],
    vs: {
      'chest.leanX': [0.12, 0.12, 0], // 앞으로 다가섬
      'head.gx': [0.08, 0.08, 0],
      'armL.z': [-1.1, -1.1, -1.3],
      'armR.z': [1.1, 1.1, 1.3],
      'elbowL.z': [-0.25, -0.25, 0],
      'elbowR.z': [0.25, 0.25, 0],
    },
  },
  {
    name: 'gesture',
    label: 'angry-단호',
    ease: 1.5,
    dt: [
      [150, 220],
      [200, 350],
      [400, 550],
    ],
    vs: {
      'head.gx': [0.14, 0.14, 0],
      'chest.turnY': [0.08, 0.08, 0],
      'chest.leanZ': [-0.05, -0.05, 0],
    },
  },
];

export type EmotionName = 'happy' | 'angry' | 'sad' | 'relaxed' | 'surprised';
// 표정 채널 키 (emo. 접두어 제외). preset 5종 + 직접 모프 강조(눈썹/surprised 부위)
export type ExpressionKey =
  | EmotionName
  | 'browAngry'
  | 'browSorrow'
  | 'browSurprised'
  | 'eyeSurprised'
  | 'mthSurprised';

export interface Mood {
  expression: Partial<Record<ExpressionKey, number>>; // 무드 표정 (채널 weight)
  loops: AnimTemplate[]; // 무한 루프 클립
  gestures: AnimTemplate[]; // 발화 시작 시 1개 랜덤 발동
}

// 루프(호흡/머리/포즈/깜빡임)는 모든 무드 공유 — 루프 톤 분기는 5단계(이번 범위 외)
const BASE_LOOPS: AnimTemplate[] = [breathing, head, pose, armPose, blink];

export const MOODS: Record<string, Mood> = {
  neutral: {
    // 팔내리기는 baseline(armL.z -1.3 / armR.z 1.3)이 담당 — hold-last로 매 프레임 유지.
    // 별도 settle 클립 불필요 (로드 시 1프레임에 대기 자세 확정)
    expression: {},
    loops: BASE_LOOPS,
    gestures: GESTURES,
  },
  happy: {
    expression: { happy: 0.9 },
    loops: BASE_LOOPS,
    gestures: HAPPY_GESTURES,
  },
  sad: {
    // relaxed(Fcl_ALL_Fun=즐거움) 제거 — 슬픔을 약화시켰음. 눈썹 올림(Sorrow)으로 변별 강화
    expression: { sad: 0.9, browSorrow: 0.5 },
    loops: BASE_LOOPS,
    gestures: SAD_GESTURES,
  },
  surprised: {
    // Fcl_ALL_Surprised(입 크게 벌림) 대신 부위 조합 — 발화 viseme와 과중첩 방지.
    // 눈썹·눈은 held(놀람 신호 유지). 입은 진입 시 gasp 일회성 입벌림 후 닫힘(useAnimator).
    expression: { browSurprised: 0.85, eyeSurprised: 0.7 },
    loops: BASE_LOOPS,
    gestures: SURPRISED_GESTURES,
  },
  angry: {
    // 눈썹 내림·모음(Angry)으로 sad와 변별 강화
    expression: { angry: 0.8, browAngry: 0.6 },
    loops: BASE_LOOPS,
    gestures: ANGRY_GESTURES,
  },
};
