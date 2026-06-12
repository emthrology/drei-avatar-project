# 톤/컬러 그레이딩 계획 (구 셰이더 보조기능)

> **방향 전환됨 (2026-06-12).** 원래 이 문서는 emission/outline색/shadingShift 같은 **MToon 머티리얼별 튜닝**을 계획했으나, 사용자 관점에서 필요성이 약하고(원칙2 미달) 일부는 기존 렌더를 훼손(원칙1 위반)함이 검증됨. → **사진편집 스타일 톤 변경 = 포스트프로세싱 컬러 그레이딩**으로 전환. 폐기된 항목은 하단 "폐기 기록"에 근거와 함께 보존.

## 개발 원칙 (이 문서 전체에 적용)

1. **비퇴행** — 신기능이 기존 동작 feature를 저해하면 안 됨
2. **실질 개선** — "개발만 하면 됨" 금지, 체감되는 개선이어야 함

## 왜 컬러 그레이딩인가

"사진편집창의 톤 변경"(밝기/대비/채도/색조)은 three.js에서 **포스트프로세싱**(렌더된 화면에 입히는 풀스크린 패스) 영역. 두 원칙에 정확히 부합:

- **원칙1**: 화면 레이어라 **모델 머티리얼을 전혀 안 건드림** → 기존 렌더 0% 훼손
- **원칙2**: 밝기/대비/채도/색조는 슬라이더당 **즉시 명확히 보임** (rim/shadingShift 같은 미묘함 없음)

## 효과 ↔ 사진편집 대응

| 효과 (`@react-three/postprocessing`) | 사진편집 대응 | 우선 |
|---|---|---|
| `BrightnessContrast` | 밝기 / 대비 | ★ 1차 |
| `HueSaturation` | 색조 / 채도 | ★ 1차 |
| `ToneMapping` | 노출/필름 룩 | 선택 |
| `Vignette` | 비네팅 | 선택 |

## 버전 제약 (확인 완료)

- 이 프로젝트는 **R3F v8 기차**(React 18 → R3F v8 → drei v9). [docs/concepts.md]나 CLAUDE.md 스택 참조.
- `@react-three/postprocessing` **최신 v3는 R3F v9(React 19) 요구** → 안 맞음
- **`@react-three/postprocessing@2.17.0`이 R3F v8 호환** (`peer @react-three/fiber ^8.0`) → 이 버전 핀
- React/R3F 업그레이드 불필요 — 기차 A 안에서 해결

## 적용 구조

전역 그레이딩이지만 **모델을 안 건드리므로** lit/shade(파츠별)와 충돌 없음. 별개 레이어로 공존.

- 상태: `store.ts`에 `grading: { brightness, contrast, hue, saturation }` 추가 (전부 숫자 → store 안전, 모드 전환 유지). 디폴트는 **무변화값**(brightness 0, contrast 0, hue 0, saturation 0)이라 로드 시 기존 화면과 동일 → 원칙1 보장
- 적용: `<EffectComposer>` + `<BrightnessContrast>` + `<HueSaturation>`를 Canvas 안에 배치, store 값 바인딩
- UI: 에디터에 `GradingPanel`(SliderRow 재사용)

## 단계 (점진)

### 1단계 — docs 개정 ✅ (이 문서)
방향 전환 기록 + 폐기 근거 보존

### 2단계 — 의존성 + store
- `npm i @react-three/postprocessing@2.17.0`
- `store.ts`에 `GradingParams` + `GRADING_DEFAULTS`(무변화) + `setGrading` 추가

### 3단계 — 에디터 적용 (먼저, 안전)
- `AvatarScene`(불투명 배경 #1a1a2e)에 `<EffectComposer>` 추가 → **투명도 이슈 없음**
- `GradingPanel` 슬라이더 → 즉시 톤 변화 확인
- 빌드/육안 검증

### 4단계 — 컴패니언 확장 (검증 후)
- 컴패니언 Canvas는 **투명 배경(`alpha:true`)** → EffectComposer가 알파를 깨뜨릴 수 있음. 알파 통과(`<EffectComposer>` 알파 처리 + 효과별 blend) 검증 필요
- 풀스크린 패스 = 게임 위 오버레이엔 비용 → 검증 후 판단 ([docs/drei-opportunities.md]의 성능 자동조절과 연계 가능)
- 안 되면 **에디터 전용으로 확정**(원칙2: 억지로 넣지 않음)

## 폐기 기록 — MToon 머티리얼별 튜닝 (male_sample.vrm 파싱 검증)

원칙1·2로 판정해 **전부 폐기**. 근거 데이터:

### Emission — 컷 (원칙1·2 모두 위반)
- 6개 머티리얼 전부 `emissiveFactor=[1,1,1]` + 별도 emissive 텍스처(1024², **13.8KB=사실상 검정**)
- MToon은 `emissive × emissiveMap`이라 텍스처 검정이면 factor 키워도 **0** → 그냥은 안 보임
- 보이게 하려면 `emissiveMap=null`로 모델 텍스처 제거(원칙1 위반) → 그래도 **파츠 균일 단색 발광**뿐(눈만 빛나기 불가, 얼굴/눈 emissive 셋업 공유)
- 이 모델엔 발광 액센트 없음 → 가치 없음(원칙2)

### Outline 색 — 컷 (전역은 원칙1 위반, 파츠별로도 가치 약함)
- outline색이 **파츠별로 다름**: 얼굴/입/눈 검정, 피부 어두운 빨강 `[0.061,0.009,0.014]`, **머리카락 청록 `[0.157,0.408,0.35]`**
- 전역 덮어쓰기면 머리카락 청록 외곽선 파괴(원칙1). 파츠별로 하면 비파괴지만 사용자 필요성 낮음(원칙2)

### shadingShift — 컷 (전역은 원칙1 위반, 정면 작은 뷰서 미묘)
- 파츠별 편차 큼: face 0.9 / eye 0.23 / body -0.05 / hair -0.2 / tops -0.35
- 전역 덮어쓰기면 음영 뭉갬(원칙1). 효과 자체도 정면 작은 뷰서 미묘(원칙2)

### 참고: 기존 전역 toony/outlineWidth의 잠재 퇴행
- 현재 [ShaderPanel](../src/components/ShaderPanel.tsx)의 전역 `toony=0.9` 디폴트가 로드 시 모든 머티리얼에 덮어써서 tops(0.35)·hair(0.8) authored 값을 뭉갬 = 약한 원칙1 위반(기존 동작). 컬러 그레이딩과 무관하나, 추후 정리 시 "실제값 디폴트 읽기"로 교정 가능
