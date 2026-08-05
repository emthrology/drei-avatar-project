// 손인사 .vrma 저작 — VRMA_03(브이사인)을 베이스로 개조한다.
//
// 왜 이런 방식인가
// ───────────────
// VRMA_02(挨拶)는 앞 2.4초가 "앉았다 일어서기"인 전신 쇼케이스라 상반신 고정 프레이밍을 밀어낸다.
// 부위만 떼어 쓰는 것도 실패했다 — 모션은 **전신이 함께 움직인다는 전제**로 저작돼 있어서
// 일부만 가져오면 남은 부위와 균형이 깨진다(hips 앞숙임 +20~30°와 head 젖힘 −18°가 짝인 식).
//
// 그래서 **전신을 통째로 쓰되 가장 정적인 클립을 고른다.** 7종 실측에서 VRMA_03 이 최소:
//   hipsY 진폭 0.023m · hips 수평 0.067m · hips 회전 81° · torso 67° (VRMA_02 는 0.634m / 96°)
// 팔만 올려 브이사인을 하고 몸은 거의 고정 — 프레임 이탈도 의류 관통도 없다.
//
// 개조는 최소 개입 2가지:
//   ① 오른손 손가락 → 편 손 (브이사인 제거). 자세는 VRMA_02 인사 순간의 손을 그대로 이식
//   ② 오른 손목 → 좌우 흔들기 주입 (월드축 sine — 로컬축은 자세 종속이라 실패, 아래 AXIS 주석)
// 팔 위치·몸통·머리는 03 원본 그대로 → 전신 일관성이 유지된다.
//
// 출력은 GLB 구조를 그대로 두고 **회전 accessor 의 float 값만 제자리 덮어쓰기** 한다
// (프레임 수·버퍼 레이아웃 불변 → 결정적 재생성, diff 도 값만 바뀜).
//
//   node scripts/makeWaveVrma.mjs [--axis z] [--amp 30] [--freq 2.2] [--out public/animations/wave.vrma]

import { readFileSync, writeFileSync } from 'fs'

const REPO = '/Users/Dongmin/new_workspace/drei-avatar-project'
const arg = (n, f) => {
  const i = process.argv.indexOf(`--${n}`)
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : f
}

const BASE = `${REPO}/public/animations/VRMA_03.vrma` // 베이스(가장 정적)
const HAND_SRC = `${REPO}/public/animations/VRMA_02.vrma` // 편 손 자세 출처(인사)
const HAND_SRC_T = Number(arg('hand-t', 3.0)) // 그 클립에서 손이 펴진 시각(초)
// 흔들기 축은 **월드 기준**으로 준다(로컬 축 금지).
// 로컬 축을 쓰면 자세에 따라 방향이 달라진다 — 실측: 손목 로컬 z=앞뒤(폭 0.088), x=좌우지만
// 폭 0.013(임계 0.08 미달). 팔을 든 자세에서 손 로컬축이 어디를 향하는지 예측 불가라
// CLAUDE.md 「축 매핑이 자세 종속」 함정에 그대로 걸린다.
// 월드 Z(정면=손바닥 법선) 축으로 돌리면 손이 프론탈 평면에서 좌우로 기운다 = 사람의 손인사.
const AXIS = arg('axis', 'z') // 월드 축
const AMP = Number(arg('amp', 30)) // 흔들기 진폭(도)
const FREQ = Number(arg('freq', 2.2)) // 흔들기 주파수(Hz)
const OUT = arg('out', `${REPO}/public/animations/wave.vrma`)

const R_FINGERS = [
  'rightThumbMetacarpal', 'rightThumbProximal', 'rightThumbDistal',
  'rightIndexProximal', 'rightIndexIntermediate', 'rightIndexDistal',
  'rightMiddleProximal', 'rightMiddleIntermediate', 'rightMiddleDistal',
  'rightRingProximal', 'rightRingIntermediate', 'rightRingDistal',
  'rightLittleProximal', 'rightLittleIntermediate', 'rightLittleDistal',
]

function parseGlb(path) {
  const buf = readFileSync(path)
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error(`GLB 아님: ${path}`)
  const total = dv.getUint32(8, true)
  let off = 12, json = null, binOff = 0
  while (off < total) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true)
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(buf.subarray(off + 8, off + 8 + len)))
    if (type === 0x004e4942) binOff = off + 8
    off += 8 + len + ((4 - (len % 4)) % 4)
  }
  return { buf, dv, json, binOff }
}

/** 본+path 의 sampler(input/output accessor 인덱스)를 찾는다 */
function sampler(g, bone, path = 'rotation') {
  const node = g.json.extensions.VRMC_vrm_animation.humanoid.humanBones[bone]?.node
  if (node == null) return null
  const ch = g.json.animations[0].channels.find((c) => c.target.node === node && c.target.path === path)
  return ch ? g.json.animations[0].samplers[ch.sampler] : null
}

/** accessor 의 float 시작 바이트 오프셋 */
function accOffset(g, idx) {
  const acc = g.json.accessors[idx]
  const bv = g.json.bufferViews[acc.bufferView]
  return g.binOff + (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0)
}

function readFloats(g, idx) {
  const acc = g.json.accessors[idx]
  const comps = { SCALAR: 1, VEC3: 3, VEC4: 4 }[acc.type]
  const start = accOffset(g, idx)
  const out = new Float32Array(acc.count * comps)
  for (let i = 0; i < out.length; i++) out[i] = g.dv.getFloat32(start + i * 4, true)
  return out
}

function writeFloats(g, idx, data) {
  const start = accOffset(g, idx)
  for (let i = 0; i < data.length; i++) g.dv.setFloat32(start + i * 4, data[i], true)
  const acc = g.json.accessors[idx]
  if (acc.min || acc.max) {
    const comps = { SCALAR: 1, VEC3: 3, VEC4: 4 }[acc.type]
    const min = new Array(comps).fill(Infinity), max = new Array(comps).fill(-Infinity)
    for (let i = 0; i < data.length; i++) {
      const c = i % comps
      if (data[i] < min[c]) min[c] = data[i]
      if (data[i] > max[c]) max[c] = data[i]
    }
    acc.min = min; acc.max = max
  }
}

// 쿼터니언 곱 (a * b), xyzw
const mul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
]
const conj = (q) => [-q[0], -q[1], -q[2], q[3]]
const axisAngleV = (v, rad) => {
  const s = Math.sin(rad / 2)
  return [v[0] * s, v[1] * s, v[2] * s, Math.cos(rad / 2)]
}
/** 쿼터니언으로 벡터 회전 */
const rotV = (q, v) => {
  const [x, y, z, w] = q
  const ix = w * v[0] + y * v[2] - z * v[1]
  const iy = w * v[1] + z * v[0] - x * v[2]
  const iz = w * v[2] + x * v[1] - y * v[0]
  const iw = -x * v[0] - y * v[1] - z * v[2]
  return [
    ix * w + iw * -x + iy * -z - iz * -y,
    iy * w + iw * -y + iz * -x - ix * -z,
    iz * w + iw * -z + ix * -y - iy * -x,
  ]
}

/** node → 부모 인덱스 맵 */
function parentMap(json) {
  const p = new Map()
  json.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => p.set(c, i)))
  return p
}

/**
 * 특정 시각 t 에서 노드의 **부모까지의 월드 회전**을 FK 로 누적한다.
 * (회전만 필요 — 축 변환에 위치는 안 쓴다)
 */
function parentWorldRotation(g, nodeIdx, t, pmap, sampleCache) {
  const chain = []
  let cur = pmap.get(nodeIdx)
  while (cur != null) { chain.unshift(cur); cur = pmap.get(cur) }
  let q = [0, 0, 0, 1]
  for (const idx of chain) {
    const local = sampleCache.get(idx)
    const r = local ? local(t) : (g.json.nodes[idx].rotation ?? [0, 0, 0, 1])
    q = mul(q, r)
  }
  return q
}

/** 노드의 rotation 채널을 시각 t 에서 선형보간해 주는 함수 (없으면 null) */
function rotationSamplerFn(g, nodeIdx) {
  const ch = g.json.animations[0].channels.find(
    (c) => c.target.node === nodeIdx && c.target.path === 'rotation',
  )
  if (!ch) return null
  const s = g.json.animations[0].samplers[ch.sampler]
  const t = readFloats(g, s.input)
  const q = readFloats(g, s.output)
  return (time) => {
    let i = 0
    while (i < t.length - 1 && t[i + 1] < time) i++
    return [q[i * 4], q[i * 4 + 1], q[i * 4 + 2], q[i * 4 + 3]]
  }
}

// ─── 1. 편 손 자세 추출 (VRMA_02 인사 순간) ─────────────────────────────────────
const src = parseGlb(HAND_SRC)
const openHand = {}
for (const bone of R_FINGERS) {
  const s = sampler(src, bone)
  if (!s) continue
  const t = readFloats(src, s.input)
  const q = readFloats(src, s.output)
  let i = 0
  while (i < t.length - 1 && t[i] < HAND_SRC_T) i++
  openHand[bone] = [q[i * 4], q[i * 4 + 1], q[i * 4 + 2], q[i * 4 + 3]]
}
console.log(`편 손 자세 추출: ${Object.keys(openHand).length}본 (${HAND_SRC.split('/').pop()} @ ${HAND_SRC_T}s)`)

// ─── 2. 베이스에 이식 + 손목 흔들기 주입 ────────────────────────────────────────
const g = parseGlb(BASE)

let n = 0
for (const bone of R_FINGERS) {
  const s = sampler(g, bone)
  const target = openHand[bone]
  if (!s || !target) continue
  const acc = g.json.accessors[s.output]
  const data = new Float32Array(acc.count * 4)
  for (let i = 0; i < acc.count; i++) data.set(target, i * 4) // 전 프레임 고정 = 브이사인 제거
  writeFloats(g, s.output, data)
  n++
}
console.log(`손가락 고정: ${n}본`)

const hand = sampler(g, 'rightHand')
if (!hand) throw new Error('rightHand 회전 채널 없음')
{
  const handNode = g.json.extensions.VRMC_vrm_animation.humanoid.humanBones.rightHand.node
  const pmap = parentMap(g.json)
  // 조상 체인의 회전 샘플러를 미리 캐시 (프레임마다 FK 누적)
  const cache = new Map()
  {
    let cur = pmap.get(handNode)
    while (cur != null) {
      const fn = rotationSamplerFn(g, cur)
      if (fn) cache.set(cur, fn)
      cur = pmap.get(cur)
    }
  }
  const worldAxis = AXIS === 'x' ? [1, 0, 0] : AXIS === 'y' ? [0, 1, 0] : [0, 0, 1]

  const t = readFloats(g, hand.input)
  const q = readFloats(g, hand.output)
  const out = new Float32Array(q.length)
  const t0 = t[0]
  for (let i = 0; i < t.length; i++) {
    const rad = (AMP * Math.PI / 180) * Math.sin(2 * Math.PI * FREQ * (t[i] - t0))
    // 월드 축 → 부모(하완) 로컬 축으로 변환 후 **pre-multiply**
    //   목표: R_world · (Q_parent · q_hand)  ⇒  q' = (Q_parent⁻¹ · R_world · Q_parent) · q_hand
    const qp = parentWorldRotation(g, handNode, t[i], pmap, cache)
    const axisLocal = rotV(conj(qp), worldAxis)
    const cur = [q[i * 4], q[i * 4 + 1], q[i * 4 + 2], q[i * 4 + 3]]
    out.set(mul(axisAngleV(axisLocal, rad), cur), i * 4)
  }
  writeFloats(g, hand.output, out)
  console.log(`손목 흔들기 주입: 월드축=${AXIS} amp=${AMP}° freq=${FREQ}Hz (${t.length}프레임)`)
}

// ─── 3. 저장 (JSON 청크 길이가 바뀔 수 있으므로 재작성) ───────────────────────────
const jsonBytes = new TextEncoder().encode(JSON.stringify(g.json))
const jsonPad = (4 - (jsonBytes.length % 4)) % 4
const jsonLen = jsonBytes.length + jsonPad
const binStart = g.binOff
const binLenOrig = g.dv.getUint32(binStart - 8, true)
const bin = g.buf.subarray(binStart, binStart + binLenOrig)
const binPad = (4 - (bin.length % 4)) % 4

const total = 12 + 8 + jsonLen + 8 + bin.length + binPad
const out = Buffer.alloc(total)
const odv = new DataView(out.buffer, out.byteOffset, out.byteLength)
odv.setUint32(0, 0x46546c67, true)
odv.setUint32(4, 2, true)
odv.setUint32(8, total, true)
odv.setUint32(12, jsonLen, true)
odv.setUint32(16, 0x4e4f534a, true)
out.set(jsonBytes, 20)
out.fill(0x20, 20 + jsonBytes.length, 20 + jsonLen) // JSON 패딩 = 공백
let p = 20 + jsonLen
odv.setUint32(p, bin.length + binPad, true)
odv.setUint32(p + 4, 0x004e4942, true)
out.set(bin, p + 8)

writeFileSync(OUT, out)
console.log(`\n✅ ${OUT}  (${(out.length / 1024).toFixed(0)}KB)`)
