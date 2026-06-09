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
│   │   ├── useIdleAnimation.ts   # 숨쉬기(chest bone) + 눈깜빡임
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
- 숨쉬기: chest bone quaternion slerp `sin(time * 0.8) * 0.015`
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

## 알려진 미해결 버그

- **TTS 소리 없음** — AudioContext가 유저 제스처 컨텍스트 밖에서 생성됨 (첫 await 이후). 수정 필요.
- **캐릭터 상반신 클리핑** — 컴패니언 카메라가 얼굴만 보임 (fov:28, lookAt y=1.45). 상반신이 보이도록 조정 필요.
- **T-포즈 (idle 없음)** — useIdleAnimation 진폭이 너무 작아 육안으로 동작 확인 불가 (0.015 rad). 가시적 움직임 구현 필요.

## 구현 로드맵

- [x] Phase 1: Vite + R3F + drei 세팅, VRM 로딩 (@pixiv/three-vrm), OrbitControls, 명시적 조명
- [x] Phase 2: 머티리얼 색상 변경 (Zustand), 파츠 show/hide (meshInfos), MToon litColor/shadeColor
- [x] Phase 3: MToon 셰이더 파라미터 UI (outlineWidthFactor, rim, shadingToony)
- [x] 컴패니언 모드: 게임 이벤트 반응, 말풍선, Google TTS, 립싱크, 숨쉬기+눈깜빡임
- [x] 컴패니언 DebugPanel: 5173 UX 포팅, VRM 직접 로드 (blob URL)
- [ ] 버그 수정: TTS AudioContext, 카메라 상반신 프레이밍, idle 애니메이션 가시성
- [ ] Phase 4: 애니메이션 미리보기 (내장 클립 재생), 스크린샷/내보내기

## 주의사항

- VRM CORS → `public/avatars/`에 위치시켜 same-origin 서빙
- Three.js v0.170.x 고정 — drei v9, @pixiv/three-vrm v3 호환
- Zustand에 Three.js 객체(VRM, Object3D) 절대 넣지 말 것 → module singleton 사용
- `vrm.update(delta)` 매 프레임 필수 — time uniform 없으면 rim light 등 정지
- KTX2Loader 타입 충돌 (drei three-stdlib vs @types/three) → `loader`, `parser` `any` 캐스트
- VRM 파츠는 Face_(merged), Body_(merged) 등 통합 메시 → 진정한 파츠 교체는 VRoid에서 별도 내보내기 필요
