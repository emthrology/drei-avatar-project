import { VRM, VRMHumanBoneName, VRMLoaderPlugin, MToonMaterial } from '@pixiv/three-vrm'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

// ─── 실제 authored GLB 파츠 로더 (미증명 ④의 검증 경로) ────────────────────────
// dummyParts 의 makeShirtShell 은 "베이스 바디를 복제"해 같은 스켈레톤에 bind 했다 —
// 즉 소스 스켈레톤과 타깃 스켈레톤이 애초에 동일 객체였다. 실제 외주 파츠는 GLB 안에
// '자기 자신의 스켈레톤'을 들고 들어온다. 따라서 진짜 리스크는:
//   "외부 SkinnedMesh 의 자체 스켈레톤 → base 스켈레톤으로 rebind 했을 때 변형 추종되는가"
// 이 파일이 그 경로다. ASSET_SPEC §1 컨벤션 락(동일 본 이름 / A-pose / scale 1.0)을 전제로
// 본 이름 매칭 후 boneInverses 를 재사용해 rebind 한다.
// ───────────────────────────────────────────────────────────────────────────

export interface LoadedPart {
  root: THREE.Object3D // base scene 에 추가된 객체(또는 head 본에 부착된 리지드 루트)
  skinned: THREE.SkinnedMesh[] // base 스켈레톤으로 rebind 된 스킨드 메시
  rigid: THREE.Object3D[] // head 본 등에 리지드 부착된 객체
  missingBones: string[] // base 에서 못 찾은 '가중된' 본 이름(파츠 규약 위반 신호)
  setVisible: (v: boolean) => void
  dispose: () => void
}

// 지오메트리에서 실제 가중(weight>0)된 본 인덱스 집합. skinIndex 는 skeleton.bones 배열 인덱스.
function usedBoneIndices(geo: THREE.BufferGeometry): Set<number> {
  const used = new Set<number>()
  const idx = geo.getAttribute('skinIndex')
  const wgt = geo.getAttribute('skinWeight')
  if (!idx || !wgt) return used
  for (let i = 0; i < idx.count; i++) {
    for (let k = 0; k < 4; k++) {
      if (wgt.getComponent(i, k) > 0) used.add(idx.getComponent(i, k))
    }
  }
  return used
}

// base VRM 의 '원시 본'을 이름→Bone 으로 인덱싱. 파츠 스키닝이 참조하는 실제 본들이다.
function indexBaseBones(baseVrm: VRM): Map<string, THREE.Bone> {
  const map = new Map<string, THREE.Bone>()
  baseVrm.scene.traverse((o) => {
    const b = o as THREE.Bone
    if (b.isBone && !map.has(b.name)) map.set(b.name, b)
  })
  return map
}

// 파츠가 데려온 '보조 본'을 base 의 대응 부모 본 아래로 graft 한다.
//   VRoid 옷은 소매/옷자락 흔들림용 secondary 본(J_Sec_*TopsUpperArm*, J_Sec_*CoatSkirt* 등)을
//   쓰는데, 이 본들은 맨몸 base 에 없다 → 이름 매칭 rebind 가 실패해 그 정점이 파츠 bind pose
//   (A-pose)에 고정된다(소매가 옆으로 뻗는 현상). 부모가 base 에 있는 본(예: UpperArm)인 보조
//   본을 그 부모 아래로 reparent(local transform 보존)하면 base 본을 리지드로 추종 → rebind 매칭.
//   스프링 매니저는 안 붙으므로 흔들림 없이 정적으로 따라간다(정적 의류엔 충분).
function graftAuxBones(partScene: THREE.Object3D, baseVrm: VRM): THREE.Object3D[] {
  const baseBones = indexBaseBones(baseVrm)
  const roots: THREE.Bone[] = []
  partScene.traverse((o) => {
    const b = o as THREE.Bone
    // base 에 없고(=보조 본) 부모가 base 에 있는 본 = graft 서브트리 루트(_end 등 자식은 함께 이동)
    if (b.isBone && !baseBones.has(b.name) && b.parent && baseBones.has(b.parent.name)) roots.push(b)
  })
  const grafted: THREE.Object3D[] = []
  for (const b of roots) {
    baseBones.get(b.parent!.name)!.add(b) // reparent(서브트리 통째, local transform 보존)
    grafted.push(b)
  }
  return grafted
}

// 외부 SkinnedMesh 를 base 스켈레톤으로 rebind.
// 핵심: 지오메트리의 skinIndex 는 '원본 skeleton.bones 배열의 인덱스'를 가리키므로,
// 같은 순서로 base 본을 치환한 새 본 배열을 만들어야 한다. boneInverses 는 바인드 포즈가
// 락(동일 A-pose)이므로 원본 것을 재사용한다(미세 차이 시 ASSET_SPEC §1 위반 → 납품 리젝).
function rebindToBase(
  sm: THREE.SkinnedMesh,
  baseBoneByName: Map<string, THREE.Bone>,
  missing: string[],
): void {
  const orig = sm.skeleton
  const used = usedBoneIndices(sm.geometry) // 미사용 본(VRoid 잔존 스프링 본 등)은 누락 보고 제외
  const bones = orig.bones.map((b, i) => {
    const match = baseBoneByName.get(b.name)
    if (!match) {
      if (used.has(i)) missing.push(b.name) // 가중된 본이 base 에 없을 때만 규약 위반
      return b // fallback: 원본 본 유지
    }
    return match
  })
  const skeleton = new THREE.Skeleton(bones, orig.boneInverses.map((m) => m.clone()))
  sm.bind(skeleton, sm.bindMatrix)
  sm.frustumCulled = false // 변형으로 바운딩박스가 어긋나 컬링되는 사고 방지
}

// ─── MToon 입히기 (옷 GLB 파츠) ──────────────────────────────────────────────
// 옷 파츠는 추출 시 gltf-transform prune 이 VRMC_materials_mtoon 을 떨궈 PBR(MeshStandardMaterial)
// 로 로드된다 → 베이스 몸체·얼굴(MToon 툰)과 톤이 어긋난다. 런타임에 베이스컬러 텍스처/색을 옮겨
// MToonMaterial 로 재구성해 톤을 맞춘다. 저작 shade 색은 prune 에서 소실 → male_base.vrm 실측
// 표준값으로 합성(옷 소스 VRM 도 동일: toony 0.95 · shift -0.05 · shade≈base×0.87).
//
// 아웃라인(외곽선)은 의도적으로 안 붙인다: 소매단·프릴 등 촘촘한 의류 지오메트리에선 BackSide 확장
// 외곽선이 겹쳐 검은 뭉침으로 보였다. 실루엣 외곽선은 base 몸체가 이미 갖고 있으므로 셰이딩 톤만 맞춘다.
const MTOON_SHADE_MUL = 0.87 // 저작 shade 가 대략 base×0.85~0.9 라 그 중간값으로 근사

function toMToon(src: THREE.Material): MToonMaterial {
  const std = src as THREE.MeshStandardMaterial
  const color = (std.color ?? new THREE.Color(1, 1, 1)).clone()
  const mat = new MToonMaterial({})
  mat.name = src.name
  // 표면 속성 이식
  mat.color = color
  mat.map = std.map ?? null
  mat.normalMap = std.normalMap ?? null
  if (std.normalScale) mat.normalScale.copy(std.normalScale)
  mat.emissiveMap = std.emissiveMap ?? null
  if (std.emissive) mat.emissive = std.emissive.clone()
  mat.transparent = src.transparent
  mat.opacity = src.opacity
  mat.alphaTest = src.alphaTest
  mat.depthWrite = src.depthWrite
  mat.side = src.side
  // 툰 셰이딩 — base 몸체/얼굴과 동일 표준값(male_base.vrm 실측, 옷 소스 VRM 도 동일).
  mat.shadeColorFactor = color.clone().multiplyScalar(MTOON_SHADE_MUL)
  mat.shadeMultiplyTexture = std.map ?? null
  mat.shadingToonyFactor = 0.95
  mat.shadingShiftFactor = -0.05
  // 알파 컷아웃(레이스/프릴, alphaMode MASK) 동기화: MToon 은 alphaTest 임계값을 별도 uniform 으로
  // 들고 매 프레임 update(delta) 에서만 갱신한다(VRM 본체는 three-vrm 가 틱해 줌). 수동 생성한 옷
  // 머티리얼은 틱되지 않으므로 uniform 이 0 으로 남아 컷아웃이 버려지지 않고 투명영역의 검정이 찍힌다.
  // 옷은 UV 애니메이션이 없어 생성 시 1회 동기화로 충분하다.
  mat.uniforms.alphaTest.value = mat.alphaTest
  return mat
}

// 메시의 PBR 머티리얼을 MToon 으로 교체한다. 멀티프리미티브 파츠(예: 여자1 원피스 = 1메시 4프리미티브
// → 머티리얼 배열 + 지오 그룹)도 슬롯별로 변환한다. 지오 그룹은 그대로 두므로 매핑 보존. 이미 MToon 이면 통과.
function convertPartToMToon(mesh: THREE.Mesh): void {
  const orig = mesh.material
  const list = Array.isArray(orig) ? orig : [orig]
  if (list.every((m) => m instanceof MToonMaterial)) return
  const converted = list.map((m) => (m instanceof MToonMaterial ? m : toMToon(m)))
  list.forEach((m) => { if (!(m instanceof MToonMaterial)) m.dispose() })
  mesh.material = Array.isArray(orig) ? converted : converted[0]
}

// authored GLB 파츠 1개를 로드해 base VRM 에 조립한다.
//   - 스킨드 파츠(상의/하의/스킨 헤어): SkinnedMesh 를 base 스켈레톤으로 rebind 후 scene 에 add
//   - 리지드 파츠(고정 헤어): 스킨드 메시가 없으면 head 원시 본에 통째로 parent
export async function loadPart(url: string, baseVrm: VRM): Promise<LoadedPart> {
  const loader = new GLTFLoader()
  const gltf = await loader.loadAsync(url)

  const missingBones: string[] = []
  const skinned: THREE.SkinnedMesh[] = []

  gltf.scene.traverse((o) => {
    const sm = o as THREE.SkinnedMesh
    if (sm.isSkinnedMesh) skinned.push(sm)
  })

  // 옷이 데려온 보조 본(소매/옷자락 J_Sec_*)을 base 부모 아래로 graft → rebind 매칭(graft 후 인덱싱)
  const graftedBones = graftAuxBones(gltf.scene, baseVrm)
  const baseBoneByName = indexBaseBones(baseVrm)

  const rigid: THREE.Object3D[] = []

  if (skinned.length > 0) {
    // 스킨드 파츠: 메시만 떼어 base 스켈레톤에 rebind
    for (const sm of skinned) {
      rebindToBase(sm, baseBoneByName, missingBones)
      convertPartToMToon(sm) // PBR → MToon (베이스 툰과 톤 일치)
      sm.removeFromParent()
      baseVrm.scene.add(sm)
    }
  } else {
    // 리지드 파츠: head 원시 본에 통째로 부착
    const headRaw = baseVrm.humanoid.getRawBoneNode(VRMHumanBoneName.Head)
    if (headRaw) {
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh) convertPartToMToon(m)
      })
      headRaw.add(gltf.scene)
      rigid.push(gltf.scene)
    }
  }

  const dispose = () => {
    for (const sm of skinned) {
      sm.removeFromParent()
      sm.geometry.dispose()
      const mats = Array.isArray(sm.material) ? sm.material : [sm.material]
      mats.forEach((m) => m.dispose())
    }
    for (const r of rigid) {
      r.removeFromParent()
      r.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        if (m.material) {
          const mats = Array.isArray(m.material) ? m.material : [m.material]
          mats.forEach((mat) => mat.dispose())
        }
      })
    }
    for (const b of graftedBones) b.removeFromParent() // graft 한 보조 본 정리
  }

  const setVisible = (v: boolean) => {
    skinned.forEach((m) => { m.visible = v })
    rigid.forEach((r) => { r.visible = v })
  }

  return {
    root: skinned.length > 0 ? baseVrm.scene : gltf.scene,
    skinned,
    rigid,
    missingBones,
    setVisible,
    dispose,
  }
}

// ─── ⑤ 스프링 헤어 로딩 + 동적 병합 (VRM 파츠) ───────────────────────────────
// 스프링 헤어는 ④와 다르다: 헤어가 쓰는 J_Sec_Hair* 본이 base 에 없고(이식 필요),
// 흔들림이 VRMC_springBone 에 실려 온다(병합 필요). 그래서 plain GLTFLoader 가 아니라
// VRMLoaderPlugin 으로 로드해 three-vrm 이 만들어 준 springBoneManager 를 가져온다.
//   1) 헤어 스프링 본 체인을 base 의 Head 원시 본 아래로 이식(reparent)
//   2) 헤어 SkinnedMesh 를 base 스켈레톤(+이식된 헤어 본)으로 rebind
//   3) 파츠 매니저의 joint 들을 base.springBoneManager 에 addJoint → base.update(delta) 가 흔듦
// 알려진 단순화(검증 목적): 콜라이더는 파츠 bind 포즈 위치에 머묾(헤어 sway 자체엔 영향 미미),
//   그리고 스탠드인은 base 보다 2.5cm 커서 헤어도 그만큼 떠 보임(④와 동일, loadPart 버그 아님).

export interface LoadedSpringPart {
  mesh: THREE.SkinnedMesh | null // 첫 메시(호환용); 전체는 meshes
  meshes: THREE.SkinnedMesh[] // 헤어 메시 전체(female 은 앞머리+뒷머리 2개)
  graftedBones: THREE.Object3D[] // base Head 아래로 이식된 헤어 스프링 본 루트
  mergedJoints: number // base 매니저에 병합된 스프링 조인트 수
  missingBones: string[]
  setVisible: (v: boolean) => void
  dispose: () => void
}

export async function loadSpringPart(url: string, baseVrm: VRM): Promise<LoadedSpringPart> {
  const loader = new GLTFLoader()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  loader.register((parser: any) => new VRMLoaderPlugin(parser))
  const gltf = await loader.loadAsync(url)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const partVrm: VRM = (gltf as any).userData?.vrm
  if (!partVrm) throw new Error('VRM 파츠가 아님 (VRMC_vrm 없음)')

  const baseHead = baseVrm.humanoid.getRawBoneNode(VRMHumanBoneName.Head)
  const partHead = partVrm.humanoid.getRawBoneNode(VRMHumanBoneName.Head)

  // 1) 헤어 스프링 본 체인(J_Sec_Hair*)을 base Head 아래로 이식. local transform 보존됨.
  const graftedBones: THREE.Object3D[] = []
  if (baseHead && partHead) {
    for (const child of [...partHead.children]) {
      if ((child as THREE.Bone).isBone && /Hair/i.test(child.name)) {
        baseHead.add(child) // reparent
        graftedBones.push(child)
      }
    }
  }

  // 2) 헤어 SkinnedMesh(들)을 base 스켈레톤으로 rebind (이식된 헤어 본은 이제 base scene 에 있어 매칭됨).
  //    female 헤어는 앞머리(Hair001) + 뒷머리(HairBack) 2메시 분산이라 '모든 SkinnedMesh'를 처리한다.
  //    male 단일 헤어도 같은 경로(N=1). 스프링본 graft·조인트 병합은 이미 개수 무관.
  const meshes: THREE.SkinnedMesh[] = []
  partVrm.scene.traverse((o) => {
    const sm = o as THREE.SkinnedMesh
    if (sm.isSkinnedMesh) meshes.push(sm)
  })
  const missingBones: string[] = []
  const baseBoneByName = indexBaseBones(baseVrm) // 이식 후 호출 → 헤어 본 포함
  for (const m of meshes) {
    rebindToBase(m, baseBoneByName, missingBones)
    m.removeFromParent()
    baseVrm.scene.add(m)
  }

  // 3) 스프링 조인트 병합
  let mergedJoints = 0
  const partMgr = partVrm.springBoneManager
  const baseMgr = baseVrm.springBoneManager
  const merged: unknown[] = []
  if (partMgr && baseMgr) {
    for (const joint of partMgr.joints) {
      baseMgr.addJoint(joint)
      merged.push(joint)
      mergedJoints++
    }
    baseMgr.setInitState()
  }

  const dispose = () => {
    if (baseMgr) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const j of merged) baseMgr.deleteJoint(j as any)
    }
    for (const b of graftedBones) b.removeFromParent()
    for (const m of meshes) {
      m.removeFromParent()
      m.geometry.dispose()
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      mats.forEach((mat) => mat.dispose())
    }
  }

  const setVisible = (v: boolean) => { for (const m of meshes) m.visible = v }

  return { mesh: meshes[0] ?? null, meshes, graftedBones, mergedJoints, missingBones, setVisible, dispose }
}

// ─── ⑦ 얼굴 교체 (B트랙: 모양 변형) ──────────────────────────────────────────
// 얼굴 변형은 옷/헤어와 다르다: VRoid 에서 얼굴 '모양'은 머리 메시 지오메트리에 baked 돼
// 텍스처로 못 바꾼다 → 다른 Face 메시로 교체해야 한다. 실측 결과(male_eye_sample vs base):
//   · Face 메시는 단 3본에 가중 — Head(0.00mm 동일) + 좌/우 눈 본(J_Adj_*FaceEye, 46.7mm 이동)
//   · 즉 형태는 Head 에 리지드라 그대로 정렬되고, '눈 본만' 변형이 데려와야 함(헤어 graft 와 동형)
//   · 표정 모프 57·익스프레션 14 의 바인드 인덱스가 base 와 동일 → 표정 리그 재연결은
//     three-vrm 내부를 안 건드리고 'base Face influences → 새 Face 미러'로 해결
// 흐름: 눈 본 graft(네임스페이스로 base 와 이름 어긋나 자기 본 사용) → 8 Face 메시 rebind →
//   base 원본 Face 숨김 → 매 프레임 morphTargetInfluences 미러.
// 알려진 단순화(PoC): 눈 lookAt 본 재연결은 생략(시선 추적 X), 표정 모프만 증명.

const FACE_MAT_RE = /Face|Eye/i // 얼굴 8 머티리얼(FaceMouth/EyeIris/…)은 모두 Face|Eye 포함, Body 제외

function faceMeshesOf(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const out: THREE.SkinnedMesh[] = []
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh
    if (!sm.isSkinnedMesh) return
    const mat = Array.isArray(sm.material) ? sm.material[0] : sm.material
    if (mat && FACE_MAT_RE.test(mat.name)) out.push(sm)
  })
  return out
}
const matNameOf = (m: THREE.SkinnedMesh): string =>
  (Array.isArray(m.material) ? m.material[0] : m.material)?.name ?? ''

export interface LoadedFacePart {
  meshes: THREE.SkinnedMesh[] // 새 얼굴 8 프리미티브
  baseFaceMeshes: THREE.SkinnedMesh[] // base 원본 얼굴(미러 소스 + 토글 복원)
  graftedBones: THREE.Object3D[] // base Head 아래로 이식된 눈 본
  missingBones: string[]
  sync: () => void // 매 프레임: base Face 표정 influences + 눈 lookAt 회전 → 새 Face/눈 본 미러
  setEyeColor: (hex: string | null) => void // 텍스처/머티리얼 축: 눈(EyeIris) 색 — 형태와 독립
  setVisible: (v: boolean) => void
  dispose: () => void
}

export async function loadFacePart(url: string, baseVrm: VRM): Promise<LoadedFacePart> {
  // base 가 MToon(툰 셰이딩)이라 얼굴도 VRMLoaderPlugin 으로 로드해 MToon 머티리얼을 보존한다.
  // plain GLTFLoader(PBR)로 빼면 툰 램프·아웃라인이 사라져 base 와 톤이 어긋난다.
  const loader = new GLTFLoader()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  loader.register((parser: any) => new VRMLoaderPlugin(parser))
  const gltf = await loader.loadAsync(url)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const partVrm: VRM = (gltf as any).userData?.vrm
  if (!partVrm) throw new Error('얼굴 파츠가 VRM 이 아님 (MToon 보존 위해 VRM 필요)')

  // base 원본 얼굴 메시(미러 소스 + 토글 시 복원 대상)
  const baseFaceMeshes = faceMeshesOf(baseVrm.scene)
  // 새 얼굴 메시(8 프리미티브) — MToon 머티리얼
  const newFaceMeshes = faceMeshesOf(partVrm.scene)

  const baseHead = baseVrm.humanoid.getRawBoneNode(VRMHumanBoneName.Head)

  // 1) 변형이 데려온 본(base 에 같은 이름이 없는 = 네임스페이스된 눈 본)을 base Head 아래로 graft.
  //    눈 본은 Head 직속 리프라 local transform 보존 reparent 로 변형 위치에 정확히 안착.
  const baseBoneNames = indexBaseBones(baseVrm)
  const graftedBones: THREE.Object3D[] = []
  const grafting = new Map<string, THREE.Object3D>()
  for (const sm of newFaceMeshes) {
    for (const b of sm.skeleton.bones) {
      if (!baseBoneNames.has(b.name) && !grafting.has(b.name)) grafting.set(b.name, b)
    }
  }
  if (baseHead) {
    for (const b of grafting.values()) {
      baseHead.add(b) // reparent
      graftedBones.push(b)
    }
  }

  // 2) 8 Face 메시를 base 스켈레톤으로 rebind(graft 후 인덱싱 → 눈 본 포함 매칭)
  const baseBoneByName = indexBaseBones(baseVrm)
  const missingBones: string[] = []
  const meshes: THREE.SkinnedMesh[] = []
  for (const sm of newFaceMeshes) {
    rebindToBase(sm, baseBoneByName, missingBones)
    sm.removeFromParent()
    baseVrm.scene.add(sm)
    meshes.push(sm)
  }

  // 3) 미러 페어링: base 얼굴 ↔ 새 얼굴을 머티리얼 이름으로 1:1 매칭.
  //    짝 없는 새 메시(예: female_base 엔 없는 FaceEyelash)는 donor(표정 모프를 가진 아무 base 얼굴
  //    메시)로 폴백 — VRoid 얼굴 프리미티브는 동일 57 표정 모프를 인덱스 정렬로 공유하므로 어느 base
  //    얼굴이든 같은 influences 를 들고 있어, donor 로 구동해도 표정이 정확히 따라온다(페어 미러와 동일한
  //    교차파일 인덱스 정렬 가정). donor 조차 없으면(이 base 에 표정 얼굴 메시 부재) 경고만.
  const donor = baseFaceMeshes.find((bm) => bm.morphTargetInfluences?.length) ?? null
  const pairs: { base: THREE.SkinnedMesh; neo: THREE.SkinnedMesh }[] = []
  const unpaired: string[] = []
  for (const neo of meshes) {
    if (!neo.morphTargetInfluences) continue
    const exact = baseFaceMeshes.find((bm) => matNameOf(bm) === matNameOf(neo) && bm.morphTargetInfluences)
    const base = exact ?? donor
    if (base) pairs.push({ base, neo })
    if (!exact && base) unpaired.push(matNameOf(neo))
  }
  if (unpaired.length) console.warn(`[face] base 짝 없는 메시 ${unpaired.length} → donor 폴백 미러: ${unpaired.join(', ')}`)
  // 눈 lookAt 미러: base lookAt(bone 타입)이 base 눈 본을 돌리지만, 보이는 눈은 graft 된 변형 눈 본이다.
  //   base 눈 본의 local 회전을 graft 눈 본에 복사 → 새 얼굴 눈도 같은 타깃을 추종(같은 Head 부모라 정합).
  const baseLeftEye = baseVrm.humanoid.getRawBoneNode(VRMHumanBoneName.LeftEye)
  const baseRightEye = baseVrm.humanoid.getRawBoneNode(VRMHumanBoneName.RightEye)
  const graftLeftEye = graftedBones.find((b) => /_L_FaceEye/.test(b.name)) ?? null
  const graftRightEye = graftedBones.find((b) => /_R_FaceEye/.test(b.name)) ?? null
  const eyePairs = ([[baseLeftEye, graftLeftEye], [baseRightEye, graftRightEye]] as const).filter(
    ([b, g]) => b && g,
  ) as [THREE.Object3D, THREE.Object3D][]

  const sync = () => {
    // 표정 모프
    for (const { base, neo } of pairs) {
      const a = base.morphTargetInfluences!
      const b = neo.morphTargetInfluences!
      const n = Math.min(a.length, b.length)
      for (let i = 0; i < n; i++) b[i] = a[i]
    }
    // 눈 회전(lookAt)
    for (const [b, g] of eyePairs) g.quaternion.copy(b.quaternion)
  }

  // 5) 텍스처/머티리얼 축(눈색): EyeIris 머티리얼 색 노브. 얼굴 '모양'(메시 교체)과 독립된 별도 축임을
  //    증명. 실제 변형 카탈로그는 baseColorTexture 교체(저작 PNG 세트)지만, 색 곱도 같은 머티리얼 노브다.
  //    base·새 얼굴 양쪽 EyeIris 에 적용(토글 상태 무관).
  const eyeIrisMats: THREE.Material[] = []
  for (const m of [...baseFaceMeshes, ...meshes]) {
    const mats = Array.isArray(m.material) ? m.material : [m.material]
    for (const mat of mats) if (mat && /EyeIris/i.test(mat.name)) eyeIrisMats.push(mat)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const colorOf = (mat: any): THREE.Color | null =>
    mat?.color?.isColor ? mat.color : mat?.uniforms?.litFactor?.value?.isColor ? mat.uniforms.litFactor.value : null
  const eyeIrisOrig = new Map<THREE.Material, THREE.Color>()
  for (const mat of eyeIrisMats) { const c = colorOf(mat); if (c) eyeIrisOrig.set(mat, c.clone()) }
  const setEyeColor = (hex: string | null) => {
    for (const mat of eyeIrisMats) {
      const c = colorOf(mat)
      if (!c) continue
      if (hex) c.set(hex)
      else { const o = eyeIrisOrig.get(mat); if (o) c.copy(o) }
    }
  }

  // 6) 가시성: 새 얼굴 ON → base 얼굴 숨김(겹침 방지) / OFF → base 얼굴 복원
  const setVisible = (v: boolean) => {
    meshes.forEach((m) => { m.visible = v })
    baseFaceMeshes.forEach((m) => { m.visible = !v })
  }

  const dispose = () => {
    for (const m of meshes) {
      m.removeFromParent()
      m.geometry.dispose()
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      mats.forEach((mat) => mat.dispose())
    }
    for (const b of graftedBones) b.removeFromParent()
    baseFaceMeshes.forEach((m) => { m.visible = true }) // base 얼굴 복원
  }

  return { meshes, baseFaceMeshes, graftedBones, missingBones, sync, setEyeColor, setVisible, dispose }
}

// ─── ⑥ 옷밑 살 클리핑 (Hide_Body) — 마킹 채널 합의 후 ─────────────────────────
// glTF 엔 '버텍스 그룹' 개념이 없다 → 외주 마킹을 어떤 채널로 받을지 미확정
//   (별도 morph / 별도 머티리얼 분리 / 숨김 인덱스 attribute 중 택1). 합의 후 구현.
// 지금 추측 구현하면 ASSET_SPEC 과 어긋날 위험 → 의도적으로 비워 둔다.
