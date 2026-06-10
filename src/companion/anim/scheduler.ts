// 선언적 애니메이션 스케줄러 — TalkingHead animFactory/animate 포팅 (VRM 채널 추상화)
//
// 모델: baseline + 델타. 각 채널은 템플릿당 1개만 기록(분리), 클립이 baseline 위에
// 절대값을 덮어씀. clock 기반 이징으로 프레임레이트 독립.
//
// 클립 정의(AnimTemplate):
//   { name, delay, dt, vs, loop, [stateName]: <서브템플릿>, alt: [...] }
//   delay : 시작 지연 ms. 스칼라 또는 [min,max,skew?,samples?] gaussian
//   dt    : 세그먼트 길이 ms 배열. 각 원소 스칼라 또는 gaussian 범위
//   vs    : { channel: [v0, v1, ...] }. 각 v 스칼라 또는 gaussian 범위. baseline에 가산

export type Ranged = number | [number, number, number?, number?]
// null = 시작값(live)으로 채움. factory가 선두에 자동 null 추가, 추가로 명시도 가능
export type ChannelValues = Record<string, (Ranged | null)[]>

export interface AnimTemplate {
  name: string
  delay?: Ranged
  dt?: Ranged[]
  vs?: ChannelValues
  loop?: boolean
  alt?: AltBranch[]
  ease?: number // 클립 전용 sigmoid 강도 (작을수록 완만). 생략 시 기본(snap)
  label?: string // UI 식별용 (디버그 패널 제스처 트리거). 스케줄러는 무시
  // 상태별 서브템플릿 (idle/speaking) — 동적 키라 인덱스 시그니처로 수용
  [state: string]: unknown
}

interface AltBranch extends AnimTemplate {
  p?: number // 선택 확률 (생략 시 균등 분배)
}

export type StateName = 'idle' | 'speaking'

// 인스턴스화된 클립
interface Clip {
  name: string
  ts: number[] // 절대 타임스탬프 [t0, t1, ...]
  vs: Record<string, (number | null)[]> // 채널별 키프레임 값 (null=시작값을 live로 채움)
  ndx: number // 현재 세그먼트 캐시
  loop: boolean
  template: AnimTemplate
  easing: (t: number) => number // 클립 전용 이징 (기본 또는 ease 지정)
}

// ── 유틸 ──────────────────────────────────────────────────────────

// 합계 평균 기반 근사 정규분포. skew로 분포 편향, samples로 종형 강도
export function gaussianRandom(start: number, end: number, skew = 1, samples = 5): number {
  let r = 0
  for (let i = 0; i < samples; i++) r += Math.random()
  return start + Math.pow(r / samples, skew) * (end - start)
}

// 시그모이드 이징 팩토리 — k가 클수록 가파른 ease-in-out
export function sigmoidFactory(k: number): (t: number) => number {
  const base = (t: number) => 1 / (1 + Math.exp(-k * t)) - 0.5
  const corr = 0.5 / base(1)
  return (t: number) => corr * base(2 * Math.max(Math.min(t, 1), 0) - 1) + 0.5
}

const DEFAULT_EASING = sigmoidFactory(7)

function resolveRanged(x: Ranged): number {
  return Array.isArray(x) ? gaussianRandom(x[0], x[1], x[2], x[3]) : x
}

// ── 스케줄러 ──────────────────────────────────────────────────────

export class AnimScheduler {
  private clock = 0
  private queue: Clip[] = []
  private live: Record<string, number> = {} // 채널별 마지막 출력값 (null 시작값 보간용)
  private easing = DEFAULT_EASING
  stateName: StateName = 'idle'

  constructor(private baseline: Record<string, number>) {
    this.live = { ...baseline }
  }

  // 템플릿을 큐에 추가 (인스턴스화)
  add(template: AnimTemplate, loop = false): void {
    this.queue.push(this.factory(template, loop))
  }

  // 이름으로 큐에서 제거 (포즈/제스처 교체 시 사용)
  remove(name: string): void {
    this.queue = this.queue.filter((c) => c.name !== name)
  }

  // 해당 이름의 클립이 큐에 있는지 (제스처 중복 발동 방지)
  has(name: string): boolean {
    return this.queue.some((c) => c.name === name)
  }

  // 템플릿 → 클립 인스턴스. delay/dt/vs의 gaussian을 이 시점에 1회 롤
  private factory(template: AnimTemplate, loop: boolean): Clip {
    // 상태/alt 계층 하강
    let a: AnimTemplate = template
    while (true) {
      if (a[this.stateName] !== undefined) {
        a = a[this.stateName] as AnimTemplate
      } else if (a.alt) {
        a = this.pickAlt(a.alt)
      } else {
        break
      }
    }

    const delay = resolveRanged(a.delay ?? 0)

    // 타임스탬프 구성
    const ts: number[] = [0]
    if (a.dt) {
      a.dt.forEach((d, i) => {
        ts[i + 1] = ts[i] + resolveRanged(d)
      })
    } else if (a.vs) {
      const maxLen = Object.values(a.vs).reduce((m, arr) => Math.max(m, arr.length), 0)
      for (let i = 1; i <= maxLen; i++) ts[i] = 0
    }
    const absTs = ts.map((t) => this.clock + delay + t)

    // 값 구성: [null, target, ...]. null은 출력 시 live로 채움.
    // target은 채널의 절대값(포즈) 또는 0 기준 델타(idle). baseline 가산 안 함 —
    // 무드 baseline 오프셋이 생기면 그때 레이어별로 재도입
    const vs: Record<string, (number | null)[]> = {}
    if (a.vs) {
      for (const [ch, arr] of Object.entries(a.vs)) {
        vs[ch] = [null, ...arr.map((x) => (x === null ? null : resolveRanged(x)))]
        // 타임스탬프 길이에 맞춰 마지막 값으로 패딩
        while (vs[ch].length < absTs.length) vs[ch].push(vs[ch][vs[ch].length - 1])
      }
    }

    const easing = a.ease !== undefined ? sigmoidFactory(a.ease) : this.easing
    return { name: a.name, ts: absTs, vs, ndx: 0, loop, template, easing }
  }

  // alt 확률 분기 (TalkingHead 동전던지기 방식)
  private pickAlt(alts: AltBranch[]): AltBranch {
    if (alts.length === 1) return alts[0]
    const coin = Math.random()
    let p = 0
    for (let i = 0; i < alts.length; i++) {
      const val = alts[i].p
      p += val === undefined ? (1 - p) / (alts.length - 1 - i) : val
      if (coin < p) return alts[i]
    }
    return alts[alts.length - 1]
  }

  // 매 프레임 호출. dtMs만큼 진행 후 채널 출력값 맵 반환
  //
  // hold-last: baseline이 아닌 직전 출력값(live)에서 시작. 클립이 기록하지 않는
  // 채널(루프 재인스턴스화의 delay 공백 등)은 마지막 값을 유지 → baseline 스냅 방지.
  // 다음 클립은 유지된 값에서 null 시작값으로 이어받아 끊김 없이 연결됨.
  tick(dtMs: number): Record<string, number> {
    this.clock += dtMs
    const out: Record<string, number> = { ...this.live }

    for (let i = 0; i < this.queue.length; i++) {
      const clip = this.queue[i]
      if (this.clock < clip.ts[0]) continue

      const last = clip.ts.length - 1
      // 현재 세그먼트 j 탐색
      let j = clip.ndx
      while (j < last && this.clock >= clip.ts[j + 1]) j++
      clip.ndx = j

      for (const ch of Object.keys(clip.vs)) {
        const arr = clip.vs[ch]
        let val: number
        if (j >= last) {
          val = arr[last] ?? this.live[ch] ?? 0
        } else {
          const start = arr[j] ?? this.live[ch] ?? this.baseline[ch] ?? 0
          const end = arr[j + 1] ?? start
          const span = clip.ts[j + 1] - clip.ts[j]
          const alpha = span > 0.0001 ? clip.easing((this.clock - clip.ts[j]) / span) : 1
          val = (1 - alpha) * start + alpha * end
        }
        out[ch] = val
      }

      // 종료 처리: 루프면 재인스턴스화(재롤), 아니면 제거
      if (this.clock >= clip.ts[last]) {
        if (clip.loop) {
          this.queue[i] = this.factory(clip.template, true)
        } else {
          this.queue.splice(i--, 1)
        }
      }
    }

    // live 갱신 (다음 프레임 hold-last 및 null 시작값 연속성)
    this.live = out
    return out
  }
}
