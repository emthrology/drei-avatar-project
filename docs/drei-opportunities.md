# drei 활용 개선 조사

이 프로젝트(MToon VRM 에디터 + 게임 위 컴패니언 오버레이)에서 [@react-three/drei](https://github.com/pmndrs/drei) v9를 더 활용할 여지를 조사한 결과. **구현 전 조사 단계** — 채택 시 별도 작업.

## 현재 사용 중 (3개)

| API | 위치 | 용도 |
|-----|------|------|
| `useGLTF` | [VRMAvatar](../src/components/VRMAvatar.tsx), [CompanionAvatar](../src/companion/CompanionAvatar.tsx) | VRM 로딩 (extendLoader로 VRMLoaderPlugin 등록) |
| `OrbitControls` | [AvatarScene](../src/components/AvatarScene.tsx) | 에디터 카메라 |
| `ContactShadows` | [AvatarScene](../src/components/AvatarScene.tsx) | 에디터 바닥 그림자 |

## 후보 (적합도 순)

### ★★★ ① 로딩 인디케이터 — `useProgress` + `<Html>` (또는 `<Loader>`)
- **문제**: 12MB VRM 로딩 중 에디터는 회색 박스(`FallbackBox`), 컴패니언은 텍스트 뱃지뿐.
- **개선**: `useProgress()`의 `progress`(0~100)를 `<Html center>`로 띄워 % 표시. 컴패니언은 blob URL 교체(파일 선택) 시에도 적용.
- **비용**: 작음. Suspense fallback을 progress 컴포넌트로 교체.
- **주의**: `<Html>`은 Canvas 자식이어야 함. 컴패니언 오버레이는 `pointerEvents:none`이라 스타일만.

### ★★★ ② 성능 자동조절 — `<PerformanceMonitor>` + `<AdaptiveDpr>`
- **문제**: 컴패니언이 호스트 게임 **위에** 떠서 같이 돈다. 게임이 무거우면 오버레이가 FPS를 더 잠식.
- **개선**: `<PerformanceMonitor onDecline=…>`로 FPS 하락 감지 → `<AdaptiveDpr pixelated />`로 오버레이 DPR 자동 강하. 게임 프레임 보호.
- **비용**: 작음. 컴패니언 Canvas에 두 컴포넌트 추가.
- **적합 이유**: 이 프로젝트 고유의 "게임 위 오버레이" 시나리오에 직접 대응.

### ★★☆ ③ 방위 기즈모 + 그리드 — `<GizmoHelper><GizmoViewport>` + `<Grid>`
- **개선**: 에디터 우하단에 축 큐브(클릭 시 정면/측면 스냅) + 바닥 그리드.
- **부가 가치**: 본 회전축(CLAUDE.md에 시각검증 기록한 UpperArm z/x, Head x/y/z 등) 이해에 직접 도움. three.js 학습 중인 상황에 적합.
- **비용**: 작음. 에디터 전용(컴패니언 제외).

### ★☆☆ ④ 머리 추적 말풍선 — `<Html>` (head 본 anchor)
- 말풍선을 head 본에 붙여 따라다니게.
- **보류 이유**: 300×400 고정 프레임 + 거의 고정 카메라라 현재 CSS 고정(`bottom:320`)으로 충분. occlusion·transform 비용만 늘어남.

### ★☆☆ ⑤ 기본 아바타 프리로드 — `useGLTF.preload(url)`
- 앱 시작 시 male_sample.vrm 미리 fetch. 첫 표시 체감 단축.
- **비용**: 한 줄. 단 VRMLoaderPlugin 등록이 preload 시그니처에도 필요한지 확인 요함.

## 제외 (이유 명시)

- **`<Environment>` / `<Stage>`** — MToonMaterial이 환경맵을 무시함(CLAUDE.md 명시). 조명은 명시적 `SceneLights`로 처리 중. 효과 없음.
- **`<Bounds>` / `useBounds`** (자동 카메라 핏) — 이 프로젝트는 의도적으로 `computeUpperBodyCamera` 본 기반 상반신 프레이밍 사용. Bounds는 전신을 잡아 프레이밍 의도와 충돌.
- **`<SoftShadows>` / `<AccumulativeShadows>`** — 작은 오버레이/툰 룩에 과함. `ContactShadows`로 충분.

## 권장

①② 우선(프로젝트 고유 상황에 직접 대응, 비용 작음). ③은 에디터 학습 보너스. ④⑤는 후순위.

## 스크린샷/내보내기 (Phase 4) 참고

drei 전용 헬퍼는 없음. `gl.domElement.toDataURL('image/png')`로 캔버스 캡처 가능 (R3F `useThree().gl`). drei 범위 밖이라 여기 별도 기록.
