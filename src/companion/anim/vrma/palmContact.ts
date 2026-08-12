// 손바닥 접촉 보정 — VRMA 재생 중 **접촉 순간에만** 두 손바닥 간격을 강제하는 최소 IK.
//
// 왜 이게 필요한가
// ───────────────
// VRMA 는 **회전만** 담는데 박수의 성패는 **손 위치**다. 리타게팅은 회전을 옮길 뿐이라 손이 어디서
// 만나는지는 체형이 정하고, 그래서 같은 클립이 캐릭터마다 다르게 닿는다(실측: 최접촉 손바닥 간격
// 남자1 0.0227m / 여자1 0.0106m — 여자1 은 겹쳐 보인다).
//
// 처음엔 에셋에 **상수 오프셋**(양 상완 바깥 N°)을 구워 맞추려 했으나 반려됐다:
//   ① 전 구간을 왜곡한다 — 벌어진 구간까지 같이 벌어져 동작이 원본에서 멀어진다
//   ② **두 체형을 동시에 만족시키는 값이 없다**(실측: 남자1 최적 0° / 여자1 최적 6°, 그 사이
//      어느 값도 양쪽 통과 못 함). 벌릴수록 팔 긴 쪽이 더 열려서 차이가 되레 커진다
//
// → 여기서는 **한쪽 제약만** 건다: "손바닥이 `minGap` 보다 가까워지지 않는다."
//   · 벌어진 구간은 손대지 않는다 → **원본 리듬·궤적 보존**
//   · 파고드는 프레임에서만 필요한 만큼 되민다 → 캐릭터 기하를 실제로 재므로 체형 무관
//   · 남자1처럼 이미 적정이면 보정량 ≈ 0 (원본 그대로)
//
// 회전축은 **월드 Y**(수직) — 손이 가슴 앞에 있을 때 수평면에서 팔을 여닫는 축이라 좌우 간격에
// 직결된다. 로컬 축은 자세 종속이라 쓰지 않는다(CLAUDE.md 「축 매핑이 자세 종속」).

import * as THREE from 'three';
import { VRMHumanBoneName, type VRM } from '@pixiv/three-vrm';

/**
 * 상완을 월드 Y 로 얼마나 돌려야 손이 바깥으로 `need` 만큼 움직이는가 (순수 함수).
 *
 * 상완을 월드 Y 축으로 θ 돌리면 손은 대략 `θ × (ŷ × d)` 만큼 움직인다(d = 어깨→손바닥).
 * 그 변위를 바깥 방향 û 에 투영한 값이 **민감도**이고, 필요한 이동량을 민감도로 나누면 θ 다.
 * 부호를 가정하지 않는다 — 좌우 어느 팔인지, 리그 축이 어느 쪽인지에 무관하게 풀린다.
 *
 * @param d  어깨 → 손바닥 벡터 (월드)
 * @param u  바깥 방향 단위벡터 (월드, 수평 성분만 의미 있음)
 * @param need 손을 바깥으로 밀어야 하는 거리(m)
 * @param maxRad 안전 클램프
 * @returns 월드 Y 축 회전각(rad). 민감도가 0 에 가까우면 0(보정 포기 — 팔이 축과 나란함)
 */
export function solveOutwardYaw(
  d: THREE.Vector3,
  u: THREE.Vector3,
  need: number,
  maxRad = 0.35,
): number {
  // ŷ × d = (d.z, 0, −d.x)
  const sensitivity = d.z * u.x - d.x * u.z;
  if (Math.abs(sensitivity) < 1e-4) return 0;
  const theta = need / sensitivity;
  return Math.max(-maxRad, Math.min(maxRad, theta));
}

const _pl = new THREE.Vector3();
const _pr = new THREE.Vector3();
const _sl = new THREE.Vector3();
const _sr = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _u = new THREE.Vector3();
const _d = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _pq = new THREE.Quaternion();
const _corr = new THREE.Quaternion();
const WORLD_Y = new THREE.Vector3(0, 1, 0);

/** 손바닥 중심(월드) = 손목·검지밑·소지밑 평균. 프로브(probe.ts sampleClap)와 같은 정의 */
function palmCenter(vrm: VRM, left: boolean, out: THREE.Vector3): boolean {
  const B = VRMHumanBoneName;
  const h = vrm.humanoid.getNormalizedBoneNode(left ? B.LeftHand : B.RightHand);
  if (!h) return false;
  const i = vrm.humanoid.getNormalizedBoneNode(
    left ? B.LeftIndexProximal : B.RightIndexProximal,
  );
  const l = vrm.humanoid.getNormalizedBoneNode(
    left ? B.LeftLittleProximal : B.RightLittleProximal,
  );
  h.getWorldPosition(out);
  if (i && l) {
    out.add(i.getWorldPosition(_tmp));
    out.add(l.getWorldPosition(_tmp));
    out.multiplyScalar(1 / 3);
  }
  return true;
}

/**
 * 손바닥이 `minGap` 보다 가까우면 양 상완을 바깥으로 돌려 되민다. 그 외엔 **아무것도 안 한다**.
 *
 * 호출 위치: VRMA 덮어쓰기 + 복귀 블렌드가 **끝난 뒤**, `vrm.update()` **전**.
 * 대상은 클립이 구동하는 것과 같은 normalized 본이다.
 *
 * @param iterations 선형 근사라 1회로는 오차가 남는다. 2회면 실용상 수렴(짧은 제스처라 비용 무시 가능)
 * @returns 보정 후 손바닥 간격(m) — 미측정/불가면 null
 */
export function enforcePalmGap(
  vrm: VRM,
  minGap: number,
  iterations = 2,
): number | null {
  const B = VRMHumanBoneName;
  const armL = vrm.humanoid.getNormalizedBoneNode(B.LeftUpperArm);
  const armR = vrm.humanoid.getNormalizedBoneNode(B.RightUpperArm);
  if (!armL || !armR) return null;

  let gap = 0;
  for (let it = 0; it < iterations; it++) {
    // 월드 행렬을 강제로 갱신한다 — useFrame 시점엔 이번 프레임 회전이 아직 반영 전이다
    vrm.scene.updateMatrixWorld(true);
    if (!palmCenter(vrm, true, _pl) || !palmCenter(vrm, false, _pr))
      return null;

    gap = _pl.distanceTo(_pr);
    const need = (minGap - gap) / 2; // 한 손당 밀어낼 거리
    if (need <= 0) return gap; // 이미 충분히 떨어져 있다 = 원본 그대로

    armL.getWorldPosition(_sl);
    armR.getWorldPosition(_sr);

    for (const [arm, shoulder, palm, other] of [
      [armL, _sl, _pl, _pr],
      [armR, _sr, _pr, _pl],
    ] as const) {
      // 바깥 = 반대 손에서 이 손을 향하는 방향(수평 성분만)
      _u.subVectors(palm, other);
      _u.y = 0;
      if (_u.lengthSq() < 1e-8) continue;
      _u.normalize();
      _d.subVectors(palm, shoulder);

      const theta = solveOutwardYaw(_d, _u, need);
      if (theta === 0) continue;

      // 월드 Y 축을 부모 로컬로 옮겨 pre-multiply (자세에 무관한 월드 기준 회전)
      arm.parent?.getWorldQuaternion(_pq);
      _axis.copy(WORLD_Y).applyQuaternion(_pq.invert());
      arm.quaternion.premultiply(
        _corr.setFromAxisAngle(_axis.normalize(), theta),
      );
    }
  }
  return gap;
}
