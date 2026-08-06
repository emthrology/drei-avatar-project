// 절차 모션 프로파일러 — "로봇 같음"을 수치화한다 (브라우저·렌더 없음).
//
// 왜 있나: VRMA 대비 부드러움 격차를 진단할 때 쓴 측정을 **재사용 가능한 검증**으로 승격한 것.
// 리뉴얼 각 단계(docs/motion-renewal-plan.md)는 이 프로파일 한 번으로 효과를 확인한다.
//
// 무엇을 재나 — 진단에서 격차가 드러난 지표는 **진폭이 아니라 분포**였다(Spine 평균 각속도는
// 절차 2.38 vs VRMA 2.02°/s로 오히려 우리가 크다). 그래서 정지 지속·버스트 집중도를 본다:
//   stillPct       채널이 인지 문턱 아래로 머무는 시간 비율
//   longestStill   본이 연속으로 얼어 있는 최장 시간   (VRMA_03 실측 0.00~0.29s)
//   burstTop5/10   총 회전량 중 상위 5%/10% 프레임이 차지하는 비중 (VRMA_03 실측 31.6%/53.7%)
//
// 한계: euler 채널 델타의 제곱합을 각속도 근사로 쓴다(쿼터니언 정확값 아님). 본 간 절대 비교가
// 아니라 **같은 지표의 단계 간 변화**를 보는 용도라 충분하다. 얼굴 채널(blink/emo.*)은 제외 —
// 표정은 이벤트 동기가 정답이라 '멈춤'이 결함이 아니다.

import { AnimScheduler, type MotionConfig, type StateName } from './scheduler';
import { BASELINE, CHEST_INHALE_SCALE, driftAt } from './channels';
import { MOODS } from './moods';

/** 이 속도 아래는 화면에서 '멈춘 것으로 보인다'고 간주 (deg/s).
 *  근거: micro-drift 최대 속도가 0.24°/s인데 육안으로 hold 구간의 얼어붙음이 남아 있었다. */
export const STILL_THRESHOLD = 0.5;

/** 연속 정지로 셀 최소 길이 (프레임). 이보다 짧은 정지는 세그먼트 사이 순간 정체라 무시 */
const MIN_STILL_RUN = 30;

export interface BoneStat {
  bone: string;
  stillPct: number; // 0~1
  meanSpeed: number; // deg/s
  maxSpeed: number; // deg/s
  longestStill: number; // 초
}

export interface MotionProfile {
  bones: BoneStat[];
  drivenBones: number; // 실제로 움직인 본 수 (평균 속도가 문턱 이상)
  burstTop5: number; // 총 회전량 중 상위 5% 프레임 비중 (0~1)
  burstTop10: number;
  /** 구동 본 중 최장 정지 (초). 손목처럼 idle 에서 아예 안 쓰는 본은 제외 —
   *  '안 쓰는 본'과 '쓰는데 얼어 있는 본'은 다른 문제다 */
  worstStill: number;
  /** 구동 본 중 최대 각속도 (deg/s). 급발진 = 리드인 보간 결함의 지표 */
  peakSpeed: number;
}

export interface ProfileOptions {
  minutes?: number;
  fps?: number;
  mood?: string;
  state?: StateName;
  motion?: MotionConfig;
  seed?: number;
}

// 결정적 난수 (mulberry32). 스케줄러는 gaussian/alt 분기에 전역 Math.random을 쓰므로
// 프로파일 구동 동안만 갈아끼운다 — 호출부가 vi.spyOn 을 안 해도 항상 같은 수치가 나오게.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 채널 → 논리 본. 채널 이름 규약(`<본>.<축>`)에서 **파생**한다 — channels.ts 의 본 목록을
// 복사해 오면 채널이 늘 때 사본만 조용히 낡는다.
const BONE_LABEL: Record<string, string> = {
  head: 'Head',
  chest: 'Chest',
  spine: 'Spine',
  armL: 'LUpperArm',
  armR: 'RUpperArm',
  elbowL: 'LLowerArm',
  elbowR: 'RLowerArm',
  handL: 'LHand',
  handR: 'RHand',
};

function boneOf(ch: string): string | null {
  const prefix = ch.slice(0, ch.indexOf('.'));
  return BONE_LABEL[prefix] ?? null; // blink·emo.* → null (얼굴 제외)
}

// 채널값을 본 회전 라디안으로 환산. chest.inhale 만 apply() 에서 스케일되므로 동일하게 반영.
function toRadians(ch: string, v: number): number {
  return ch === 'chest.inhale' ? v * CHEST_INHALE_SCALE : v;
}

export function profileIdle(opts: ProfileOptions = {}): MotionProfile {
  const {
    minutes = 5,
    fps = 60,
    mood = 'neutral',
    state = 'idle',
    motion = { overlap: 35, smooth: 0.7 },
    seed = 1,
  } = opts;

  const dtMs = 1000 / fps;
  const frames = Math.round(minutes * 60 * fps);
  const realRandom = Math.random;
  const series: Record<string, number[]> = {};

  try {
    Math.random = mulberry32(seed);
    const scheduler = new AnimScheduler(BASELINE, motion);
    scheduler.stateName = state;
    (MOODS[mood] ?? MOODS.neutral).loops.forEach((t) => scheduler.add(t, true));

    let t = 0;
    for (let i = 0; i < frames; i++) {
      const out = scheduler.tick(dtMs);
      t += dtMs / 1000;
      for (const [ch, v] of Object.entries(out)) {
        if (!boneOf(ch)) continue;
        // micro-drift 는 apply 레이어라 스케줄러 출력에 없다 → 같은 함수로 재현
        (series[ch] ??= []).push(toRadians(ch, v) + driftAt(ch, t));
      }
    }
  } finally {
    Math.random = realRandom;
  }

  // 본별 프레임 각속도 (축 델타 제곱합의 제곱근)
  const sq: Record<string, number[]> = {};
  for (const [ch, arr] of Object.entries(series)) {
    const bone = boneOf(ch)!;
    const acc = (sq[bone] ??= new Array(arr.length - 1).fill(0));
    for (let i = 1; i < arr.length; i++) {
      const d = arr[i] - arr[i - 1];
      acc[i - 1] += d * d;
    }
  }

  const toDegPerSec = (1 / (dtMs / 1000)) * (180 / Math.PI);
  const bones: BoneStat[] = [];
  const totalPerFrame = new Array(frames - 1).fill(0);

  for (const [bone, acc] of Object.entries(sq)) {
    const speed = acc.map((x) => Math.sqrt(x) * toDegPerSec);
    for (let i = 0; i < speed.length; i++) totalPerFrame[i] += speed[i];

    let run = 0;
    let longest = 0;
    let still = 0;
    for (const s of speed) {
      if (s < STILL_THRESHOLD) {
        still++;
        run++;
      } else {
        if (run >= MIN_STILL_RUN) longest = Math.max(longest, run);
        run = 0;
      }
    }
    if (run >= MIN_STILL_RUN) longest = Math.max(longest, run);

    bones.push({
      bone,
      stillPct: still / speed.length,
      meanSpeed: speed.reduce((a, c) => a + c, 0) / speed.length,
      maxSpeed: Math.max(...speed),
      longestStill: longest / fps,
    });
  }
  bones.sort((a, b) => a.bone.localeCompare(b.bone));

  // 버스트 집중도: 총 회전량 중 상위 p 비율 프레임이 차지하는 몫
  const sorted = [...totalPerFrame].sort((a, b) => b - a);
  const total = sorted.reduce((a, c) => a + c, 0);
  const topShare = (p: number) =>
    total === 0
      ? 0
      : sorted
          .slice(0, Math.round(sorted.length * p))
          .reduce((a, c) => a + c, 0) / total;

  const driven = bones.filter((b) => b.meanSpeed >= STILL_THRESHOLD);
  return {
    bones,
    drivenBones: driven.length,
    burstTop5: topShare(0.05),
    burstTop10: topShare(0.1),
    worstStill: Math.max(...driven.map((b) => b.longestStill)),
    peakSpeed: Math.max(...driven.map((b) => b.maxSpeed)),
  };
}

/** 사람이 읽는 표 (npm run motion:stat 출력) */
export function formatProfile(p: MotionProfile): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const lines = [
    'bone            정지%   평균°/s   최대°/s   최장정지(s)',
    ...p.bones.map(
      (b) =>
        `${b.bone.padEnd(14)}${pct(b.stillPct).padStart(6)}` +
        `${b.meanSpeed.toFixed(2).padStart(10)}${b.maxSpeed.toFixed(2).padStart(10)}` +
        `${b.longestStill.toFixed(2).padStart(14)}`,
    ),
    '',
    `구동 본        ${p.drivenBones} / ${p.bones.length}          (VRMA_03 실측 51 / 52)`,
    `버스트 집중도  상위5% ${pct(p.burstTop5)} · 상위10% ${pct(p.burstTop10)}   (VRMA_03 실측 31.6% · 53.7%)`,
    `최장 정지      ${p.worstStill.toFixed(2)}s          (VRMA_03 실측 0.29s)`,
    `최대 각속도    ${p.peakSpeed.toFixed(1)}°/s        (VRMA_03 실측 49°/s)`,
    '※ 최장 정지·최대 각속도는 구동 본 기준 (idle 에서 안 쓰는 손목 등 제외)',
  ];
  return lines.join('\n');
}
