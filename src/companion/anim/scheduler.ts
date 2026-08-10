// 선언적 애니메이션 스케줄러 — TalkingHead animFactory/animate 포팅 (VRM 채널 추상화)
//
// 모델: baseline + 델타. 각 채널은 템플릿당 1개만 기록(분리), 클립이 baseline 위에
// 절대값을 덮어씀. clock 기반 이징으로 프레임레이트 독립.
//
// 자연스러움 레이어(MotionConfig, opt-in — 기본 off면 기존과 바이트 동일):
//   overlap : 채널의 운동학적 깊이(torso 0 → arm 1 → elbow 2, head 1)에 비례해 시작 시각을
//             지연 → 한 클립이 한 덩어리로 안 움직이고 몸통→팔→손 시차(follow-through)를 가짐.
//   smooth  : 킥네매틱(본) 채널의 이징을 smootherstep로 블렌드 → 급가감속·스냅 제거, 양 끝이
//             부드럽게 정착(1·2차 도함수 0). 오버슈트/anticipation 없음(그건 '각진·군인' 느낌).
//             얼굴 채널(blink/emo.*)은 표정 동기 위해 항상 sigmoid(smooth 미적용).
//
// 클립 정의(AnimTemplate):
//   { name, delay, dt, vs, loop, [stateName]: <서브템플릿>, alt: [...] }
//   delay : 시작 지연 ms. 스칼라 또는 [min,max,skew?,samples?] gaussian
//   dt    : 세그먼트 길이 ms 배열. 각 원소 스칼라 또는 gaussian 범위
//   vs    : { channel: [v0, v1, ...] }. 각 v 스칼라 또는 gaussian 범위. baseline에 가산

export type Ranged = number | [number, number, number?, number?];
// null = 시작값(live)으로 채움. factory가 선두에 자동 null 추가, 추가로 명시도 가능
export type ChannelValues = Record<string, (Ranged | null)[]>;

export interface AnimTemplate {
  name: string;
  delay?: Ranged;
  dt?: Ranged[];
  vs?: ChannelValues;
  loop?: boolean;
  alt?: AltBranch[];
  ease?: number; // 클립 전용 sigmoid 강도 (작을수록 완만). 생략 시 기본(snap)
  label?: string; // UI 식별용 (디버그 패널 제스처 트리거). 스케줄러는 무시
  // 상태별 서브템플릿 (idle/speaking) — 동적 키라 인덱스 시그니처로 수용
  [state: string]: unknown;
}

interface AltBranch extends AnimTemplate {
  p?: number; // 선택 확률 (생략 시 균등 분배)
}

export type StateName = 'idle' | 'speaking';

// 자연스러움 튜닝 (opt-in). 기본 0 = 기존 동작 그대로(비퇴행). useAnimator가 앱용으로 켬.
export interface MotionConfig {
  overlap?: number; // 깊이당 시작 지연 ms (0=off). 예 50 → arm 50ms·elbow 100ms 뒤처짐
  smooth?: number; // 부드러움 0~1 (0=off). 본 채널 이징을 smootherstep로 블렌드하는 비율
}

// 인스턴스화된 클립
interface Clip {
  name: string;
  ts: number[]; // 절대 타임스탬프 [t0, t1, ...] (오프셋 미포함 기준)
  vs: Record<string, (number | null)[]>; // 채널별 키프레임 값 (null=시작값을 live로 채움)
  offsets: Record<string, number>; // 채널별 시작 지연 ms (overlap, ≥0)
  chEase: Record<string, (t: number) => number>; // 채널별 이징 (overshoot 또는 sigmoid)
  maxOffset: number; // 클립 수명 연장분 (가장 늦게 끝나는 채널까지 대기)
  loop: boolean;
  template: AnimTemplate;
}

// ── 유틸 ──────────────────────────────────────────────────────────

// 합계 평균 기반 근사 정규분포. skew로 분포 편향, samples로 종형 강도
export function gaussianRandom(
  start: number,
  end: number,
  skew = 1,
  samples = 5,
): number {
  let r = 0;
  for (let i = 0; i < samples; i++) r += Math.random();
  return start + Math.pow(r / samples, skew) * (end - start);
}

// 시그모이드 이징 팩토리 — k가 클수록 가파른 ease-in-out
export function sigmoidFactory(k: number): (t: number) => number {
  const base = (t: number) => 1 / (1 + Math.exp(-k * t)) - 0.5;
  const corr = 0.5 / base(1);
  return (t: number) => corr * base(2 * Math.max(Math.min(t, 1), 0) - 1) + 0.5;
}

// smootherstep (Ken Perlin) — 양 끝에서 1·2차 도함수가 0이라 가장 부드럽게 출발·정착.
// 오버슈트/anticipation 없이 단조 증가 → '각지지 않은' 완만한 이징. 본 채널 부드러움용.
export function smootherstep(t: number): number {
  const x = Math.max(Math.min(t, 1), 0);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

const DEFAULT_EASING = sigmoidFactory(7);

// 채널의 운동학적 깊이 (proximal→distal). overlap 지연 = 깊이 × config.overlap.
// torso(몸통·척추)가 먼저 움직이고 팔·손이 뒤따름 → 한 덩어리 움직임 해소.
function channelDepth(ch: string): number {
  if (ch.startsWith('hand')) return 3; // 손목 = 최말단 (몸통→상완→하완→손 순서)
  if (ch.startsWith('elbow')) return 2;
  if (ch.startsWith('arm') || ch.startsWith('head')) return 1;
  return 0; // spine/chest(몸통, 선행) · blink/emo(얼굴, 지연 없음)
}

// 얼굴 채널: 표정은 이벤트와 동기돼야 하므로 overlap/overshoot 미적용 (항상 sigmoid).
function isFacial(ch: string): boolean {
  return ch === 'blink' || ch.startsWith('emo.');
}

function resolveRanged(x: Ranged): number {
  return Array.isArray(x) ? gaussianRandom(x[0], x[1], x[2], x[3]) : x;
}

// ── 스케줄러 ──────────────────────────────────────────────────────

export class AnimScheduler {
  private clock = 0;
  private queue: Clip[] = [];
  private live: Record<string, number> = {}; // 채널별 마지막 출력값 (null 시작값 보간용)
  private easing = DEFAULT_EASING;
  private motion: Required<MotionConfig>;
  stateName: StateName = 'idle';

  constructor(
    private baseline: Record<string, number>,
    motion: MotionConfig = {},
  ) {
    this.live = { ...baseline };
    this.motion = { overlap: motion.overlap ?? 0, smooth: motion.smooth ?? 0 };
  }

  // 자연스러움 튜닝 갱신 (런타임 토글용). 이후 인스턴스화되는 클립부터 적용.
  setMotion(motion: MotionConfig): void {
    this.motion = { overlap: motion.overlap ?? 0, smooth: motion.smooth ?? 0 };
  }

  // 템플릿을 큐에 추가 (인스턴스화)
  add(template: AnimTemplate, loop = false): void {
    this.queue.push(this.factory(template, loop));
  }

  // 이름으로 큐에서 제거 (포즈/제스처 교체 시 사용)
  remove(name: string): void {
    this.queue = this.queue.filter((c) => c.name !== name);
  }

  // 해당 이름의 클립이 큐에 있는지 (제스처 중복 발동 방지)
  has(name: string): boolean {
    return this.queue.some((c) => c.name === name);
  }

  // 템플릿 → 클립 인스턴스. delay/dt/vs의 gaussian을 이 시점에 1회 롤
  private factory(template: AnimTemplate, loop: boolean): Clip {
    // 상태/alt 계층 하강
    let a: AnimTemplate = template;
    while (true) {
      if (a[this.stateName] !== undefined) {
        a = a[this.stateName] as AnimTemplate;
      } else if (a.alt) {
        a = this.pickAlt(a.alt);
      } else {
        break;
      }
    }

    const delay = resolveRanged(a.delay ?? 0);

    // 타임스탬프 구성
    const ts: number[] = [0];
    if (a.dt) {
      a.dt.forEach((d, i) => {
        ts[i + 1] = ts[i] + resolveRanged(d);
      });
    } else if (a.vs) {
      const maxLen = Object.values(a.vs).reduce(
        (m, arr) => Math.max(m, arr.length),
        0,
      );
      for (let i = 1; i <= maxLen; i++) ts[i] = 0;
    }
    const absTs = ts.map((t) => this.clock + delay + t);

    // 값 구성: [null, target, ...]. null은 출력 시 live로 채움.
    // target은 채널의 절대값(포즈) 또는 0 기준 델타(idle). baseline 가산 안 함 —
    // 무드 baseline 오프셋이 생기면 그때 레이어별로 재도입
    const vs: Record<string, (number | null)[]> = {};
    if (a.vs) {
      for (const [ch, arr] of Object.entries(a.vs)) {
        vs[ch] = [
          null,
          ...arr.map((x) => (x === null ? null : resolveRanged(x))),
        ];
        // 타임스탬프 길이에 맞춰 마지막 값으로 패딩
        while (vs[ch].length < absTs.length)
          vs[ch].push(vs[ch][vs[ch].length - 1]);
      }
    }

    // 채널별 오프셋(overlap) + 이징(smooth) 산출
    const baseEasing =
      a.ease !== undefined ? sigmoidFactory(a.ease) : this.easing;
    // 본 채널 부드러움: baseEasing과 smootherstep을 smooth 비율로 블렌드(스냅·급가감속 제거).
    const smooth = this.motion.smooth;
    const softEasing =
      smooth > 0
        ? (t: number) => (1 - smooth) * baseEasing(t) + smooth * smootherstep(t)
        : null;

    const offsets: Record<string, number> = {};
    const chEase: Record<string, (t: number) => number> = {};
    let maxOffset = 0;
    for (const ch of Object.keys(vs)) {
      const off = this.motion.overlap * channelDepth(ch); // 얼굴=depth 0 → 지연 없음
      offsets[ch] = off;
      if (off > maxOffset) maxOffset = off;
      chEase[ch] = softEasing && !isFacial(ch) ? softEasing : baseEasing;
    }

    return {
      name: a.name,
      ts: absTs,
      vs,
      offsets,
      chEase,
      maxOffset,
      loop,
      template,
    };
  }

  // alt 확률 분기 (TalkingHead 동전던지기 방식)
  private pickAlt(alts: AltBranch[]): AltBranch {
    if (alts.length === 1) return alts[0];
    const coin = Math.random();
    let p = 0;
    for (let i = 0; i < alts.length; i++) {
      const val = alts[i].p;
      p += val === undefined ? (1 - p) / (alts.length - 1 - i) : val;
      if (coin < p) return alts[i];
    }
    return alts[alts.length - 1];
  }

  // 매 프레임 호출. dtMs만큼 진행 후 채널 출력값 맵 반환
  //
  // hold-last: baseline이 아닌 직전 출력값(live)에서 시작. 클립이 기록하지 않는
  // 채널(루프 재인스턴스화의 delay 공백 등)은 마지막 값을 유지 → baseline 스냅 방지.
  // 다음 클립은 유지된 값에서 null 시작값으로 이어받아 끊김 없이 연결됨.
  //
  // 채널별 시각(overlap): 채널마다 오프셋만큼 늦은 유효시각(et)으로 세그먼트를 개별 탐색 →
  // 같은 클립 안에서도 몸통이 먼저·손이 나중. 클립 수명은 maxOffset만큼 연장해 늦은 채널까지 완주.
  tick(dtMs: number): Record<string, number> {
    this.clock += dtMs;
    const out: Record<string, number> = { ...this.live };

    for (let i = 0; i < this.queue.length; i++) {
      const clip = this.queue[i];
      const last = clip.ts.length - 1;

      for (const ch of Object.keys(clip.vs)) {
        const et = this.clock - clip.offsets[ch]; // 이 채널의 유효시각
        if (et < clip.ts[0]) continue; // 아직 시작 전 → live 유지(out 초기값)

        // 이 채널의 현재 세그먼트 j 탐색
        let j = 0;
        while (j < last && et >= clip.ts[j + 1]) j++;

        const arr = clip.vs[ch];
        // null 시작값은 **세그먼트 진입 시 1회만** 고정한다(vs는 factory가 인스턴스마다 새로
        // 만드므로 mutate 안전). 매 프레임 live를 다시 읽으면 보간이
        // out = (1−α)·out_직전 + α·target 재귀 = 1차 저역통과 필터가 된다 → 명목 duration의
        // 절반쯤에 완주하고(60fps: 1.0s→0.48s) 피크 속도가 앞으로 쏠리며 프레임레이트에
        // 종속된다. chEase가 그리려던 곡선도 필터에 먹혀 smooth 설정이 무력화된다.
        // 상세·실측 docs/motion-renewal-plan.md 원인①
        if (arr[j] === null) arr[j] = this.live[ch] ?? this.baseline[ch] ?? 0;
        let val: number;
        if (j >= last) {
          val = arr[last] ?? this.live[ch] ?? 0;
        } else {
          const start = arr[j] ?? this.live[ch] ?? this.baseline[ch] ?? 0;
          const end = arr[j + 1] ?? start;
          const span = clip.ts[j + 1] - clip.ts[j];
          const alpha =
            span > 0.0001 ? clip.chEase[ch]((et - clip.ts[j]) / span) : 1;
          val = (1 - alpha) * start + alpha * end;
        }
        out[ch] = val;
      }

      // 종료 처리: 늦은 채널까지 끝나도록 maxOffset 연장. 루프면 재인스턴스화, 아니면 제거
      if (this.clock >= clip.ts[last] + clip.maxOffset) {
        if (clip.loop) {
          this.queue[i] = this.factory(clip.template, true);
        } else {
          this.queue.splice(i--, 1);
        }
      }
    }

    // live 갱신 (다음 프레임 hold-last 및 null 시작값 연속성)
    this.live = out;
    return out;
  }
}
