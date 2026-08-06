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

| 역할            | 도구                                                       |
| --------------- | ---------------------------------------------------------- |
| VRM 로딩/셰이더 | `@pixiv/three-vrm` v3.5.3                                  |
| 3D 렌더링       | `@react-three/fiber` v8                                    |
| 헬퍼/유틸       | `@react-three/drei` v9                                     |
| 상태 관리       | Zustand v5                                                 |
| UI              | React + Vite + Tailwind                                    |
| 테스트          | Vitest (`npm test` / `test:watch`) — 순수 로직 단위 테스트 |
| 아바타 포맷     | VRM (VRoid Studio 직접 내보내기)                           |

**Vite 필수** — R3F 생태계 표준, CRA 사용 금지.
**Three.js v0.170.x** — @pixiv/three-vrm 3.x 호환 버전.
**R3F v8 train 고정** — React 18 → @react-three/fiber v8 → drei v9. v9(React 19)로 안 올림(이득 없음, three-vrm은 양쪽 호환). 포스트프로세싱도 v8 호환 `@react-three/postprocessing@2.17` 핀. 상세 [docs/shader-features-plan.md](docs/shader-features-plan.md).

## 현재 프로젝트 구조

```
drei-avatar-project/
├── public/
│   ├── animations/           # VRMA 모션 — VRMA_01~07(VRoid 공식 무료) + wave.vrma(03 개조본). 전부 커밋
│   └── avatars/
│       ├── male_base.vrm     # 남자1 베이스(컨벤션 락 키스톤)
│       ├── male1/            # 남자1 파츠(Tops/Bottoms/Face/Hair) + parts/(미커밋 원본)
│       ├── female1/          # 여자1 베이스 + 파츠(Tops/Bottoms/Hair/Face) + parts/(미커밋 원본)
│       ├── thumbs/           # 카탈로그 썸네일 PNG (renderThumbs 산출, 커밋)
│       ├── Hair_sample.vrm   # 남자1 헤어 1(루트 잔류 에셋) · male_eye_sample.vrm 도 동일
│       └── male_sample.vrm   # 컴패니언 디폴트 샘플 아바타
├── src/
│   ├── editor/                  # ── 에셋 조립 엔진 (composer 흡수, 에디터·컴패니언 공유) ──
│   │   ├── useAssembledVrm.ts   #   ★공유 조립 훅: base 로드 + 슬롯 diff + faceRef + 외형값 적용. 에디터/컴패니언 양쪽이 사용
│   │   ├── appearance.ts        #   applyAppearance(씬, shader, meshInfos) — 셰이더·색 머티리얼 적용(에디터·컴패니언 공유)
│   │   ├── EditorScene.tsx      #   3-pane: 좌 캐릭터셀렉터+카탈로그 / 중앙 3D / 우 EditorPanel
│   │   ├── ComposerAvatar.tsx   #   useAssembledVrm + 에디터 정책(restpose/프레이밍/meshInfos) + 라이브 프리뷰 시 useAnimator 구동
│   │   ├── partLoader.ts        #   loadPart(GLB rebind) / loadSpringPart(VRM 스프링헤어 병합) / loadFacePart(얼굴교체+눈graft+표정미러)
│   │   ├── constants.ts         #   CHARACTERS[] (베이스별 catalog) · Selection · VARIANTS_BY_ID · BASE_SPEC(컨벤션 락)
│   │   ├── meshLabels.ts        #   메시→부위 라벨 규칙(VRoid 머티리얼명 기반, base·파츠·성별 공통). 파츠/색상 리스트 표시용
│   │   └── ui/                  #   CatalogPicker(탭+썸네일 그리드) · VariantCard · ThumbScene(오프라인 썸네일 단독 렌더)
│   ├── components/
│   │   ├── SceneLights.tsx   # 에디터·컴패니언 공유 조명 (store.lighting 단일 소스)
│   │   ├── GradingEffects.tsx# 컬러 그레이딩 포스트프로세싱 (EffectComposer, store.grading)
│   │   ├── EditorPanel.tsx   # 에디터 우측 패널 (색상/셰이더/조명/톤/애니메이션) — 업로드 제거(조립 전용)
│   │   ├── Section.tsx       # 에디터 패널 공용 접이식 섹션(아코디언, controlled 단일 오픈)
│   │   ├── ShaderPanel.tsx   # MToon 슬라이더(외곽선/툰경계) → store.shader. 적용은 공유 appearance.ts
│   │   ├── LightPanel.tsx    # 조명 슬라이더 (환경광/메인광 강도·각도)
│   │   ├── GradingPanel.tsx  # 톤 슬라이더 (밝기/대비/색조/채도)
│   │   └── AnimationPanel.tsx# 에디터 라이브 프리뷰 토글(store.animPreview) + 무드/제스처/idle포즈 트리거(window 이벤트)
│   ├── companion/
│   │   ├── CompanionOverlay.tsx  # fixed 오버레이 (300×400, bottom-right) + DprGovernor(FPS 하락 시 DPR↓)
│   │   ├── CompanionAvatar.tsx   # useAssembledVrm(조립 공유) + 본기반 카메라 + 립싱크/애니/시선. 업로드는 catalog=[] 오버라이드
│   │   ├── DebugPanel.tsx        # 컴패니언 디버그 패널 (상태/이벤트/언어/VRM 로드)
│   │   ├── useLipsync.ts         # word timing → 음소 스케줄 → viseme
│   │   ├── lipsyncEn.ts          # 영어 단어 → Oculus 15 viseme 음소 분해 (lipsyncEn.test.ts 콜로케이트)
│   │   ├── visemeApplier.ts      # 모음→expressionManager / 자음→Fcl_MTH_* 직접
│   │   ├── useLookAt.ts          # 시선 추적 + rangeMap 보정 + center/glance 사케이드
│   │   ├── anim/                 # ── 절차 애니메이션 스케줄러 (B/C/E) ──
│   │   │   ├── scheduler.ts      #   animFactory + tick(clock 보간) + gaussian + 클립별 ease + MotionConfig(overlap 시차/smootherstep) (scheduler.test.ts 콜로케이트)
│   │   │   ├── channels.ts       #   논리 채널 → VRM 본/표정. baseline(rest) 정의 + micro-drift 레이어
│   │   │   ├── moods.ts          #   무드 5종: 루프(호흡/머리/포즈/armPose팔/깜빡임) + 제스처 10종
│   │   │   ├── useAnimator.ts    #   R3F 훅. 발화 전환 시 랜덤 제스처 + idle 팔 포즈 트리거
│   │   │   └── vrma/             #   VRMA 이산 제스처 레이어 — clips.ts(카탈로그) + useVrmaLayer.ts(재생·idle 복귀 블렌드)
│   │   ├── useGameEvents.ts      # window game:event 수신
│   │   ├── tts.ts                # Google TTS REST API → AudioBuffer + word timing
│   │   └── locales.ts            # ko/en 반응 대사 + TTS_CONFIG
│   ├── store.ts              # Zustand: characterId/selection/eyeColor/partStatus(조립) + meshInfos/lighting/shader/grading
│   ├── vite-env.d.ts         # VITE_GOOGLE_TTS_API_KEY 타입 선언
│   ├── main.tsx              # 엔트리. ?thumb=<cat>:<id> 분기(ThumbScene) + window.__CATALOG 노출
│   └── App.tsx               # 에디터(조립)/컴패니언 모드 전환
├── scripts/                  # 오프라인 에셋 파이프라인 (npm run assets)
│   ├── extractParts.mjs      #   VRoid 소스 VRM → 파츠 GLB/VRM (raw glTF 수술 + prune)
│   ├── renderThumbs.mjs      #   puppeteer 로 ?thumb= 단독 렌더 → 썸네일 PNG (커밋)
│   ├── makeWaveVrma.mjs      #   VRMA_03 개조 → wave.vrma (손가락 이식 + 월드축 흔들기 주입)
│   ├── probeMotion.mjs       #   손동작 수치 판정 (npm run probe) — 자기 vite/브라우저를 띄움
│   ├── probeAttach.mjs       #   같은 판정을 살아있는 dev 서버·브라우저에 붙어 실행 (npm run probe:tab, 4~6초)
│   └── vrmaShots.mjs         #   VRMA/절차 필름스트립 비교 캡처
├── .env                      # VITE_GOOGLE_TTS_API_KEY (선택)
└── package.json
```

## 아바타 소스

| 소스         | 무료    | 비고                             |
| ------------ | ------- | -------------------------------- |
| VRoid Studio | ✅      | VRM 직접 로딩 가능 (변환 불필요) |
| Avaturn      | ❌ 유료 | RPM 대안                         |

**⚠️ Ready Player Me 사용 불가** — 2026년 1월 Netflix 인수 후 서비스 종료.
**GLB 사용 시 주의** — @pixiv/three-vrm는 .vrm 파일 로딩 전용. GLB는 VRM 메타데이터 없음.

## 에셋 추가 워크플로 (오프라인 파이프라인)

새 파츠(옷·헤어·얼굴)를 카탈로그에 추가하는 표준 절차. 흩어진 단계를 한 곳에 모은다.
관련 코드: [scripts/extractParts.mjs](scripts/extractParts.mjs) · [scripts/renderThumbs.mjs](scripts/renderThumbs.mjs) · [src/editor/constants.ts](src/editor/constants.ts).

1. **소스 VRM 배치.** VRoid Studio에서 해당 캐릭터 **베이스 위에** 파츠를 입혀 export → `public/avatars/<char>/parts/`에 둔다 (예: `male1/parts/male_top_xyz.vrm`).
   - ⚠️ `parts/`는 **gitignore**(미커밋, ~256MB). 다른 환경에선 avatar-composer에서 복사. 런타임 산출물만 커밋한다.
2. **추출 잡 1줄** — `scripts/extractParts.mjs` `JOBS` 배열에 추가. 옷=`vrm:false`(→GLB), 스프링헤어·얼굴=`vrm:true`(→VRM, MToon·스프링 보존). 머티리얼 필터(`keepMaterial`)·멀티메시(`meshes:[]`)·본 네임스페이스(`nsBones`)는 기존 항목 참고.
3. **카탈로그 1줄** — `src/editor/constants.ts` 해당 캐릭터의 `catalog[category].variants`에 `{id, label, url, thumb}` 추가. `id`는 **전역 고유**(썸네일 파일명·선택 키). url은 2번 `out` 경로와 일치. **`label`은 `[명칭][숫자]` 형식으로 통일**(여자1 기준): 얼굴/헤어/상의/하의 + 카테고리 내 1부터 순번(서술형 명칭 금지). id·파일명은 영문 식별자로 별개 유지 — 라벨만 이 규칙.
4. **`npm run assets`** — extract→thumbs 일괄. (개별: `npm run extract` / `npm run thumbs`). puppeteer가 `?thumb=` 경로로 단독 렌더해 `thumbs/<id>.png` 생성.
5. **커밋 대상** — 런타임 산출물(`<char>/*.glb`·`*.vrm`)과 **썸네일 PNG**(puppeteer 재생성 불가, 소스 취급). `parts/` 원본은 제외.

- **파츠/색상 리스트 부위 라벨은 자동**(별도 작업 불필요). 에디터 리스트 표시명은 메시 이름이 아니라 **머티리얼 이름**에서 뽑는다([src/editor/meshLabels.ts](src/editor/meshLabels.ts)). VRoid 머티리얼 명명 규칙(`N00_…_<Part>_<NN>_<TYPE>`)이 base·얼굴 변형·바디·헤어·의류·양 성별에 공통이라, 규칙을 따르는 새 에셋은 자동으로 한글 부위 라벨이 붙는다(미매칭 시 원본 메시 이름 fallback). **새 부위 종류**(예 양말·장갑)가 생겨 라벨이 안 붙으면 `meshLabels.ts` `LABEL_RULES`에 1줄 추가(구체적 토큰을 앞에).

- **새 캐릭터(베이스) 추가**는 `CHARACTERS[]`에 `{id, label, baseUrl, catalog}` 1개 — 엔진은 base 불가지라 무수정. variant id는 캐릭터 프리픽스로 분리(예 `f1-`).
- **⚠️ Vercel:** `prebuild` 없음. `parts/` 소스가 미커밋이라 빌드 서버에선 추출 불가 → 위 산출물을 **커밋해야** 배포에 반영된다. 파이프라인은 로컬 전용.

## VRM 로딩 패턴

```tsx
// useGLTF extendLoader 콜백으로 VRMLoaderPlugin 등록
const gltf = useGLTF(url, true, true, (loader: any) => {
  loader.register((parser: any) => new VRMLoaderPlugin(parser as any));
});
const vrm: VRM | undefined = (gltf as any).userData?.vrm;

// VRM 0.x 미러 보정
VRMUtils.rotateVRM0(vrm);

// 매 프레임 time-based uniform 업데이트 (rim light 등)
useFrame((_, delta) => {
  vrm.update(delta);
});
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
window.dispatchEvent(
  new CustomEvent('game:event', {
    detail: { type: 'level_clear' }, // player_die | level_clear | near_miss | jump | start
  }),
);
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

없으면 말풍선만 표시 (오디오 없음). 현재 등급은 WaveNet — 실수요 서비스 이식 시 백엔드 선정(트래픽 구간별 비용·한국어 품질·립싱크 타이밍 제공 여부)은 [docs/tts-model-selection.md](docs/tts-model-selection.md).

## 컴패니언 DebugPanel

5173(game-avatar-companion) DebugPanel과 동일한 UX. VRM 변환 파이프라인 제거, .vrm 직접 blob URL 로딩으로 교체.

```tsx
// App.tsx companion 모드에서 렌더링
<DebugPanel
  status={companionStatus} // 'loading' | 'ready' | 'speaking'
  lastText={lastText}
  lang={lang}
  onEvent={dispatchGameEvent} // game:event CustomEvent dispatch
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
- [x] **무드 시스템 확장 1~4단계 완료** — 무드 5종(neutral/happy/sad/surprised/angry). 게임 이벤트별 표정 전환(`emo.*` 채널→preset emotion) + 무드별 제스처 톤. 발화 후 neutral decay. DebugPanel 무드/표정 버튼. 상세 [docs/mood-plan.md](docs/mood-plan.md)
- [x] **무드 변별/품질 폴리싱** — sad/angry는 눈썹 부위 모프(`Fcl_BRW_*`) 강조로 구분. surprised는 입벌림 gasp 일회성(발화 viseme와 분리). 표정↔립싱크 입 충돌 검증(가산·비파괴 확인)
- [x] **happy 눈매 폴리싱 (얼굴 인지 + 일회성 분해)** — ①VRoid `Fcl_ALL_Joy` 속 눈웃음(`Fcl_EYE_Joy`)이 일부 얼굴(female)에선 눈을 덜 감게 저작됨 → 보이는 얼굴의 모프 정점 변위를 측정해 부족분만큼 `Fcl_EYE_Close`를 가산(목표 비율 0.62, male류는 boost=0 비퇴행). 얼굴 교체마다 lazy 재산출(`channels.ts refreshHappyEye`). ②preset `happy`(입+눈+눈썹 결합) held → "말하는 내내 눈감김" → surprised gasp와 동형으로 분해: 입(`Fcl_MTH_Joy`)·눈썹(`Fcl_BRW_Joy`) held + 눈(`emo.eyeJoy`)은 진입 시 일회성 클립(`HAPPY_EYE`)이 감았다 뜸 → 발화 중 눈뜸 유지
- [x] **TTS 성별 음성 선택** — VRM에 성별 필드 없음 → 에디터에서 수동 선택(`Gender` 토글). `TTS_CONFIG`를 lang×gender로 확장
- [x] **에디터 조명 컨트롤 + 공유 SceneLights** — `store.lighting`로 에디터/컴패니언 조명 공유, LightPanel 슬라이더(환경광/메인광 강도·각도). rim 제거
- [x] **컬러 그레이딩 (포스트프로세싱)** — 사진편집식 톤(밝기/대비/색조/채도). EffectComposer 화면 레이어(모델 비훼손), 에디터·컴패니언 `store.grading` 공유. emission/outline색/shadingShift는 모델 검증 후 폐기 ([docs/shader-features-plan.md](docs/shader-features-plan.md))
- [x] **idle 자연스러운 팔 동작 (FK)** — armPose 루프(허리짚기/뒷짐/미세 무게이동) + 몸통 둘러보기. IK는 보류 ([docs/idle-arm-plan.md](docs/idle-arm-plan.md))
- [x] **에디터 = 에셋 조립 (avatar-composer 흡수)** — 임의 VRM 업로드 폐기(authored-only). 에디터가 `CHARACTERS[]`(남자1/여자1) base + 모듈 파츠 카탈로그 조립으로 전환. `src/editor/`(constants/partLoader/ComposerAvatar/EditorScene/ui). 좌측 카탈로그 피커(face/hair/tops/bottoms 스왑) + 우측 공유 설정(색/셰이더/조명/톤). seam: 파츠 교체 후 `meshInfos` 재수집 → 색/셰이더 패널이 새 파츠 인지. composer 정책(유휴시선/wave/더미)은 벗기고 drei 정책(restpose/프레이밍) 주입. PoC 모드·AvatarScene·VRMAvatar 제거. (composer `INTEGRATION.md`/`INTEGRATION_GAP.md`)
- [x] **컴패니언 = 에디터 조립 아바타 공유** — 조립 엔진을 `useAssembledVrm` 훅으로 추출(ComposerAvatar·CompanionAvatar 공유). 컴패니언이 `store.characterId/selection/eyeColor`로 base+파츠를 동일 조립 → 에디터에서 조합한 결과가 그대로 보임. 컴패니언 립싱크/anim/시선은 조립 위에 얹음(faceRef.sync로 얼굴교체도 표정 미러). DebugPanel 업로드는 `catalog=[]` 단일 VRM 오버라이드로 잔류
- [x] **오프라인 파이프라인 이식 (Phase 7)** — `scripts/extractParts.mjs`(VRoid 소스→파츠 GLB/VRM raw 수술+prune) + `renderThumbs.mjs`(puppeteer로 `?thumb=` 단독 렌더 스냅샷) + `ui/ThumbScene.tsx` + `main.tsx` `?thumb=` 분기·`window.__CATALOG`. devDeps(@gltf-transform/core·functions, puppeteer) + `npm run assets`(extract→thumbs)/`extract`/`thumbs`. **extract·thumbs 둘 다 byte-deterministic 재생성 검증**. ⚠️ `prebuild` 미추가 — `parts/` 소스가 gitignore라 Vercel 빌드선 추출 불가(런타임 산출물 커밋으로 충당)
- [x] **무드 5단계 — 루프 톤 분기** — happy=활발한 머리/호흡(템포↓·진폭↑), sad=느린 미동(템포↑·진폭↓). 스케줄러 자체엔 `moodName` 차원을 안 넣음 — `moods.ts`의 `scaleTemplate()`가 호흡/머리/포즈 템플릿을 무드별 톤(tempo/amplitude)으로 재귀 스케일해 `loopsForMood()`가 조립, `useAnimator`가 무드 전환 시 `TONE_LOOP_NAMES` 3종만 remove/재add(hold-last로 스냅 없음). neutral은 스케일 1×라 원본 객체 그대로 반환(참조 동일 = 비퇴행). armPose/blink는 이번 범위 밖(무드 무관 공유 유지)
- [x] **drei 로딩 인디케이터 + 컴패니언 FPS 적응형 DPR** — 에디터: 12MB VRM 로딩 중 `useProgress()` % 를 Suspense fallback으로 표시. 컴패니언: `<PerformanceMonitor>`를 `setDpr`에 직접 연결(`DprGovernor`)해 FPS 하락 시 오버레이 해상도를 낮춰 **게임 프레임 보호**, 회복 시 복원. ⚠️ drei `<AdaptiveDpr>`는 OrbitControls 없는 이 캔버스에서 `performance.regress()`가 안 불려 **무동작** → 콜백 직결 방식으로 대체
- [x] **모션 자연스러움 — 탈로봇 (overlap/smootherstep + micro-drift + idle 다양화)** — 3단계. ①`scheduler.ts` `MotionConfig{overlap,smooth}`(기본 0=off, 바이트 동일): 채널 운동학적 깊이(torso 0→arm/head 1→elbow 2)만큼 시작 시각을 미뤄 몸통→팔→손 시차 + 본 채널 이징을 smootherstep로 블렌드. **오버슈트는 시도 후 반려**("각진 군인" 피드백) → `moods.ts` 데이터 무변경으로 전 클립 소급 적용. ②`channels.ts` micro-drift: 초저주파 sine을 apply-레이어에서 가산해 hold 구간 "얼어붙음" 제거. ③`IDLE_ARM_POSES`에 앞으로모으기 추가 + 차렷 확률 0.72→0.55(팔짱·한손잡기는 클리핑으로 반려). 상세 [docs/motion-naturalness-plan.md](docs/motion-naturalness-plan.md) · 보류 기록 [docs/wave-gesture-attempts.md](docs/wave-gesture-attempts.md)
- [ ] **후속: IK 도입** — 손이 보이는 제스처(손가슴 등) 정밀화. CCDIKSolver 채널 추상화. 상세 [docs/ik-plan.md](docs/ik-plan.md)
- [ ] **▶ 다음 세션 착수: 절차 레이어를 VRMA 본 커버리지에 맞추기 — 로봇 느낌의 구조적 원인** (명시 2026-08-05, 미착수)
  - **문제**: 절차는 **52본 중 9본만** 움직인다 — [channels.ts](src/companion/anim/channels.ts) 생성자가 잡는 Head·Chest·Spine·UpperArm L/R·LowerArm L/R·Hand L/R 뿐(손가락은 `curlFingers()`로 1회 고정). **Neck·Shoulder L/R·UpperChest·Hips·다리**는 전혀 안 건드려 "관절 인형" 인상을 준다. VRMA 손인사가 확연히 자연스러웠던 이유도 **52본을 다 쓰기 때문**이다(같은 아바타·같은 카메라에서 대조됨)
  - **해법 = apply 레이어 소급 적용** (개별 클립 저작 금지). overlap·smootherstep·micro-drift와 **동일 계열**: `channels.ts` `apply()`에서 기존 채널 값으로부터 새 본을 파생시킨다 → `moods.ts` 데이터 무변경으로 전 동작(idle 루프·제스처 24종)에 소급. **계수 0 = 기존 출력 바이트 동일**로 두고 `useAnimator`에서만 활성 → [scheduler.test.ts](src/companion/anim/scheduler.test.ts) 패턴으로 비퇴행 고정
  - **우선순위** (상반신 프레임에 보이는 순): ①**어깨 추종** — `armL/R.z`(들기)에 비례해 Shoulder 소량 회전. 팔이 어깨 소켓에서만 도는 게 최대 원인 ②**목 분배** — `head.rotate*`를 Head/Neck으로 나눔(예 0.65/0.35). 총 회전량 유지, 분절만 생김 ③**UpperChest 분배** — 호흡·몸통 비틀림을 Chest/UpperChest로 ④micro-drift `DRIFT` 맵에 neck/shoulder 추가
  - **검증**: `npm run probe`(임계 무변경) + [scripts/vrmaShots.mjs](scripts/vrmaShots.mjs) 필름스트립으로 절차 idle vs VRMA 대조. ⚠️ **신규 본 = 회귀 위험** — 새 본을 채널이 소유하면 VRMA 레이어의 「소유 판별」결과가 바뀐다(그 본의 복귀 목표가 rest0→live로 전환) → VRMA 손인사 복귀도 함께 재검증할 것
  - **범위 밖**: Hips/다리 체중이동은 아래 별도 항목(신규 본+채널이라 위험도가 다름)
- [ ] **후속: 하반신 무게이동** — 현 `pose` 루프는 Spine만 회전(액티브함 구조적 천장). Hips/UpperLeg/LowerLeg 축 검증 후 `hips.*`/`knee.*` 채널 신설. 신규 본/채널 회귀 위험으로 보류 ([docs/motion-naturalness-plan.md](docs/motion-naturalness-plan.md) 4번)
- [x] **손인사(wave) — 완료** (2026-08-04) — FK 5회 실패 후 보류했다가 **검증 방식을 바꿔** 재개해 완료. 양 캐릭터에서 프로브 6개 지표 전부 PASS. 푼 열쇠 2개: ①**흔들기를 손목으로 이관** → `armR.y`(상완 롤)가 자세 전용으로 free 해져 커플링 해소 ②**육안 → 수치 검증**. 부산물: `handR.*`·`*.twist` 채널 신설, 프로브 지표 3종 추가(몸통이격·손바닥 바깥/정면), `--char`/`--wave`/`--wait` 플래그, 필름스트립 [scripts/waveShots.mjs](scripts/waveShots.mjs). **임계값은 하나도 안 바꿨다**(바꾼 건 측정 지점·구간뿐). 상세 [docs/wave-gesture-attempts.md](docs/wave-gesture-attempts.md)
- [x] **VRMA(표준 모션 포맷) 도입 — 손인사 교체 완료** (2026-08-05) — 판정 2기준(ⓐ자연스러움 ⓑ확장성) 모두 통과. `@pixiv/three-vrm-animation@3.5.3` + `src/companion/anim/vrma/`(카탈로그·재생 레이어). **새 동작 추가 = 파일 떨구고 카탈로그 1줄**(euler 튜닝 없음), 같은 파일이 남자1·여자1 무수정 동작. ⚠️ **부분 추출 금지**(부위 마스킹·상대 모드·가중치 축소 전부 시도 후 반려 — 모션은 전신이 함께 움직인다는 전제로 저작돼 일부만 쓰면 더 어색해진다) → 전신을 쓰되 **가장 정적인 클립**을 고른다. 손인사는 VRMA_03(정적임 실측 최소)을 [scripts/makeWaveVrma.mjs](scripts/makeWaveVrma.mjs)로 개조한 `wave.vrma`(= 우리가 만든 첫 .vrma). 조달 경로·함정 [docs/vrma-adoption.md](docs/vrma-adoption.md)
- [ ] **후속: `moods.ts` 분할** (747줄, 2026-08 기준) — 루프·idle포즈·제스처·타입·MOODS조립 5종 혼재로 응집 낮음. `anim/poses.ts`(idle 3종) / `anim/gestures.ts` / `moods.ts`(타입+톤+조립)로 **순수 이동 먼저**, 로직 변경은 다음 PR. **착수 시점은 다음 제스처/무드 추가 직전** — 지금은 안 아프므로 미리 건드리지 않는다(YAGNI). 현 구성은 `grep -n "^export" src/companion/anim/moods.ts`로 재확인
- [ ] **후속: 테스트 확장** — 순수/준순수인데 미테스트: [store.ts](src/store.ts)(`setCharacter` 리셋·mesh patch) · [channels.ts](src/companion/anim/channels.ts)(채널→본 매핑 테이블) · [meshLabels.ts](src/editor/meshLabels.ts)(`LABEL_RULES` 매칭·fallback, 48줄 순수 규칙 = **최고 ROI**). `moods.ts` 분할 전 characterization으로 쓰면 일석이조
- [x] **에디터 라이브 프리뷰** — 디버그 패널 없는 에디터에서 모션 확인. VRoid VRM엔 내장 클립이 없어 AnimationMixer 경로(빈 패널) 폐기 → 컴패니언과 동일한 절차 엔진(`useAnimator`) 재사용. `store.animPreview` 토글(기본 OFF=정적 편집 보존, 비퇴행), ON 시 ComposerAvatar가 idle 구동. AnimationPanel = 토글 + 무드/제스처/idle포즈 트리거(`companion:*` window 이벤트 공유, DebugPanel과 동일 경로). `useAnimator(…, enabled)` 4번째 인자로 게이팅
- ❌ **폐기: Phase 4 스크린샷/내보내기** (2026-08-04 결정) — 초기 로드맵의 플레이스홀더 한 줄이 전부로, **명세된 적 없는 항목**이었다. 착수 전 해석을 4가지로 펼쳐 검토: A 캔버스 PNG 캡처 / B 조합 설정 JSON 저장·복원 / C 조립 VRM·GLB 익스포트 / D 컴패니언 투명 PNG. **전부 불필요 판정**. 근거: A·D는 OS 스크린샷으로 대체되고(차별점은 UI 없는 순수 렌더·DPR 고해상도·투명배경뿐인데 그 용도가 없음), C는 MToon·스프링본 보존 문제로 난이도만 높고 사용 맥락이 없으며, B는 아래 관찰에도 불구하고 요구되지 않음. **원칙②(실질 개선) 미달 → 안 만드는 것이 정답.** 오프라인 스크린샷이 필요하면 이미 있는 [scripts/renderThumbs.mjs](scripts/renderThumbs.mjs)(puppeteer + `?thumb=`) 경로를 쓴다.
  - 📌 **부수 관찰(미해결로 남김)**: 영속성이 전무하다(`persist`/`localStorage` grep 0건). 새로고침하면 파츠 조합·메시별 색·셰이더·조명·그레이딩이 전부 초기값으로 소실된다. B가 이를 풀 수 있었으나 기능 자체가 불필요 판정이라 **의도적으로 남겨둔 상태**다. 향후 이 소실이 실제 불편으로 드러나면 그때 재검토(=신규 제안, 폐기 번복 아님).
- 보류: per-제스처 손가락 매핑 — 300×400 프레임에선 지엽적이라 스킵 (전역 편안한 손으로 충분)

## TalkingHead 포팅 로드맵

TalkingHead 1.3 소스(3,994줄) 분석 결과, 핵심 기능 전부 VRM으로 재현 가능. 일부는 VRM이 우위.

### VRM 실측 데이터 (male_sample.vrm 파싱 결과)

- **VRM 1.0**, preset expressions 14종: happy/angry/sad/relaxed/surprised + aa/ih/ou/ee/oh + blink/blinkL/R + neutral
- **lookAt type: bone** — 눈동자 본 제어 네이티브 (`vrm.lookAt.target = camera` 한 줄)
- **springBones 내장** — 머리카락/옷 물리 자동 (`vrm.update()`가 처리, TalkingHead엔 없는 기능)
- **face morph 57개** — `Fcl_BRW_*`(눈썹), `Fcl_EYE_*`(눈), `Fcl_MTH_*`(입) 부위별 감정 모프 → ARKit 셰이프 조합 기반 무드 표현 재현 가능

### 진행 순서 (의존성 기준, 알파벳순 아님)

| 순서 | 단계                      | 내용                                                                                                                                                                                                                                                             | 의존성    | 권장 모델 |
| ---- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------- |
| 1    | ✅ A. 시선                | `vrm.lookAt.lookAt()` 직접 호출 + rangeMap 보정(수평 inputMax 50) + center/glance 2상태 사케이드                                                                                                                                                                 | 독립      | Sonnet    |
| 2    | ✅ D. 립싱크 업그레이드   | `lipsyncEn.ts` 글자 기반 음소 분해 + `visemeApplier.ts` 이중 경로 (모음→expressionManager / 자음→Fcl_MTH_Close 등 직접 조작). `registerExpression()` 불필요 — 모프 비중복으로 충돌 없음                                                                          | 독립      | Fable     |
| 3    | ✅ B. 애니메이션 스케줄러 | `anim/` 서브시스템 — animFactory(템플릿→클립) + clock 기반 보간 + gaussian + idle/speaking 분기. **hold-last**(클립 미기록 채널 직전값 유지)로 끊김 제거. 클립별 `ease`(sigmoid 강도)                                                                            | 기반 코드 | Opus      |
| 4    | ✅ C. 포즈 전환           | 6종 상반신 체중이동(Spine 회전 → Head/팔/Chest FK 상속 → 전신 흔들림). 진폭↑, 3~10초 전환으로 적극적 idle. 머리도 70% 미동/30% 둘러보기 alt                                                                                                                      | B 필요    | Opus      |
| 5    | ✅ E. 제스처              | FK(IK 미사용) 발화 제스처 **10종 세트** — 팔 주도/머리 주도(끄덕·갸웃)/다가서기·물러서기/몸통 기울임/손가슴. 발화 시작 시 랜덤 1개(확률 0.6) + **DebugPanel 수동 트리거**(`companion:gesture` 이벤트). out-hold-back + ease 2.5. 전역 편안한 손(손가락 curl 1회) | B 필요    | Opus      |

### D 단계: 합성 viseme 레시피

VRM preset은 입 모양 5개(aa/ih/ou/ee/oh)지만, VRoid 모델의 추가 입 모프를 조합해 런타임 확장:

| Oculus viseme | 합성 레시피 (VRoid 모프)                  |
| ------------- | ----------------------------------------- |
| PP (b/p/m)    | `Fcl_MTH_Close` 1.0                       |
| FF (f/v)      | `Fcl_MTH_Close` 0.5 + `Fcl_MTH_Small` 0.4 |
| SS (s/z)      | `Fcl_MTH_I` 0.4 + `Fcl_MTH_Small` 0.3     |
| DD/nn/kk      | `Fcl_MTH_I` 또는 `Fcl_MTH_E` 저강도       |
| CH            | `Fcl_MTH_U` 0.5 + `Fcl_MTH_I` 0.3         |
| sil           | 전부 0                                    |
| aa/E/ih/oh/ou | preset 그대로                             |

- 구현: `expressionManager.registerExpression()` — 모델 파일 수정 불필요
- **이식성 필수**: `Fcl_MTH_*`는 VRoid 명명 규칙. 비VRoid 모델 대비 모프 이름 감지 → 없으면 preset 5개 fallback

### 알려진 한계 (수용)

- TH/RR viseme: 혀 지오메트리가 모델에 없어 근사치 — Blender 수작업 필요라 스킵
- 콧잔등 등 ARKit 미세 모프 부재 — 300×400px 오버레이에선 식별 불가
- IK(`touchAt`)는 스킵 — three.js CCDIKSolver로 가능하나 니치 기능

## 주의사항

- **개발 원칙** (신기능 시 준수): ①비퇴행 — 기존 동작 feature를 저해 금지. ②실질 개선 — "개발만 하면 됨" 금지, 체감되는 개선이어야. (rim·emission 컷, 그레이딩 화면 레이어 채택, Phase 4 폐기가 이 원칙의 사례)
- **문서 작성 기준** (docs/ 비대화 방지, 2026-08-04): ⓐ**git이 이미 기록한 것은 문서로 남기지 않는다** — 대체된 문서는 아카이브 배너보다 **삭제**가 낫다(`git log`에 있다). ⓑ**CLAUDE.md 한 줄로 들어가면 문서를 만들지 않는다** — 함정·불변식이 payload고 나머지는 서술이다. ⓒ`/project-methodology` **스킬 references와 중복되는 로컬 사본 금지**(스킬이 세션마다 원본을 싣는다). ⓓ판단 기준: "이 문서가 **다음 세션의 결정을 바꾸는가**?" 아니면 안 만들거나 버린다. ⓔ**새 문서는 이 파일에서 링크한다** — 미링크 문서는 새 세션이 발견하지 못해 사실상 없는 것과 같다
- **현행 진단·계획 문서**: [docs/project-diagnosis-2026-08.md](docs/project-diagnosis-2026-08.md)(**⏳ 2026-08-31 만료 후 삭제** — 살아있는 할 일은 위 로드맵 `[ ]`로 이미 이전됨) · [docs/concepts.md](docs/concepts.md)(이 프로젝트에 쓰인 수학/3D 개념 설명)
- **테스트 관례**: 소스 옆 `*.test.ts` 콜로케이션. vitest 심볼은 `import { describe, it, expect, vi } from 'vitest'`로 **명시**(전역 설정 없이 tsc 통과). 스케줄러는 `Math.random` 의존 → 테스트는 `vi.spyOn(Math,'random')` 고정 또는 스칼라(비-ranged) 클립으로 결정적 입력 사용. 대상은 순수 로직만(시각/렌더·React 글루는 수동 영역)
- VRM CORS → `public/avatars/`에 위치시켜 same-origin 서빙
- Three.js v0.170.x 고정 — drei v9, @pixiv/three-vrm v3 호환
- Zustand에 Three.js 객체(VRM, Object3D) 절대 넣지 말 것 → module singleton 사용
- `vrm.update(delta)` 매 프레임 필수 — 없으면 springBone 물리(머리카락/옷)·lookAt·표정 정지
- KTX2Loader 타입 충돌 (drei three-stdlib vs @types/three) → `loader`, `parser` `any` 캐스트
- VRM 파츠는 Face*(merged), Body*(merged) 등 통합 메시 → **임의 업로드 VRM은 진정한 파츠 교체 불가**(merged). 에디터 조립은 이걸 풀려고 authored 베이스+파츠 라이브러리로 전환: 외주가 베이스 위에 스키닝한 모듈 파츠(GLB/VRM)를 런타임 rebind/graft로 조립(`src/editor/partLoader.ts`). 컨벤션 락은 authored 경로에만 적용

### 에셋 조립 엔진(src/editor/) 불변식 — 신규 파츠/로더 수정 시 준수

- **base 불가지 로더**: `load*(url, baseVrm)` 시그니처 유지 — 새 기능도 baseVrm/스펙을 파라미터로 받게. 캐릭터(base) 추가는 `constants.ts` `CHARACTERS[]`에 1줄(베이스별 `{baseUrl, catalog}`)
- **컨벤션 락(`BASE_SPEC`)**: VRM1.0·54본·`J_Bip_*`·A-pose·신장 1.756m·MToon. 파츠가 어기면 rebind 깨짐. 외주 사양은 composer `ASSET_SPEC.md`
- **rebind/graft**: 외부 SkinnedMesh skinIndex는 자기 skeleton.bones 인덱스 → 같은 순서로 base 본 치환 + boneInverses 재사용. base에 없는 보조 본(소매 J*Sec*\*, 눈 본)은 부모 아래로 graft 후 rebind 매칭. 스프링 헤어는 base springBoneManager에 addJoint 병합 → `vrm.update(delta)` 한 번에 같이 돔(이중 호출 금지)
- **MToon 통일**: 옷 GLB는 prune으로 PBR 로드 → 런타임 `toMToon` 변환(shade≈base×0.87, toony 0.95)으로 base 툰과 톤 일치. 아웃라인은 의도적 미부착(촘촘한 의류서 뭉침)
- **seam(meshInfos)**: 파츠 add/remove 후 `setMeshInfos(collectMeshInfos(base))` 재수집 — 색 패널·ShaderPanel(`[vals, meshInfos]` 의존)이 새 파츠 인지. ComposerAvatar가 슬롯 load 성공 직후 호출. 리스트 표시명은 머티리얼명 규칙([meshLabels.ts](src/editor/meshLabels.ts))으로 부위 라벨화(미매칭 fallback=원본명). **파츠 로더가 숨긴 base 메시**(얼굴 교체 시 base 얼굴)는 `userData[SHADOWED_BY_PART]` 표식으로 `collectMeshInfos`가 제외 → swap 얼굴과 중복 행·가시성 이중 소유 토글 충돌 차단(로더가 가시성 소유, dispose 시 복원+표식 해제)
- **slot diff + genRef**: 카테고리 슬롯당 1개 active. 빠른 연속 선택은 genRef 토큰으로 늦게 끝난 로드 폐기(레이스 가드). 캐릭터 전환은 `<ComposerAvatar key={characterId}>` remount + dispose의 `useGLTF.clear(baseUrl)`

### 애니메이션 스케줄러(anim/) 불변식 — 신규 동작 추가 시 준수

- **채널 단일 소유**: 한 채널은 한 클립만 기록(분리). 충돌나는 본은 FK 계층 또는 base+delta로 해결 — 포즈=Spine, 호흡=Chest.x, 제스처몸통=Chest.x(leanX)/y/z, idle머리=Head.rotate*, 제스처머리=Head.g*(idle 위에 합성). 자식 본이 부모 회전 상속
- **hold-last**: `tick`은 baseline이 아닌 직전 출력(live)에서 시작 → 클립 미기록 채널은 유지. 동작 종료 시 vs를 rest로 끝내야 복귀(안 그러면 그 자세로 멈춤)
- **VRM normalized 본 회전축 (male_sample 전부 시각 검증)**:
  - UpperArm `z`=프론탈 들기/내리기(팔내리기 ∓1.3), `x`=앞뒤 스윙(**음수=앞**/양수=뒤)
  - LowerArm 팔꿈치굽힘=`z`(왼쪽−/오른쪽+, ~−1.7로 손이 가슴까지). **X/Y 아님**
  - ⚠️ `elbow.x`/`elbow.y`는 **롤이 아니다** — 팔을 내렸을 때만 롤처럼 보인다. 팔꿈치를 접은 뒤엔 하완을 **휘두른다**(실측: 손이 허리↔목으로 이동)
  - **굴곡된 팔의 롤은 euler로 표현 불가** — `R=Rx·Ry·Rz`라 굴곡(z)이 안쪽에 먼저 적용되고 x·y는 **부모 고정축** 기준으로 돈다. 손바닥 방향(회외)·상완 내외회전은 반드시 **`*.twist` 채널**(뼈 길이축 axis-angle을 euler 뒤에 post-multiply, [channels.ts](src/companion/anim/channels.ts))로. 기본 0 = 기존 동작 바이트 동일
  - Head `x`=숙임(끄덕), `y`=턴, `z`=기울임(갸웃). Chest `x`=호흡/앞뒤린·`y`=턴·`z`=좌우린
  - 손가락 curl=proximal/intermediate `z`(좌−/우+). 전역 편안한 손은 `Channels` 생성 시 1회 설정(클립이 안 건드려 유지)
- **카메라 상단**: 본 추정 금지 → `Box3.setFromObject(scene).max.y`(헤어 실제 끝). 머리 잘림 방지
- **컴패니언 해상도**: 오버레이가 에디터보다 거칠어 보이는 건 **버그 아님** — 고정 300×400에 같은 아바타를 그려 백버퍼 픽셀이 ~3배 적고(dpr 동일), fov 28 클로즈업이 이를 증폭한다. 또렷하게 하려면 `<Canvas dpr={[1,2.5]}>`로 **상한만** 올린다 — `DprGovernor`가 `initialDpr × factor`로 계산하므로 거버너와 충돌하지 않고 맞물린다(여유 시 또렷 / 부하 시 자동 강하)
- **이징**: 짧은 동작(제스처)은 `ease: 2.5~3.5`(완만), 기본(snap)은 blink/idle용. 각진 로봇 느낌은 ease 낮춰 해결
- **손동작은 육안 아닌 수치로 검증** ([probe.ts](src/companion/anim/probe.ts) · `npm run probe`): 팔 기하를 **Hips 로컬**로 재서 술어 판정(흔들림 주축·상완 정지도·하완 전방·손 높이·상완 이격). 손인사 5회 실패가 전부 "덜렁덜렁" 같은 육안 표현이라 수렴 못한 데서 도입([docs/wave-gesture-attempts.md](docs/wave-gesture-attempts.md)). 값 바꾸고 `npm run probe -- --gesture <i>` 로 즉시 판정 — 사람이 봐줄 필요 없음
  - ⚠️ **`useMotionProbe`는 `vrm.update(delta)` 다음에 등록**(R3F는 등록 순서=실행 순서) — 안 그러면 스프링본 반영 전 자세를 잰다. 기준계가 Hips인 이유는 호흡(Chest)·포즈(Spine)가 Hips를 안 돌려서 — Chest 기준이면 호흡이 `hand.z`에 노이즈로 섞인다
  - 지표 9종: 흔들림 주축·이동폭(둘 다 **손끝** 기준 — 손목 회전은 손목 관절을 못 움직여 손목에서 재면 항상 0) · 상완 정지도 · 하완 전방 · 손 높이 · 상완 이격 · **몸통이격**(하완이 몸통에 파묻힘) · **손바닥 바깥/정면**(palmOut/palmFwd — 인사는 정면이 목표, 측면만 키우면 손이 날로 서서 안 보임)
  - 플래그: `--wave`(손인사) · `--gesture 1,2,3`(한 세션에서 일괄 — vite 기동 1회) · `--char female1`(**캐릭터마다 값이 다르다, 양쪽 검증 필수**) · `--wait`(팔 드는 전환 구간 제외; 포함하면 어떤 동작도 '상완 덜렁거림'으로 불합격)
  - **프로브가 못 재는 것 = 자세가 인사처럼 보이는가.** 지표 6개를 다 통과하고도 참고 이미지와 전혀 다른 자세('만세')였던 적이 있다 → 눈=방향 교정 / 프로브=회귀 감시로 역할을 나눈다. 필름스트립 [scripts/waveShots.mjs](scripts/waveShots.mjs)(`--char`·`--gesture` 지원, DebugPanel 자동 숨김)
  - **튜닝 루프 = 탐색은 `npm run probe:tab`(4~6초) / 확정은 `npm run verify`**(vitest + 양 캐릭터 wave 프로브). 실측상 `npm run probe` 30초 중 **27초가 콜드스타트**(vite 기동·puppeteer·12MB VRM 로드)고 측정 구간은 3초뿐 — [scripts/probeAttach.mjs](scripts/probeAttach.mjs)는 전용 헤드리스 크롬 하나를 띄워두고 로드된 탭을 재사용해 그 27초를 1회 비용으로 접는다(`npm run dev` 선행 필요). 측정·판정 로직은 페이지 안(`useMotionProbe`)이라 **동일**하고, 판정도 exit code 로 나간다(`probeMotion.mjs:173`과 같은 규약)
    - **브라우저 손으로 띄우지 말 것** — 스크립트가 기동·재사용·15분 유휴 자동종료까지 관리한다. 수동으로 남기면 크롬 9프로세스(≈1.1GB)가 다음 세션의 유령이 된다(실제로 다른 프로젝트가 남긴 9222 headless `--disable-gpu` 크롬에 붙어 WebGL 없이 63초를 날린 적 있음 → 그래서 포트가 아니라 **user-data-dir 로 신원을 확인**하고 남의 것이면 붙지 않는다)
    - **dev 서버도 신원으로 찾는다** — 5173은 vite 전역 기본값이라 번호만 믿으면 남의 프로젝트 서버를 조용히 잰다. [vite.config.ts](vite.config.ts) `probe-dev-server-identity` 플러그인이 `GET /__probe_id` → `{root, pid}` 로 응답하고, 프로브가 사람 대역을 훑어 **root가 이 저장소인** 서버를 고른다(포트가 5174로 밀려도 따라감). ⚠️ 파일에 기록을 남기는 방식은 **낡은 기록이 두 방식으로 깨져 폐기**했다(①사용자 dev가 IPv6면 일회용 서버가 IPv4로 나란히 붙어 덮어씀 ②config 수정 시 재시작 경합). 살아있는 서버에게 직접 물으면 낡은 상태가 존재할 수 없다
    - ⚠️ **포트 대역을 갈라 쓴다 — 5173~5189는 사람의 `npm run dev` 몫**(vite는 점유 시 5173부터 위로 올라간다), **스크립트 일회용 서버는 5190대**(probeMotion 5190 · waveShots 5191 · vrmaShots 5192 · renderThumbs 5193). 겹치면 `npm run probe` 가 도는 중에 `probe:tab` 이 그 일회용 서버에 붙는다 — **같은 저장소를 서빙하므로 신원 검사를 그냥 통과한다.** 새 스크립트를 추가할 땐 5190대에서 고를 것
    - **낡은 코드를 잴 수 없다** — `--no-reload`를 줘도 `src`/`public/animations`/`public/avatars`의 mtime이 페이지 `performance.timeOrigin`보다 새로우면 강제 리로드. HMR 반영 여부는 밖에서 확인 불가 + R3F 씬은 HMR 후 상태가 어긋나므로 **낡았을 가능성이 있으면 리로드**(오판을 안전한 방향으로). 또 dev 서버를 재기동하면 모듈 해시가 바뀌므로 `setCacheEnabled(false)` 필수 — 안 하면 부팅이 멈추고 증상은 "ready 도달 실패"로만 보인다
    - ⚠️ **완료 선언은 여전히 `npm run verify`** — `ProbeResult`에 조건(로드 후 경과·트리거 후 경과)이 없어 **프로토콜을 건너뛴 수치와 지킨 수치가 화면상 구별되지 않는다**. `probe:tab`은 프로토콜을 코드로 강제하지만, 브라우저에서 손으로 이벤트를 쏜 수치는 방향 판단 전용
  - ⚠️ **임계값은 자동 조정되지 않는다** — `WAVE_TARGETS`는 박힌 상수라 사람이 손으로만 바뀐다. **PASS를 얻으려고 임계를 낮추는 것 금지**(측정기를 끄는 것과 같다). "물리적으로 도달 불가능한 기준이었다"는 실측 근거가 있을 때만 조정하고, **조정 사실과 근거를 반드시 보고**한다. 요구받아도 두 경우를 구분해 제시한 뒤 판단을 받을 것 — 상세 [docs/wave-gesture-attempts.md](docs/wave-gesture-attempts.md) 「임계값 조정 규율」
- **VRMA 레이어 = 이산 제스처, idle 은 절차가 계속 소유** ([anim/vrma/](src/companion/anim/vrma/)): `AnimationMixer`가 humanoid 본을 통째로 덮어쓰므로 그냥 멈추면 마지막 자세에서 **튄다**. three.js `fadeOut`도 답이 아님 — 블렌드 상대가 액션 시작 시점의 **얼어붙은** 스냅샷이라 그 사이 움직인 절차 레이어와 어긋난다. → 매 프레임 **①절차 결과 스냅샷 → ②mixer 덮어쓰기 → ③가중치 w로 스냅샷 쪽 slerp**(w: 0→1→1→0, smootherstep). 상대가 **살아있는 절차 출력**이라 호흡 위상까지 맞춰 복귀. w=0이면 기존 동작과 동일(비퇴행)
  - **소유권 이전 = 초기화 지점** — `action.stop()` 이 부르는 three.js `restoreOriginalState` 가 바인딩된 본 **전부**를 액션 시작 시점 값으로 되돌린다. ①절차가 **안 쓰는** 본(Hips·목·어깨·다리·손가락)은 복귀 목표를 제스처 직전 자세(rest0)로 둬서 restore 를 무효화(직전 출력으로 두면 목표가 자기 자신이라 VRMA 자세에 머물다 22° 점프) ②절차가 **쓰는** 본은 `stop()` **직후 최종 자세를 다시 써 넣어** 무효화 — 안 하면 그 한 프레임만 rest0 로 튀어 **손이 19cm 왕복하는 1프레임 블링크**가 화면에 나간다(R3F는 useFrame 다 돌고 렌더). 소유 판별은 "직전에 우리가 써 넣은 값 그대로인가"로 런타임에(채널 목록 복사 금지 — 한쪽만 바뀌면 조용히 어긋남)
  - **부분 추출 금지** — 부위 마스킹/상대 모드/가중치 축소 전부 반려. VRMA는 전신 동시 운동 전제(실측: VRMA_02의 hips 앞숙임 +19~~30°와 head 젖힘 −16~~−25°가 **짝**이라 하나만 가져오면 균형이 깨짐). 대신 **정적인 클립을 골라 전신 사용** + `hipsPosition` 트랙만 제거(고정 상반신 프레이밍 보호)
  - **흔들기 축은 월드 기준** — 로컬 축은 자세 종속이라 예측 불가(실측: 손목 로컬 z=앞뒤 / x=좌우지만 폭 0.013로 임계 미달 / 월드 z=좌우 0.082 통과). 저작 스크립트가 부모까지 월드 회전을 FK 누적해 변환 후 pre-multiply
  - **정지 프레임으로는 depth와 좌우를 구분 못 한다** — 필름스트립으로 고른 축이 프로브에서 앞뒤 흔들기로 판명된 적 있음. 손동작은 반드시 `npm run probe`로 잰다(측정 창은 클립 타이밍에 맞출 것 — 창이 클립보다 길면 복귀 구간이 섞여 전부 깨진다)
  - **체형 차이는 리타게팅이 안 없앤다** — 자세는 맞춰주지만 팔 길이가 달라 이동폭은 다르게 나온다(같은 30°에서 남자1 0.131 / 여자1 0.096). **양 캐릭터 프로브 필수**
- **모션 레이어 = 데이터 무변경 소급 적용**: 자연스러움은 개별 클립 저작이 아니라 **스케줄러/apply 레이어**에서 전 클립에 소급 적용한다. 새 파라미터는 **기본값 no-op**(off일 때 기존 출력 바이트 동일)으로 두고 `useAnimator`에서만 활성 → 테스트는 config 미지정=off로 비퇴행 고정([scheduler.test.ts](src/companion/anim/scheduler.test.ts))
  - **overlap(시차)**: `MotionConfig.overlap`(현재 35ms) × `channelDepth`(torso 0 · arm/head 1 · elbow 2)만큼 채널 시작을 지연 → 몸통→팔→손 proximal-to-distal lag. `tick`은 채널별 유효시각(`et = clock − offset`)으로 세그먼트를 **개별 탐색**하고 클립 수명은 `maxOffset`만큼 연장. **채널 소유·hold-last 불변**(타임라인만 밀림)
  - **smooth(정착)**: `MotionConfig.smooth`(현재 0.7)로 본 채널 이징을 `baseEasing`↔`smootherstep` 블렌드. **오버슈트/anticipation 금지** — 시도 후 "각진 군인" 느낌으로 반려됨([[motion-smoothness-not-overshoot]]). 부드러움은 오버슈트가 아니라 양 끝 도함수 0으로 얻는다
  - **얼굴 채널 제외**: `isFacial`(blink/`emo.*`)은 overlap·smooth 미적용, 항상 sigmoid — 표정은 이벤트와 **동기**돼야 함
  - **micro-drift**: [channels.ts](src/companion/anim/channels.ts) `DRIFT` 맵(채널별 [주파수, 위상, 진폭≈0.005~~0.008rad])의 초저주파 sine을 `apply(state, t)`에서 최종 euler에 상시 가산 → hold 구간(제스처 정지·포즈 유지)도 살아있음. 활성 모션 땐 진폭에 묻혀 **hold 감지 불필요**. ⚠️ `tick` 반환 state는 `scheduler.live` **동일 참조 → mutate 금지**(drift는 euler 로컬에만 가산, hold-last 비오염). 제외=머리(이미 미동)·얼굴(표정 동기)·`chest.inhale`(이미 진동). 주기는 서로 안 맞아떨어지게(≈5~~12s) 배치해 반복감 제거. `DRIFT_AMP=0`이면 완전 무영향
- **lookAt rangeMap**: VRoid 기본 inputMax 90은 정면 시선이 거의 0 → `useLookAt`에서 수평만 보정. 수직 보정 시 눈 내리깖(카메라가 가슴 높이라 하향각 포화)
- **제스처 추가**: `anim/moods.ts` GESTURES 배열에 `{label, ease, dt:[out,hold,back], vs:[out,hold,rest]}` 항목 추가 → DebugPanel 버튼 자동 생성. 손은 상반신 프레임 하단이라 큰 손짓보다 절제된 동작이 적합
- **held 표정 vs 일회성 표정**: 한 채널은 둘 중 하나만 소유. held(무드 유지)는 `MOODS[m].expression` → `moodExprClip`(EMOTION*CHANNELS 중 `ONESHOT_EMOTION_CHANNELS` 제외분). 일회성(진입 1회 후 0 복귀)은 `useAnimator`의 전용 클립 + 해당 채널을 held에서 제외. 현재 일회성: surprised 입벌림(`emo.mthSurprised`/SURPRISE_GASP), happy 눈웃음(`emo.eyeJoy`/HAPPY_EYE). 발화 내내 같은 부위가 고정되면 안 되는 표정은 이 패턴으로(눈감김·입벌림). happy처럼 부위 결합 preset이 문제면 부위 모프(`Fcl_MTH*_`/`Fcl*EYE*_`/`Fcl*BRW*\*`)로 분해
- **idle 팔 포즈 (armPose 루프)**: arm/elbow 채널 단독 소유. idle=포즈 alt, **speaking=rest로 양보** → 발화 제스처가 큐 후순위로 per-channel 승(루프는 생성 시 add, 제스처는 발화 시 add). 포즈 추가 시 **양팔 전 채널 명시**(잔상 방지) + `IDLE_ARM_POSES`에 넣으면 DebugPanel `companion:idlepose` 버튼 자동 생성. 몸통 둘러보기는 `pose` 루프(spine 단독) alt로 추가(머리 FK 상속). 상세 [docs/idle-arm-plan.md](docs/idle-arm-plan.md)
- **컬러 그레이딩 = 화면 레이어**: EffectComposer 포스트프로세싱은 모델 머티리얼 비훼손(개발 원칙1=비퇴행). 컴패니언 투명배경 알파 보존 확인됨. `store.grading` 디폴트=무변화(0). 사진편집식 톤은 머티리얼 튜닝(emission 등) 아닌 이 레이어로 해결
