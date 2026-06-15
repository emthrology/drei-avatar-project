# 구조 진단 (1단계)

[code-structure-guide.md](code-structure-guide.md) 기준으로 현 구조를 라벨링. **결론: 전반적으로 건강함.** 두 도메인(components=에디터 / companion=오버레이) 분리, anim/ 층 분리(scheduler·channels·templates·hook), store 단일 출처, 채널 추상화로 낮은 결합 — 잘 돼 있음. 아래는 ROI 있는 개선점만.

## 진단표

| 영역 | 책임 | 판정 | 근거 | ROI |
|------|------|------|------|-----|
| `anim/scheduler.ts` | 애니 엔진 | ✅ 적합 | 단일 책임, 본 무지(낮은 결합) | — |
| `anim/channels.ts` | 채널→VRM 본 매핑 | ✅ 적합 | 추상화 경계 모범 | — |
| `anim/useAnimator.ts` | R3F 훅(구동) | ✅ 적합 | 엔진/데이터를 조립만 | — |
| **`anim/moods.ts` (620줄)** | 루프+idle포즈+제스처×5+타입+조립 | ⚠️ 분할후보 | **5개 카테고리 혼재** = 책임 과다·발견성↓ | 중 |
| **`components/` (9파일)** | 3D 씬 + UI 패널 혼재 | ⚠️ 분할후보 | 씬(AvatarScene/VRMAvatar/SceneLights/GradingEffects) vs 패널(Editor/Shader/Light/Grading/Animation) — **3+ 규칙** | 중 |
| **씬 싱글톤 (ShaderPanel·AnimationPanel)** | `_vrmScene`/`setAnimScene` 전역 브리지 | ⚠️ 주의 | **UI 파일이 전역 씬 브리지 보유**(관심사 미분리) + VRMAvatar가 패널을 import(역방향 결합) | 중 |
| `companion/` lipsync 3종 | useLipsync/lipsyncEn/visemeApplier | ⚠️ 분할후보(약) | 동질 3파일 → `lipsync/` (3+ 규칙) | 낮 |
| `store.ts` | 공유 상태 | ✅ 적합 | 단일 출처 잘 지킴(조명/셰이더/톤/메시) | — |
| 이벤트 버스(window CustomEvent) | DebugPanel↔useAnimator, App↔게임 | ✅ 적합(주의) | R3F 경계 우회로 타당. 단 이벤트명 문자열 산재 → 상수화 여지 | 낮 |

## 우선순위 (ROI 높은 순, 전부 소단위·저위험)

### P1 — `components/` 폴더 분리 (씬 vs 패널)
```
components/
├── scene/   # AvatarScene, VRMAvatar, SceneLights, GradingEffects
└── panels/  # EditorPanel, ShaderPanel, LightPanel, GradingPanel, AnimationPanel
```
- **순수 이동 + import 경로만** 변경. 발견성 즉효. 위험 최저
- 3D와 UI가 한 폴더에 섞인 걸 해소

### P2 — `anim/moods.ts` 카테고리 분할
```
anim/templates/{loops,gestures,idlePoses}.ts  + moods.ts(타입+조립만)
```
- 순수 이동 + re-export. 620줄 → 콘텐츠 찾기 쉬워짐
- **타입은 그대로 둬도 됨**(공유는 어차피 MOODS 데이터 import 경유) — 카테고리 분할이 핵심

### P3 — 씬 싱글톤 브리지 추출
- `setShaderPanelScene`(ShaderPanel)·`setAnimScene`(AnimationPanel)을 **전용 모듈**(예: `components/scene/vrmSceneBridge.ts`)로 이동
- UI 패널에서 전역 씬 보유 제거 → 관심사 분리 + VRMAvatar가 패널 대신 브리지를 import(결합 방향 정상화)
- 로직 이동 있어 P1·P2보다 신중히

### 보류 (낮은 ROI, 다가올 기능과 무관)
- lipsync 폴더화 / 이벤트명 상수화 — 안 아프면 나중에

## 실행 원칙
- 한 번에 하나씩. 매 단계 `tsc`+`build`+컴패니언/에디터 수동 확인
- 전부 동작 불변(비퇴행). 순수 이동부터(P1→P2→P3)
