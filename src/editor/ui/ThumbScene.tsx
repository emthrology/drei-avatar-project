import { useEffect, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import { PartCategory, VARIANTS_BY_ID } from '../constants'

// 오프라인 썸네일 렌더 — 파츠 파일을 base 조립 없이 '단독'으로 로드해 그 메시만 렌더한다.
// (조립 경로: slot 엔진/rebind/graft 를 통째 우회 → 타이밍/상태 의존 제거). VRM 은 VRMLoaderPlugin
// 으로 MToon 보존, GLB(옷)는 plain PBR. 바운딩박스 fit 카메라로 카테고리 무관 자동 프레이밍.
// 로드+프레이밍 완료 시 window.__thumbReady=true → scripts/renderThumbs.mjs(puppeteer)가 스냅샷.

// 카테고리별 여백(작을수록 꽉 참). 인덱스 정점 bbox(아래) 기준 — 얼굴도 정확히 잡혀 0.9 면 전체 안착.
const PADDING: Record<PartCategory, number> = { face: 0.9, hair: 0.95, tops: 1.12, bottoms: 1.12 }
// 옷(tops/bottoms)은 A-pose 라 팔이 벌어져 가로로 넓다 → fit 하면 작아짐.
// 몸통/다리 폭(±halfWidth)으로 X 를 크롭해 해당 부위를 세로로 꽉 채운다(클로즈업, 팔은 프레임 밖).
const CROP_HALF_X: Partial<Record<PartCategory, number>> = { tops: 0.22, bottoms: 0.22 }

function FitCamera({ object, category }: { object: THREE.Object3D; category: PartCategory }) {
  const { camera } = useThree()
  useEffect(() => {
    // 렌더되는 메시 geometry 바운딩만 합산(빈 본/전신 스켈레톤 노드 제외 — 안 그러면 중심이
    // 허리로 잡혀 파츠가 작고 위로 치우침). SkinnedMesh 는 변형 없는 bind pose 정점 범위.
    object.updateWorldMatrix(true, true)
    const box = new THREE.Box3()
    const v = new THREE.Vector3()
    object.traverse((o) => {
      const m = o as THREE.Mesh
      const pos = m.isMesh && m.geometry ? m.geometry.attributes.position : null
      if (!pos) return
      // ★ 인덱스된 정점만 합산. 프리미티브 필터로 메시 일부만 남긴 경우(female 헤어 HairBack 은 Body
      //   메시의 한 프리미티브 → POSITION 버퍼를 Body 전체와 공유) computeBoundingBox()는 전체 속성을
      //   훑어 몸 전체 범위를 잡는다. 실제 렌더되는 삼각형(index) 정점만 봐야 올바른 크기.
      const idx = m.geometry.index
      const n = idx ? idx.count : pos.count
      for (let i = 0; i < n; i++) {
        v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m.matrixWorld)
        box.expandByPoint(v)
      }
    })
    if (box.isEmpty()) return
    // 카테고리별 X 크롭(클로즈업)
    const half = CROP_HALF_X[category]
    if (half != null) {
      const cx = (box.min.x + box.max.x) / 2
      box.min.x = cx - half
      box.max.x = cx + half
    }
    const center = box.getCenter(new THREE.Vector3())
    const sphere = box.getBoundingSphere(new THREE.Sphere())
    const cam = camera as THREE.PerspectiveCamera
    const dist = (sphere.radius / Math.sin((cam.fov * Math.PI) / 180 / 2)) * PADDING[category]
    cam.position.set(center.x, center.y, center.z + dist) // VRM1.0/VRoid 정면 = +Z
    cam.lookAt(center)
    cam.near = Math.max(dist / 100, 0.01)
    cam.far = dist * 10
    cam.updateProjectionMatrix()
    // 한 프레임 더 그린 뒤 ready (행렬·머티리얼 반영 안정화)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        ;(window as unknown as { __thumbReady?: boolean }).__thumbReady = true
      }),
    )
  }, [object, camera, category])
  return null
}

export function ThumbScene({ category, variantId }: { category: PartCategory; variantId: string }) {
  const resolved = VARIANTS_BY_ID.get(variantId)
  const [obj, setObj] = useState<THREE.Object3D | null>(null)

  useEffect(() => {
    if (!resolved) return
    let alive = true
    const isVrm = resolved.variant.url.endsWith('.vrm')
    const loader = new GLTFLoader()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (isVrm) loader.register((parser: any) => new VRMLoaderPlugin(parser))
    loader
      .loadAsync(resolved.variant.url)
      .then((gltf) => {
        if (!alive) return
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vrm = (gltf as any).userData?.vrm
        if (vrm) VRMUtils.rotateVRM0(vrm) // VRM0 보정(1.0이면 no-op)
        gltf.scene.traverse((o) => { o.frustumCulled = false }) // 변형 없는 bind pose 바운딩 컬링 방지
        setObj(gltf.scene)
      })
      .catch((e) => console.error('[thumb] 파츠 로드 실패', e))
    return () => { alive = false }
  }, [resolved])

  return (
    <div className="w-full h-full">
      <Canvas camera={{ fov: 30 }} gl={{ alpha: true, preserveDrawingBuffer: true }}>
        <ambientLight intensity={1.0} />
        <directionalLight position={[1, 2, 2]} intensity={1.3} />
        {obj && <primitive object={obj} />}
        {obj && <FitCamera object={obj} category={category} />}
      </Canvas>
    </div>
  )
}
