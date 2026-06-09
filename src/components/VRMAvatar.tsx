import { useEffect, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { VRMLoaderPlugin, VRM, VRMUtils } from '@pixiv/three-vrm'
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
