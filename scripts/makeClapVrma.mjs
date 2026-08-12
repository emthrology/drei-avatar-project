// 박수 .vrma 보정 — 외부 조달한 clap-src.vrma 를 우리 체형에 맞게 손본다.
//
// 왜 필요한가 (실측)
// ─────────────────
// VRMA 는 **회전만** 담는데 박수의 성패는 **손 위치**다. 리타게팅은 회전을 옮겨줄 뿐 손이 어디서
// 만나는지는 체형이 정한다 → 소스 리그에서 손목 간격 0.085m 로 알맞게 마주치던 박수가, 어깨가
// 좁고 팔이 짧은 우리 캐릭터에서는 **손이 서로를 지나쳐 버린다**:
//
//   npm run probe -- --clap    비관통(부호 있는 좌우 간격 최솟값)
//     남자1  −0.0223m   (2.2cm 교차)
//     여자1  −0.0468m   (4.7cm 교차) ← 팔이 짧을수록 깊다
//
//   여자1 은 손이 뭉개져 붙어 있느라 벌어짐이 release 임계를 못 넘어 **박수 횟수도 1회**로 셌다.
//
// 손인사 때는 체형 차이가 흔들기 **진폭** 차이로만 나타나 무해했지만(0.131 vs 0.096), 접촉
// 동작에서는 이렇게 눈에 보이는 결함이 된다. 이게 박수에만 있는 위험 등급이다.
//
// 개입 ② — 손가락을 펴서 모은다
// ─────────────────────────────
// 원본은 손가락이 반쯤 굽은 채라 **마주 대는 시늉만 하고 박수 모양이 안 난다**(육안). 박수는
// 손가락을 펴서 붙인 손바닥으로 친다. 30개 손가락 본을 전부 **항등 회전**으로 덮으면 대상 VRM
// 의 rest 자세 = 곧게 편 손가락이 된다(VRoid rest 는 편 손. 절차 레이어가 굽히는 「편안한 손」은
// 재생 중엔 mixer 가 덮으므로 무관하다). 좌우 대칭이 구조적으로 보장되는 것도 장점이다.
//
// ⚠️ 손가락을 펴도 **프로브 수치는 안 변한다** — 손바닥 법선은 Index/Little **Proximal 밑마디의
// 위치**로 정의되는데, 그 위치는 부모(Hand)가 정하지 손가락 굽힘이 바꾸지 않는다. 즉 이 개입은
// 접촉·정렬 판정과 독립이다(실제로 재측정해도 동일).
//
// ❌ 개입 ① — 상수 오프셋으로 손 떼어놓기는 **반려됐다** (기본값 0 = 미적용)
// ────────────────────────────────────────────────────────────────
// 양 상완을 일정 각도 바깥으로 벌려 접촉을 맞추려 했으나 두 가지로 실패했다:
//   ① **전 구간이 왜곡된다** — 벌어진 구간까지 같이 벌어져 원본 동작에서 멀어진다
//   ② **두 체형을 동시에 만족시키는 값이 없다** (아래 스윕)
// → 접촉은 런타임이 맞춘다: `VrmaClipDef.minPalmGap` + [palmContact.ts](../src/companion/anim/vrma/palmContact.ts).
//   파고드는 프레임에서만 실제 기하를 재서 되밀므로 원본 보존 + 체형 무관이다.
//   `--spread` 는 실험용으로 남겨두되 **기본 0**(에셋은 원본 동작 그대로).
// 회전축은 **월드 Y**(수직): 손이 가슴 앞에 있을 때 수평면에서 팔을 열고 닫는 축이라 좌우
// 간격에 직결된다. 로컬 축은 자세 종속이라 쓰지 않는다(CLAUDE.md 「축 매핑이 자세 종속」).
//
// 참고 스윕(반려 근거). 처음엔 "손목이 교차하면 안 된다"는
// 기준으로 10° 를 골랐는데, 그게 **틀린 기준이었다**(육안 반증: "손바닥을 갖다대지도 않는다").
// Hand 본 원점은 손바닥 안쪽이라 손바닥이 맞닿으면 손목끼리는 거의 일치한다. 손목 교차를 없애면
// 손바닥이 손 두께만큼 강제로 벌어진다. → 판정을 **손바닥 중심 거리**로 바꾸고 다시 재보정했다.
//
// 손바닥 중심 거리 스윕(최솟값, m). 육안 기준점: 0.011=겹쳐 보임 / 0.023=제대로 닿음 / 0.081=허공
//
//   spread     남자1      여자1
//     0°      0.0226    0.0106  ← 원본. 남자1 최적 / 여자1 겹침(육안 확인)
//     3°      0.0306    0.0170
//     5°      0.0433    0.0194
//     6°      0.0493    0.0216  ← 여자1 최적 / 남자1 접촉 부족
//     7°      0.0562    0.0261  ← 남자1 접촉 상한(0.05) 초과
//    10°      0.0810    0.0397  ← 둘 다 허공
//
// **남자1 최적 0° / 여자1 최적 6° 로 최적점이 어긋나고 그 사이에 양쪽 통과하는 값이 없다.**
// 게다가 벌릴수록 차이가 커진다(팔 긴 쪽이 1도당 더 열림) → 상수 오프셋으로는 원리적으로 못 푼다.
// 이게 "접촉 동작에는 위치 제약(=최소 IK)이 필요하다"는 결론의 정량적 근거다.
//
// 출력은 GLB 구조를 그대로 두고 **회전 accessor 의 float 만 제자리 덮어쓰기** → 결정적 재생성.
//
//   node scripts/makeClapVrma.mjs [--spread 10] [--sign 1] [--keep-fingers] [--out ...]

import { readFileSync, writeFileSync } from 'fs';

const REPO = '/Users/Dongmin/new_workspace/drei-avatar-project';
const arg = (n, f) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : f;
};

const BASE = `${REPO}/public/animations/clap-src.vrma`;
const SPREAD = Number(arg('spread', 0)); // 상완 바깥 회전(도, 한쪽당)
const SIGN = Number(arg('sign', 1)); // 바깥 방향 부호 (리그 축 방향에 따라 뒤집는다)
const FLATTEN = !process.argv.includes('--keep-fingers'); // 손가락 펴서 모으기
const OUT = arg('out', `${REPO}/public/animations/clap.vrma`);

function parseGlb(path) {
  const buf = readFileSync(path);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67)
    throw new Error(`GLB 아님: ${path}`);
  const total = dv.getUint32(8, true);
  let off = 12,
    json = null,
    binOff = 0;
  while (off < total) {
    const len = dv.getUint32(off, true),
      type = dv.getUint32(off + 4, true);
    if (type === 0x4e4f534a)
      json = JSON.parse(
        new TextDecoder().decode(buf.subarray(off + 8, off + 8 + len)),
      );
    if (type === 0x004e4942) binOff = off + 8;
    off += 8 + len + ((4 - (len % 4)) % 4);
  }
  return { buf, dv, json, binOff };
}

function accOffset(g, idx) {
  const acc = g.json.accessors[idx];
  const bv = g.json.bufferViews[acc.bufferView];
  return g.binOff + (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
}
function readFloats(g, idx) {
  const acc = g.json.accessors[idx];
  const comps = { SCALAR: 1, VEC3: 3, VEC4: 4 }[acc.type];
  const start = accOffset(g, idx);
  const out = new Float32Array(acc.count * comps);
  for (let i = 0; i < out.length; i++)
    out[i] = g.dv.getFloat32(start + i * 4, true);
  return out;
}
function writeFloats(g, idx, data) {
  const start = accOffset(g, idx);
  for (let i = 0; i < data.length; i++)
    g.dv.setFloat32(start + i * 4, data[i], true);
  const acc = g.json.accessors[idx];
  if (acc.min || acc.max) {
    const comps = { SCALAR: 1, VEC3: 3, VEC4: 4 }[acc.type];
    const min = new Array(comps).fill(Infinity),
      max = new Array(comps).fill(-Infinity);
    for (let i = 0; i < data.length; i++) {
      const c = i % comps;
      if (data[i] < min[c]) min[c] = data[i];
      if (data[i] > max[c]) max[c] = data[i];
    }
    acc.min = min;
    acc.max = max;
  }
}

// 쿼터니언 (xyzw)
const mul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const conj = (q) => [-q[0], -q[1], -q[2], q[3]];
const axisAngleV = (v, rad) => {
  const s = Math.sin(rad / 2);
  return [v[0] * s, v[1] * s, v[2] * s, Math.cos(rad / 2)];
};
const rotV = (q, v) => {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1];
  const iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0];
  const iw = -x * v[0] - y * v[1] - z * v[2];
  return [
    ix * w + iw * -x + iy * -z - iz * -y,
    iy * w + iw * -y + iz * -x - ix * -z,
    iz * w + iw * -z + ix * -y - iy * -x,
  ];
};

function parentMap(json) {
  const p = new Map();
  json.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => p.set(c, i)));
  return p;
}
function rotationSamplerFn(g, nodeIdx) {
  const ch = g.json.animations[0].channels.find(
    (c) => c.target.node === nodeIdx && c.target.path === 'rotation',
  );
  if (!ch) return null;
  const s = g.json.animations[0].samplers[ch.sampler];
  const t = readFloats(g, s.input);
  const q = readFloats(g, s.output);
  return (time) => {
    let i = 0;
    while (i < t.length - 1 && t[i + 1] < time) i++;
    return [q[i * 4], q[i * 4 + 1], q[i * 4 + 2], q[i * 4 + 3]];
  };
}
/** 부모까지의 월드 회전을 FK 로 누적 (축 변환용 — 위치는 안 쓴다) */
function parentWorldRotation(g, nodeIdx, t, pmap, cache) {
  const chain = [];
  let cur = pmap.get(nodeIdx);
  while (cur != null) {
    chain.unshift(cur);
    cur = pmap.get(cur);
  }
  let q = [0, 0, 0, 1];
  for (const idx of chain) {
    const fn = cache.get(idx);
    q = mul(q, fn ? fn(t) : (g.json.nodes[idx].rotation ?? [0, 0, 0, 1]));
  }
  return q;
}

const g = parseGlb(BASE);
const humanBones = g.json.extensions.VRMC_vrm_animation.humanoid.humanBones;
const pmap = parentMap(g.json);
const WORLD_Y = [0, 1, 0];

// ─── 손가락 → 펴서 모은 손 (항등 = 대상 VRM 의 rest 자세) ──────────────────────
if (FLATTEN) {
  const FINGER_RE = /(Thumb|Index|Middle|Ring|Little)/;
  let n = 0;
  for (const [bone, def] of Object.entries(humanBones)) {
    if (!FINGER_RE.test(bone)) continue;
    const ch = g.json.animations[0].channels.find(
      (c) => c.target.node === def.node && c.target.path === 'rotation',
    );
    if (!ch) continue;
    const s = g.json.animations[0].samplers[ch.sampler];
    const acc = g.json.accessors[s.output];
    const data = new Float32Array(acc.count * 4);
    for (let i = 0; i < acc.count; i++) data.set([0, 0, 0, 1], i * 4);
    writeFloats(g, s.output, data);
    n++;
  }
  console.log(`손가락 펴기: ${n}본 (항등 회전 = rest 자세)`);
}

for (const [bone, dir] of [
  ['leftUpperArm', +1],
  ['rightUpperArm', -1],
]) {
  const node = humanBones[bone]?.node;
  if (node == null) throw new Error(`${bone} 없음`);
  const ch = g.json.animations[0].channels.find(
    (c) => c.target.node === node && c.target.path === 'rotation',
  );
  if (!ch) throw new Error(`${bone} 회전 채널 없음`);
  const s = g.json.animations[0].samplers[ch.sampler];

  // 조상 체인 회전 샘플러 캐시 (프레임마다 월드축 → 부모 로컬축 변환)
  const cache = new Map();
  {
    let cur = pmap.get(node);
    while (cur != null) {
      const fn = rotationSamplerFn(g, cur);
      if (fn) cache.set(cur, fn);
      cur = pmap.get(cur);
    }
  }

  const t = readFloats(g, s.input);
  const q = readFloats(g, s.output);
  const out = new Float32Array(q.length);
  const rad = (SPREAD * Math.PI) / 180 * dir * SIGN;
  for (let i = 0; i < t.length; i++) {
    // 목표: R_world · (Q_parent · q)  ⇒  q' = (Q_parent⁻¹ · R_world · Q_parent) · q
    const qp = parentWorldRotation(g, node, t[i], pmap, cache);
    const axisLocal = rotV(conj(qp), WORLD_Y);
    const cur = [q[i * 4], q[i * 4 + 1], q[i * 4 + 2], q[i * 4 + 3]];
    out.set(mul(axisAngleV(axisLocal, rad), cur), i * 4);
  }
  writeFloats(g, s.output, out);
  console.log(
    `${bone}: 월드Y ${((rad * 180) / Math.PI).toFixed(1)}° 오프셋 (${t.length}프레임)`,
  );
}

// ─── 저장 (JSON 청크 길이가 바뀔 수 있으므로 재작성) ───────────────────────────
const jsonBytes = new TextEncoder().encode(JSON.stringify(g.json));
const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
const jsonLen = jsonBytes.length + jsonPad;
const binStart = g.binOff;
const binLenOrig = g.dv.getUint32(binStart - 8, true);
const bin = g.buf.subarray(binStart, binStart + binLenOrig);
const binPad = (4 - (bin.length % 4)) % 4;

const total = 12 + 8 + jsonLen + 8 + bin.length + binPad;
const out = Buffer.alloc(total);
const odv = new DataView(out.buffer, out.byteOffset, out.byteLength);
odv.setUint32(0, 0x46546c67, true);
odv.setUint32(4, 2, true);
odv.setUint32(8, total, true);
odv.setUint32(12, jsonLen, true);
odv.setUint32(16, 0x4e4f534a, true);
out.set(jsonBytes, 20);
out.fill(0x20, 20 + jsonBytes.length, 20 + jsonLen);
let p = 20 + jsonLen;
odv.setUint32(p, bin.length + binPad, true);
odv.setUint32(p + 4, 0x004e4942, true);
out.set(bin, p + 8);

writeFileSync(OUT, out);
console.log(`\n✅ ${OUT}  (${(out.length / 1024).toFixed(0)}KB)  spread=${SPREAD}° sign=${SIGN}`);
