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
**R3F v8 train 고정** — React 18 → @react-three/fiber v8 → drei v9. v9(React 19)로 안 올림(이득 없음, three-vrm은 양쪽 호환). 포스트프로세싱도 v8 호환 `@react-three/postprocessing@2.17` 핀. 상세 [docs/shader-features-plan.md](docs/shader-features-plan.md).

## 현재 프로젝트 구조

```
drei-avatar-project/
├── public/
│   └── avatars/
│       ├── male_base.vrm     # 남자1 베이스(컨벤션 락 키스톤) · male1/ 파츠 라이브러리
│       ├── female1/          # 여자1 베이스 + 파츠(Tops/Bottoms/Hair/Face)
│       ├── thumbs/           # 카탈로그 썸네일 PNG (renderThumbs 산출, 커밋)
│       └── male_sample.vrm   # 컴패니언 디폴트 샘플 아바타
├── src/
│   ├── editor/                  # ── 에셋 조립 엔진 (composer 흡수, 에디터·컴패니언 공유) ──
│   │   ├── useAssembledVrm.ts   #   ★공유 조립 훅: base 로드 + 슬롯 diff + faceRef + 외형값 적용. 에디터/컴패니언 양쪽이 사용
│   │   ├── appearance.ts        #   applyAppearance(씬, shader, meshInfos) — 셰이더·색 머티리얼 적용(에디터·컴패니언 공유)
│   │   ├── EditorScene.tsx      #   3-pane: 좌 캐릭터셀렉터+카탈로그 / 중앙 3D / 우 EditorPanel
│   │   ├── ComposerAvatar.tsx   #   useAssembledVrm + 에디터 정책(restpose/프레이밍/ShaderPanel·AnimationPanel/meshInfos)
│   │   ├── partLoader.ts        #   loadPart(GLB rebind) / loadSpringPart(VRM 스프링헤어 병합) / loadFacePart(얼굴교체+눈graft+표정미러)
│   │   ├── constants.ts         #   CHARACTERS[] (베이스별 catalog) · Selection · VARIANTS_BY_ID · BASE_SPEC(컨벤션 락)
│   │   └── ui/                  #   CatalogPicker(탭+썸네일 그리드) · VariantCard · ThumbScene(오프라인 썸네일 단독 렌더)
│   ├── components/
│   │   ├── SceneLights.tsx   # 에디터·컴패니언 공유 조명 (store.lighting 단일 소스)
│   │   ├── GradingEffects.tsx# 컬러 그레이딩 포스트프로세싱 (EffectComposer, store.grading)
│   │   ├── EditorPanel.tsx   # 에디터 우측 패널 (색상/셰이더/조명/톤/애니메이션) — 업로드 제거(조립 전용)
│   │   ├── ShaderPanel.tsx   # MToon 슬라이더(외곽선/툰경계) → store.shader. 적용은 공유 appearance.ts
│   │   ├── LightPanel.tsx    # 조명 슬라이더 (환경광/메인광 강도·각도)
│   │   ├── GradingPanel.tsx  # 톤 슬라이더 (밝기/대비/색조/채도)
│   │   └── AnimationPanel.tsx# 내장 애니메이션 클립 목록 + 재생
│   ├── companion/
│   │   ├── CompanionOverlay.tsx  # fixed 오버레이 (300×400, bottom-right)
│   │   ├── CompanionAvatar.tsx   # useAssembledVrm(조립 공유) + 본기반 카메라 + 립싱크/애니/시선. 업로드는 catalog=[] 오버라이드
│   │   ├── DebugPanel.tsx        # 컴패니언 디버그 패널 (상태/이벤트/언어/VRM 로드)
│   │   ├── useLipsync.ts         # word timing → 음소 스케줄 → viseme
│   │   ├── lipsyncEn.ts          # 영어 단어 → Oculus 15 viseme 음소 분해
│   │   ├── visemeApplier.ts      # 모음→expressionManager / 자음→Fcl_MTH_* 직접
│   │   ├── useLookAt.ts          # 시선 추적 + rangeMap 보정 + center/glance 사케이드
│   │   ├── anim/                 # ── 절차 애니메이션 스케줄러 (B/C/E) ──
│   │   │   ├── scheduler.ts      #   animFactory + tick(clock 보간) + gaussian + 클립별 ease
│   │   │   ├── channels.ts       #   논리 채널 → VRM 본/표정. baseline(rest) 정의
│   │   │   ├── moods.ts          #   무드 5종: 루프(호흡/머리/포즈/armPose팔/깜빡임) + 제스처 10종
│   │   │   └── useAnimator.ts    #   R3F 훅. 발화 전환 시 랜덤 제스처 + idle 팔 포즈 트리거
│   │   ├── useGameEvents.ts      # window game:event 수신
│   │   ├── tts.ts                # Google TTS REST API → AudioBuffer + word timing
│   │   └── locales.ts            # ko/en 반응 대사 + TTS_CONFIG
│   ├── store.ts              # Zustand: characterId/selection/eyeColor/partStatus(조립) + meshInfos/lighting/shader/grading
│   ├── vite-env.d.ts         # VITE_GOOGLE_TTS_API_KEY 타입 선언
│   ├── main.tsx              # 엔트리. ?thumb=<cat>:<id> 분기(ThumbScene) + window.__CATALOG 노출
│   └── App.tsx               # 에디터(조립)/컴패니언 모드 전환
├── scripts/                  # 오프라인 에셋 파이프라인 (npm run assets)
│   ├── extractParts.mjs      #   VRoid 소스 VRM → 파츠 GLB/VRM (raw glTF 수술 + prune)
│   └── renderThumbs.mjs      #   puppeteer 로 ?thumb= 단독 렌더 → 썸네일 PNG (커밋)
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

## 에셋 추가 워크플로 (오프라인 파이프라인)

새 파츠(옷·헤어·얼굴)를 카탈로그에 추가하는 표준 절차. 흩어진 단계를 한 곳에 모은다.
관련 코드: [scripts/extractParts.mjs](scripts/extractParts.mjs) · [scripts/renderThumbs.mjs](scripts/renderThumbs.mjs) · [src/editor/constants.ts](src/editor/constants.ts).

1. **소스 VRM 배치.** VRoid Studio에서 해당 캐릭터 **베이스 위에** 파츠를 입혀 export → `public/avatars/<char>/parts/`에 둔다 (예: `male1/parts/male_top_xyz.vrm`).
   - ⚠️ `parts/`는 **gitignore**(미커밋, ~256MB). 다른 환경에선 avatar-composer에서 복사. 런타임 산출물만 커밋한다.
2. **추출 잡 1줄** — `scripts/extractParts.mjs` `JOBS` 배열에 추가. 옷=`vrm:false`(→GLB), 스프링헤어·얼굴=`vrm:true`(→VRM, MToon·스프링 보존). 머티리얼 필터(`keepMaterial`)·멀티메시(`meshes:[]`)·본 네임스페이스(`nsBones`)는 기존 항목 참고.
3. **카탈로그 1줄** — `src/editor/constants.ts` 해당 캐릭터의 `catalog[category].variants`에 `{id, label, url, thumb}` 추가. `id`는 **전역 고유**(썸네일 파일명·선택 키). url은 2번 `out` 경로와 일치.
4. **`npm run assets`** — extract→thumbs 일괄. (개별: `npm run extract` / `npm run thumbs`). puppeteer가 `?thumb=` 경로로 단독 렌더해 `thumbs/<id>.png` 생성.
5. **커밋 대상** — 런타임 산출물(`<char>/*.glb`·`*.vrm`)과 **썸네일 PNG**(puppeteer 재생성 불가, 소스 취급). `parts/` 원본은 제외.

- **새 캐릭터(베이스) 추가**는 `CHARACTERS[]`에 `{id, label, baseUrl, catalog}` 1개 — 엔진은 base 불가지라 무수정. variant id는 캐릭터 프리픽스로 분리(예 `f1-`).
- **⚠️ Vercel:** `prebuild` 없음. `parts/` 소스가 미커밋이라 빌드 서버에선 추출 불가 → 위 산출물을 **커밋해야** 배포에 반영된다. 파이프라인은 로컬 전용.

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

ShaderPanel은 슬라이더로 `store.shader`만 갱신. **실제 씬 머티리얼 적용은 공유 조립 훅**
(`useAssembledVrm` → `editor/appearance.ts` `applyAppearance`)이 담당 → **에디터·컴패니언 동일 적용**.
(이전 `setShaderPanelScene` module singleton 패턴은 폐기 — 컴패니언이 ShaderPanel을 안 띄워 적용
누락됐던 버그를 공유 계층으로 해소.) 메시 색(lit/shade)도 같은 `applyAppearance`로 양쪽 적용.
가시성(show/hide)만 에디터 전용(컴패니언 가시성은 파츠 로더가 소유).

조작 가능한 파라미터 (전역, `store.shader`):
- `outlineWidthFactor` — 외곽선 두께 (0~0.02)
- `shadingToonyFactor` — 툰 경계 선명도 (0~1, 높을수록 명확한 경계)

**rim 계열 제거됨** — MToon 핵심 아님 + 작은 오버레이서 인지 불가. emission/outline색/shadingShift도 모델 파싱 검증 후 폐기(원칙1·2 미달). 근거 [docs/shader-features-plan.md](docs/shader-features-plan.md).
**조명·톤은 별도 레이어**: 조명=LightPanel/SceneLights(`store.lighting`), 사진편집식 톤=컬러 그레이딩 포스트프로세싱(GradingPanel/GradingEffects, `store.grading` — 모델 비훼손 화면 레이어).

## 컴패니언 모드

게임 이벤트에 반응하는 VTuber 스타일 오버레이.

### 게임 이벤트 연동
```typescript
window.dispatchEvent(new CustomEvent('game:event', {
  detail: { type: 'level_clear' }  // player_die | level_clear | near_miss | jump | start
}))
```

### 아이들 애니메이션 (anim/ 스케줄러 — 옛 useIdleAnimation 대체됨)
선언적 루프 템플릿([moods.ts](src/companion/anim/moods.ts) BASE_LOOPS):
- 호흡(`chest.inhale`) / 머리 미동(`head.rotate*`, 가끔 둘러보기) / 눈깜빡임
- 포즈(`spine.*` 체중이동 + 둘러보기 alt) — Head/팔 FK 상속
- **armPose 팔**: 차렷+미세이동 / 허리짚기 / 뒷짐. 발화 시 rest로 양보(제스처가 팔 소유). 상세 [docs/idle-arm-plan.md](docs/idle-arm-plan.md)

옛 useIdleAnimation(slerp 기반)은 폐기 — 위 선언적 스케줄러로 흡수.

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

VRM 로드 흐름(업로드 오버라이드): 파일 선택 → `URL.createObjectURL(file)` → `setCompanionAvatarUrl(url)` → `<CompanionOverlay uploadUrl={url}>` → CompanionAvatar 가 `catalog=[]` 단일 VRM 으로 조립(파츠 0). **uploadUrl 없으면 store 조립 아바타**(에디터 결과) 표시 — `sourceKey=uploadUrl ?? characterId` 로 리마운트.

## 해결된 버그 (이력)

- ~~TTS 소리 없음~~ — 원인은 `VITE_GOOGLE_TTS_API_KEY` 부재. `.env`에 키 추가 후 정상 동작 확인 (키는 gitignore됨).
- ~~캐릭터 상반신 클리핑~~ — 본 위치 기반 자동 프레이밍으로 해결. `computeUpperBodyCamera()`가 Head/Hips 본에서 상반신 범위 계산 → fov 28 기준 거리 산출 (CompanionAvatar.tsx).
- ~~T-포즈 고정~~ — useIdleAnimation에 팔 내리기 포즈(UpperArm Z ±1.3rad slerp) + 머리 미세 움직임 추가.
- ~~DebugPanel 상태 미반영~~ — CompanionOverlay에 `onStatusChange`/`onSpeak` 콜백 추가하여 App까지 상태 전달.
- ~~expressionManager.update() 이중 호출~~ — useLipsync의 수동 호출 제거 (`vrm.update(delta)`가 내부 처리).
- ~~머리 잘림(헤어 큰 모델)~~ — 본 추정 대신 `Box3.setFromObject(scene).max.y`(실제 메시 최상단)로 카메라 상단 산출.
- ~~제스처 안 보임~~ — 트리거는 정상이나 상반신 프레이밍이 손을 잘라냄 + 본 회전축 미검증. 미묘한 상완 움직임으로 절제(손 안 보여도 OK, TalkingHead 동일) + DebugPanel 버튼으로 축 검증.
- ~~에디터 버튼 사라짐(컴패니언 모드)~~ — 모드 툴바 z-10 < DebugPanel z-9999. 툴바를 `z-[10000]`으로 올림 (App 컨테이너가 stacking context 미생성이라 직접 비교됨).

## 구현 로드맵

- [x] Phase 1: Vite + R3F + drei 세팅, VRM 로딩 (@pixiv/three-vrm), OrbitControls, 명시적 조명
- [x] Phase 2: 머티리얼 색상 변경 (Zustand), 파츠 show/hide (meshInfos), MToon litColor/shadeColor
- [x] Phase 3: MToon 셰이더 파라미터 UI (outlineWidthFactor, rim, shadingToony)
- [x] 컴패니언 모드: 게임 이벤트 반응, 말풍선, Google TTS, 립싱크, 숨쉬기+눈깜빡임
- [x] 컴패니언 DebugPanel: 5173 UX 포팅, VRM 직접 로드 (blob URL)
- [x] 버그 수정: TTS API 키, 카메라 상반신 프레이밍, idle 애니메이션 가시성
- [x] **TalkingHead 포팅 A+D 단계 완료** (시선/사케이드, 합성 viseme 립싱크)
- [x] **TalkingHead 포팅 B+C+E 단계 완료** (애니메이션 스케줄러, 포즈 전환, 발화 제스처)
- [x] **제스처/idle 폴리싱** (적극적 idle, 제스처 10종, DebugPanel 수동 트리거, 전역 편안한 손, z-index 수정)
- [x] **무드 시스템 확장 1~4단계 완료** — 무드 5종(neutral/happy/sad/surprised/angry). 게임 이벤트별 표정 전환(`emo.*` 채널→preset emotion) + 무드별 제스처 톤. 발화 후 neutral decay. DebugPanel 무드/표정 버튼. (5단계 루프 톤 `moodName` 분기는 미착수)
- [x] **무드 변별/품질 폴리싱** — sad/angry는 눈썹 부위 모프(`Fcl_BRW_*`) 강조로 구분. surprised는 입벌림 gasp 일회성(발화 viseme와 분리). 표정↔립싱크 입 충돌 검증(가산·비파괴 확인)
- [x] **TTS 성별 음성 선택** — VRM에 성별 필드 없음 → 에디터에서 수동 선택(`Gender` 토글). `TTS_CONFIG`를 lang×gender로 확장
- [x] **에디터 조명 컨트롤 + 공유 SceneLights** — `store.lighting`로 에디터/컴패니언 조명 공유, LightPanel 슬라이더(환경광/메인광 강도·각도). rim 제거
- [x] **컬러 그레이딩 (포스트프로세싱)** — 사진편집식 톤(밝기/대비/색조/채도). EffectComposer 화면 레이어(모델 비훼손), 에디터·컴패니언 `store.grading` 공유. emission/outline색/shadingShift는 모델 검증 후 폐기 ([docs/shader-features-plan.md](docs/shader-features-plan.md), [docs/drei-opportunities.md](docs/drei-opportunities.md))
- [x] **idle 자연스러운 팔 동작 (FK)** — armPose 루프(허리짚기/뒷짐/미세 무게이동) + 몸통 둘러보기. IK는 보류 ([docs/idle-arm-plan.md](docs/idle-arm-plan.md))
- [x] **에디터 = 에셋 조립 (avatar-composer 흡수)** — 임의 VRM 업로드 폐기(authored-only). 에디터가 `CHARACTERS[]`(남자1/여자1) base + 모듈 파츠 카탈로그 조립으로 전환. `src/editor/`(constants/partLoader/ComposerAvatar/EditorScene/ui). 좌측 카탈로그 피커(face/hair/tops/bottoms 스왑) + 우측 공유 설정(색/셰이더/조명/톤). seam: 파츠 교체 후 `meshInfos` 재수집 → 색/셰이더 패널이 새 파츠 인지. composer 정책(유휴시선/wave/더미)은 벗기고 drei 정책(restpose/프레이밍) 주입. PoC 모드·AvatarScene·VRMAvatar 제거. (composer `INTEGRATION.md`/`INTEGRATION_GAP.md`)
- [x] **컴패니언 = 에디터 조립 아바타 공유** — 조립 엔진을 `useAssembledVrm` 훅으로 추출(ComposerAvatar·CompanionAvatar 공유). 컴패니언이 `store.characterId/selection/eyeColor`로 base+파츠를 동일 조립 → 에디터에서 조합한 결과가 그대로 보임. 컴패니언 립싱크/anim/시선은 조립 위에 얹음(faceRef.sync로 얼굴교체도 표정 미러). DebugPanel 업로드는 `catalog=[]` 단일 VRM 오버라이드로 잔류
- [x] **오프라인 파이프라인 이식 (Phase 7)** — `scripts/extractParts.mjs`(VRoid 소스→파츠 GLB/VRM raw 수술+prune) + `renderThumbs.mjs`(puppeteer로 `?thumb=` 단독 렌더 스냅샷) + `ui/ThumbScene.tsx` + `main.tsx` `?thumb=` 분기·`window.__CATALOG`. devDeps(@gltf-transform/core·functions, puppeteer) + `npm run assets`(extract→thumbs)/`extract`/`thumbs`. **extract·thumbs 둘 다 byte-deterministic 재생성 검증**. ⚠️ `prebuild` 미추가 — `parts/` 소스가 gitignore라 Vercel 빌드선 추출 불가(런타임 산출물 커밋으로 충당)
- [ ] **후속: 무드 5단계 — 루프 톤 분기** — happy=활발한 머리/호흡, sad=느린 미동. 스케줄러 factory에 `moodName` 분기 추가 필요 (현재 루프는 전 무드 공유)
- [ ] **후속: IK 도입** — 손이 보이는 제스처(손가슴 등) 정밀화. CCDIKSolver 채널 추상화. 상세 [docs/ik-plan.md](docs/ik-plan.md)
- [ ] Phase 4: 애니메이션 미리보기 (내장 클립 재생), 스크린샷/내보내기
- 보류: per-제스처 손가락 매핑 — 300×400 프레임에선 지엽적이라 스킵 (전역 편안한 손으로 충분)

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
| 3 | ✅ B. 애니메이션 스케줄러 | `anim/` 서브시스템 — animFactory(템플릿→클립) + clock 기반 보간 + gaussian + idle/speaking 분기. **hold-last**(클립 미기록 채널 직전값 유지)로 끊김 제거. 클립별 `ease`(sigmoid 강도) | 기반 코드 | Opus |
| 4 | ✅ C. 포즈 전환 | 6종 상반신 체중이동(Spine 회전 → Head/팔/Chest FK 상속 → 전신 흔들림). 진폭↑, 3~10초 전환으로 적극적 idle. 머리도 70% 미동/30% 둘러보기 alt | B 필요 | Opus |
| 5 | ✅ E. 제스처 | FK(IK 미사용) 발화 제스처 **10종 세트** — 팔 주도/머리 주도(끄덕·갸웃)/다가서기·물러서기/몸통 기울임/손가슴. 발화 시작 시 랜덤 1개(확률 0.6) + **DebugPanel 수동 트리거**(`companion:gesture` 이벤트). out-hold-back + ease 2.5. 전역 편안한 손(손가락 curl 1회) | B 필요 | Opus |

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

- **개발 원칙** (신기능 시 준수): ①비퇴행 — 기존 동작 feature를 저해 금지. ②실질 개선 — "개발만 하면 됨" 금지, 체감되는 개선이어야. (rim·emission 컷, 그레이딩 화면 레이어 채택이 이 원칙의 사례)
- VRM CORS → `public/avatars/`에 위치시켜 same-origin 서빙
- Three.js v0.170.x 고정 — drei v9, @pixiv/three-vrm v3 호환
- Zustand에 Three.js 객체(VRM, Object3D) 절대 넣지 말 것 → module singleton 사용
- `vrm.update(delta)` 매 프레임 필수 — 없으면 springBone 물리(머리카락/옷)·lookAt·표정 정지
- KTX2Loader 타입 충돌 (drei three-stdlib vs @types/three) → `loader`, `parser` `any` 캐스트
- VRM 파츠는 Face_(merged), Body_(merged) 등 통합 메시 → **임의 업로드 VRM은 진정한 파츠 교체 불가**(merged). 에디터 조립은 이걸 풀려고 authored 베이스+파츠 라이브러리로 전환: 외주가 베이스 위에 스키닝한 모듈 파츠(GLB/VRM)를 런타임 rebind/graft로 조립(`src/editor/partLoader.ts`). 컨벤션 락은 authored 경로에만 적용

### 에셋 조립 엔진(src/editor/) 불변식 — 신규 파츠/로더 수정 시 준수

- **base 불가지 로더**: `load*(url, baseVrm)` 시그니처 유지 — 새 기능도 baseVrm/스펙을 파라미터로 받게. 캐릭터(base) 추가는 `constants.ts` `CHARACTERS[]`에 1줄(베이스별 `{baseUrl, catalog}`)
- **컨벤션 락(`BASE_SPEC`)**: VRM1.0·54본·`J_Bip_*`·A-pose·신장 1.756m·MToon. 파츠가 어기면 rebind 깨짐. 외주 사양은 composer `ASSET_SPEC.md`
- **rebind/graft**: 외부 SkinnedMesh skinIndex는 자기 skeleton.bones 인덱스 → 같은 순서로 base 본 치환 + boneInverses 재사용. base에 없는 보조 본(소매 J_Sec_*, 눈 본)은 부모 아래로 graft 후 rebind 매칭. 스프링 헤어는 base springBoneManager에 addJoint 병합 → `vrm.update(delta)` 한 번에 같이 돔(이중 호출 금지)
- **MToon 통일**: 옷 GLB는 prune으로 PBR 로드 → 런타임 `toMToon` 변환(shade≈base×0.87, toony 0.95)으로 base 툰과 톤 일치. 아웃라인은 의도적 미부착(촘촘한 의류서 뭉침)
- **seam(meshInfos)**: 파츠 add/remove 후 `setMeshInfos(collectMeshInfos(base))` 재수집 — 색 패널·ShaderPanel(`[vals, meshInfos]` 의존)이 새 파츠 인지. ComposerAvatar가 슬롯 load 성공 직후 호출
- **slot diff + genRef**: 카테고리 슬롯당 1개 active. 빠른 연속 선택은 genRef 토큰으로 늦게 끝난 로드 폐기(레이스 가드). 캐릭터 전환은 `<ComposerAvatar key={characterId}>` remount + dispose의 `useGLTF.clear(baseUrl)`

### 애니메이션 스케줄러(anim/) 불변식 — 신규 동작 추가 시 준수

- **채널 단일 소유**: 한 채널은 한 클립만 기록(분리). 충돌나는 본은 FK 계층 또는 base+delta로 해결 — 포즈=Spine, 호흡=Chest.x, 제스처몸통=Chest.x(leanX)/y/z, idle머리=Head.rotate*, 제스처머리=Head.g*(idle 위에 합성). 자식 본이 부모 회전 상속
- **hold-last**: `tick`은 baseline이 아닌 직전 출력(live)에서 시작 → 클립 미기록 채널은 유지. 동작 종료 시 vs를 rest로 끝내야 복귀(안 그러면 그 자세로 멈춤)
- **VRM normalized 본 회전축 (male_sample 전부 시각 검증)**:
  - UpperArm `z`=프론탈 들기/내리기(팔내리기 ∓1.3), `x`=앞뒤 스윙(**음수=앞**/양수=뒤)
  - LowerArm 팔꿈치굽힘=`z`(왼쪽−/오른쪽+, ~−1.7로 손이 가슴까지). **X/Y 아님**(Y는 길이축 roll=안 보임)
  - Head `x`=숙임(끄덕), `y`=턴, `z`=기울임(갸웃). Chest `x`=호흡/앞뒤린·`y`=턴·`z`=좌우린
  - 손가락 curl=proximal/intermediate `z`(좌−/우+). 전역 편안한 손은 `Channels` 생성 시 1회 설정(클립이 안 건드려 유지)
- **카메라 상단**: 본 추정 금지 → `Box3.setFromObject(scene).max.y`(헤어 실제 끝). 머리 잘림 방지
- **이징**: 짧은 동작(제스처)은 `ease: 2.5~3.5`(완만), 기본(snap)은 blink/idle용. 각진 로봇 느낌은 ease 낮춰 해결
- **lookAt rangeMap**: VRoid 기본 inputMax 90은 정면 시선이 거의 0 → `useLookAt`에서 수평만 보정. 수직 보정 시 눈 내리깖(카메라가 가슴 높이라 하향각 포화)
- **제스처 추가**: `anim/moods.ts` GESTURES 배열에 `{label, ease, dt:[out,hold,back], vs:[out,hold,rest]}` 항목 추가 → DebugPanel 버튼 자동 생성. 손은 상반신 프레임 하단이라 큰 손짓보다 절제된 동작이 적합
- **idle 팔 포즈 (armPose 루프)**: arm/elbow 채널 단독 소유. idle=포즈 alt, **speaking=rest로 양보** → 발화 제스처가 큐 후순위로 per-channel 승(루프는 생성 시 add, 제스처는 발화 시 add). 포즈 추가 시 **양팔 전 채널 명시**(잔상 방지) + `IDLE_ARM_POSES`에 넣으면 DebugPanel `companion:idlepose` 버튼 자동 생성. 몸통 둘러보기는 `pose` 루프(spine 단독) alt로 추가(머리 FK 상속). 상세 [docs/idle-arm-plan.md](docs/idle-arm-plan.md)
- **컬러 그레이딩 = 화면 레이어**: EffectComposer 포스트프로세싱은 모델 머티리얼 비훼손(개발 원칙1=비퇴행). 컴패니언 투명배경 알파 보존 확인됨. `store.grading` 디폴트=무변화(0). 사진편집식 톤은 머티리얼 튜닝(emission 등) 아닌 이 레이어로 해결
