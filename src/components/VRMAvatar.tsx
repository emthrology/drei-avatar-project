import { useEffect, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { VRMLoaderPlugin, VRM, VRMUtils, VRMHumanBoneName } from '@pixiv/three-vrm'
import * as THREE from 'three'
import { useAvatarStore, threeColorToHex } from '../store'
import { setShaderPanelScene } from './ShaderPanel'
import { setAnimScene, updateAnimMixer } from './AnimationPanel'

interface VRMAvatarProps {
  url: string
}

export function VRMAvatar({ url }: VRMAvatarProps) {
  const vrmRef = useRef<VRM | null>(null)
  const { setMeshInfos, meshInfos } = useAvatarStore()
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gltf = useGLTF(url, true, true, (loader: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loader.register((parser: any) => new VRMLoaderPlugin(parser as any))
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vrm: VRM | undefined = (gltf as any).userData?.vrm

  // VRM 최초 로드 시 메시 목록 추출
  useEffect(() => {
    if (!vrm) return
    vrmRef.current = vrm
    VRMUtils.rotateVRM0(vrm)
    applyRestPose(vrm)
    setShaderPanelScene(vrm.scene)
    setAnimScene(vrm.scene, gltf.animations ?? [])

    const infos = collectMeshInfos(vrm)
    setMeshInfos(infos)

    return () => {
      setShaderPanelScene(null)
      setAnimScene(null, [])
      VRMUtils.deepDispose(vrm.scene)
    }
  }, [vrm, setMeshInfos])

  // 로드 시 상반신 기준으로 카메라+OrbitControls target 1회 세팅(이후 조작은 자유).
  // vrm·controls 양쪽이 준비됐을 때 실행 → 마운트 순서 무관(controls는 makeDefault로 등록)
  useEffect(() => {
    if (!vrm || !controls) return
    frameUpperBody(vrm, camera as THREE.PerspectiveCamera, controls as unknown as OrbitControlsLike)
  }, [vrm, camera, controls])

  // meshInfos 변경 → 실제 Three.js 오브젝트에 반영
  useEffect(() => {
    const vrm = vrmRef.current
    if (!vrm || meshInfos.length === 0) return

    vrm.scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      const info = meshInfos.find((m) => m.name === obj.name)
      if (!info) return

      obj.visible = info.visible

      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      mats.forEach((mat) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const m = mat as any
        if (m.isMToonMaterial) {
          m.color?.setStyle(info.litColor)
          m.shadeColorFactor?.setStyle(info.shadeColor)
        }
      })
    })
  }, [meshInfos])

  useFrame((_, delta) => {
    vrmRef.current?.update(delta)
    updateAnimMixer(delta)
  })

  if (!vrm) return null
  return <primitive object={vrm.scene} />
}

// OrbitControls 최소 인터페이스 (drei controls 타입이 느슨해 직접 명시)
interface OrbitControlsLike {
  target: THREE.Vector3
  update: () => void
}

// 로드된 모델의 상반신(hips→머리끝)을 화면 중앙에 맞추는 카메라/타깃 산출.
// 컴패니언 computeUpperBodyCamera와 동일 발상(본+Box3 최상단) — fov는 에디터 카메라값 사용.
// 본 누락/origin 모델은 표준 VRM 신장으로 fallback. 모델 불문 헤어 끝까지 포함(Box3.max.y).
function frameUpperBody(
  vrm: VRM,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControlsLike,
) {
  vrm.scene.updateWorldMatrix(true, true)

  const headBone = vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Head)
  const hipsBone = vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Hips)
  const headPos = new THREE.Vector3()
  const hipsPos = new THREE.Vector3()
  headBone?.getWorldPosition(headPos)
  hipsBone?.getWorldPosition(hipsPos)
  if (headPos.y < 0.1) headPos.y = 1.6
  if (hipsPos.y < 0.1) hipsPos.y = 0.95

  const torsoHeight = headPos.y - hipsPos.y
  const bbox = new THREE.Box3().setFromObject(vrm.scene)
  const headEstimate = headPos.y + torsoHeight * 0.3
  const meshTop = isFinite(bbox.max.y) ? bbox.max.y : headEstimate
  const spanTop = Math.max(meshTop, headEstimate) + torsoHeight * 0.05
  const spanBot = hipsPos.y + torsoHeight * 0.15
  const targetY = (spanTop + spanBot) / 2
  const verticalSpan = spanTop - spanBot

  // 에디터 카메라 fov 기준 수직 범위가 딱 차는 거리(10% 여백)
  const dist = (verticalSpan / 2) / Math.tan(((camera.fov * Math.PI) / 180) / 2) * 1.1

  camera.position.set(0, targetY, dist)
  controls.target.set(0, targetY, 0)
  controls.update()
}

// 편집 첫 화면 T-pose → 차렷. 상완을 몸 옆으로 내림(UpperArm z = ∓1.3 rad).
// 값/축은 컴패니언 anim BASELINE 불변식과 동일(CLAUDE.md: z=프론탈 들기/내리기, 좌−/우+).
// 정적 적용 — 에디터엔 스케줄러가 없고 vrm.update(humanoid)가 매 프레임 normalized→raw 반영해 유지됨.
// (AnimationPanel 클립 재생 시에만 mixer가 덮음 = 의도된 동작)
function applyRestPose(vrm: VRM) {
  const armL = vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.LeftUpperArm)
  const armR = vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.RightUpperArm)
  if (armL) armL.rotation.z = -1.3
  if (armR) armR.rotation.z = 1.3
}

function collectMeshInfos(vrm: VRM) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infos: ReturnType<typeof import('../store').threeColorToHex extends any ? any : never>[] = []
  const seen = new Set<string>()

  vrm.scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    if (seen.has(obj.name)) return
    seen.add(obj.name)

    const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = mat as any

    infos.push({
      name: obj.name,
      visible: obj.visible,
      litColor: m?.color ? threeColorToHex(m.color) : '#ffffff',
      shadeColor: m?.shadeColorFactor ? threeColorToHex(m.shadeColorFactor) : '#888888',
    })
  })

  return infos
}
