# 셰이더 보조기능 추가 계획

## 배경

Rim(림 라이트)은 MToon의 **핵심이 아니라 액세서리**다. 컴패니언 300×400 오버레이 + 어두운 의상에선 거의 인지 불가라, 에디터에서 **제거**한다. 대신 체감 큰 보조기능을 추가한다.

핵심 우선순위(이 프로젝트 기준):
1. 외곽선 굵기 (실루엣 인상)
2. 툰 경계 선명도 + shade 색 (셀 룩)
3. ~~Rim~~ (제거)

## 확정 범위

emission + outline 색상 + shadingShift

## 현황 (이미 있는 것)

- **litColor / shadeColor**: 이미 **파츠별**로 동작 ([EditorPanel](../src/components/EditorPanel.tsx) 색상 섹션 → `meshInfos` → [VRMAvatar](../src/components/VRMAvatar.tsx) 적용). 신규 아님
- **outlineWidth / shadingToony**: 전역 ([ShaderPanel](../src/components/ShaderPanel.tsx))

## 두 적용 구조

- **파츠별 (meshInfos)**: 파츠 선택 → 그 파츠만. lit/shade가 이 방식. **emission 적합** (눈만 빛나게 등)
- **전역 (ShaderPanel)**: 모든 MToon 일괄. outline 굵기/toony가 이 방식. **outline 색상·shadingShift 적합**

## 단계

### 1단계 — Rim 제거 ✅ (선행 완료)
- `store.ts` ShaderParams에서 rim 4종(rimMix/rimColor/rimFresnelPower/rimLift) 제거
- ShaderPanel에서 rim 슬라이더·색상 제거

### 2단계 — 파츠별 Emission
- `MeshInfo`에 `emissionColor: string` + `emissionIntensity: number` 추가
- `collectMeshInfos`: `m.emissive`(색) + `m.emissiveIntensity`(강도) 읽어 초기화 → 로드 시 외형 유지
- meshInfos 적용 effect: `m.emissive.setStyle(...)`, `m.emissiveIntensity = ...`
- 색상 섹션 UI: emission 색 피커 + 강도 슬라이더 (0~5 정도)

### 3단계 — 전역 Outline 색상
- ShaderParams에 `outlineColor: string` 추가
- ShaderPanel에 색 피커 → `m.outlineColorFactor.setStyle(...)`
- 디폴트: 모델 outlineColorFactor가 대부분 `[0,0,0]`(검정) → **검정** 디폴트 (피부만 어두운 빨강 `[0.061,0.0086,0.014]`). 검정으로 통일돼도 자연스러움

### 4단계 — shadingShift (전역)
- ShaderParams에 `shadingShift: number` (-1~1) 추가
- ShaderPanel 슬라이더 → `m.shadingShiftFactor`
- 효과: 빛/그늘 경계 **위치** 이동 → 정면에서도 toony 경계 드러냄
- 주의: 모델 기본값이 파츠마다 다름(face 0.9, body -0.05 등). 전역 덮어쓰기라 로드 시 음영 살짝 바뀜 (기존 toony 전역 덮어쓰기와 동일한 성격)

## 열린 이슈 (구현 시 검증)

- **emission ↔ emissive 텍스처**: 모델 `emissiveFactor=[1,1,1]`인데 안 빛남 → emissive 텍스처(검정)나 `KHR_materials_emissive_strength=0`이 변조 중일 가능성. 텍스처가 검정이면 색/강도 factor를 키워도 `factor × 텍스처(0) = 0`이라 **변화 없을 수 있음**. 파츠별로 다를 수 있으니, emission 슬라이더가 실제 보이는지 파츠별 확인 필요. 안 보이면 emissiveMap 무시 옵션 검토
- **전역 덮어쓰기 성격**: outlineColor/shadingShift는 전역이라 로드 시 모델 per-material 값을 덮음 (outlineWidth/toony도 동일). 파츠별 보존이 필요하면 meshInfos로 이동 고려

## 비고

- MToon 프로퍼티명: `m.emissive`(Color)·`m.emissiveIntensity`·`m.outlineColorFactor`(Color)·`m.shadingShiftFactor`(number)
- 색 변경은 needsUpdate 불필요(uniform), 단 일관성 위해 기존 코드 따름
