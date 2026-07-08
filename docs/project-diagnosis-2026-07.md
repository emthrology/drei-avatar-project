# 프로젝트 진단 & 향후 방향 제안 (2026-07)

> **성격**: 실행 계획이 아니라 **진단·제안 문서**. "상태 진단 + 미구현 항목 구현가능성 검토 + 앞으로 나아갈 길 제안".
> 다음 플랜모드 세션의 착수 자료로 사용 — 각 방향에 seam(file:line)을 박아둠.

## Context

로드맵(CLAUDE.md)의 대형 항목은 대부분 완료 상태. 남은 미구현 항목이 소수라, "다음에 뭘 할지"를 정하기 전에 **현 상태를 진단하고 남은 항목의 실제 구현 난이도/가치를 저울질**하는 것이 목적. 개발 원칙(①비퇴행 ②체감 개선)에 비춰 ROI 순으로 방향을 제안한다.

---

## 1. 상태 진단

**결론: 성숙하고 건강한 구조.** 두 도메인(에디터 조립 / 컴패니언 오버레이)이 공유 엔진 위에 서 있고, 인라인 기술부채가 거의 없다(전체 `src/`에 TODO 1개 — `editor/constants.ts:134`).

- **아키텍처**: 조립 엔진 `useAssembledVrm`(에디터·컴패니언 공유) + 절차 애니 스케줄러 `anim/`(scheduler/channels/moods/useAnimator, 채널 추상화로 낮은 결합) + Zustand 단일 상태(`store.ts`, Three 객체 미보관). `refactor-diagnosis.md` 자체 평가 "전반적으로 건강함"이 유효.
- **스택 일관성**: React 18 / R3F v8 / drei v9 / three 0.170 / VRM 3.x 라인으로 의도적 고정. Vitest v4가 유일하게 최신예(주의만).
- **테스트**: 순수 로직 2파일만 — `scheduler.test.ts`, `lipsyncEn.test.ts`. **store·channels·moods·editor 파이프라인·UI는 전부 미테스트**(의도적 — 시각/렌더는 수동 영역, `testing-strategy.md`).
- **문서 위생 이슈**: `drei-opportunities.md`·`canvas-resolution-notes.md`·`refactor-diagnosis.md`가 **삭제된 파일**(`VRMAvatar.tsx`, `AvatarScene.tsx`)을 참조 — composer 리팩토링 이전 작성분. 재사용 전 갱신 필요.

---

## 2. 미구현 항목 구현가능성 검토

### A. Phase 4 — 스크린샷/내보내기 ✅ 쉬움~중 · 체감가치 **높음**
- **현황**: 인앱 스캐폴딩 0. 라이브 Canvas 2개 모두 `preserveDrawingBuffer` 없음 → 지금 `toDataURL` 하면 빈 화면.
  - `editor/EditorScene.tsx:65` `gl={{ antialias: true }}`
  - `companion/CompanionOverlay.tsx:96` `gl={{ antialias: true, alpha: true }}`
- **참고 자산**: 오프라인 썸네일용 `editor/ui/ThumbScene.tsx:95`엔 이미 `preserveDrawingBuffer: true` 사용 — 동일 패턴 재사용 가능.
- **경로**: 에디터 Canvas에 `preserveDrawingBuffer: true` 추가 → 캔버스 내부 컴포넌트에서 `useThree().gl.domElement.toBlob(cb, 'image/png')` → anchor 다운로드. UI는 `components/EditorPanel.tsx:98` 아래 새 `<Section title="내보내기">` 추가(아코디언 관례 준수). 포스트프로세싱(EffectComposer)이 매 프레임 렌더하므로 `preserveDrawingBuffer`면 버튼 시점 캡처가 유효.
- **주의**: preserveDrawingBuffer는 소폭 성능비용 → 에디터만 적용(컴패니언은 오버레이라 후순위). 투명 배경 PNG 원하면 컴패니언(`alpha:true`)에도 확장.
- **가치**: 로드맵 미완 Phase를 닫고, 원칙2(체감 개선)에 정확히 부합. **1순위 추천.**

### B. 무드 5단계 — 루프 톤 분기(moodName) ✅ 중 · 체감가치 중(폴리싱)
- **단일 seam 확인**: `useAnimator.ts:107`이 무드와 무관하게 `MOODS.neutral.loops`를 하드코딩. `MOODS[m].loops`는 전부 동일 `BASE_LOOPS` 참조(`moods.ts:590`). 즉 무드가 바뀌어도 표정·제스처만 바뀌고 루프(호흡/머리/포즈)는 공유.
- **경로**: `BASE_LOOPS` 정적 배열 → `makeLoops(moodName)` 팩토리로(진폭·`dt`/`delay` 스케일). 무드 변경 블록(`useAnimator.ts:131-146`)에서 5개 base 루프를 `scheduler.remove(name)` 후 무드 스케일판 재`add`. 스케줄러가 이름 기반 remove 지원(`scheduler.ts:87`), 루프 이름 안정적(breathing/head/pose/armPose/blink)이라 안전.
- **대안(저터치)**: 스케줄러에 `stateName`과 유사한 `moodName` 차원 추가해 factory 하강(`scheduler.ts:99-108`)에서 분기 — 더 정공법이나 손이 큼. 권장은 위 "루프 재구성" 방식.
- **비퇴행 필수**: neutral 루프 값은 현재와 **바이트 동일** 유지(happy/sad만 스케일).

### C. IK 도입 (CCDIKSolver) ⚠️ 어려움 · 체감가치 낮음 → **지금 보류 권장**
- **임피던스 미스매치**: CCDIKSolver는 `SkinnedMesh.skeleton` 본 인덱스 기반, VRM은 normalized 프록시 본(`channels.ts:142-151`) — 매핑이 실제 난관(`ik-plan.md:69` 명시).
- **파급**: `channels.ts` 생성자에 IK 체인 셋업 + `apply()`(`channels.ts:274-289`)를 관절 오일러 쓰기에서 타겟 위치+`solver.update()`로 전환. `moods.ts`의 GESTURES/무드세트 전부가 관절각으로 저작됨(`moods.ts:248-567`) → 재저작 또는 호환 레이어. `vrm.update()` 이후 solve 순서 제약.
- **가치**: 손이 프레임에 드는 제스처(손가슴/얼굴터치)에만 이득 → 300×400 오버레이에선 한계적. 프로젝트가 반복적으로 "손 안 보여도 OK"로 보류해온 판단이 유효. **에디터가 전신 내보내기 도구로 확장될 때 재검토.**

### D. drei 활용 ①로딩% ②성능 자동조절 ✅ 쉬움 · 체감가치 중(프로젝트 고유)
- **①** 12MB VRM 로딩 중 회색 박스뿐 → `useProgress()` % 를 Suspense fallback으로. 소규모.
- **②** 컴패니언이 게임 **위에** 떠 FPS 잠식 → `<PerformanceMonitor onDecline>`+`<AdaptiveDpr>`로 오버레이 DPR 자동강하(게임 프레임 보호). 이 프로젝트 고유 시나리오 직격.
- (`drei-opportunities.md` ③기즈모/그리드=에디터 학습 보너스, ⑤preload=1줄 — 후순위.)

### E. 안전망/위생 (상시)
- **테스트 확장**: `store.ts` 액션(setCharacter 리셋, mesh patch), `channels.ts` 매핑, `meshLabels.ts` 규칙 — 순수/준순수라 저비용 고ROI. 리팩토링 전 characterization으로도 유용.
- **문서 갱신**: 위 stale 참조 3건 수정.

---

## 3. 제안하는 길 (ROI 우선순위)

| 순위 | 방향 | 난이도 | 체감가치 | 근거 |
|------|------|--------|----------|------|
| **1** | **스크린샷/내보내기(Phase 4)** | 쉬움~중 | 높음 | 미완 Phase 종료 + 원칙2 직격. seam 명확 |
| 2 | drei ①로딩% + ②AdaptiveDpr | 쉬움 | 중 | 소규모, 프로젝트 고유 상황 대응 |
| 3 | 무드 5단계 루프 톤 분기 | 중 | 중 | 단일 seam, 폴리싱. 비퇴행 주의 |
| 4 | 테스트/문서 위생 | 쉬움 | 안전망 | 후속 개발 가속 |
| 보류 | IK 도입 | 어려움 | 낮음 | 임피던스↑, 현 오버레이서 체감↓ |

**추천 시퀀스**: 1(스크린샷) → 2(drei UX/성능) → 3(무드 루프톤). IK는 사용 맥락(전신 내보내기 등)이 생길 때 승격.

---

## 4. 다음 플랜모드 착수용 seam 요약

- **스크린샷**: `EditorScene.tsx:65`(gl 플래그) · `EditorPanel.tsx:98`(UI Section) · `ThumbScene.tsx:95`(참고 패턴) · `useThree().gl.domElement.toBlob`.
- **무드 루프톤**: `useAnimator.ts:107`(하드코딩 지점) · `moods.ts:590`(BASE_LOOPS→팩토리) · `useAnimator.ts:131-146`(무드 변경 블록에서 루프 remove/재add) · `scheduler.ts:87`(remove).
- **drei ①②**: `EditorScene.tsx:68`(Suspense fallback) · `CompanionOverlay.tsx:96`(Canvas 자식으로 PerformanceMonitor/AdaptiveDpr).
- **IK**(보류): `ik-plan.md` 전체 · `channels.ts:142-151`(본 해석) · `channels.ts:274-289`(apply) · `moods.ts:248-567`(재저작 대상).

## 검증(향후 실제 구현 시)
- `npm test`(순수 로직) + `npm run build`(tsc) 통과.
- 수동: 에디터/컴패니언 양쪽에서 기능 확인(스크린샷 PNG 열어보기, 무드별 루프 톤 시각 확인, 로딩 % 표시, FPS 강하 시 DPR 하락).
- 비퇴행: 각 방향 도입 후 기존 동작(정적 편집·립싱크·기존 무드 표정/제스처) 불변 확인.
