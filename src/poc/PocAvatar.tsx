import { useEffect, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { VRMLoaderPlugin, VRM, VRMUtils, VRMHumanBoneName } from '@pixiv/three-vrm'
import * as THREE from 'three'

// ─────────────────────────────────────────────────────────────────────────
// 에셋 스왑 PoC — "고정 베이스 + 모듈 조립" 전제의 하중 시험.
// 검증 3종(이게 되면 라이브러리 제작으로 진행, 안 되면 경로 재검토):
//   ① 리지드 부착   : 헤어 메시를 head '원시 본(raw bone)'에 parent → 머리 회전 따라옴
//   ② 스킨드 rebind : 새 SkinnedMesh를 공유 스켈레톤에 bind() → 팔 굽힘 따라 변형
//   ③ 모프 슬라이더 : expressionManager로 face 모프 구동(male_sample 실물 모프)
// 더미 단계라 에셋 저작/스프링본 병합/클리핑은 의도적으로 제외(다음 단계).
// ─────────────────────────────────────────────────────────────────────────

interface PocAvatarProps {
  hair: boolean
  shirt: boolean
  morph: number      // 0~1, face 모프 강도
  morphName: string  // expressionManager preset 이름
  wave: boolean      // 팔/머리 흔들기 → 부착물 추종 검증
  onReport: (lines: string[]) => void
}

const URL = '/avatars/male_sample.vrm'

export function PocAvatar({ hair, shirt, morph, morphName, wave, onReport }: PocAvatarProps) {
  const vrmRef = useRef<VRM | null>(null)
  const hairRef = useRef<THREE.Object3D | null>(null)
  const shirtRef = useRef<THREE.SkinnedMesh | null>(null)
  const waveRef = useRef(wave)
  waveRef.current = wave

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gltf = useGLTF(URL, true, true, (loader: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loader.register((parser: any) => new VRMLoaderPlugin(parser as any))
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vrm: VRM | undefined = (gltf as any).userData?.vrm

  useEffect(() => {
    if (!vrm) return
    vrmRef.current = vrm
    VRMUtils.rotateVRM0(vrm)

    const report: string[] = []

    // ① 리지드 부착 — 헤어를 head '원시 본'에 직접 parent
    const headRaw = vrm.humanoid.getRawBoneNode(VRMHumanBoneName.Head)
    if (headRaw) {
      const hairMesh = makeHair()
      headRaw.add(hairMesh)
      hairRef.current = hairMesh
      report.push('① 리지드 부착: head 본에 헤어 parent ✅')
    } else {
      report.push('① 리지드 부착: head 원시 본 없음 ❌')
    }

    // ② 스킨드 rebind — 기존 스킨드 메시 형상을 복제→법선 오프셋→공유 스켈레톤에 bind
    const shirtMesh = makeShirtShell(vrm, report)
    if (shirtMesh) {
      vrm.scene.add(shirtMesh)
      shirtRef.current = shirtMesh
    }

    // ③ 모프 — 사용 가능한 preset 표정 목록 보고
    const names = vrm.expressionManager?.expressions?.map((e) => e.expressionName) ?? []
    report.push(`③ 모프: expression ${names.length}종 (${names.slice(0, 6).join(', ')}…)`)

    onReport(report)

    return () => {
      if (hairRef.current) {
        hairRef.current.removeFromParent()
        disposeObject(hairRef.current)
        hairRef.current = null
      }
      if (shirtRef.current) {
        shirtRef.current.removeFromParent()
        disposeObject(shirtRef.current)
        shirtRef.current = null
      }
      VRMUtils.deepDispose(vrm.scene)
    }
  }, [vrm, onReport])

  // 토글 — 가시성만
  useEffect(() => { if (hairRef.current) hairRef.current.visible = hair }, [hair])
  useEffect(() => { if (shirtRef.current) shirtRef.current.visible = shirt }, [shirt])

  // ③ 모프 슬라이더 적용
  useEffect(() => {
    const v = vrmRef.current
    if (!v?.expressionManager) return
    // 직전 프레임에 남지 않도록 전 표정 0 후 대상만 설정
    v.expressionManager.expressions.forEach((e) => v.expressionManager!.setValue(e.expressionName, 0))
    v.expressionManager.setValue(morphName, morph)
  }, [morph, morphName])

  useFrame((_, delta) => {
    const v = vrmRef.current
    if (!v) return

    // 기본 차렷 + wave 시 좌완 굽힘/머리 턴 → 부착물 추종을 눈으로 확인
    const armL = v.humanoid.getNormalizedBoneNode(VRMHumanBoneName.LeftUpperArm)
    const armR = v.humanoid.getNormalizedBoneNode(VRMHumanBoneName.RightUpperArm)
    const head = v.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Head)
    if (armR) armR.rotation.z = 1.3
    if (waveRef.current) {
      const t = performance.now() / 1000
      if (armL) armL.rotation.z = -1.3 + (Math.sin(t * 2.2) * 0.5 + 0.5) * 1.0 // 옆→앞 들기
      if (head) head.rotation.y = Math.sin(t * 1.3) * 0.5
    } else {
      if (armL) armL.rotation.z = -1.3
      if (head) head.rotation.y = 0
    }

    v.update(delta) // normalized→raw 반영 + 모프/스프링본 + 스킨 변형
  })

  if (!vrm) return null
  return <primitive object={vrm.scene} />
}

// ① 헤어 더미 — 머리에 씌우는 반구형 캡 (리지드 부착 대상)
function makeHair(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(0.11, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.6)
  geo.scale(1.05, 1.15, 1.1)
  const mat = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.8 })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = 'POC_hair'
  mesh.position.set(0, 0.06, 0.005) // head 본 기준 위로
  return mesh
}

// ② 셔츠 쉘 — 기존 스킨드 메시(바디) 형상을 복제, 법선 방향으로 살짝 부풀려
//    공유 스켈레톤에 bind. 새로 만든 SkinnedMesh가 애니메이션 따라 변형되면 rebind 성립.
//    (실 파이프라인에선 Blender authored 옷 메시가 같은 역할 — 여기선 메커니즘만 증명)
function makeShirtShell(vrm: VRM, report: string[]): THREE.SkinnedMesh | null {
  let src: THREE.SkinnedMesh | null = null
  // 몸통 계열 우선, 없으면 아무 스킨드 메시
  vrm.scene.traverse((o) => {
    const sm = o as THREE.SkinnedMesh
    if (sm.isSkinnedMesh && !src && /body|tops|cloth|costume/i.test(o.name)) src = sm
  })
  if (!src) {
    vrm.scene.traverse((o) => {
      const sm = o as THREE.SkinnedMesh
      if (sm.isSkinnedMesh && !src) src = sm
    })
  }
  if (!src) {
    report.push('② 스킨드 rebind: 소스 SkinnedMesh 없음 ❌')
    return null
  }
  const source = src as THREE.SkinnedMesh

  const geo = source.geometry.clone()
  // 법선 방향 1.5cm 부풀려 살 위에 뜨는 '겉옷 쉘'로 — 따로 노는 레이어임을 가시화
  const pos = geo.attributes.position as THREE.BufferAttribute
  const nor = geo.attributes.normal as THREE.BufferAttribute | undefined
  if (nor) {
    const off = 0.015
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(
        i,
        pos.getX(i) + nor.getX(i) * off,
        pos.getY(i) + nor.getY(i) * off,
        pos.getZ(i) + nor.getZ(i) * off,
      )
    }
    pos.needsUpdate = true
  }

  const mat = new THREE.MeshStandardMaterial({
    color: 0x3358ff,
    roughness: 0.6,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
  })

  const shirt = new THREE.SkinnedMesh(geo, mat)
  shirt.name = 'POC_shirt'
  // 핵심: 새 SkinnedMesh를 기존 스켈레톤에 bind (소스의 bindMatrix 그대로)
  shirt.bind(source.skeleton, source.bindMatrix)
  shirt.frustumCulled = false

  report.push(`② 스킨드 rebind: '${source.name}' 형상→새 SkinnedMesh bind() ✅ (본 ${source.skeleton.bones.length})`)
  return shirt
}

function disposeObject(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.geometry) m.geometry.dispose()
    if (m.material) {
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      mats.forEach((mat) => mat.dispose())
    }
  })
}

// 주의: useGLTF.preload는 쓰지 않음. extendLoader(VRM 플러그인) 없이 preload하면
// 같은 URL이 플러그인 없는 gltf로 캐시돼 에디터·컴패니언까지 vrm 누락으로 깨짐.
