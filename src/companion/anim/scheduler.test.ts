import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AnimScheduler,
  gaussianRandom,
  sigmoidFactory,
  smootherstep,
  type AnimTemplate,
} from './scheduler'

afterEach(() => vi.restoreAllMocks())

describe('sigmoidFactory', () => {
  const f = sigmoidFactory(7)

  it('고정점: f(0)=0, f(0.5)=0.5, f(1)=1', () => {
    expect(f(0)).toBeCloseTo(0, 6)
    expect(f(0.5)).toBeCloseTo(0.5, 6)
    expect(f(1)).toBeCloseTo(1, 6)
  })

  it('범위 밖 입력은 [0,1]로 클램프', () => {
    expect(f(-1)).toBeCloseTo(0, 6)
    expect(f(2)).toBeCloseTo(1, 6)
  })

  it('단조 증가', () => {
    let prev = -Infinity
    for (let t = 0; t <= 1; t += 0.1) {
      const v = f(t)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })
})

describe('gaussianRandom', () => {
  it('Math.random=0.5 → 구간 중앙 (skew=1)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    expect(gaussianRandom(0, 100)).toBeCloseTo(50, 6)
  })

  it('Math.random 양 끝 → 구간 양 끝', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(gaussianRandom(10, 20)).toBeCloseTo(10, 6)
    vi.spyOn(Math, 'random').mockReturnValue(1)
    expect(gaussianRandom(10, 20)).toBeCloseTo(20, 6)
  })

  it('항상 [start, end] 안', () => {
    for (let i = 0; i < 200; i++) {
      const v = gaussianRandom(-5, 5)
      expect(v).toBeGreaterThanOrEqual(-5)
      expect(v).toBeLessThanOrEqual(5)
    }
  })
})

describe('AnimScheduler — 불변식 characterization', () => {
  const baseline = { a: 0, b: 0 }

  it('보간 + hold-last: live→target 램프 후 종료해도 값 유지, 미기록 채널은 불변', () => {
    const s = new AnimScheduler(baseline)
    const clip: AnimTemplate = { name: 't', dt: [100], vs: { a: [1] } }
    s.add(clip, false)

    expect(s.tick(0).a).toBeCloseTo(0, 6)    // 시작 = live(0)
    expect(s.tick(50).a).toBeCloseTo(0.5, 6) // 중간 = 0.5 (sigmoid 대칭)
    expect(s.tick(50).a).toBe(1)             // 종료 = target, 클립 제거됨

    const after = s.tick(50)
    expect(after.a).toBe(1) // hold-last: 클립 사라져도 유지
    expect(after.b).toBe(0) // 미기록 채널은 baseline 유지
  })

  it('루프: 종료 시 재인스턴스화되어 패턴 반복', () => {
    const s = new AnimScheduler(baseline)
    const loop: AnimTemplate = { name: 'L', delay: 0, dt: [10, 10], vs: { a: [1, 0] } }
    s.add(loop, true)

    expect(s.tick(10).a).toBe(1) // seg0 끝
    expect(s.tick(10).a).toBe(0) // seg1 끝 → 재인스턴스화
    expect(s.tick(10).a).toBe(1) // 새 사이클 seg0
    expect(s.tick(10).a).toBe(0) // 새 사이클 seg1
  })

  it('pickAlt: 확률 분기를 Math.random으로 선택', () => {
    const tmpl: AnimTemplate = {
      name: 'x',
      alt: [
        { name: 'x', p: 0.7, dt: [10], vs: { a: [1] } },
        { name: 'x', dt: [10], vs: { b: [1] } },
      ],
    }

    vi.spyOn(Math, 'random').mockReturnValue(0.5) // < 0.7 → 첫 분기(a)
    const s1 = new AnimScheduler(baseline)
    s1.add(tmpl, false)
    const r1 = s1.tick(10)
    expect(r1.a).toBe(1)
    expect(r1.b).toBe(0)

    vi.spyOn(Math, 'random').mockReturnValue(0.8) // >= 0.7 → 둘째 분기(b)
    const s2 = new AnimScheduler(baseline)
    s2.add(tmpl, false)
    const r2 = s2.tick(10)
    expect(r2.b).toBe(1)
    expect(r2.a).toBe(0)
  })

  it('remove/has: 이름으로 큐 제어', () => {
    const s = new AnimScheduler(baseline)
    s.add({ name: 'g', delay: 1000, dt: [10], vs: { a: [1] } }, false)
    expect(s.has('g')).toBe(true)
    s.remove('g')
    expect(s.has('g')).toBe(false)
  })

  it('비퇴행: motion 기본값(off)이면 config 미지정과 동일', () => {
    const clip: AnimTemplate = { name: 't', ease: 2.5, dt: [100], vs: { a: [1] } }
    const off = new AnimScheduler(baseline)
    const explicit = new AnimScheduler(baseline, { overlap: 0, smooth: 0 })
    off.add(clip, false)
    explicit.add(structuredClone(clip), false)
    for (const dt of [0, 25, 25, 25, 25]) {
      expect(off.tick(dt).a).toBeCloseTo(explicit.tick(dt).a, 12)
    }
  })
})

describe('smootherstep', () => {
  it('고정점: f(0)=0, f(0.5)=0.5, f(1)=1', () => {
    expect(smootherstep(0)).toBeCloseTo(0, 6)
    expect(smootherstep(0.5)).toBeCloseTo(0.5, 6)
    expect(smootherstep(1)).toBeCloseTo(1, 6)
  })

  it('단조 증가 + 오버슈트 없음 (항상 [0,1])', () => {
    let prev = -Infinity
    for (let t = 0; t <= 1; t += 0.05) {
      const v = smootherstep(t)
      expect(v).toBeGreaterThanOrEqual(prev)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
      prev = v
    }
  })

  it('양 끝이 완만 (끝단 기울기가 중앙보다 작음)', () => {
    const e = 1e-4
    const slopeStart = (smootherstep(e) - smootherstep(0)) / e
    const slopeMid = (smootherstep(0.5 + e) - smootherstep(0.5)) / e
    expect(slopeStart).toBeLessThan(slopeMid) // 출발이 부드러움
  })
})

describe('AnimScheduler — 자연스러움 레이어 (overlap/smooth)', () => {
  it('overlap: 깊은 채널(elbow)이 몸통 채널(chest)보다 늦게 시작', () => {
    const s = new AnimScheduler(
      { 'chest.leanX': 0, 'elbowL.z': 0 },
      { overlap: 100, smooth: 0 },
    )
    // chest depth 0(지연 0), elbow depth 2 → 오프셋 200ms
    s.add({ name: 'g', dt: [100], vs: { 'chest.leanX': [1], 'elbowL.z': [1] } }, false)
    const r = s.tick(50)
    expect(r['chest.leanX']).toBeCloseTo(0.5, 6) // 몸통은 진행(sigmoid 중앙)
    expect(r['elbowL.z']).toBe(0) // 손은 아직 시작 전(et=-150) → live 유지
  })

  it('overlap: maxOffset만큼 클립 수명 연장 → 늦은 채널도 목표 도달', () => {
    const s = new AnimScheduler(
      { 'chest.leanX': 0, 'elbowL.z': 0 },
      { overlap: 100, smooth: 0 },
    )
    s.add({ name: 'g', dt: [100], vs: { 'chest.leanX': [1], 'elbowL.z': [1] } }, false)
    // 몸통 완료(100ms) 후에도 elbow 오프셋(200) 때문에 클립 유지 → 300ms에서 elbow=1
    for (let k = 0; k < 6; k++) s.tick(50) // 총 300ms
    expect(s.has('g')).toBe(false) // 300 >= ts_last(100)+maxOffset(200) → 제거됨
    const r = s.tick(10)
    expect(r['elbowL.z']).toBe(1) // hold-last: 늦은 채널도 목표 도달 후 유지
  })

  it('smooth: 본 채널이 오버슈트 없이 단조 정착 (목표 초과 없음)', () => {
    const s = new AnimScheduler({ 'armL.z': 0 }, { overlap: 0, smooth: 1 })
    s.add({ name: 'g', ease: 2.5, dt: [100], vs: { 'armL.z': [1] } }, false)
    let prev = -Infinity
    let maxV = -Infinity
    for (let k = 0; k < 10; k++) {
      const v = s.tick(10)['armL.z']
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9) // 단조 (되돌아옴/스냅 없음)
      prev = v
      maxV = Math.max(maxV, v)
    }
    expect(maxV).toBeLessThanOrEqual(1 + 1e-9) // 목표 초과(오버슈트) 없음
  })
})
