# 무드 시스템 확장 계획

## 진행 상태: 1~5단계 완료 ✅

- ✅ 1단계 감정 채널 인프라 / ✅ 2단계 무드 정의+표정 전환 / ✅ 3단계 이벤트 매핑+배선 / ✅ 4단계 제스처 톤
- 추가 폴리싱: sad/angry 눈썹 모프 변별, surprised 입벌림 gasp, TTS 성별 음성 선택
- ✅ 5단계 루프 톤 분기 — 아래 "향후" 절 참조(실제 구현은 계획과 세부 방식이 다름: 스케줄러에 `moodName`을 넣는 대신 `moods.ts`가 템플릿을 무드별로 스케일해 재조립)

## 목표

게임 이벤트에 따라 컴패니언이 감정 무드로 전환 — 표정(VRM preset emotion) + 제스처 톤.
범위: 1~4단계 (표정 + 제스처 톤). 무드는 발화 후 neutral로 복귀.

## 데이터 흐름

```
game:event { type: 'level_clear' }
   ↓ useGameEvents
EVENT_MOODS['level_clear'] = 'happy'
   ↓ onSpeak(reaction, mood)
CompanionOverlay: setMood('happy') → 발화 종료 timeout에서 setMood('neutral')
   ↓ mood prop (speaking과 동일 경로)
CompanionAvatar: moodRef
   ↓
useAnimator: moodRef 변경 감지
   ├ 표정 전환 클립 스케줄 (모든 emo.* 채널 명시 → 활성=target, 나머지=0)
   └ MOODS[mood].gestures 로 제스처 풀 교체
```

## 무드 정의

```
EmotionName = 'happy' | 'angry' | 'sad' | 'relaxed' | 'surprised'

neutral   : expression {}                          gestures = 기존 10종
happy     : expression { happy: 0.6 }              gestures = 경쾌 (진폭↑, ease 낮음)
sad       : expression { sad: 0.5, relaxed: 0.15 } gestures = 느림·처짐 (head.gx +=숙임)
surprised : expression { surprised: 0.6 }          gestures = 빠른 반응·물러서기
angry     : expression { angry: 0.5 }              gestures = 날카로움 (ease 낮음, 진폭↑)
```

## 이벤트 → 무드 매핑

```ts
EVENT_MOODS: Record<GameEventType, MoodName> = {
  player_die: 'sad',
  level_clear: 'happy',
  near_miss: 'surprised',
  jump: 'happy',
  start: 'happy',
};
```

## 단계별 구현

### 1단계 — 감정 채널 인프라

- `channels.ts` BASELINE에 `emo.happy/angry/sad/relaxed/surprised` 추가 (전부 0)
- `Channels.apply()`에 5개 `expressionManager.setValue(preset, v('emo.X'))` 추가
- preset 존재 감지 → 없으면 스킵 (비VRoid fallback, viseme morphMap과 동일 패턴)
  - 생성자에서 `expressionManager.getExpression(name)` 으로 존재 여부 캐싱

### 2단계 — 무드 정의 + 표정 전환

- `moods.ts` `Mood` 타입에 `expression: Partial<Record<EmotionName, number>>` 추가
- 무드 5종 정의 (위 표)
- `useAnimator`:
  - `moodRef` 추가 (prop → ref)
  - 무드 변경 감지 시 표정 전환 클립 스케줄:
    ```ts
    function moodExprClip(expr): AnimTemplate {
      const vs = {};
      for (const e of ALL_EMOTIONS) vs[`emo.${e}`] = [expr[e] ?? 0]; // 비활성=0 명시
      return { name: 'mood-expr', ease: 3, dt: [[400, 600]], vs };
    }
    scheduler.remove('mood-expr');
    scheduler.add(moodExprClip(MOODS[mood].expression), false);
    ```
  - hold-last가 전환 후 표정 유지. factory 선두 null로 현재값→target 부드럽게 ramp

### 3단계 — 이벤트 매핑 + 배선

- `locales.ts`에 `EVENT_MOODS` 테이블 추가, `MoodName` 타입 export
- `useGameEvents`: 핸들러에서 이벤트 타입 → 무드 결정, `onSpeak(reaction, mood)` 시그니처 확장
- `CompanionOverlay`: `mood` state 추가. handleReaction에서 setMood, 발화 종료 timeout(말풍선 clear와 동일 지점)에서 `setMood('neutral')`
- `CompanionAvatar`: `mood` prop → `moodRef` (speaking → stateRef와 동일 패턴)

### 4단계 — 제스처 톤

- 무드별 제스처 세트 (curated, 2~4종씩). neutral은 기존 10종 유지
- 톤 차별화 가이드:
  - happy: ease 1.5~2.0 (탄력), 진폭↑, dt 짧게 (빠른 반응)
  - sad: ease 3.5~4.0 (느림), 진폭↓, head.gx 양수(고개 숙임) 바이어스
  - surprised: out 매우 빠름(dt out 150~250), 물러서기/움찔
  - angry: ease 1.5(날카로움), 진폭↑, chest.leanX 양수(다가섬)
- 일부는 neutral 제스처 차용 가능 (label만 구분)

## 알려진 리스크 (개발 중 검증)

- **표정 ↔ 립싱크 입 충돌**: happy preset이 입꼬리 모프 포함 시 viseme 입과 겹침.
  → 발화 중 감정 weight 캡(0.4~0.5) 또는 표정 입 성분만 약화. 실제 보고 조정
- **표정 ↔ blink 눈 충돌**: happy 눈 가늘어짐 + blink 동시. VRM override가 보통 처리하나 확인
- **무드 전환 타이밍**: 발화 시작 시 무드 설정 + 제스처 발동이 같은 프레임 → 표정 ramp(400ms)와 제스처가 겹쳐도 채널 분리(emo.* vs 본)라 충돌 없음. 시각만 확인
- **decay 시점**: 발화 종료 timeout이 무드를 neutral로 → 표정이 말풍선보다 약간 더 머물도록 delay 여유 줄지 검토

## 5단계 — 루프 톤 무드 분기 (완료)

- 목표: happy=활발한 머리/호흡, sad=느린 미동
- **실제 구현은 이 문서의 원안(스케줄러 factory에 `moodName` 분기 추가)과 다름** — 더 저위험인 "템플릿 스케일" 방식 채택:
  - `moods.ts`에 `scaleTemplate(template, {tempo, amplitude})` 재귀 유틸 추가. `dt`/`delay`는 tempo로, `vs`(진폭)는 amplitude로 스케일하며 `alt`/`idle`/`speaking` 서브템플릿까지 재귀 순회
  - `MOOD_TONE`: `happy={tempo:0.7, amplitude:1.2}`, `sad={tempo:1.6, amplitude:0.55}`. 나머지(neutral/surprised/angry)는 `{1,1}` — `scaleTemplate`이 `tone={1,1}`이면 원본 객체를 그대로 반환(참조 동일성 유지)해 비퇴행 보장
  - 분기 대상은 `breathing`/`head`/`pose` 3종만(`TONE_LOOP_NAMES`로 export). `armPose`/`blink`는 무드 무관 공유 유지 — armPose는 제스처가 별도 소유하는 채널이라 톤 분기 실익이 적고, blink는 이번 범위 밖으로 명시적으로 남김
  - `useAnimator.ts`의 무드 전환 블록에서 `TONE_LOOP_NAMES` 3종을 `scheduler.remove()` 후 새 무드의 스케일판을 `scheduler.add(..., true)`로 재등록. 스케줄러의 hold-last(현재값에서 이어받음)가 전환 시 시각적 스냅을 막아줌 — 스케줄러 자체는 무드를 전혀 모른 채 그대로 재사용
- 튜닝 수치(tempo/amplitude)는 1차 추정값 — 실제 체감은 브라우저에서 시각 확인 필요(이 프로젝트 관례상 모션 자연스러움은 수동 검증 영역 — CLAUDE.md 「테스트 관례」)
