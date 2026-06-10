# 프로젝트 배경 개념 설명

이 프로젝트에서 실제로 사용된 수학/3D 개념들을 코드와 함께 설명합니다.

---

## 1. 오일러 각도 (Euler Angles)

물체의 회전을 X/Y/Z 세 축의 각도로 표현하는 방법.

```
X축 회전 = 고개 끄덕임 (pitching)
Y축 회전 = 고개 좌우 돌리기 (yawing)
Z축 회전 = 고개 기울이기 (rolling)
```

단위는 라디안(radian). `π ≈ 3.14` 가 180도.

```
0.1 rad ≈ 5.7도
1.3 rad ≈ 74도   ← armL.z = -1.3 이 "팔 내리기" 위치
```

코드에서:
```ts
// channels.ts
this._euler.set(
  v('head.rotateX') + v('head.gx'),  // 끄덕임 + 제스처 끄덕임
  v('head.rotateY') + v('head.gy'),  // 좌우 돌리기
  v('head.rotateZ') + v('head.gz'),  // 기울이기
)
this.head.quaternion.setFromEuler(this._euler)
```

`set(x, y, z)`로 오일러를 만든 다음 쿼터니언으로 변환해서 본에 적용합니다.

---

## 2. 쿼터니언 (Quaternion)

오일러 각도를 그대로 쓰면 문제가 생깁니다 — 짐벌락(Gimbal Lock):
두 축이 겹쳐버려 회전이 뭉개지는 현상. 3D 소프트웨어가 모두 내부적으로 쿼터니언을 쓰는 이유입니다.

쿼터니언은 `(x, y, z, w)` 4개 숫자로 회전을 표현. 수학적으로 복소수의 확장이지만, **사용 관점에서는**:

- 오일러로 직관적으로 각도를 정하고
- Three.js에 넘길 때만 `.setFromEuler()`로 변환

하면 됩니다. 직접 쿼터니언 값을 쓸 일은 거의 없습니다.

```ts
// 오일러 → 쿼터니언 변환 패턴 (channels.ts 전체에서 이 패턴만 사용)
this._euler.set(x, y, z)
bone.quaternion.setFromEuler(this._euler)
```

---

## 3. FK (Forward Kinematics, 순방향 기구학)

"부모 뼈를 돌리면 자식 뼈가 따라온다" — 그게 전부입니다.

```
Spine (척추)
  └ Chest (가슴)
      └ Head (머리)
      └ LeftUpperArm (왼 위팔)
          └ LeftLowerArm (왼 아래팔)
```

Spine을 10도 오른쪽으로 돌리면, Chest·Head·양팔이 전부 10도 따라옵니다.
이 프로젝트에서 포즈 클립이 `spine.y`만 건드려도 전신이 흔들리는 이유입니다.

반대 개념인 IK(역방향)는 "손을 여기 놓으면 팔꿈치가 어디여야 하지?"를 역산하는 것. 이 프로젝트에서는 사용 안 함.

---

## 4. 가우시안 분포 (Gaussian / Normal Distribution)

흔히 말하는 정규분포. 종형 커브 — 평균 근처 값이 가장 많이 나오고 끝으로 갈수록 드물어집니다.

```
순수 Math.random() → min~max 구간에서 완전 균등
가우시안 → min~max 중앙 부근이 더 자주 나옴
```

코드 구현:
```ts
// scheduler.ts
function gaussianRandom(start, end, skew = 1, samples = 5) {
  let r = 0
  for (let i = 0; i < samples; i++) r += Math.random()  // 5번 더하기
  return start + Math.pow(r / samples, skew) * (end - start)
}
```

`Math.random()` 여러 번 더하면 중앙 편향이 생깁니다 (중심극한정리). `samples`가 클수록 더 뾰족한 종형.

**왜 쓰는가:** 눈 깜빡임 간격이 [2000, 8000]ms 균등이면 규칙적으로 느껴짐. 가우시안으로 하면 자연스러운 분산이 됩니다.

```ts
// moods.ts — 눈깜빡임 delay
delay: [2000, 8000, 1, 2]  // [min, max, skew, samples]
```

---

## 5. 시그모이드 이징 (Sigmoid Easing)

애니메이션의 "가속-감속" 곡선. 로봇처럼 각지지 않고 부드럽게 시작해서 부드럽게 멈추게 합니다.

시그모이드 함수: `1 / (1 + e^(-kx))` — S자 커브.

```
t=0.0 → alpha=0.0  (시작)
t=0.5 → alpha=0.5  (중간)
t=1.0 → alpha=1.0  (끝)

하지만 0~0.2 구간은 천천히, 0.4~0.6 구간은 빠르게, 0.8~1.0 구간은 다시 천천히.
```

`k` 값으로 곡선 기울기 조절:
- `k = 7` (기본): 꽤 가파름. blink처럼 순간적인 동작에 적합
- `k = 2.5` (제스처): 완만한 S. 팔 들어올릴 때 부드럽게

```ts
// scheduler.ts
export function sigmoidFactory(k: number) {
  const base = (t) => 1 / (1 + Math.exp(-k * t)) - 0.5
  const corr = 0.5 / base(1)
  return (t) => corr * base(2 * t - 1) + 0.5  // 0~1 입력 → 0~1 출력
}
```

---

## 6. 모프 타겟 / 블렌드셰이프 (Morph Target)

메시의 정점을 미리 다른 위치로 변형해 놓은 것. 0~1 값으로 얼마나 변형할지 조절.

```
기본 입 모양 (0.0) ──────── 완전히 다문 입 (1.0)
       ↑ Fcl_MTH_Close: 0.5 = 반쯤 다문 상태
```

VRoid 모델에는 입 모양 모프가 여러 개 있습니다:
- `Fcl_MTH_Close` — 입 닫기
- `Fcl_MTH_Small` — 입 좁히기
- `Fcl_MTH_A/I/U/E/O` — 모음 입 모양

립싱크에서 이것을 조합해서 다양한 자음/모음 입 모양을 만듭니다.

```ts
// visemeApplier.ts
PP: { Fcl_MTH_Close: 1.0 }           // b/p/m → 입 완전히 닫힘
FF: { Fcl_MTH_Close: 0.5, Fcl_MTH_Small: 0.4 }  // f/v → 반쯤 닫고 좁힘
```

---

## 7. 비세임 (Viseme)

소리에 대응하는 입 모양의 단위. 음소(phoneme)와 비슷하지만 **시각적**으로 구분 가능한 것만 분류합니다.

이 프로젝트는 Oculus Lipsync 표준의 15개 viseme를 사용:

| 그룹 | viseme | 발음 |
|------|--------|------|
| 모음 | aa / E / I / O / U | a, e, i, o, u 입 모양 |
| 자음 | PP | b, p, m (입술 붙임) |
| 자음 | FF | f, v (윗니-아랫입술) |
| 자음 | SS | s, z (이 사이로 공기) |
| 자음 | CH | ch, sh, j |
| 기타 | sil | 묵음 |

영어 단어를 글자 단위로 분석해서 viseme 시퀀스로 변환:
```
"hello" → h(스킵) + ee(E) + ll(DD) + o(O) → [E, DD, O]
```

---

## 8. VRM과 normalized bone

VRM은 VRoid Studio에서 만드는 3D 아바타 포맷. 내부에 휴머노이드 본 구조가 정의되어 있습니다.

**normalized bone**이란: 모델마다 본의 실제 방향/위치가 다를 수 있는데, `@pixiv/three-vrm`이 이를 표준 방향으로 정규화해줍니다. 덕분에 어떤 VRM 모델이든 같은 코드로 같은 축 방향으로 회전시킬 수 있습니다.

```ts
// VRM에서 본 가져오기
vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Head)
vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.LeftUpperArm)
```

이 프로젝트에서 검증된 축 (male_sample.vrm 기준):
```
Head.x = 끄덕임 (양수=숙임)
Head.y = 좌우 돌리기
Head.z = 기울이기 (갸웃)

LeftUpperArm.z = 정면으로 들기/내리기 (음수=들기, -1.3이 자연스러운 대기)
LeftUpperArm.x = 앞뒤 스윙 (음수=앞으로)
LeftLowerArm.z = 팔꿈치 굽힘 (음수=굽힘)
```

---

## 9. R3F useFrame

React Three Fiber의 렌더 루프 훅. Three.js의 `requestAnimationFrame`에 해당.

```ts
useFrame((state, delta) => {
  // 매 프레임 (보통 60fps) 호출됨
  // delta = 이전 프레임과의 시간 차이 (초 단위, 보통 ~0.016)
  vrm.update(delta)  // VRM 물리/표정/시선 업데이트
})
```

`delta`를 써야 프레임레이트와 무관하게 같은 속도로 움직입니다. 60fps/30fps 모두 동일한 애니메이션 속도.

이 프로젝트의 스케줄러는 `performance.now()`의 절대 ms 기준으로 동작하므로 delta와 독립적입니다.

---

## 개념 간 관계 정리

```
TTS 음성 재생
    ↓
word timing 분해 (useLipsync)
    ↓
lipsyncEn: 단어 → viseme 배열
    ↓
visemeApplier: viseme → 모프타겟 조작
    ↓
vrm.update(delta)가 expressionManager 반영

─────────────────────────────────

AnimScheduler.tick(dtMs)
    ├ gaussianRandom으로 타이밍/값 샘플링
    ├ sigmoidFactory로 세그먼트간 보간 (alpha 계산)
    └ channels (오일러 → 쿼터니언 → 본 회전)
           ↓
      FK 계층으로 자식 본이 자동 따라옴
```
