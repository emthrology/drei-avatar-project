// vrm.lookAt.lookAt(worldPos) 직접 호출 + 사케이드(랜덤 시선 오프셋)
// target Object3D 방식 대신 직접 호출 — vrm.update()가 이전 lookAt 호출로
// 계산된 yaw/pitch를 그대로 applier에 적용함

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { VRM, VRMLookAtBoneApplier } from '@pixiv/three-vrm';
import * as THREE from 'three';

const _targetPos = new THREE.Vector3();
const _saccade = new THREE.Vector3();
const _saccadeGoal = new THREE.Vector3();

// VRoid 기본 rangeMap은 inputMaxValue 90 — 정면 근처 목표(입력 수 °)로는
// 눈 회전이 0.x° 수준이라 식별 불가. 정면 ±10° 범위에 전체 가동범위를 쓰도록 보정.
const RANGE_INPUT_MAX = 10;

function tuneRangeMap(vrm: VRM) {
  const applier = vrm.lookAt?.applier;
  if (!(applier instanceof VRMLookAtBoneApplier)) return; // expression 타입 모델은 원본 유지
  // 수평만 증폭. 수직은 원본(90) 유지 — 카메라가 가슴 높이라 눈→카메라 각도가
  // 항상 ~8° 아래인데, 수직까지 증폭하면 포화되어 상시 내리깐 눈이 됨
  applier.rangeMapHorizontalInner.inputMaxValue = RANGE_INPUT_MAX;
  applier.rangeMapHorizontalOuter.inputMaxValue = RANGE_INPUT_MAX;
}

export function useLookAt(vrmRef: React.RefObject<VRM | null>) {
  const { camera } = useThree();
  const timerRef = useRef(4);
  const phaseRef = useRef<'center' | 'glance'>('center');
  const tunedRef = useRef<VRM | null>(null);

  useFrame((_, delta) => {
    const vrm = vrmRef.current;
    if (!vrm?.lookAt) return;

    if (tunedRef.current !== vrm) {
      tunedRef.current = vrm;
      tuneRangeMap(vrm);
    }

    // 기본은 카메라 응시(center). 가끔 짧게 곁눈질(glance) 후 바로 복귀 —
    // 유저 시선을 피하는 인상을 주지 않도록 응시 시간이 압도적으로 길어야 함
    timerRef.current -= delta;
    if (timerRef.current <= 0) {
      if (phaseRef.current === 'center') {
        phaseRef.current = 'glance';
        _saccadeGoal.set(
          (Math.random() - 0.5) * 0.35, // 좌우 ±15cm
          (Math.random() - 0.5) * 0.1, // 상하 ±5cm
          0,
        );
        timerRef.current = 0.4 + Math.random() * 0.5; // 곁눈질 0.4~0.9초
      } else {
        phaseRef.current = 'center';
        _saccadeGoal.set(0, 0, 0); // 카메라로 복귀
        timerRef.current = 4 + Math.random() * 4; // 응시 4~8초
      }
    }

    _saccade.lerp(_saccadeGoal, 0.08);

    // 카메라 world position + 사케이드 오프셋으로 직접 lookAt 호출
    _targetPos.copy(camera.position).add(_saccade);
    vrm.lookAt.lookAt(_targetPos);
  });
}
