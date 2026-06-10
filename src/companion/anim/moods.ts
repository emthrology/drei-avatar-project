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

// 머리 미동: idle은 느리고 큰 호, speaking은 짧고 빈번. 고정 sine 대신 gaussian 랜덤
const head: AnimTemplate = {
  name: 'head',
  loop: true,
  idle: {
    name: 'head',
    delay: [0, 1000],
    dt: [[1000, 5000]],
    vs: {
      'head.rotateX': [[-0.02, 0.04]],
      'head.rotateY': [[-0.05, 0.05]],
      'head.rotateZ': [[-0.03, 0.03]],
    },
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

// 포즈: 3종 상반신 체중이동을 랜덤 전환. Spine만 회전(Head/팔은 FK 계층 상속).
// delay=현 포즈 유지 시간(6~16초), dt=전환 이징(2초). hold-last로 전환 사이 자세 유지.
// 각 alt가 spine 전축을 명시 → 미지정 채널 드리프트 방지(결정적 전환)
const pose: AnimTemplate = {
  name: 'pose',
  loop: true,
  alt: [
    {
      name: 'pose',
      delay: [6000, 16000],
      dt: [2000],
      vs: { 'spine.x': [0.0], 'spine.y': [0.05], 'spine.z': [0.045] },
    },
    {
      name: 'pose',
      delay: [6000, 16000],
      dt: [2000],
      vs: { 'spine.x': [0.02], 'spine.y': [-0.06], 'spine.z': [-0.05] },
    },
    {
      name: 'pose',
      delay: [6000, 16000],
      dt: [2000],
      vs: { 'spine.x': [-0.01], 'spine.y': [0.08], 'spine.z': [0.0] },
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
//   비대칭 타이밍(out < back) + dt를 gaussian 범위로 → 매번 미묘히 달라져 기계적이지 않음.
//   factory가 선두 null(=live) 자동 추가 → live에서 out으로 부드럽게 시작, rest로 복귀.
// ease=3.5: 완만한 곡선(기본 snap보다 부드럽게) → 각진 로봇 느낌 제거.
//
// 확정 축(시각 검증): armL/R.z(프론탈 들기), elbow.z(굽힘), chest.turnY(몸통 턴),
// chest.leanZ(몸통 린). 팔 주도 / 몸통 주도로 결을 다양화. 모두 절제된 크기.
const GESTURES: AnimTemplate[] = [
  // ── 팔 주도 ──────────────────────────────────────────
  // 왼손짓 + 몸통 왼쪽
  {
    name: 'gesture',
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
  // 오른손짓 + 몸통 오른쪽
  {
    name: 'gesture',
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
  // 양손 펼침 (가볍게)
  {
    name: 'gesture',
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
  // 양손 빠른 강조 (짧고 또렷하지만 부드럽게)
  {
    name: 'gesture',
    ease: 2.5,
    dt: [
      [230, 320],
      [180, 320],
      [450, 620],
    ],
    vs: {
      'armL.z': [-1.16, -1.16, -1.3],
      'armR.z': [1.16, 1.16, 1.3],
      'elbowL.z': [-0.28, -0.28, 0],
      'elbowR.z': [0.28, 0.28, 0],
      'chest.turnY': [-0.05, -0.05, 0],
    },
  },
  // ── 몸통 주도 (기울여 강조, 팔은 보조) ────────────────
  // 왼쪽으로 기울임
  {
    name: 'gesture',
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
  // 오른쪽으로 기울임
  {
    name: 'gesture',
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
