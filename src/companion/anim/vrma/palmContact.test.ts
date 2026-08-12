// 손바닥 접촉 보정의 순수 로직 — 각도 해법만 테스트한다(THREE 씬이 필요한 부분은 프로브 담당).
//
// 고정하는 불변식: **부호를 가정하지 않는다.** 좌우 어느 팔이든, 리그의 축 방향이 어떻든
// "바깥으로 need 만큼" 이 성립해야 한다. 손인사에서 축 부호를 손으로 맞추다 5번 실패한
// 전례가 있어서(docs/wave-gesture-attempts.md) 여기서는 기하로 풀고 그걸 테스트로 박는다.

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { solveOutwardYaw } from './palmContact';

/** 상완을 월드 Y 로 θ 돌렸을 때 손이 실제로 바깥으로 얼마나 가는지 (검증용 정방향 계산) */
function actualOutwardMove(
  d: THREE.Vector3,
  u: THREE.Vector3,
  theta: number,
): number {
  const moved = d
    .clone()
    .applyQuaternion(
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        theta,
      ),
    );
  return moved.sub(d).dot(u);
}

describe('solveOutwardYaw', () => {
  it('구한 각도로 돌리면 실제로 원하는 만큼 바깥으로 간다', () => {
    // 손이 어깨 앞·안쪽에 있는 전형적 박수 자세
    const d = new THREE.Vector3(-0.12, -0.05, 0.22); // 어깨 → 손바닥
    const u = new THREE.Vector3(-1, 0, 0).normalize(); // 바깥 = −x
    const need = 0.008;
    const theta = solveOutwardYaw(d, u, need);
    expect(theta).not.toBe(0);
    // 선형 근사라 오차가 있지만 방향과 크기가 맞아야 한다
    expect(actualOutwardMove(d, u, theta)).toBeCloseTo(need, 3);
  });

  it('반대쪽 팔(부호 반전)도 같은 식으로 풀린다 — 부호를 가정하지 않는다', () => {
    const d = new THREE.Vector3(0.12, -0.05, 0.22);
    const u = new THREE.Vector3(1, 0, 0).normalize();
    const need = 0.008;
    const theta = solveOutwardYaw(d, u, need);
    expect(actualOutwardMove(d, u, theta)).toBeCloseTo(need, 3);
  });

  it('필요량이 크면 클램프된다 (폭주 방지)', () => {
    const d = new THREE.Vector3(-0.12, -0.05, 0.22);
    const u = new THREE.Vector3(-1, 0, 0);
    expect(Math.abs(solveOutwardYaw(d, u, 10, 0.35))).toBeCloseTo(0.35, 6);
  });

  it('팔이 회전축과 나란하면 0 — 아무리 돌려도 안 벌어지므로 보정을 포기한다', () => {
    // 손이 어깨 **바로 아래**(수직) → 월드 Y 회전으로는 수평 이동이 안 생긴다
    const d = new THREE.Vector3(0, -0.3, 0);
    const u = new THREE.Vector3(1, 0, 0);
    expect(solveOutwardYaw(d, u, 0.01)).toBe(0);
  });

  it('need 가 0 이면 0 — 이미 충분히 떨어져 있으면 원본을 안 건드린다', () => {
    const d = new THREE.Vector3(-0.12, -0.05, 0.22);
    const u = new THREE.Vector3(-1, 0, 0);
    // (부호 있는 0 이 나올 수 있어 toBe 대신 근사 비교)
    expect(solveOutwardYaw(d, u, 0)).toBeCloseTo(0, 12);
  });
});
