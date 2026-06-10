// 무드별 애니메이션 템플릿. 현재는 neutral만 — 8무드 확장은 C/E 단계 영역.
//
// 각 템플릿은 루프 클립으로 큐에 등록되며, 완료 시 gaussian 재롤되어 무한 반복.
// idle/speaking 서브키로 발화 중 더 큰 머리 움직임 등 분기.

import type { AnimTemplate } from './scheduler'

// 호흡: 1.5초 지연 후 들숨(1.2s)→유지(0.5s)→날숨(1.0s) 반복
const breathing: AnimTemplate = {
  name: 'breathing',
  loop: true,
  delay: 1500,
  dt: [1200, 500, 1000],
  vs: { 'chest.inhale': [0.5, 0.5, 0] },
}

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
}

// 포즈: 3종 상반신 체중이동을 랜덤 전환. Spine만 회전(Head/팔은 FK 계층 상속).
// delay=현 포즈 유지 시간(6~16초), dt=전환 이징(2초). hold-last로 전환 사이 자세 유지.
// 각 alt가 spine 전축을 명시 → 미지정 채널 드리프트 방지(결정적 전환)
const pose: AnimTemplate = {
  name: 'pose',
  loop: true,
  alt: [
    { name: 'pose', delay: [6000, 16000], dt: [2000], vs: { 'spine.x': [0.0], 'spine.y': [0.05], 'spine.z': [0.045] } },
    { name: 'pose', delay: [6000, 16000], dt: [2000], vs: { 'spine.x': [0.02], 'spine.y': [-0.06], 'spine.z': [-0.05] } },
    { name: 'pose', delay: [6000, 16000], dt: [2000], vs: { 'spine.x': [-0.01], 'spine.y': [0.08], 'spine.z': [0.0] } },
  ],
}

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
}

export interface Mood {
  loops: AnimTemplate[] // 무한 루프 클립
}

export const MOODS: Record<string, Mood> = {
  neutral: {
    // 팔내리기는 baseline(armL.z -1.3 / armR.z 1.3)이 담당 — hold-last로 매 프레임 유지.
    // 별도 settle 클립 불필요 (로드 시 1프레임에 대기 자세 확정)
    loops: [breathing, head, pose, blink],
  },
}
