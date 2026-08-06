# IK 도입 계획

## 배경

초기에는 300×400 오버레이에서 손이 안 보인다는 가정으로 IK를 스킵했으나,
`손가슴` 등 손이 프레임에 들어오는 제스처가 생기면서 재고 필요.

현재 `손가슴`은 armL.z/x + elbowL.z를 수동 튜닝으로 가슴 근처에 보내는 방식.
모델마다 팔 길이가 달라서 비VRoid 모델에서 손 위치가 어긋날 수 있음.

## IK가 필요한 동작

- **손가슴**: 손 끝이 가슴 본 위치에 닿아야 자연스러움
- **얼굴 터치**: 볼/턱을 짚는 생각하는 포즈
- **향후 양손 맞잡기**: 두 손 끝이 같은 위치에 있어야 함

## 구현 방법

Three.js 내장 `CCDIKSolver` 사용.

```ts
import { CCDIKSolver } from 'three/examples/jsm/animation/CCDIKSolver'

// IK 체인 정의: effector(손 끝) → links(아래팔 → 위팔) → target(목표 본)
const iks = [{
  target: targetBoneIndex,    // 손이 도달해야 할 위치 (빈 Object3D)
  effector: handBoneIndex,    // 손 끝 본
  links: [
    { index: lowerArmIndex, rotationMin: ..., rotationMax: ... },
    { index: upperArmIndex, rotationMin: ..., rotationMax: ... },
  ],
  iteration: 10,
  minAngle: 0,
  maxAngle: 1,
}]

const solver = new CCDIKSolver(skinnedMesh, iks)
// useFrame에서: solver.update()
```

## 스케줄러 통합 방식

IK target(Object3D 위치)을 채널로 추상화하면 기존 스케줄러와 통합 가능.

```
channels.ts에 IK 타겟 채널 추가:
  'ikL.x', 'ikL.y', 'ikL.z'  → leftHandTarget.position

Channels.apply()에서:
  leftHandTarget.position.set(v('ikL.x'), v('ikL.y'), v('ikL.z'))
  solver.update()  // CCDIKSolver가 팔 각도 역산
```

moods.ts 제스처에서 목표 좌표를 vs로 지정하면 됨:

```ts
{
  name: 'gesture',
  label: '손가슴(IK)',
  vs: {
    'ikL.x': [chestX, chestX, 0],
    'ikL.y': [chestY, chestY, 0],
    'ikL.z': [chestZ + 0.1, chestZ + 0.1, 0],
  }
}
```

## 주의사항

- CCDIKSolver는 SkinnedMesh의 bone index 기반 → VRM normalized bone과 매핑 필요
- `vrm.update(delta)` 이후에 `solver.update()` 호출해야 함 (VRM 물리가 먼저)
- FK 제스처와 IK 제스처가 같은 팔 채널을 건드리면 충돌 → 채널 단일 소유 원칙 준수
  (IK가 활성화된 동안 해당 팔의 FK 채널은 비워야 함)
- 목표 좌표는 월드 스페이스 기준 → 아바타가 이동/회전하는 경우 보정 필요
  (이 프로젝트는 아바타 고정이라 문제 없음)
