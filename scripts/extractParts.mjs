// VRoid 소스 VRM에서 부위별 파츠를 떼어낸다 (라이브러리 추출기).
//   정적 의류(상의/하의/액세서리) → GLB (VRM 확장 제거, plain GLTFLoader 용)
//   스프링 물리(흔들 헤어) → VRM (VRMC_springBone 보존, VRMLoaderPlugin 용)
//
// 방식: raw glTF 수술. VRoid 통짜 export 안에서 부위는 이미 별도 mesh/머티리얼(프리미티브)다.
//   '모든 노드 + bin 통째 유지' → 스프링/콜라이더/IBM의 node·accessor 참조가 그대로 유효.
//   타깃 mesh만 노드에 남기고(필요시 머티리얼로 프리미티브까지 필터) 나머지 mesh 참조를 끊는다.
//
// 본/지오메트리/텍스처 prune (GLB 전용):
//   raw 수술은 참조 무결성을 위해 끊긴 Face 메시·미사용 머티리얼·텍스처를 bin에 통째로 남긴다
//   (파츠당 ~13MB). 정적 GLB는 확장이 없어 안전하므로 gltf-transform prune+dedup으로 회수한다
//   → ~1MB. VRM(스프링)은 gltf-transform이 VRMC_springBone을 모르고 써내며 떨궈버리므로 prune
//   대상에서 제외(raw 유지). VRM 본 prune은 VRM 인지 prune 도입 후 후속 과제.
//
// 스프링 본 네임스페이싱 (VRM 전용):
//   VRoid는 헤어마다 J_Sec_Hair* 본 이름을 재사용한다 → 여러 스프링 파츠를 동시에 base Head로
//   이식하면 이름 충돌(rebind 가 엉뚱한 본에 매칭). 추출 시 헤어 스프링 노드 name에 파츠 prefix를
//   붙여 전역 고유화한다. 스프링/스킨 조인트는 인덱스 참조라 name 변경에 안전하고, 런타임 매칭
//   (/Hair/i graft + 정확한 이름 rebind)은 prefix가 붙어도 'Hair' 부분문자열·고유성 모두 유지.
//
// 실행: node scripts/extractParts.mjs

import fs from 'fs'
import { NodeIO } from '@gltf-transform/core'
import { prune, dedup } from '@gltf-transform/functions'

const DIR = 'public/avatars'
const MAGIC = 0x46546c67
const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942

// ── 추출 잡 정의 ── (부위 추가 = 여기에 한 줄)
const JOBS = [
  // 상의 변형(Body 메시에서 Tops_01_CLOTH 프리미티브만 추출)
  { src: 'male1/parts/male_white_shirt.vrm',  mesh: 'Body', keepMaterial: 'Tops_01_CLOTH',    out: 'male1/Tops_white_shirt.glb',    vrm: false },
  { src: 'male1/parts/male_top_basic.vrm',    mesh: 'Body', keepMaterial: 'Tops_01_CLOTH',    out: 'male1/Tops_basic.glb',          vrm: false },
  { src: 'male1/parts/male_top_hawaian.vrm',  mesh: 'Body', keepMaterial: 'Tops_01_CLOTH',    out: 'male1/Tops_hawaian.glb',        vrm: false },
  // 하의 변형(Bottoms_01_CLOTH / 흰 바지는 Onepiece_00_CLOTH 2프리미티브)
  { src: 'male1/parts/male_scotch_pants.vrm', mesh: 'Body', keepMaterial: 'Bottoms_01_CLOTH', out: 'male1/Bottoms_scotch_pants.glb', vrm: false },
  { src: 'male1/parts/male_bottom_jean.vrm',  mesh: 'Body', keepMaterial: 'Bottoms_01_CLOTH', out: 'male1/Bottoms_jean.glb',         vrm: false },
  { src: 'male1/parts/male_bottom_white_pants.vrm', mesh: 'Body', keepMaterial: 'Onepiece_00_CLOTH', out: 'male1/Bottoms_white_pants.glb', vrm: false },
  { src: 'male_sample.vrm',                   mesh: 'Hair',                                     out: 'Hair_sample.vrm', vrm: true, springKeep: 'Hair', nsBones: '^J_Sec_.*Hair' },
  // 얼굴(B트랙): Face 메시 통째(8 머티리얼·57 모프). **VRM 으로** 추출 — base 가 MToon(툰 셰이딩)이라
  //   GLB(PBR)로 빼면 톤이 어긋남 → VRMC_materials_mtoon 보존 위해 VRM 유지(VRMLoaderPlugin 로드).
  //   변형이 옮긴 눈 본(J_Adj_*FaceEye)만 네임스페이스 → 로더가 base 눈 본(46.7mm 어긋남) 대신 '자기 눈
  //   본'을 graft. 표정은 base 익스프레션 인덱스(양 파일 동일) 재사용 → base Face influences 를 새 Face 로 미러.
  { src: 'male_eye_sample.vrm',               mesh: 'Face',                                     out: 'male1/Face_eyesample.vrm', vrm: true, nsBones: 'FaceEye' },

  // ── female1 (베이스: female1/female_base.vrm) ──
  // 상의(Body 메시 Tops_01_CLOTH). top_3 은 타이(Accessory_Tie)·top_4 는 Onepiece/Shoes 가 섞여
  //   Tops_01_CLOTH 만 남긴다 → 이 둘은 부분 추출이라 **시각 검토** 후 분류 확정(다음 창).
  { src: 'female1/parts/female_top_1.vrm', mesh: 'Body', keepMaterial: 'Tops_01_CLOTH', out: 'female1/Tops_1.glb', vrm: false },
  { src: 'female1/parts/female_top_2.vrm', mesh: 'Body', keepMaterial: 'Tops_01_CLOTH', out: 'female1/Tops_2.glb', vrm: false },
  { src: 'female1/parts/female_top_3.vrm', mesh: 'Body', keepMaterial: 'Tops_01_CLOTH', out: 'female1/Tops_3.glb', vrm: false },
  { src: 'female1/parts/female_top_4.vrm', mesh: 'Body', keepMaterial: 'Tops_01_CLOTH', out: 'female1/Tops_4.glb', vrm: false },
  // 하의(Bottoms_01_CLOTH)
  { src: 'female1/parts/female_bottom_1.vrm', mesh: 'Body', keepMaterial: 'Bottoms_01_CLOTH', out: 'female1/Bottoms_1.glb', vrm: false },
  { src: 'female1/parts/female_bottom_2.vrm', mesh: 'Body', keepMaterial: 'Bottoms_01_CLOTH', out: 'female1/Bottoms_2.glb', vrm: false },
  { src: 'female1/parts/female_bottom_3.vrm', mesh: 'Body', keepMaterial: 'Bottoms_01_CLOTH', out: 'female1/Bottoms_3.glb', vrm: false },
  // 얼굴(B트랙, male1 동형 — Face 메시·57모프·눈 본 네임스페이스). face_1 = 베이스 얼굴이라 제외.
  { src: 'female1/parts/female_face_2.vrm', mesh: 'Face', out: 'female1/Face_2.vrm', vrm: true, nsBones: 'FaceEye' },
  { src: 'female1/parts/female_face_3.vrm', mesh: 'Face', out: 'female1/Face_3.vrm', vrm: true, nsBones: 'FaceEye' },
  { src: 'female1/parts/female_face_4.vrm', mesh: 'Face', out: 'female1/Face_4.vrm', vrm: true, nsBones: 'FaceEye' },
  // 헤어(hair_1~4): 앞머리(Hair001 메시 통째) + 뒷머리(Body 메시의 HairBack 프리미티브)가 2메시 분산
  //   → meshes[] 멀티-타깃으로 둘 다 보존(Body 는 HairBack 머티리얼만 남김). 스프링은 Hair 체인 보존,
  //   J_Sec_*Hair 본은 네임스페이스(다중 헤어 동시로드 충돌 방지). 런타임 loadSpringPart 가 멀티-메시 처리.
  { src: 'female1/parts/female_hair_1.vrm', meshes: [{ mesh: 'Hair001' }, { mesh: 'Body', keepMaterial: 'HairBack' }], out: 'female1/Hair_1.vrm', vrm: true, springKeep: 'Hair', nsBones: '^J_Sec_.*Hair' },
  { src: 'female1/parts/female_hair_2.vrm', meshes: [{ mesh: 'Hair001' }, { mesh: 'Body', keepMaterial: 'HairBack' }], out: 'female1/Hair_2.vrm', vrm: true, springKeep: 'Hair', nsBones: '^J_Sec_.*Hair' },
  { src: 'female1/parts/female_hair_3.vrm', meshes: [{ mesh: 'Hair001' }, { mesh: 'Body', keepMaterial: 'HairBack' }], out: 'female1/Hair_3.vrm', vrm: true, springKeep: 'Hair', nsBones: '^J_Sec_.*Hair' },
  { src: 'female1/parts/female_hair_4.vrm', meshes: [{ mesh: 'Hair001' }, { mesh: 'Body', keepMaterial: 'HairBack' }], out: 'female1/Hair_4.vrm', vrm: true, springKeep: 'Hair', nsBones: '^J_Sec_.*Hair' },
]

function parseGLB(path) {
  const buf = fs.readFileSync(path)
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let off = 12
  let json = null
  let bin = null
  while (off < buf.length) {
    const len = dv.getUint32(off, true)
    const type = dv.getUint32(off + 4, true)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === JSON_CHUNK) json = JSON.parse(new TextDecoder().decode(data))
    if (type === BIN_CHUNK) bin = Buffer.from(data)
    off += 8 + len
  }
  return { json, bin }
}

function packGLB(json, bin) {
  const enc = new TextEncoder().encode(JSON.stringify(json))
  const jsonPad = (4 - (enc.length % 4)) % 4
  const binPad = (4 - (bin.length % 4)) % 4
  const total = 12 + 8 + enc.length + jsonPad + 8 + bin.length + binPad
  const out = Buffer.alloc(total)
  let p = 0
  out.writeUInt32LE(MAGIC, p); p += 4
  out.writeUInt32LE(2, p); p += 4
  out.writeUInt32LE(total, p); p += 4
  out.writeUInt32LE(enc.length + jsonPad, p); p += 4
  out.writeUInt32LE(JSON_CHUNK, p); p += 4
  Buffer.from(enc).copy(out, p); p += enc.length
  out.fill(0x20, p, p + jsonPad); p += jsonPad
  out.writeUInt32LE(bin.length + binPad, p); p += 4
  out.writeUInt32LE(BIN_CHUNK, p); p += 4
  bin.copy(out, p); p += bin.length
  out.fill(0x00, p, p + binPad)
  return out
}

// gltf-transform prune+dedup 으로 GLB 압축(끊긴 메시·미사용 머티리얼/텍스처/액세서리 제거).
// 정적 GLB 한정 — VRM 확장이 없어 무손실로 안전.
async function pruneGlb(path) {
  const io = new NodeIO()
  const doc = await io.read(path)
  await doc.transform(prune(), dedup())
  await io.write(path, doc)
}

// material/textureInfo 안의 모든 texture index(.index)를 texMap 으로 재매핑(중첩/확장 포함 재귀).
function remapTexInObject(obj, texMap) {
  if (Array.isArray(obj)) { obj.forEach((v) => remapTexInObject(v, texMap)); return }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'index' && typeof v === 'number' && texMap.has(v)) obj.index = texMap.get(v)
      else remapTexInObject(v, texMap)
    }
  }
}

// VRM 안전 prune (raw 수술): 렌더되는 mesh 가 안 쓰는 머티리얼·텍스처·이미지 제거 + bin 재패킹.
//   ★ accessor/모프타깃/skin/노드/VRMC(springBone·humanoid·expressions·firstPerson)는 일절 안 건드린다 —
//     이들은 node/mesh/accessor 인덱스 참조라 그대로 유효. 이동하는 건 material/texture/image/bufferView
//     인덱스뿐이고, 그 참조처(primitive.material, material 텍스처, texture.source, meta.thumbnail,
//     expression material binds)만 갱신한다. → 모프·표정·스프링 보존, 확장성 유지.
//   회수 대상: 미사용 머티리얼/텍스처/이미지의 bufferView 데이터(주로 다른 부위 텍스처).
function pruneVrm(path) {
  const { json: g, bin } = parseGLB(path)
  if (!g.materials || !g.bufferViews) return

  // 1) 렌더되는(노드가 참조하는) mesh 가 쓰는 머티리얼만 보존
  const rendered = new Set(g.nodes.filter((n) => n.mesh !== undefined).map((n) => n.mesh))
  const keptMat = new Set()
  g.meshes.forEach((m, mi) => {
    if (rendered.has(mi)) m.primitives.forEach((p) => { if (p.material != null) keptMat.add(p.material) })
  })
  // 2) 보존 머티리얼이 참조하는 텍스처(모든 .index 수집 — over-keep 은 안전)
  const keptTex = new Set()
  for (const mi of keptMat) {
    JSON.stringify(g.materials[mi]).replace(/"index":\s*(\d+)/g, (_, n) => { keptTex.add(+n); return _ })
  }
  // expression material binds 가 참조하는 머티리얼도 보존(있으면)
  const exprMatBinds = []
  const pre = g.extensions?.VRMC_vrm?.expressions
  for (const grp of [pre?.preset, pre?.custom]) {
    for (const v of Object.values(grp || {})) {
      for (const b of [...(v.materialColorBinds || []), ...(v.textureTransformBinds || [])]) {
        keptMat.add(b.material); exprMatBinds.push(b)
      }
    }
  }
  for (const mi of keptMat) JSON.stringify(g.materials[mi]).replace(/"index":\s*(\d+)/g, (_, n) => { keptTex.add(+n); return _ })
  // 3) 보존 이미지(보존 텍스처의 source + VRM 썸네일)
  const keptImg = new Set()
  for (const ti of keptTex) { const t = g.textures?.[ti]; if (t && t.source != null) keptImg.add(t.source) }
  const thumb = g.extensions?.VRMC_vrm?.meta?.thumbnailImage
  if (thumb != null) keptImg.add(thumb)
  // 4) 보존 bufferView = 모든 accessor 의 BV(geometry/morph/skin 전부 유지) ∪ 보존 이미지 BV
  const keptBV = new Set()
  g.accessors.forEach((a) => {
    if (a.bufferView != null) keptBV.add(a.bufferView)
    if (a.sparse) { keptBV.add(a.sparse.indices.bufferView); keptBV.add(a.sparse.values.bufferView) }
  })
  for (const ii of keptImg) { const im = g.images?.[ii]; if (im && im.bufferView != null) keptBV.add(im.bufferView) }

  // bufferView 재패킹 → 새 bin + old→new 인덱스 맵
  const bvList = [...keptBV].sort((a, b) => a - b)
  const bvMap = new Map()
  const newBVs = []
  const parts = []
  let off = 0
  for (const oldIdx of bvList) {
    const bv = g.bufferViews[oldIdx]
    const pad = (4 - (off % 4)) % 4
    if (pad) { parts.push(Buffer.alloc(pad)); off += pad }
    const data = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength)
    const nbv = { buffer: 0, byteOffset: off, byteLength: bv.byteLength }
    if (bv.byteStride != null) nbv.byteStride = bv.byteStride
    if (bv.target != null) nbv.target = bv.target
    bvMap.set(oldIdx, newBVs.length)
    newBVs.push(nbv)
    parts.push(Buffer.from(data))
    off += bv.byteLength
  }
  const newBin = Buffer.concat(parts)

  // accessor.bufferView 재매핑(인덱스만; accessor 자체/byteOffset 불변)
  g.accessors.forEach((a) => {
    if (a.bufferView != null) a.bufferView = bvMap.get(a.bufferView)
    if (a.sparse) {
      a.sparse.indices.bufferView = bvMap.get(a.sparse.indices.bufferView)
      a.sparse.values.bufferView = bvMap.get(a.sparse.values.bufferView)
    }
  })
  // images 재색인(+BV 재매핑)
  const imgMap = new Map(); const newImages = []
  g.images.forEach((im, i) => {
    if (keptImg.has(i)) { if (im.bufferView != null) im.bufferView = bvMap.get(im.bufferView); imgMap.set(i, newImages.length); newImages.push(im) }
  })
  // textures 재색인(+source 재매핑)
  const texMap = new Map(); const newTextures = []
  g.textures.forEach((t, i) => {
    if (keptTex.has(i)) { if (t.source != null) t.source = imgMap.get(t.source); texMap.set(i, newTextures.length); newTextures.push(t) }
  })
  // materials 재색인(+텍스처 .index 재매핑)
  const matMap = new Map(); const newMaterials = []
  g.materials.forEach((m, i) => {
    if (keptMat.has(i)) { remapTexInObject(m, texMap); matMap.set(i, newMaterials.length); newMaterials.push(m) }
  })
  // 참조처 갱신: primitive.material(전 mesh — 죽은 mesh 의 dangling 머티리얼은 제거)
  g.meshes.forEach((m) => m.primitives.forEach((p) => {
    if (p.material != null) { const nm = matMap.get(p.material); if (nm != null) p.material = nm; else delete p.material }
  }))
  if (thumb != null && g.extensions?.VRMC_vrm?.meta) g.extensions.VRMC_vrm.meta.thumbnailImage = imgMap.get(thumb)
  for (const b of exprMatBinds) b.material = matMap.get(b.material)

  g.bufferViews = newBVs
  g.images = newImages
  g.textures = newTextures
  g.materials = newMaterials
  g.buffers = [{ byteLength: newBin.length }]
  fs.writeFileSync(path, packGLB(g, newBin))
}

function runJob(job) {
  const { json: g, bin } = parseGLB(`${DIR}/${job.src}`)

  // 타깃 mesh — 단일(job.mesh) 또는 멀티(job.meshes[{mesh, keepMaterial}]) 통일 처리.
  const targets = job.meshes ?? [{ mesh: job.mesh, keepMaterial: job.keepMaterial }]
  const keepIdx = new Set()
  const outName = job.out.split('/').pop().replace(/\.\w+$/, '')
  targets.forEach((t, ti) => {
    const mi = g.meshes.findIndex((m) => new RegExp(t.mesh, 'i').test(m.name))
    if (mi < 0) throw new Error(`${job.src}: mesh "${t.mesh}" 없음`)
    // 머티리얼 필터(있으면) — 그 mesh 안에서 해당 프리미티브만 남김
    if (t.keepMaterial) {
      const kept = g.meshes[mi].primitives.filter((p) =>
        (g.materials?.[p.material]?.name ?? '').includes(t.keepMaterial),
      )
      if (!kept.length) throw new Error(`${job.src}: material "${t.keepMaterial}" 없음 (mesh ${t.mesh})`)
      g.meshes[mi].primitives = kept
    }
    // 멀티 타깃이면 출력명에 인덱스 suffix(메시 이름 고유화)
    g.meshes[mi].name = targets.length > 1 ? `${outName}_${ti}` : outName
    keepIdx.add(mi)
  })

  // 보존 대상 외 mesh 는 노드 참조 제거(렌더 끊기) — node·accessor 인덱스는 유지
  g.nodes.forEach((n) => {
    if (n.mesh !== undefined && !keepIdx.has(n.mesh)) delete n.mesh
  })

  if (job.vrm) {
    // VRM 유지: 스프링을 지정 체인만 남김(노드 인덱스 보존 → 참조 유효)
    const sb = g.extensions?.VRMC_springBone
    if (sb?.springs && job.springKeep) {
      sb.springs = sb.springs.filter((s) =>
        s.joints?.some((j) => (g.nodes[j.node]?.name ?? '').includes(job.springKeep)),
      )
    }
    // 표정 morphTargetBinds 중 드롭된(렌더 안 되는) 메시를 가리키는 바인드 제거. 안 그러면 three-vrm
    //   VRMExpressionLoaderPlugin 이 없는 메시의 모프에 접근해 터진다(null.every). 헤어처럼 Face 를
    //   드롭한 파츠는 14개 전부 dangling → 비워짐(헤어는 표정 불필요). 얼굴 파츠는 Face 보존이라 유지.
    const rendered = new Set(g.nodes.filter((n) => n.mesh !== undefined).map((n) => n.mesh))
    const expr = g.extensions?.VRMC_vrm?.expressions
    for (const grp of [expr?.preset, expr?.custom]) {
      for (const v of Object.values(grp || {})) {
        if (v.morphTargetBinds) {
          v.morphTargetBinds = v.morphTargetBinds.filter((b) => {
            const nd = g.nodes[b.node]
            return nd && nd.mesh !== undefined && rendered.has(nd.mesh)
          })
        }
      }
    }
  } else {
    // GLB: VRM 확장 제거(순수 GLTFLoader)
    delete g.extensionsRequired
    delete g.extensions
  }

  // 본 네임스페이싱(공통): nsBones 정규식에 걸리는 본 node name 에 파츠 prefix 부여.
  //   목적 1 — 스프링 충돌 방지: 헤어마다 J_Sec_*Hair* 이름 재사용 → 다중 파츠 동시 로드 시 충돌.
  //   목적 2 — 본 graft 강제: 얼굴 변형이 옮긴 본(J_Adj_*FaceEye)은 base 와 같은 이름이면 rebind 가
  //     base 본(엉뚱한 위치)에 매칭됨 → prefix 로 base 와 이름을 어긋내 로더가 '자기 본'을 graft 하게 함.
  //   node 참조는 인덱스라 name 변경에 안전. 런타임 매칭은 부분문자열(/Hair/i, /FaceEye/)·고유성 유지.
  let renamed = 0
  if (job.nsBones) {
    const prefix = job.ns ?? job.out.split('/').pop().replace(/\.\w+$/, '')
    const re = new RegExp(job.nsBones)
    g.nodes.forEach((n) => {
      if (n.name && re.test(n.name)) { n.name = `${prefix}__${n.name}`; renamed++ }
    })
  }

  fs.writeFileSync(`${DIR}/${job.out}`, packGLB(g, bin))
  return { renamed }
}

for (const job of JOBS) {
  const { renamed } = runJob(job)
  const before = fs.statSync(`${DIR}/${job.out}`).size
  if (!job.vrm) await pruneGlb(`${DIR}/${job.out}`) // GLB: gltf-transform prune
  else pruneVrm(`${DIR}/${job.out}`)                // VRM: 안전 텍스처 prune(모프·VRMC 보존)

  // 자가검수 — 재파싱해 무결성 확인(모프·프리미티브·텍스처 참조 유효 + 용량 회수)
  const re = parseGLB(`${DIR}/${job.out}`)
  const rn = re.json.nodes.filter((n) => n.mesh !== undefined)
  const mb = (fs.statSync(`${DIR}/${job.out}`).size / 1024 / 1024).toFixed(1)
  const saved = ((before - fs.statSync(`${DIR}/${job.out}`).size) / 1024 / 1024).toFixed(1)
  const springs = re.json.extensions?.VRMC_springBone?.springs?.length
  const renderedMeshes = new Set(rn.map((n) => n.mesh))
  const prims = [...renderedMeshes].reduce((s, mi) => s + re.json.meshes[mi].primitives.length, 0)
  // 무결성 가드: 보존 머티리얼의 텍스처/이미지 참조가 범위 내인지
  let dangling = 0
  re.json.materials?.forEach((m) => JSON.stringify(m).replace(/"index":\s*(\d+)/g, (_, n) => {
    if (+n >= (re.json.textures?.length ?? 0)) dangling++; return _
  }))
  re.json.textures?.forEach((t) => { if (t.source != null && t.source >= (re.json.images?.length ?? 0)) dangling++ })
  const morphs = job.vrm ? re.json.meshes[[...renderedMeshes][0]]?.primitives[0]?.targets?.length : null
  console.log(
    `✅ ${job.out} (${mb}MB, -${saved}MB) 렌더노드 ${rn.length}·prim ${prims}` +
      (job.vrm
        ? (morphs != null ? ` · 모프 ${morphs}` : '') +
          (springs != null ? ` · 스프링 ${springs}` : '') +
          (renamed ? ` · 네임스페이스 ${renamed}본` : '')
        : ' · GLB·pruned') +
      (dangling ? ` · ⚠️ dangling ${dangling}` : ''),
  )
}
