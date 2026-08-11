// 절차 모션 프로파일러 — "로봇 같음"을 수치화한다 (브라우저·렌더 없음).
//
// 왜 있나: VRMA 대비 부드러움 격차를 진단할 때 쓴 측정을 **재사용 가능한 검증**으로 승격한 것.
// 절차 모션을 바꿨을 때의 효과는 이 프로파일 한 번으로 확인한다(`npm run motion:stat`).
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
import {
  BASELINE,
  boneEulers,
  DERIVE_DEFAULT,
  type DeriveConfig,
} from './channels';
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
  /** 본 파생 계수. 기본은 useAnimator 가 실제로 켜는 값 — 프로파일은 출하 구성을 재야 한다 */
  derive?: DeriveConfig;
  seed?: number;
}

/** 예산 판정에 쓰는 시드 집합. 단일 시드는 **비교 불가**하다 — 아래 profileMean 주석 참조 */
export const BUDGET_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

// 여러 시드의 평균 프로파일.
//
// ⚠️ **단일 시드로 변경 전후를 비교하면 안 된다.** 스케줄러는 전역 `Math.random` 을 쓰고,
// `gaussianRandom` 은 `samples` 만큼 호출을 소비한다 → 난수 **소비량**이 달라지는 변경
// (samples 조정·클립 추가·alt 분기 변경 등)은 시드가 같아도 그 뒤 스트림 전체를 어긋나게 만든다.
// 그러면 관측된 차이가 변경의 효과인지 시드 노이즈인지 구분되지 않는다(실측: 최장 정지가
// 단일 시드 14.58s vs 8시드 평균 12.87s). 예산 단정문은 반드시 이 평균으로 판정한다.
export function profileMean(
  seeds: number[] = BUDGET_SEEDS,
  opts: Omit<ProfileOptions, 'seed'> = {},
): MotionProfile {
  const runs = seeds.map((seed) => profileIdle({ ...opts, seed }));
  const avg = (pick: (p: MotionProfile) => number) =>
    runs.reduce((a, p) => a + pick(p), 0) / runs.length;
  const bones = runs[0].bones.map((_, i) => ({
    bone: runs[0].bones[i].bone,
    stillPct: avg((p) => p.bones[i].stillPct),
    meanSpeed: avg((p) => p.bones[i].meanSpeed),
    maxSpeed: avg((p) => p.bones[i].maxSpeed),
    longestStill: avg((p) => p.bones[i].longestStill),
  }));
  return {
    bones,
    drivenBones: Math.round(avg((p) => p.drivenBones)),
    burstTop5: avg((p) => p.burstTop5),
    burstTop10: avg((p) => p.burstTop10),
    worstStill: avg((p) => p.worstStill),
    peakSpeed: avg((p) => p.peakSpeed),
  };
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

// boneEulers 본 키 → 표시 이름. 얼굴 채널(blink/emo.*)은 boneEulers 가 아예 안 내보내므로
// 여기서도 자동 제외된다(표정은 이벤트 동기가 정답이라 '멈춤'이 결함이 아니다).
const BONE_LABEL: Record<string, string> = {
  head: 'Head',
  neck: 'Neck',
  chest: 'Chest',
  upperChest: 'UpperChest',
  spine: 'Spine',
  shoulderL: 'LShoulder',
  shoulderR: 'RShoulder',
  armL: 'LUpperArm',
  armR: 'RUpperArm',
  elbowL: 'LLowerArm',
  elbowR: 'RLowerArm',
  handL: 'LHand',
  handR: 'RHand',
};

export function profileIdle(opts: ProfileOptions = {}): MotionProfile {
  const {
    minutes = 5,
    fps = 60,
    mood = 'neutral',
    state = 'idle',
    motion = { overlap: 35, smooth: 0.7 },
    derive = DERIVE_DEFAULT,
    seed = 1,
  } = opts;

  const dtMs = 1000 / fps;
  const frames = Math.round(minutes * 60 * fps);
  const realRandom = Math.random;
  // 본별 오일러 시계열 [x[], y[], z[]]
  const series: Record<string, [number[], number[], number[]]> = {};

  try {
    Math.random = mulberry32(seed);
    const scheduler = new AnimScheduler(BASELINE, motion);
    scheduler.stateName = state;
    (MOODS[mood] ?? MOODS.neutral).loops.forEach((t) => scheduler.add(t, true));

    let t = 0;
    for (let i = 0; i < frames; i++) {
      const out = scheduler.tick(dtMs);
      t += dtMs / 1000;
      // 채널→본 변환(micro-drift·파생 포함)은 apply() 와 **같은 함수**를 쓴다. 모델이 없는
      // 헤드리스라 파생 본은 전부 존재한다고 본다(컨벤션 락 BASE_SPEC 54본 기준).
      for (const [bone, e] of Object.entries(boneEulers(out, derive, t))) {
        const s = (series[bone] ??= [[], [], []]);
        s[0].push(e[0]);
        s[1].push(e[1]);
        s[2].push(e[2]);
      }
    }
  } finally {
    Math.random = realRandom;
  }

  // 본별 프레임 각속도 (축 델타 제곱합의 제곱근)
  const sq: Record<string, number[]> = {};
  for (const [bone, axes] of Object.entries(series)) {
    const acc = (sq[BONE_LABEL[bone] ?? bone] = new Array(
      axes[0].length - 1,
    ).fill(0));
    for (const arr of axes) {
      for (let i = 1; i < arr.length; i++) {
        const d = arr[i] - arr[i - 1];
        acc[i - 1] += d * d;
      }
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
