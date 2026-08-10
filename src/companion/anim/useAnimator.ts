// 절차 애니메이션 R3F 훅 — 스케줄러를 매 프레임 구동하여 VRM에 기록
//
// useIdleAnimation을 대체. 호흡/머리미동/눈깜빡임/팔내리기를 선언적 무드 템플릿으로 흡수.
// 립싱크(입)·lookAt(눈)은 채널이 겹치지 않으므로 별도 훅 유지.
// 무드: stateRef(idle/speaking)와 별개로 moodRef(neutral/happy/…)로 표정+제스처 톤 전환.

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { VRM } from '@pixiv/three-vrm';
import {
  AnimScheduler,
  type StateName,
  type AnimTemplate,
  type ChannelValues,
} from './scheduler';
import {
  Channels,
  BASELINE,
  DERIVE_DEFAULT,
  EMOTION_CHANNELS,
} from './channels';
import { MOODS, IDLE_POSES, TONE_LOOP_NAMES, WAVE } from './moods';

// 일회성 클립이 전담하는 채널은 held 표정(moodExprClip)에서 제외 — 채널 단일 소유:
// emo.mthSurprised=surprised gasp(입벌림), emo.eyeJoy=happy 진입 눈웃음(감았다 뜸).
const ONESHOT_EMOTION_CHANNELS = ['emo.mthSurprised', 'emo.eyeJoy'];
const HELD_EMOTION_CHANNELS = EMOTION_CHANNELS.filter(
  (c) => !ONESHOT_EMOTION_CHANNELS.includes(c),
);

// 무드 표정 전환 클립: held 감정 채널을 명시(활성=target, 나머지=0) → hold-last로 교체.
// factory 선두 null이 현재값→target 부드러운 ramp 보장. ease 3 = 완만.
// expr 키는 'emo.' 접두어 없는 suffix (happy/angry/browSorrow…)
function moodExprClip(expr: Record<string, number>): AnimTemplate {
  const vs: ChannelValues = {};
  for (const ch of HELD_EMOTION_CHANNELS) {
    vs[ch] = [expr[ch.slice(4)] ?? 0]; // 'emo.' 제거 후 조회
  }
  return { name: 'mood-expr', ease: 3, dt: [[400, 600]], vs };
}

// 놀람 gasp: surprised 진입 시 입을 빠르게 확 벌렸다(open) → 잠깐 유지 → 천천히 닫음(close).
// 닫히면서 자연스럽게 발화 viseme로 인계. 일회성(non-loop) — 종료 후 hold-last로 0 유지.
const SURPRISE_GASP: AnimTemplate = {
  name: 'gasp',
  ease: 2,
  dt: [
    [120, 180],
    [200, 320],
    [450, 650],
  ],
  vs: { 'emo.mthSurprised': [0.75, 0.75, 0] },
};

// happy 눈웃음: happy 진입 시 눈을 살짝 감았다(웃는 눈^_^) 뜬다 — held 아님이라 발화 중 눈뜸 유지.
// emo.eyeJoy → Fcl_EYE_Joy + EYE_Close boost(channels). surprised gasp와 동형(상승·유지·하강).
const HAPPY_EYE: AnimTemplate = {
  name: 'happyeye',
  ease: 2,
  dt: [
    [150, 200],
    [300, 450],
    [400, 600],
  ],
  vs: { 'emo.eyeJoy': [1, 1, 0] },
};

// enabled=false: tick 을 돌리지 않음(에디터 프리뷰 토글 OFF). 본/표정은 호출부가 소유
// (ComposerAvatar 가 rest pose 복원) → 재활성 시 깨끗이 재구성되도록 builtVrm 을 비운다.
export function useAnimator(
  vrmRef: React.RefObject<VRM | null>,
  stateRef: React.RefObject<StateName>,
  moodRef: React.RefObject<string>,
  enabled = true,
  greetOnReady = false, // 등장 시 손인사 1회
) {
  const schedulerRef = useRef<AnimScheduler | null>(null);
  const channelsRef = useRef<Channels | null>(null);
  const builtVrmRef = useRef<VRM | null>(null);
  const prevStateRef = useRef<StateName>('idle');
  const driftTRef = useRef(0); // idle micro-drift 위상 누적 시간(초)
  const manualWaveRef = useRef(false); // 디버그 패널 손인사 트리거 대기
  // 무드 이중 소스: prop(게임 이벤트) + 디버그 이벤트. 변경 감지를 분리해 서로 안 덮음
  const propMoodSeenRef = useRef<string>('neutral'); // 마지막으로 관측한 prop 무드
  const activeMoodRef = useRef<string>('neutral'); // 현재 표시 중인 무드 (gesture 풀 소스)
  const manualMoodRef = useRef<string | null>(null); // 디버그 패널 무드 트리거 대기
  const manualGestureRef = useRef<number | null>(null); // 디버그 패널 제스처 트리거 대기
  const manualIdlePoseRef = useRef<number | null>(null); // 디버그 패널 idle 팔 포즈 트리거 대기

  const GESTURE_PROB = 0.6; // 발화당 제스처 발동 확률

  // 디버그 패널 → window 이벤트로 제스처/무드 수동 트리거 (R3F 경계 우회)
  useEffect(() => {
    const onGesture = (e: Event) => {
      const idx = (e as CustomEvent).detail?.index;
      if (typeof idx === 'number') manualGestureRef.current = idx;
    };
    const onMood = (e: Event) => {
      const m = (e as CustomEvent).detail?.mood;
      if (typeof m === 'string') manualMoodRef.current = m;
    };
    const onIdlePose = (e: Event) => {
      const idx = (e as CustomEvent).detail?.index;
      if (typeof idx === 'number') manualIdlePoseRef.current = idx;
    };
    // 손인사는 VRMA 레이어가 소유(2026-08-05) → 절차판은 `companion:wave-proc` 로만 발동한다.
    // 지우지 않는 이유: 프로브/필름스트립에서 VRMA 판과 나란히 비교하는 기준선이라서.
    const onWave = () => {
      manualWaveRef.current = true;
    };
    window.addEventListener('companion:gesture', onGesture);
    window.addEventListener('companion:mood', onMood);
    window.addEventListener('companion:idlepose', onIdlePose);
    window.addEventListener('companion:wave-proc', onWave);
    return () => {
      window.removeEventListener('companion:gesture', onGesture);
      window.removeEventListener('companion:mood', onMood);
      window.removeEventListener('companion:idlepose', onIdlePose);
      window.removeEventListener('companion:wave-proc', onWave);
    };
  }, []);

  useFrame((_, delta) => {
    if (!enabled) {
      builtVrmRef.current = null; // 재활성 시 BASELINE 부터 깨끗이 재구성
      return;
    }
    const vrm = vrmRef.current;
    if (!vrm?.humanoid) return;

    // VRM 교체 시 스케줄러/채널 재구성
    if (builtVrmRef.current !== vrm) {
      builtVrmRef.current = vrm;
      // 자연스러움 레이어 활성: 몸통→팔→손 시차(overlap) + 본 채널 부드러운 정착(smooth,
      // smootherstep). 오버슈트/anticipation은 '각진·군인' 느낌이라 미채택. 얼굴(blink/emo.*)은
      // 표정 동기 위해 미적용. 상세 docs/motion-naturalness-plan.md
      const scheduler = new AnimScheduler(BASELINE, {
        overlap: 35,
        smooth: 0.7,
      });
      MOODS.neutral.loops.forEach((t) => scheduler.add(t, true));
      if (greetOnReady) scheduler.add({ ...WAVE, delay: [700, 900] }, false);
      schedulerRef.current = scheduler;
      // 본 파생 활성(리뉴얼 3단계): 목·어깨·UpperChest 가 기존 채널에서 회전을 나눠 진다.
      // 총 회전량은 유지되고 관절만 분절 → moods.ts 무변경으로 전 동작에 소급(channels.ts).
      channelsRef.current = new Channels(vrm, DERIVE_DEFAULT);
      propMoodSeenRef.current = 'neutral'; // 새 VRM은 neutral 표정으로 시작
      activeMoodRef.current = 'neutral';
    }

    const scheduler = schedulerRef.current!;
    const curState = stateRef.current ?? 'idle';
    scheduler.stateName = curState;

    // 무드 결정: prop(게임 이벤트) 변경 또는 디버그 이벤트 → activeMood (last-writer-wins).
    // prop은 매 렌더 덮어쓰이므로 "변경 시점"만 잡고, 디버그가 prop 위에 우선 적용됨.
    const propMood = moodRef.current ?? 'neutral';
    let nextMood = activeMoodRef.current;
    if (propMood !== propMoodSeenRef.current) {
      propMoodSeenRef.current = propMood;
      nextMood = propMood;
    }
    if (manualMoodRef.current !== null) {
      nextMood = manualMoodRef.current;
      manualMoodRef.current = null;
    }
    // 무드 변경 → 표정 전환 클립 스케줄 (감정 채널 ramp, 본 채널과 분리되어 충돌 없음)
    if (nextMood !== activeMoodRef.current) {
      const mood = MOODS[nextMood] ?? MOODS.neutral;
      scheduler.remove('mood-expr');
      scheduler.add(moodExprClip(mood.expression), false);
      // 루프 톤 분기(5단계): 호흡/머리/포즈를 무드 스케일판으로 교체. hold-last가 현재값에서
      // 이어받아 스냅 없음(scheduler.ts) — armPose/blink는 무드 무관 공유라 건드리지 않음.
      TONE_LOOP_NAMES.forEach((name) => scheduler.remove(name));
      mood.loops
        .filter((t) => TONE_LOOP_NAMES.includes(t.name))
        .forEach((t) => scheduler.add(t, true));
      // surprised 진입: 입벌림 gasp 일회성 발동 (held 입 대신 → 닫히며 viseme로 인계)
      if (nextMood === 'surprised') {
        scheduler.remove('gasp');
        scheduler.add(SURPRISE_GASP, false);
      }
      // happy 진입: 눈웃음 일회성 발동 (held 눈 대신 → 감았다 떠서 발화 중 눈뜸 유지)
      if (nextMood === 'happy') {
        scheduler.remove('happyeye');
        scheduler.add(HAPPY_EYE, false);
      }
      activeMoodRef.current = nextMood;
    }

    // 디버그 패널 idle 포즈 수동 트리거(팔+몸통 둘러보기): out-hold-return 일회성으로 주입.
    // 소속 루프(armPose/pose)보다 뒤에 add → per-channel 후순위 승 → 1.8s 유지 후 baseline 복귀.
    if (manualIdlePoseRef.current !== null) {
      const pose = IDLE_POSES[manualIdlePoseRef.current];
      manualIdlePoseRef.current = null;
      if (pose?.vs && pose.dt) {
        const vs: ChannelValues = {};
        for (const ch of Object.keys(pose.vs)) {
          const target = pose.vs[ch][0] as number;
          vs[ch] = [target, target, BASELINE[ch] ?? 0];
        }
        scheduler.remove('idlepose-manual');
        scheduler.add(
          {
            name: 'idlepose-manual',
            ease: pose.ease,
            dt: [pose.dt[0], 1800, 700],
            vs,
          },
          false,
        );
      }
    }

    // 디버그 패널 수동 트리거: 항상 neutral 세트 (패널이 neutral 라벨 표시)
    if (manualGestureRef.current !== null) {
      const g = MOODS.neutral.gestures[manualGestureRef.current];
      manualGestureRef.current = null;
      if (g) {
        scheduler.remove('gesture');
        scheduler.add(g, false);
      }
    }

    if (manualWaveRef.current) {
      manualWaveRef.current = false;
      scheduler.remove('wave');
      scheduler.add(WAVE, false);
    }

    // idle→speaking 전환 시 현재 무드 세트에서 1개 랜덤 제스처 (확률 + 중복 방지)
    const moodGestures = (MOODS[activeMoodRef.current] ?? MOODS.neutral)
      .gestures;
    if (
      curState === 'speaking' &&
      prevStateRef.current !== 'speaking' &&
      moodGestures.length > 0 &&
      !scheduler.has('gesture') &&
      Math.random() < GESTURE_PROB
    ) {
      const g = moodGestures[Math.floor(Math.random() * moodGestures.length)];
      scheduler.add(g, false);
    }
    prevStateRef.current = curState;

    const state = scheduler.tick(delta * 1000); // 초 → ms
    driftTRef.current += delta; // idle micro-drift 위상 누적 (초)
    channelsRef.current!.apply(state, driftTRef.current);
  });
}
