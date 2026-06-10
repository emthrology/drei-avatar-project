# CLAUDE.md — drei-avatar-project

drei 기반 3D 아바타 에디터 + 디스플레이어.
VRoid VRM 아바타를 불러와 MToon 셰이더로 파츠/색상을 실시간 커스터마이징.

## 프로젝트 배경

이전 프로젝트(game-avatar-companion)에서 TalkingHead.js + vanilla Three.js 방식의 한계로 새로 시작:
- 외부 라이브러리가 씬을 소유해서 셰이더 끼워넣기 어려움
- VRM을 GLB로 변환하면서 MToon 데이터가 손실됨 → MeshToonMaterial 수동 교체로는 퀄리티 한계
- `onBeforeCompile` 등 커스텀 셰이더 적용이 구조적으로 힘들었음

→ **@pixiv/three-vrm + drei + R3F**로 VRM 네이티브 로딩, MToon 셰이더를 직접 제어하는 구조로 전환

## 기술 스택

| 역할 | 도구 |
|------|------|
| VRM 로딩/셰이더 | `@pixiv/three-vrm` v3.5.3 |
| 3D 렌더링 | `@react-three/fiber` v8 |
| 헬퍼/유틸 | `@react-three/drei` v9 |
| 상태 관리 | Zustand v5 |
| UI | React + Vite + Tailwind |
| 아바타 포맷 | VRM (VRoid Studio 직접 내보내기) |

**Vite 필수** — R3F 생태계 표준, CRA 사용 금지.
**Three.js v0.170.x** — @pixiv/three-vrm 3.x 호환 버전.

## 현재 프로젝트 구조

```
drei-avatar-project/
├── public/
│   └── avatars/
│       └── male_sample.vrm   # 12MB VRoid 샘플 아바타
├── src/
│   ├── components/
│   │   ├── AvatarScene.tsx   # Canvas + Lights + OrbitControls
│   │   ├── VRMAvatar.tsx     # VRM 로딩, MToon 파라미터 적용, 프레임 업데이트
│   │   ├── EditorPanel.tsx   # 에디터 우측 패널 (탭: 파츠/셰이더/애니메이션)
│   │   ├── ShaderPanel.tsx   # MToon 파라미터 슬라이더 (module singleton 방식)
│   │   └── AnimationPanel.tsx# 내장 애니메이션 클립 목록 + 재생
│   ├── companion/
│   │   ├── CompanionOverlay.tsx  # fixed 오버레이 (300×400, bottom-right)
│   │   ├── CompanionAvatar.tsx   # VRM 로딩 + 립싱크 + 아이들 애니메이션
│   │   ├── DebugPanel.tsx        # 컴패니언 디버그 패널 (상태/이벤트/언어/VRM 로드)
│   │   ├── useLipsync.ts         # word timing → VRM expressionManager viseme
│   │   ├── useIdleAnimation.ts   # 팔내리기 + 숨쉬기 + 머리 미세움직임 + 눈깜빡임
│   │   ├── useGameEvents.ts      # window game:event 수신
│   │   ├── tts.ts                # Google TTS REST API → AudioBuffer + word timing
│   │   └── locales.ts            # ko/en 반응 대사 + TTS_CONFIG
│   ├── store.ts              # Zustand: avatarUrl, meshInfos (visible/litColor/shadeColor)
│   ├── vite-env.d.ts         # VITE_GOOGLE_TTS_API_KEY 타입 선언
│   └── App.tsx               # 에디터/컴패니언 모드 전환
├── .env                      # VITE_GOOGLE_TTS_API_KEY (선택)
└── package.json
```

## 아바타 소스

| 소스 | 무료 | 비고 |
|------|------|------|
| VRoid Studio | ✅ | VRM 직접 로딩 가능 (변환 불필요) |
| Avaturn | ❌ 유료 | RPM 대안 |

**⚠️ Ready Player Me 사용 불가** — 2026년 1월 Netflix 인수 후 서비스 종료.
**GLB 사용 시 주의** — @pixiv/three-vrm는 .vrm 파일 로딩 전용. GLB는 VRM 메타데이터 없음.

## VRM 로딩 패턴

```tsx
// useGLTF extendLoader 콜백으로 VRMLoaderPlugin 등록
const gltf = useGLTF(url, true, true, (loader: any) => {
  loader.register((parser: any) => new VRMLoaderPlugin(parser as any))
})
const vrm: VRM | undefined = (gltf as any).userData?.vrm

// VRM 0.x 미러 보정
VRMUtils.rotateVRM0(vrm)

// 매 프레임 time-based uniform 업데이트 (rim light 등)
useFrame((_, delta) => { vrm.update(delta) })
```

**중요:** MToonMaterial은 R3F Environment/HDR을 무시함.
명시적 `<ambientLight>` + `<directionalLight>` 필수.

## MToon 셰이더 파라미터 (ShaderPanel)

module singleton 패턴으로 vrm.scene을 공유:
```ts
let _vrmScene: THREE.Object3D | null = null
export function setShaderPanelScene(scene) { _vrmScene = scene }
```

조작 가능한 파라미터:
- `outlineWidthFactor` — 외곽선 두께 (0~0.02)
- `rimLightingMixFactor` — 림 라이트 강도 (0~1)
- `rimColorFactor` — 림 라이트 색상 (THREE.Color)
- `shadingToonyFactor` — 툰 셰이딩 강도 (0~1, 높을수록 명확한 경계)

## 컴패니언 모드

게임 이벤트에 반응하는 VTuber 스타일 오버레이.

### 게임 이벤트 연동
```typescript
window.dispatchEvent(new CustomEvent('game:event', {
  detail: { type: 'level_clear' }  // player_die | level_clear | near_miss | jump | start
}))
```

### 아이들 애니메이션 (useIdleAnimation.ts)
- 팔 내리기: T포즈 → UpperArm Z ±1.3rad로 slerp(0.08) — 로드 후 ~1초에 걸쳐 대기 포즈 정착
- 숨쉬기: chest bone quaternion slerp `sin(time * 0.8) * 0.015`
- 머리 미세 움직임: 좌우 0.27Hz ±0.04rad + 끄덕 0.53Hz ±0.02rad, slerp(0.05)
- 눈깜빡임: open → closing(70ms) → opening(100ms) → open(2~5s 랜덤)

### 립싱크 (useLipsync.ts)
- word timing → VRM `expressionManager` viseme 매핑
- 영어 단어 첫 모음: a→Aa, e→Ee, i→Ih, o→Oh, u→Ou
- TTS 없을 때: 말풍선만 5초 표시

### TTS 설정
`.env` 파일:
```
VITE_GOOGLE_TTS_API_KEY=your_key_here
```
없으면 말풍선만 표시 (오디오 없음).

## 컴패니언 DebugPanel

5173(game-avatar-companion) DebugPanel과 동일한 UX. VRM 변환 파이프라인 제거, .vrm 직접 blob URL 로딩으로 교체.

```tsx
// App.tsx companion 모드에서 렌더링
<DebugPanel
  status={companionStatus}      // 'loading' | 'ready' | 'speaking'
  lastText={lastText}
  lang={lang}
  onEvent={dispatchGameEvent}   // game:event CustomEvent dispatch
  onLangChange={setLang}
  onAvatarLoad={handleAvatarLoad} // .vrm 파일 → URL.createObjectURL → CompanionOverlay key 변경
/>
```

VRM 로드 흐름: 파일 선택 → `URL.createObjectURL(file)` → `setCompanionAvatarUrl(url)` → `effectiveAvatarUrl` 변경 → `<CompanionOverlay key={effectiveAvatarUrl} />` 리마운트

## 해결된 버그 (이력)

- ~~TTS 소리 없음~~ — 원인은 `VITE_GOOGLE_TTS_API_KEY` 부재. `.env`에 키 추가 후 정상 동작 확인 (키는 gitignore됨).
- ~~캐릭터 상반신 클리핑~~ — 본 위치 기반 자동 프레이밍으로 해결. `computeUpperBodyCamera()`가 Head/Hips 본에서 상반신 범위 계산 → fov 28 기준 거리 산출 (CompanionAvatar.tsx).
- ~~T-포즈 고정~~ — useIdleAnimation에 팔 내리기 포즈(UpperArm Z ±1.3rad slerp) + 머리 미세 움직임 추가.
- ~~DebugPanel 상태 미반영~~ — CompanionOverlay에 `onStatusChange`/`onSpeak` 콜백 추가하여 App까지 상태 전달.
- ~~expressionManager.update() 이중 호출~~ — useLipsync의 수동 호출 제거 (`vrm.update(delta)`가 내부 처리).

## 구현 로드맵

- [x] Phase 1: Vite + R3F + drei 세팅, VRM 로딩 (@pixiv/three-vrm), OrbitControls, 명시적 조명
- [x] Phase 2: 머티리얼 색상 변경 (Zustand), 파츠 show/hide (meshInfos), MToon litColor/shadeColor
- [x] Phase 3: MToon 셰이더 파라미터 UI (outlineWidthFactor, rim, shadingToony)
- [x] 컴패니언 모드: 게임 이벤트 반응, 말풍선, Google TTS, 립싱크, 숨쉬기+눈깜빡임
- [x] 컴패니언 DebugPanel: 5173 UX 포팅, VRM 직접 로드 (blob URL)
- [x] 버그 수정: TTS API 키, 카메라 상반신 프레이밍, idle 애니메이션 가시성
- [x] **TalkingHead 포팅 A+D 단계 완료** (시선/사케이드, 합성 viseme 립싱크)
- [ ] **TalkingHead 포팅 B→C→E 단계** ← 현재 진행 단계
- [ ] Phase 4: 애니메이션 미리보기 (내장 클립 재생), 스크린샷/내보내기

## TalkingHead 포팅 로드맵

TalkingHead 1.3 소스(3,994줄) 분석 결과, 핵심 기능 전부 VRM으로 재현 가능. 일부는 VRM이 우위.

### VRM 실측 데이터 (male_sample.vrm 파싱 결과)

- **VRM 1.0**, preset expressions 14종: happy/angry/sad/relaxed/surprised + aa/ih/ou/ee/oh + blink/blinkL/R + neutral
- **lookAt type: bone** — 눈동자 본 제어 네이티브 (`vrm.lookAt.target = camera` 한 줄)
- **springBones 내장** — 머리카락/옷 물리 자동 (`vrm.update()`가 처리, TalkingHead엔 없는 기능)
- **face morph 57개** — `Fcl_BRW_*`(눈썹), `Fcl_EYE_*`(눈), `Fcl_MTH_*`(입) 부위별 감정 모프 → ARKit 셰이프 조합 기반 무드 표현 재현 가능

### 진행 순서 (의존성 기준, 알파벳순 아님)

| 순서 | 단계 | 내용 | 의존성 | 권장 모델 |
|------|------|------|--------|----------|
| 1 | ✅ A. 시선 | `vrm.lookAt.lookAt()` 직접 호출 + rangeMap 보정(수평 inputMax 50) + center/glance 2상태 사케이드 | 독립 | Sonnet |
| 2 | ✅ D. 립싱크 업그레이드 | `lipsyncEn.ts` 글자 기반 음소 분해 + `visemeApplier.ts` 이중 경로 (모음→expressionManager / 자음→Fcl_MTH_Close 등 직접 조작). `registerExpression()` 불필요 — 모프 비중복으로 충돌 없음 | 독립 | Fable |
| 3 | B. 애니메이션 스케줄러 | `animFactory` 선언적 시퀀스 엔진 포팅 (~300줄). `{delay, dt, vs}` + gaussian 랜덤 + idle/speaking 분기. 무드 시스템의 기반 | 기반 코드 | 상위 모델 |
| 4 | C. 포즈 전환 | 2~3개 대기 포즈 랜덤 전환. **B의 'pose' 트랙으로 구동** (독립 타이머로 먼저 만들면 재작업됨) | B 필요 | Sonnet |
| 5 | E. 제스처 (선택) | speakWithHands 등 본 회전 시퀀스. VRM humanoid 손가락 본 표준화되어 있음 | B 필요 | Sonnet |

### D 단계: 합성 viseme 레시피

VRM preset은 입 모양 5개(aa/ih/ou/ee/oh)지만, VRoid 모델의 추가 입 모프를 조합해 런타임 확장:

| Oculus viseme | 합성 레시피 (VRoid 모프) |
|---|---|
| PP (b/p/m) | `Fcl_MTH_Close` 1.0 |
| FF (f/v) | `Fcl_MTH_Close` 0.5 + `Fcl_MTH_Small` 0.4 |
| SS (s/z) | `Fcl_MTH_I` 0.4 + `Fcl_MTH_Small` 0.3 |
| DD/nn/kk | `Fcl_MTH_I` 또는 `Fcl_MTH_E` 저강도 |
| CH | `Fcl_MTH_U` 0.5 + `Fcl_MTH_I` 0.3 |
| sil | 전부 0 |
| aa/E/ih/oh/ou | preset 그대로 |

- 구현: `expressionManager.registerExpression()` — 모델 파일 수정 불필요
- **이식성 필수**: `Fcl_MTH_*`는 VRoid 명명 규칙. 비VRoid 모델 대비 모프 이름 감지 → 없으면 preset 5개 fallback

### 알려진 한계 (수용)

- TH/RR viseme: 혀 지오메트리가 모델에 없어 근사치 — Blender 수작업 필요라 스킵
- 콧잔등 등 ARKit 미세 모프 부재 — 300×400px 오버레이에선 식별 불가
- IK(`touchAt`)는 스킵 — three.js CCDIKSolver로 가능하나 니치 기능

## 주의사항

- VRM CORS → `public/avatars/`에 위치시켜 same-origin 서빙
- Three.js v0.170.x 고정 — drei v9, @pixiv/three-vrm v3 호환
- Zustand에 Three.js 객체(VRM, Object3D) 절대 넣지 말 것 → module singleton 사용
- `vrm.update(delta)` 매 프레임 필수 — time uniform 없으면 rim light 등 정지
- KTX2Loader 타입 충돌 (drei three-stdlib vs @types/three) → `loader`, `parser` `any` 캐스트
- VRM 파츠는 Face_(merged), Body_(merged) 등 통합 메시 → 진정한 파츠 교체는 VRoid에서 별도 내보내기 필요
