import { useCallback, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm'
import * as THREE from 'three'
import { PartCategoryDef } from './constants'
import { useAssembledVrm } from './useAssembledVrm'
import { SHADOWED_BY_PART } from './partLoader'
import { useAvatarStore, threeColorToHex, type MeshInfo } from '../store'
import { labelForMaterialName } from './meshLabels'
import { setAnimScene, updateAnimMixer } from '../components/AnimationPanel'

// 에디터 조립 아바타 — 공유 조립 엔진(useAssembledVrm)에 drei 에디터 정책을 얹는다:
// 정적 rest pose · frameUpperBody 카메라 · ShaderPanel/AnimationPanel 싱글턴 · meshInfos 색 편집.
// composer 정책(유휴 시선/wave/더미)은 이식하지 않음. 캐릭터 전환은 상위 key={characterId} remount.

interface Props {
  baseUrl: string
  catalog: PartCategoryDef[]
}

export function ComposerAvatar({ baseUrl, catalog }: Props) {
  const meshInfos = useAvatarStore((s) => s.meshInfos)
  const setMeshInfos = useAvatarStore((s) => s.setMeshInfos)

  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls)

  // 조립된 base 씬에서 메시 목록 재수집 → 색/셰이더 패널 갱신(seam: 파츠 add/remove 후 호출).
  const recollect = useCallback((base: VRM) => setMeshInfos(collectMeshInfos(base)), [setMeshInfos])

  const { vrm, vrmRef, animations, syncFace } = useAssembledVrm(baseUrl, catalog, recollect)

  // ─── 로드 시 drei 정책 주입 ────────────────────────────────────────────────
  // 셰이더·메시 색 적용은 공유 훅(useAssembledVrm)이 담당(컴패니언과 동일 경로). 여기선 에디터 전용
  // 정책만: rest pose · 애니 믹서 싱글턴 · meshInfos 목록 수집(색 패널 리스트용).
  useEffect(() => {
    if (!vrm) return
    applyRestPose(vrm)
    setAnimScene(vrm.scene, animations)
    setMeshInfos(collectMeshInfos(vrm))
    return () => {
      setAnimScene(null, [])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vrm])

  // ─── 로드 시 상반신 기준 카메라/타깃 1회 세팅 (vrm·controls 양쪽 준비됐을 때) ──────────
  useEffect(() => {
    if (!vrm || !controls) return
    frameUpperBody(vrm, camera as THREE.PerspectiveCamera, controls as unknown as OrbitControlsLike)
  }, [vrm, camera, controls])

  // ─── meshInfos 가시성(show/hide) 반영 — 에디터 전용 메시 토글 ──────────────────────
  // 색은 공유 훅이 적용. 가시성은 에디터 메시 리스트의 토글이라 여기서만(컴패니언은 로더가 가시성 소유).
  useEffect(() => {
    const v = vrmRef.current
    if (!v || meshInfos.length === 0) return
    v.scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      const info = meshInfos.find((m) => m.name === obj.name)
      if (info) obj.visible = info.visible
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meshInfos])

  useFrame((_, delta) => {
    const v = vrmRef.current
    if (!v) return
    v.update(delta)
    syncFace() // update 후: base 표정 influences + 눈 lookAt 회전 → 교체된 새 Face/눈 본 미러
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

// 로드된 모델의 상반신(hips→머리끝)을 화면 중앙에 맞추는 카메라/타깃 산출 (VRMAvatar 에서 이전).
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

  const dist = (verticalSpan / 2) / Math.tan(((camera.fov * Math.PI) / 180) / 2) * 1.1

  camera.position.set(0, targetY, dist)
  controls.target.set(0, targetY, 0)
  controls.update()
}

// 편집 첫 화면 T-pose → 차렷. 상완을 몸 옆으로 내림(UpperArm z = ∓1.3 rad). (VRMAvatar 에서 이전)
function applyRestPose(vrm: VRM) {
  const armL = vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.LeftUpperArm)
  const armR = vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.RightUpperArm)
  if (armL) armL.rotation.z = -1.3
  if (armR) armR.rotation.z = 1.3
}

function collectMeshInfos(vrm: VRM): MeshInfo[] {
  const infos: MeshInfo[] = []
  const seen = new Set<string>()

  vrm.scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    // 파츠 로더가 가린 base 메시(얼굴 교체 시 숨긴 base 얼굴)는 제외 — 중복 행·토글 충돌 차단
    if (obj.userData[SHADOWED_BY_PART]) return
    if (seen.has(obj.name)) return
    seen.add(obj.name)

    const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = mat as any

    infos.push({
      name: obj.name,
      // 부위 라벨 — 머티리얼 명명 규칙(meshLabels) 기반, 미매칭 시 원본 메시 이름으로 fallback
      label: labelForMaterialName(m?.name) ?? (obj.name || '(unnamed)'),
      visible: obj.visible,
      litColor: m?.color ? threeColorToHex(m.color) : '#ffffff',
      shadeColor: m?.shadeColorFactor ? threeColorToHex(m.shadeColorFactor) : '#888888',
    })
  })

  return infos
}
