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
**R3F v8 train 고정** — React 18 → @react-three/fiber v8 → drei v9. v9(React 19)로 안 올림(이득 없음, three-vrm은 양쪽 호환). 포스트프로세싱도 v8 호환 `@react-three/postprocessing@2.17` 핀 — **최신 v3는 R3F v9(React 19) 요구**라 올리면 기차가 깨진다.

## 프로젝트 구조 (역할 지도)

파일 단위 목록은 두지 않는다 — 코드를 읽으면 알 수 있고 금방 낡는다. **각 디렉터리가 무엇을 소유하는지**만 적는다.

| 위치 | 소유하는 것 |
| --- | --- |
| `src/editor/` | **에셋 조립 엔진**(에디터·컴패니언 공유). `useAssembledVrm`(base 로드+슬롯 diff) · `partLoader`(rebind/graft) · `appearance`(셰이더·색) · `constants`(CHARACTERS 카탈로그) |
| `src/companion/` | 오버레이·립싱크·TTS·시선. 게임 이벤트에 반응하는 VTuber 레이어 |
| `src/companion/anim/` | **절차 애니메이션**. `scheduler`(클립 보간) · `channels`(채널→본 + 파생 + 동요) · `moods`(루프·제스처·무드) · `vrma/`(이산 제스처 레이어) · `probe`/`motionProfile`(수치 검증) |
| `src/components/` | 공유 씬 요소(조명·그레이딩)와 에디터 패널 |
| `scripts/` | 오프라인 파이프라인(파츠 추출·썸네일)과 검증 하네스(프로브·필름스트립). 전부 로컬 전용 |
| `public/avatars/` | authored 베이스 + 모듈 파츠 + 썸네일. `<char>/parts/` 원본은 **gitignore** |
| `public/animations/` | VRMA 모션 — 공식 7종 + `wave.vrma`(우리가 만든 개조본). 전부 커밋 |

진입점은 [App.tsx](src/App.tsx)(에디터/컴패니언 전환)와 [main.tsx](src/main.tsx)(`?thumb=` 썸네일 단독 렌더 분기).
상태는 [store.ts](src/store.ts) 하나 — **Three.js 객체는 절대 넣지 않는다**(아래 주의사항).
## 아바타 소스

| 소스         | 무료    | 비고                             |
| ------------ | ------- | -------------------------------- |
| VRoid Studio | ✅      | VRM 직접 로딩 가능 (변환 불필요) |
| Avaturn      | ❌ 유료 | RPM 대안                         |

**⚠️ Ready Player Me 사용 불가** — 2026년 1월 Netflix 인수 후 서비스 종료.
**GLB 사용 시 주의** — @pixiv/three-vrm는 .vrm 파일 로딩 전용. GLB는 VRM 메타데이터 없음.

## 에셋 추가 워크플로 — `asset-assembly` 스킬

새 파츠(옷·헤어·얼굴)·캐릭터 추가는 소스 VRM 배치 → `extractParts.mjs` 잡 1줄 → `constants.ts`
카탈로그 1줄 → `npm run assets` → **런타임 산출물·썸네일 커밋**(`parts/` 원본은 gitignore).
단계별 함정·조립 엔진 불변식은 `asset-assembly` 스킬에 있다.

⚠️ **Vercel 빌드에선 추출이 불가능하다**(`parts/` 미커밋) → 산출물을 커밋해야 배포에 반영된다.

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

**rim 계열 제거됨** — MToon 핵심 아님 + 작은 오버레이서 인지 불가. emission/outline색/shadingShift도 모델 파싱 검증 후 폐기(원칙1·2 미달, 실측 근거는 메모리 [[shader-features-verified-findings]]).
⚠️ **머티리얼 파라미터의 전역 덮어쓰기는 원칙1 위반이다** — VRoid는 값을 **파츠별로 다르게 저작**한다(outline색: 머리카락만 청록 `[0.157,0.408,0.35]` / shadingShift: face 0.9 ~ tops −0.35). 전역 슬라이더는 이 authored 값을 뭉갠다. 새 MToon 파라미터를 노출하려면 **파츠별 + 실제값을 디폴트로 읽기**(`collectMeshInfos` 패턴)여야 한다.
📌 **미해결(기존 부채)**: 현 ShaderPanel의 전역 `toony=0.9` 디폴트가 로드 시 tops(0.35)·hair(0.8) authored 값을 덮어쓴다 = 약한 원칙1 위반. 셰이더 패널을 손볼 때 "실제값 디폴트 읽기"로 교정 가능.
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
- **armPose 팔**: 차렷+미세이동 / 허리짚기 / 뒷짐 / 앞으로모으기. 발화 시 rest로 양보(제스처가 팔 소유) — 불변식은 아래 「idle 팔 포즈」

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

## 구현 로드맵

> 완료 항목은 **무엇을 했는지가 아니라 다음 판단에 필요한 것만** 남긴다(문서 작성 기준 ⓐ — 경위는 `git log`). 재시도를 막아야 하는 반려·함정은 아래 「불변식」 절로 승격돼 있다.

- [x] Phase 1~3: Vite + R3F + drei · VRM 로딩(@pixiv/three-vrm) · 머티리얼 색상/파츠 show-hide(meshInfos) · MToon 셰이더 파라미터 UI
- [x] 컴패니언 모드 + DebugPanel — 게임 이벤트 반응, 말풍선, Google TTS, 립싱크, idle 애니메이션
- [x] TalkingHead 포팅 A~E 전 단계 — 시선/사케이드 · 합성 viseme 립싱크 · 애니메이션 스케줄러 · 포즈 전환 · 발화 제스처 10종 · 전역 편안한 손
- [x] **무드 시스템 5종** (neutral/happy/sad/surprised/angry) — 이벤트별 표정 전환(`emo.*`→preset) + 제스처 톤 + 루프 톤 분기 + 발화 후 neutral decay. 변별 폴리싱(sad/angry 눈썹 모프 · surprised 입벌림 gasp · happy 눈매 일회성 분해). 표정↔립싱크 입 충돌은 **가산·비파괴로 검증됨**
- [x] TTS 성별 음성 선택 (VRM에 성별 필드가 없어 에디터 수동 선택, `TTS_CONFIG`=lang×gender) · 에디터 조명 컨트롤(공유 `SceneLights`) · 컬러 그레이딩 포스트프로세싱
- [x] **idle 자연스러운 팔 동작 (FK)** — armPose 루프(차렷/허리짚기/뒷짐/앞으로모으기) + 몸통 둘러보기. IK는 보류
- [x] **에디터 = 에셋 조립 (avatar-composer 흡수)** — 임의 VRM 업로드 폐기(**authored-only**). `CHARACTERS[]` base + 모듈 파츠 카탈로그 조립(`src/editor/`). 컴패니언도 같은 `useAssembledVrm`을 써서 에디터 조합 결과가 그대로 보인다(DebugPanel 업로드만 `catalog=[]` 오버라이드로 잔류)
- [x] **오프라인 에셋 파이프라인** — `npm run assets`(extractParts→renderThumbs). **extract·thumbs 둘 다 byte-deterministic 재생성 검증됨** → 산출물이 의심스러우면 지우고 다시 돌려도 안전
- [x] **drei 로딩 인디케이터 + 컴패니언 FPS 적응형 DPR**(`DprGovernor` — FPS 하락 시 오버레이 해상도를 낮춰 게임 프레임 보호)
- [x] **모션 자연스러움 — 탈로봇** (overlap/smootherstep + micro-drift + idle 자세 다양화)
- [ ] **후속: IK 도입** — 손이 보이는 제스처(손가슴 등) 정밀화. CCDIKSolver 채널 추상화. 상세 [docs/ik-plan.md](docs/ik-plan.md)
- [x] **절차 레이어 리뉴얼 (VRMA 대비 부드러움 격차)** (2026-08-06~10, 0~4단계) — 진단으로 우선순위가 뒤집힌 라운드다: 1순위는 본 커버리지가 아니라 **스케줄러 리드인 보간 결함**이었다(불변식은 [scheduler.ts](src/companion/anim/scheduler.ts) 주석에 실측째로 박혀 있다). 측정 하네스(`npm run motion:stat`) → 보간 수정 → `armRelaxed` 분포 → 타이밍 1차 → 본 커버리지(구동 본 7→11) → 자세 동요 순. 결과 **본별 정지 비율 52~76% → 10~30%로 VRMA_03 대역(6~31%) 진입**
- [ ] **보류: 리뉴얼 5단계 2차 — 속도·타이밍 폴리싱** — 4단계까지 끝낸 뒤 **육안 게이트 2개**가 남았고, 둘 다 수치로 못 잡아 사람이 봐야 한다: ①4단계 자세 동요로 **부유감**(물 위에 뜬 느낌)이 나는가 ②idle 이 여전히 느린가(1단계 보간 수정으로 전환이 명목 duration을 다 쓰게 되어 실제 2배 길어졌다). 재개 시 필요한 것:
  - **레버는 `dt` 가 아니라 `delay` 다** — 실측상 `delay`(1.5~6s)가 `dt`(0.8~4s)보다 길다. `delay` 축소는 전환 곡선을 안 건드려 **1단계에서 얻은 부드러움을 안 깎고** 최대 각속도도 안 올린다. 1차에서 이미 이 레버로 버스트 상위5% 35.0→30.5%(VRMA 31.6% 상회)
  - **`dt` 축소는 천장이 가깝다** — 최대 각속도가 예산의 95%. 걸리면 예산을 완화하지 말고 '왜 더 빨라야 하는가'를 먼저 답할 것([motionProfile.test.ts](src/companion/anim/motionProfile.test.ts)에 이력째 기록)
  - 부유감이 나면 `DRIFT_AMP`를 0으로 내려 격리한 뒤 **진폭부터** 낮춘다(속도가 아니라)
  - `dt`/`delay` 는 `moods.ts` 의 숫자일 뿐 구조가 아니다 — **언제든 한 줄로 바뀌므로 미뤄도 잃는 게 없다**
- [ ] **후속: 하반신 무게이동** — 현 `pose` 루프는 Spine만 회전(액티브함 구조적 천장). Hips/UpperLeg/LowerLeg 축을 시각 검증한 뒤 `hips.*`/`knee.*` 채널 신설: 한 다리에 체중 → Hips 좌우 이동+회전, 반대 무릎 살짝 굽힘, Spine 보상, `pose` 루프와 연동. FK로 충분(IK와 별개). **신규 본/채널이라 VRMA 「소유 판별」 회귀 위험** → 보류 중
- [x] **손인사(wave)** (2026-08-04) — FK 5회 실패 후 **육안→수치 검증(프로브)으로 바꿔** 완료. 부산물: `handR.*`·`*.twist` 채널, 프로브 지표 9종, `npm run probe` 플래그류. 이후 VRMA판으로 교체됨(절차판은 `companion:wave-proc` 기준선으로 잔류). 실패 5건의 재현·규율 [docs/wave-gesture-attempts.md](docs/wave-gesture-attempts.md)
- [x] **VRMA(표준 모션 포맷) 도입** (2026-08-05) — `@pixiv/three-vrm-animation` + `src/companion/anim/vrma/`. **새 동작 추가 = 파일 떨구고 카탈로그 1줄**(euler 튜닝 없음), 같은 파일이 양 캐릭터 무수정 동작. 손인사는 VRMA_03을 개조한 `wave.vrma`. 조달 경로·함정 [docs/vrma-adoption.md](docs/vrma-adoption.md) — **새 동작 추가 전 필독**
- [x] **인사(greet) = 손인사 + happy 합성** (2026-08-10) — 컴패니언 진입 시 1회 자동. **새 `.vrma` 파일 0개**(`VrmaClipDef.mood`로 본=VRMA / 표정=무드를 겹침)
- [ ] **후속: `moods.ts` 분할** (747줄, 2026-08 기준) — 루프·idle포즈·제스처·타입·MOODS조립 5종 혼재로 응집 낮음. `anim/poses.ts`(idle 3종) / `anim/gestures.ts` / `moods.ts`(타입+톤+조립)로 **순수 이동 먼저**, 로직 변경은 다음 PR. **착수 시점은 다음 제스처/무드 추가 직전** — 지금은 안 아프므로 미리 건드리지 않는다(YAGNI). 현 구성은 `grep -n "^export" src/companion/anim/moods.ts`로 재확인
- [ ] **후속: 테스트 확장** — 순수/준순수인데 미테스트: [store.ts](src/store.ts)(`setCharacter` 리셋·mesh patch) · [channels.ts](src/companion/anim/channels.ts)(채널→본 매핑 테이블) · [meshLabels.ts](src/editor/meshLabels.ts)(`LABEL_RULES` 매칭·fallback, 48줄 순수 규칙 = **최고 ROI**). `moods.ts` 분할 전 characterization으로 쓰면 일석이조
- [x] **에디터 라이브 프리뷰** — `store.animPreview` 토글(**기본 OFF = 정적 편집 보존**), ON 시 컴패니언과 동일한 절차 엔진(`useAnimator`)을 ComposerAvatar가 구동. AnimationPanel 트리거는 `companion:*` window 이벤트로 DebugPanel과 같은 경로. ⚠️ **AnimationMixer 경로는 반려됨** — VRoid VRM엔 내장 클립이 없어 패널이 빈다
- ❌ **폐기: Phase 4 스크린샷/내보내기** (2026-08-04) — 명세된 적 없는 플레이스홀더. 해석 4안(캔버스 PNG · 설정 JSON 저장 · VRM/GLB 익스포트 · 투명 PNG) 전부 원칙②(실질 개선) 미달. **재개 트리거는 "미완 Phase"가 아니라 구체적 용도다** — 그때 신규 제안으로 다룬다. 오프라인 렌더만 필요하면 이미 있는 [scripts/renderThumbs.mjs](scripts/renderThumbs.mjs)(`?thumb=`) 재사용
  - 📌 **미해결로 남긴 관찰**: 영속성 전무(`persist`/`localStorage` 0건) → 새로고침하면 파츠 조합·색·셰이더·조명·그레이딩이 전부 초기화된다. 위 폐기 판정에 따라 **의도적으로 남긴 상태**
- 보류: per-제스처 손가락 매핑 — 300×400 프레임에선 지엽적이라 스킵 (전역 편안한 손으로 충분)

## VRM 실측 데이터 (male_sample.vrm 파싱)

- **VRM 1.0**, preset expressions 14종: happy/angry/sad/relaxed/surprised + aa/ih/ou/ee/oh + blink/blinkL/R + neutral
- **lookAt type: bone** — 눈동자 본 제어 네이티브 (`vrm.lookAt.target = camera` 한 줄)
- **springBones 내장** — 머리카락/옷 물리 자동 (`vrm.update()` 가 처리)
- **face morph 57개** — `Fcl_BRW_*`(눈썹) · `Fcl_EYE_*`(눈) · `Fcl_MTH_*`(입) 부위별 감정 모프
- 수용한 한계: TH/RR viseme 은 혀 지오메트리가 없어 근사 · 콧잔등 등 ARKit 미세 모프 부재(300×400 오버레이서 식별 불가)

> TalkingHead 1.3 포팅(시선·립싱크·스케줄러·포즈·제스처)은 전 단계 완료. 합성 viseme 레시피는
> [visemeApplier.ts](src/companion/visemeApplier.ts) 가 진실이다.
## 주의사항

- **개발 원칙** (신기능 시 준수): ①비퇴행 — 기존 동작 feature를 저해 금지. ②실질 개선 — "개발만 하면 됨" 금지, 체감되는 개선이어야. (rim·emission 컷, 그레이딩 화면 레이어 채택, Phase 4 폐기가 이 원칙의 사례)
- **문서 작성 기준** (docs/ 비대화 방지, 2026-08-04): ⓐ**git이 이미 기록한 것은 문서로 남기지 않는다** — 대체된 문서는 아카이브 배너보다 **삭제**가 낫다(`git log`에 있다). ⓑ**CLAUDE.md 한 줄로 들어가면 문서를 만들지 않는다** — 함정·불변식이 payload고 나머지는 서술이다. ⓒ`/project-methodology` **스킬 references와 중복되는 로컬 사본 금지**(스킬이 세션마다 원본을 싣는다). ⓓ판단 기준: "이 문서가 **다음 세션의 결정을 바꾸는가**?" 아니면 안 만들거나 버린다. ⓔ**새 문서는 이 파일에서 링크한다** — 미링크 문서는 새 세션이 발견하지 못해 사실상 없는 것과 같다
- **현행 문서 5개** (이게 전부 — 완료된 계획서는 삭제한다, 기준 ⓐ·ⓓ): 착수 전 필독 [docs/vrma-adoption.md](docs/vrma-adoption.md) · 재시도 차단 [docs/wave-gesture-attempts.md](docs/wave-gesture-attempts.md) · 미착수 설계 [docs/ik-plan.md](docs/ik-plan.md) · 이식 조사 [docs/tts-model-selection.md](docs/tts-model-selection.md) · 학습 자료 [docs/concepts.md](docs/concepts.md)
  - **모션 계획서는 안 남긴다** — 절차 애니메이션의 함정·실측은 전부 **사용 지점 코드 주석**([scheduler.ts](src/companion/anim/scheduler.ts) 리드인 보간 · [motionProfile.ts](src/companion/anim/motionProfile.ts) 시드 스트림 · [motionProfile.test.ts](src/companion/anim/motionProfile.test.ts) 예산 규율 · [channels.ts](src/companion/anim/channels.ts) 파생 계수)과 위 불변식 절에 있다. 문서로 옮기면 코드와 어긋난다
- **테스트 관례**: 소스 옆 `*.test.ts` 콜로케이션. vitest 심볼은 `import { describe, it, expect, vi } from 'vitest'`로 **명시**(전역 설정 없이 tsc 통과). 스케줄러는 `Math.random` 의존 → 테스트는 `vi.spyOn(Math,'random')` 고정 또는 스칼라(비-ranged) 클립으로 결정적 입력 사용. 대상은 순수 로직만(시각/렌더·React 글루는 수동 영역)
- VRM CORS → `public/avatars/`에 위치시켜 same-origin 서빙
- Three.js v0.170.x 고정 — drei v9, @pixiv/three-vrm v3 호환
- Zustand에 Three.js 객체(VRM, Object3D) 절대 넣지 말 것 → module singleton 사용
- `vrm.update(delta)` 매 프레임 필수 — 없으면 springBone 물리(머리카락/옷)·lookAt·표정 정지
- KTX2Loader 타입 충돌 (drei three-stdlib vs @types/three) → `loader`, `parser` `any` 캐스트
- VRM 파츠는 Face*(merged), Body*(merged) 등 통합 메시 → **임의 업로드 VRM은 진정한 파츠 교체 불가**(merged). 에디터 조립은 이걸 풀려고 authored 베이스+파츠 라이브러리로 전환: 외주가 베이스 위에 스키닝한 모듈 파츠(GLB/VRM)를 런타임 rebind/graft로 조립(`src/editor/partLoader.ts`). 컨벤션 락은 authored 경로에만 적용

### 에셋 조립 엔진(src/editor/) — 상세는 `asset-assembly` 스킬

- **base 불가지 로더**: `load*(url, baseVrm)` 시그니처 유지. 캐릭터 추가는 `constants.ts` `CHARACTERS[]` 에 1줄
- **컨벤션 락(`BASE_SPEC`)**: VRM1.0·54본·`J_Bip_*`·A-pose·신장 1.756m·MToon. 파츠가 어기면 rebind 깨짐
- **seam(meshInfos)**: 파츠 add/remove 후 `setMeshInfos(collectMeshInfos(base))` 재수집 — 색·셰이더 패널이 새 파츠를 인지한다
- rebind/graft·MToon 통일·slot diff 레이스 가드는 스킬 참조

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
  - ⚠️ **drei `<AdaptiveDpr>`는 이 캔버스에서 무동작** — `performance.regress()`를 부르는 주체가 OrbitControls인데 컴패니언엔 없다. 그래서 `<PerformanceMonitor>` 콜백을 `setDpr`에 직결한 `DprGovernor`로 대체했다. 성능 자동조절을 다시 손댈 때 `<AdaptiveDpr>`로 되돌리지 말 것
- **이징**: 짧은 동작(제스처)은 `ease: 2.5~3.5`(완만), 기본(snap)은 blink/idle용. 각진 로봇 느낌은 ease 낮춰 해결
- **손동작은 육안 아닌 수치로 검증** ([probe.ts](src/companion/anim/probe.ts) · `npm run probe`): 팔 기하를 **Hips 로컬**로 재서 술어 판정. 값 바꾸고 `npm run probe -- --gesture <i>` 로 즉시 판정 — 사람이 봐줄 필요 없다. **캐릭터마다 값이 다르므로 양쪽 검증 필수.** 지표·플래그·튜닝 루프는 `motion-probe` 스킬
  - ⚠️ **PASS 를 얻으려고 임계값(`WAVE_TARGETS`)을 낮추지 않는다** — 측정기를 끄는 것과 같다. 조정은 "물리적으로 도달 불가능한 기준이었다"는 실측 근거가 있을 때만, 그리고 **반드시 보고**한다
  - ⚠️ **에이전트는 `npm run dev` 를 임의로 띄우지 않는다**(먼저 사람에게 묻는다) · **`pkill -f vite` 같은 일괄 종료 금지** — 사람이 띄운 서버가 말없이 죽는다. 포트 대역(사람 5173~5189 / 스크립트 5190대)과 브라우저 수명 관리는 `motion-probe` 스킬
- **VRMA 레이어 = 이산 제스처, idle 은 절차가 계속 소유** ([anim/vrma/](src/companion/anim/vrma/)): `AnimationMixer` 가 본을 통째로 덮어쓰므로 그냥 멈추면 **튄다** → 매 프레임 절차 출력을 스냅샷해 가중치 w 로 slerp 복귀(w=0 이면 기존 동작과 동일). 새 동작 추가 = 파일 떨구고 카탈로그 1줄. **소유권 이전·부분 추출 금지·월드 축 등 불변식은 `vrma-motion` 스킬**(새 손동작 전 필독)
- **모션 레이어 = 데이터 무변경 소급 적용**: 자연스러움은 개별 클립 저작이 아니라 **스케줄러/apply 레이어**에서 전 클립에 소급 적용한다. 새 파라미터는 **기본값 no-op**(off 일 때 기존 출력 바이트 동일)으로 두고 `useAnimator` 에서만 활성. **overlap·smooth·본 파생·자세 동요의 상세와 금지사항은 `motion-tuning` 스킬**
- **lookAt rangeMap**: VRoid 기본 inputMax 90은 정면 시선이 거의 0 → `useLookAt`에서 수평만 보정. 수직 보정 시 눈 내리깖(카메라가 가슴 높이라 하향각 포화)
- **제스처 추가**: `anim/moods.ts` GESTURES 배열에 `{label, ease, dt:[out,hold,back], vs:[out,hold,rest]}` 항목 추가 → DebugPanel 버튼 자동 생성. 손은 상반신 프레임 하단이라 큰 손짓보다 절제된 동작이 적합
- **held 표정 vs 일회성 표정**: 한 채널은 둘 중 하나만 소유. held(무드 유지)는 `MOODS[m].expression` → `moodExprClip`(EMOTION*CHANNELS 중 `ONESHOT_EMOTION_CHANNELS` 제외분). 일회성(진입 1회 후 0 복귀)은 `useAnimator`의 전용 클립 + 해당 채널을 held에서 제외. 현재 일회성: surprised 입벌림(`emo.mthSurprised`/SURPRISE_GASP), happy 눈웃음(`emo.eyeJoy`/HAPPY_EYE). 발화 내내 같은 부위가 고정되면 안 되는 표정은 이 패턴으로(눈감김·입벌림). happy처럼 부위 결합 preset이 문제면 부위 모프(`Fcl_MTH*_`/`Fcl*EYE*_`/`Fcl*BRW*\*`)로 분해
  - ⚠️ **모프 강도는 얼굴마다 다르게 저작돼 있다** — VRoid `Fcl_EYE_Joy`가 female 얼굴에선 눈을 덜 감는다. 보이는 얼굴의 **모프 정점 변위를 실측**해 부족분만큼 `Fcl_EYE_Close`를 가산한다(목표 비율 0.62, male류는 boost=0이라 비퇴행). 얼굴 교체마다 lazy 재산출(`channels.ts refreshHappyEye`) — **새 얼굴 파츠를 추가하면 이 경로를 탄다**(별도 작업 불필요하나, 표정이 이상하면 여기부터 본다)
- **무드 톤 분기 = 템플릿 스케일**: 스케줄러엔 `moodName` 차원이 **없다**. `moods.ts` `scaleTemplate()`가 호흡/머리/포즈 템플릿을 무드 톤(tempo/amplitude)으로 재귀 스케일하고, 무드 전환 시 `TONE_LOOP_NAMES` 3종만 remove/재add 한다(hold-last가 스냅을 막음). neutral은 스케일 1×라 **원본 객체를 그대로 반환**(참조 동일 = 비퇴행). armPose/blink는 무드 무관 공유 — 톤을 주려면 이 목록에 넣을지부터 판단할 것
- **idle 팔 포즈 (armPose 루프)**: arm/elbow 채널 단독 소유. idle=포즈 alt, **speaking=rest로 양보** → 발화 제스처가 큐 후순위로 per-channel 승(루프는 생성 시 add, 제스처는 발화 시 add). 포즈 추가 시 **양팔 전 채널 명시**(잔상 방지) + `IDLE_ARM_POSES`에 넣으면 DebugPanel `companion:idlepose` 버튼 자동 생성. 몸통 둘러보기는 `pose` 루프(spine 단독) alt로 추가(머리 FK 상속)
  - ⚠️ **몸 앞을 가로지르는 FK 포즈는 반려됨**(팔짱·한손잡기) — 클리핑 + '손가슴' 제스처와 시각 중복. 비대칭은 허리짚기(L/R)가 담당한다. 새 포즈는 몸을 안 가로지르는 쪽으로
- **컬러 그레이딩 = 화면 레이어**: EffectComposer 포스트프로세싱은 모델 머티리얼 비훼손(개발 원칙1=비퇴행). 컴패니언 투명배경 알파 보존 확인됨. `store.grading` 디폴트=무변화(0). 사진편집식 톤은 머티리얼 튜닝(emission 등) 아닌 이 레이어로 해결
