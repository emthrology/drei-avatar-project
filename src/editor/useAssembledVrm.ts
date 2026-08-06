import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useGLTF } from '@react-three/drei';
import { VRMLoaderPlugin, VRM, VRMUtils } from '@pixiv/three-vrm';
import * as THREE from 'three';
import { PartCategory, PartCategoryDef, VARIANTS_BY_ID } from './constants';
import {
  loadPart,
  loadSpringPart,
  loadFacePart,
  LoadedPart,
  LoadedSpringPart,
  LoadedFacePart,
} from './partLoader';
import { useAvatarStore } from '../store';
import { applyAppearance } from './appearance';

// ─── 조립 엔진 훅 (에디터·컴패니언 공유) ─────────────────────────────────────────
// base VRM 로드 + 슬롯 diff(swap-on-select) + faceRef 를 한 곳에 모은 composer 엔진.
// 호스트(ComposerAvatar=에디터 / CompanionAvatar=컴패니언)는 이 훅으로 조립만 하고
// 정책(rest pose·프레이밍·meshInfos / 립싱크·anim·시선)은 각자 얹는다(엔진/정책 분리).
// 업로드 임의 VRM 은 'catalog=[] 인 base' = 파츠 0개 → 단일 VRM 으로 렌더(통합 경로).
//   선택/눈색은 store 단일 소스(에디터에서 조정 → 컴패니언이 같은 store 로 동일 조립).

type AnyLoadedPart = LoadedPart | LoadedSpringPart | LoadedFacePart;
interface Slot {
  variantId: string;
  loaded: AnyLoadedPart;
}

export interface AssembledVrm {
  vrm: VRM | undefined;
  vrmRef: React.MutableRefObject<VRM | null>;
  animations: THREE.AnimationClip[];
  syncFace: () => void; // 매 프레임 vrm.update 후 호출: base 표정/눈 → 교체된 Face 미러
}

export function useAssembledVrm(
  baseUrl: string,
  catalog: PartCategoryDef[],
  onAssembled?: (base: VRM) => void, // 슬롯 교체 settle 후 콜백(에디터: meshInfos 재수집 seam)
): AssembledVrm {
  const vrmRef = useRef<VRM | null>(null);
  // 카테고리 슬롯: 슬롯당 1개 active. genRef 는 async 로드 레이스(빠른 연속 선택) 가드.
  const slotsRef = useRef<Map<PartCategory, Slot>>(new Map());
  const genRef = useRef<Map<PartCategory, number>>(new Map());
  const faceRef = useRef<LoadedFacePart | null>(null);

  const selection = useAvatarStore((s) => s.selection);
  const eyeColor = useAvatarStore((s) => s.eyeColor);
  const setPartStatus = useAvatarStore((s) => s.setPartStatus);
  // 외형값(셰이더·메시 색) — 에디터에서 조정하면 컴패니언도 같은 store 로 적용(공유).
  const shader = useAvatarStore((s) => s.shader);
  const meshInfos = useAvatarStore((s) => s.meshInfos);
  // 최신값 통로 — 파츠 로딩 이펙트(비동기)가 재실행 없이 현재 값을 읽으려고 쓴다.
  // 쓰기는 렌더가 아니라 **커밋 시점**에. 이 훅은 useGLTF 가 서스펜드하므로 **버려지는 렌더가
  // 실제로 발생**하고, 그 렌더가 ref 를 건드리면 커밋 안 된 값이 남는다(오늘은 값이 멱등이라
  // 무해하지만 원리적으로 잘못). useLayoutEffect 는 모든 useEffect 보다 먼저 실행되므로
  // 아래 로딩 이펙트가 낡은 값을 읽는 일은 없다 — 선언 순서에도 의존하지 않는다.
  const eyeColorRef = useRef(eyeColor);
  const onAssembledRef = useRef(onAssembled);
  useLayoutEffect(() => {
    eyeColorRef.current = eyeColor;
    onAssembledRef.current = onAssembled;
  });
  // 조립 변경(파츠 add/remove) 카운터 → 새 파츠 머티리얼에도 외형값 재적용 트리거
  const [assemblyVersion, setAssemblyVersion] = useState(0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gltf = useGLTF(baseUrl, true, true, (loader: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loader.register((parser: any) => new VRMLoaderPlugin(parser as any));
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vrm: VRM | undefined = (gltf as any).userData?.vrm;

  // ─── 베이스 로드 + dispose ──────────────────────────────────────────────────
  useEffect(() => {
    if (!vrm) return;
    VRMUtils.rotateVRM0(vrm);
    vrmRef.current = vrm;

    const slots = slotsRef.current;
    return () => {
      slots.forEach((s) => s.loaded.dispose());
      slots.clear();
      faceRef.current = null;
      VRMUtils.deepDispose(vrm.scene);
      // deepDispose 가 drei useGLTF 캐시 씬을 파괴 → 캐시에서 드롭해 재진입(base 스위치) 시 새로 로드.
      useGLTF.clear(baseUrl);
    };
  }, [vrm, baseUrl]);

  // ─── 슬롯 선택·교체 엔진 ────────────────────────────────────────────────────
  // 카테고리별 desired(selection) vs 현재 슬롯 diff → 다르면 기존 dispose 후 새 변형 load.
  // null 이면 슬롯 비움. genRef 토큰으로 늦게 끝난 이전 로드를 폐기(레이스 차단).
  useEffect(() => {
    const base = vrmRef.current;
    if (!base) return;
    const apply = async (cat: PartCategory, desired: string | null) => {
      const slot = slotsRef.current.get(cat);
      if ((slot?.variantId ?? null) === desired) return;
      const gen = (genRef.current.get(cat) ?? 0) + 1;
      genRef.current.set(cat, gen);
      if (slot) {
        slot.loaded.dispose();
        slotsRef.current.delete(cat);
        if (cat === 'face') faceRef.current = null;
      }
      if (!desired) {
        setPartStatus(cat, 'idle');
        onAssembledRef.current?.(base);
        setAssemblyVersion((v) => v + 1);
        return;
      }
      const resolved = VARIANTS_BY_ID.get(desired);
      if (!resolved) {
        setPartStatus(cat, 'error');
        return;
      }
      setPartStatus(cat, 'loading');
      const load =
        resolved.kind === 'spring'
          ? loadSpringPart
          : resolved.kind === 'face'
            ? loadFacePart
            : loadPart;
      try {
        const loaded = await load(resolved.variant.url, base);
        if (genRef.current.get(cat) !== gen) {
          loaded.dispose();
          return;
        } // 더 새 선택이 들어옴
        slotsRef.current.set(cat, { variantId: desired, loaded });
        if (cat === 'face') {
          faceRef.current = loaded as LoadedFacePart;
          faceRef.current.setEyeColor(eyeColorRef.current);
        }
        loaded.setVisible(true);
        if (loaded.missingBones.length)
          console.warn(
            `[${cat}] 누락 본 ${loaded.missingBones.length}:`,
            loaded.missingBones.slice(0, 3),
          );
        setPartStatus(cat, 'loaded');
        onAssembledRef.current?.(base); // seam: 호스트가 조립 변화 인지(에디터=meshInfos 재수집)
        setAssemblyVersion((v) => v + 1); // 새 파츠 머티리얼에 외형값(셰이더·색) 재적용 트리거
      } catch (err) {
        if (genRef.current.get(cat) !== gen) return;
        console.error(`[${cat}] 로드 실패`, err);
        setPartStatus(cat, 'error');
      }
    };
    catalog.forEach((c) => apply(c.id, selection[c.id] ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vrm, selection, catalog]);

  useEffect(() => {
    faceRef.current?.setEyeColor(eyeColor);
  }, [eyeColor]);

  // ─── 외형값(셰이더·메시 색) 적용 — 에디터·컴패니언 공유 ────────────────────────────
  // store.shader / store.meshInfos 변경 OR 조립 변경(assemblyVersion) 시 씬 머티리얼에 반영.
  // 에디터에서 슬라이더/색 조정 → 같은 store → 컴패니언도 동일 적용(가시성 제외, appearance.ts 참조).
  useEffect(() => {
    const v = vrmRef.current;
    if (!v) return;
    applyAppearance(v.scene, shader, meshInfos);
  }, [vrm, shader, meshInfos, assemblyVersion]);

  const syncFace = () => faceRef.current?.sync();

  return { vrm, vrmRef, animations: gltf.animations ?? [], syncFace };
}
