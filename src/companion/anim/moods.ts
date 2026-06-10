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

export interface Mood {
  loops: AnimTemplate[]; // 무한 루프 클립
  gestures: AnimTemplate[]; // 발화 시작 시 1개 랜덤 발동
}

export const MOODS: Record<string, Mood> = {
  neutral: {
    // 팔내리기는 baseline(armL.z -1.3 / armR.z 1.3)이 담당 — hold-last로 매 프레임 유지.
    // 별도 settle 클립 불필요 (로드 시 1프레임에 대기 자세 확정)
    loops: [breathing, head, pose, blink],
    gestures: GESTURES,
  },
};
