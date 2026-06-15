# 5가지 구조 기준 — 이 코드베이스 실례

[code-structure-guide.md](code-structure-guide.md)의 5기준이 **이 프로젝트에서 구체적으로 어떻게 충족/미달하는지**를 실제 파일로 설명. 잘 된 곳(✅)과 약한 곳(⚠️)을 같이 본다.

---

## 1. 응집도 (Cohesion) — 같이 변하는 건 같이 둔다

> 한 파일 = 한 책임. "이 파일은 왜 바뀌나?"의 답이 하나여야 함.

**✅ 잘 됨**
- [scheduler.ts](../src/companion/anim/scheduler.ts) — 애니메이션 엔진(클립 인스턴스화·보간·이징)만. 바뀌는 이유: "보간 로직 변경" 하나
- [channels.ts](../src/companion/anim/channels.ts) — 논리 채널→VRM 본 매핑만
- [useLookAt.ts](../src/companion/useLookAt.ts) — 시선 추적만

**⚠️ 약함**
- [moods.ts](../src/companion/anim/moods.ts) (620줄) — **루프 + idle 포즈 + 제스처(기본+무드 4종) + 타입 + MOODS 조립**. 바뀌는 이유가 5가지("제스처 추가", "idle 포즈 추가", "무드 추가", "타입 변경"…) → 응집 낮음
- [ShaderPanel.tsx](../src/components/ShaderPanel.tsx) — UI 슬라이더 **+ 전역 씬 싱글톤(`_vrmScene`)** 두 책임 혼재

---

## 2. 결합도 (Coupling) — 모듈 간 의존을 줄인다

> A를 고치면 B·C·D까지 따라 고쳐야 하면 높음. 추상화로 세부를 감추면 낮아짐.

**✅ 잘 됨 — 채널 추상화**
[scheduler.ts](../src/companion/anim/scheduler.ts)는 `'head.rotateX'` 같은 **논리 채널 문자열**만 다루고 VRM 본을 전혀 모름. 실제 본 매핑은 [channels.ts](../src/companion/anim/channels.ts) `apply()`에 격리:
```ts
// scheduler: 본을 모름 → 채널 값만 출력
out['head.rotateX'] = val
// channels: 여기서만 본을 앎
this.head.quaternion.setFromEuler(...)
```
→ 본 회전 방식이 바뀌어도 scheduler는 무수정. 낮은 결합.

**✅ 잘 됨 — store 경유 공유**
[LightPanel](../src/components/LightPanel.tsx)(쓰기)과 [SceneLights](../src/components/SceneLights.tsx)(읽기)는 서로 직접 의존하지 않고 `store.lighting`만 바라봄. 한쪽을 고쳐도 다른 쪽 무관.

**⚠️ 약함 — 역방향 결합**
[VRMAvatar.tsx](../src/components/VRMAvatar.tsx)가 UI 패널을 import해서 씬을 넘김:
```ts
import { setShaderPanelScene } from './ShaderPanel'
import { setAnimScene } from './AnimationPanel'
```
데이터/로더(VRMAvatar)가 **UI 패널에 의존** = 결합 방향이 거꾸로. 패널을 지우거나 옮기면 VRMAvatar가 깨짐. (P3에서 브리지 모듈로 분리 권장)

---

## 3. 관심사 분리 (SoC) — 층을 나눈다

> 엔진/로직 · 데이터 · UI · 설정이 한 파일·폴더에 섞이지 않게.

**✅ 잘 됨 — anim/ 층 분리**
| 층 | 파일 |
|----|------|
| 엔진 | scheduler.ts |
| 본 매핑 | channels.ts |
| 데이터 | moods.ts |
| 구동(R3F) | useAnimator.ts |

**✅ 잘 됨 — 렌더 레이어 분리**
조명=[SceneLights](../src/components/SceneLights.tsx), 톤=[GradingEffects](../src/components/GradingEffects.tsx)(화면 레이어), 셰이더=[ShaderPanel](../src/components/ShaderPanel.tsx)(머티리얼). 각자 다른 층이라 서로 안 건드림.

**⚠️ 약함**
- [components/](../src/components/) 폴더에 **3D 씬(AvatarScene/VRMAvatar/SceneLights/GradingEffects)과 UI 패널(Editor/Shader/Light/Grading/Animation)이 한 폴더**에 섞임 → 층이 폴더로 안 드러남 (P1)
- ShaderPanel이 **UI + 씬 브리지(로직)** 섞음 (위 1·2와 동일 지점)

---

## 4. 단일 출처 (DRY) — 같은 지식 중복 금지

> 같은 지식이 두 곳에 있으면 한쪽만 고치고 잊어 버그.

**✅ 잘 됨 — 조명 통합 (해결된 중복 사례)**
예전엔 컴패니언 Canvas가 조명을 **따로 하드코딩**해서 에디터와 중복 → 에디터에서 조명을 바꿔도 컴패니언 미반영(버그). 지금은 `store.lighting` 단일 출처 + 공유 [SceneLights](../src/components/SceneLights.tsx)로 통합.

**✅ 잘 됨 — rest 값 단일 정의**
[channels.ts](../src/companion/anim/channels.ts)의 `BASELINE`이 모든 채널 rest 값의 단일 출처. hold-last·null 시작값이 전부 여기 참조.

**✅ 잘 됨**
`store.grading`/`store.shader`도 모드 전환에도 값 유지하는 단일 출처.

**참고 (진짜 중복 아님)**
본 회전축 지식(`armL.z = -1.3` 등)이 BASELINE·moods 템플릿·CLAUDE.md 불변식에 나타나지만, 코드는 **값**이고 문서는 **설명**이라 역할이 다름 → 중복 아님.

---

## 5. 크기 / 발견성 — 너무 크면 쪼개고, 이름으로 찾게

> 본 규칙: 동질 파일 3+ → 폴더.

**✅ 잘 됨**
- 대부분 파일 100줄 내외, **이름이 책임을 드러냄**: `SceneLights`, `GradingPanel`, `useLipsync`, `visemeApplier`
- [anim/](../src/companion/anim/) — 관련 4파일을 서브폴더로 묶음

**⚠️ 약함**
- [moods.ts](../src/companion/anim/moods.ts) **620줄** — 특정 제스처/포즈 찾기 비용 큼 (P2)
- [components/](../src/components/) **9파일** — 3+ 규칙상 폴더 분리 대상 (P1)
- lipsync 3파일([useLipsync](../src/companion/useLipsync.ts)/[lipsyncEn](../src/companion/lipsyncEn.ts)/[visemeApplier](../src/companion/visemeApplier.ts)) — 동질 3+ → `lipsync/` 후보(낮은 ROI)

---

## 종합

대부분 기준에서 **양호**(특히 결합도·관심사 분리·DRY는 모범 사례 다수). 반복적으로 걸리는 약한 지점은 세 군데로 수렴:
1. **moods.ts 비대/다책임** (응집·크기) → P2
2. **components/ 층 미분리** (SoC·크기) → P1
3. **씬 싱글톤이 UI 패널에 있음** (응집·결합·SoC가 같은 곳에서 동시에 걸림) → P3

상세 우선순위·실행은 [refactor-diagnosis.md](refactor-diagnosis.md).
