// VRMA 제스처 레이어 — 절차 idle 위에 얹는 이산 동작. 끝나면 idle 로 되돌아온다.
//
// 역할 분담(도입 결정 2026-08-05):
//   절차 레이어(useAnimator) = idle 전부(호흡·포즈·armPose·머리미동·micro-drift) + 표정·립싱크·시선
//   VRMA 레이어(여기)        = 이산 제스처(손인사 등) 1회 재생
//
// ── 복귀(= 이 파일의 핵심) ──────────────────────────────────────────────────
// AnimationMixer 는 매 프레임 본을 통째로 덮어쓰므로, 그냥 멈추면 VRMA 마지막 자세에서
// 절차 자세로 **튄다**. three.js `fadeOut` 도 답이 아니다 — PropertyMixer 가 블렌드하는 상대는
// 액션 시작 시점에 **얼어붙은** 스냅샷이라, 그 사이 계속 움직인 절차 레이어와는 여전히 어긋난다.
//
// 그래서 블렌드를 우리가 한다: 매 프레임 ①절차가 쓴 결과를 스냅샷 → ②mixer 가 덮어씀 →
// ③가중치 w 로 스냅샷 쪽으로 되돌린다(slerp). w: 0→1(진입) →1(유지) →1→0(복귀).
// 블렌드 상대가 **살아있는 절차 출력**이라 복귀 지점이 항상 현재 idle 이다(호흡 위상까지 일치).
// w=0 이면 절차 출력 그대로 = 재생 안 할 때 기존 동작과 바이트 동일(개발 원칙①).
//
// 등록 순서: useAnimator(절차 기록) → **이 훅** → vrm.update(springBone). R3F 는 등록 순서 = 실행 순서.

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { VRM } from '@pixiv/three-vrm';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  VRMAnimationLoaderPlugin,
  createVRMAnimationClip,
  type VRMAnimation,
} from '@pixiv/three-vrm-animation';
import { VRMA_CLIPS, VRMA_WAVE, filterTracks, type VrmaClipDef } from './clips';

const FPS = 60; // 공식 7종 실측 keyframe rate (subclip 프레임 변환용)

// url → 파싱된 VRMAnimation. 제스처는 반복 발동되므로 캐시 필수.
const cache = new Map<string, Promise<VRMAnimation>>();

function loadVrma(url: string): Promise<VRMAnimation> {
  let p = cache.get(url);
  if (!p) {
    const loader = new GLTFLoader();
    loader.register(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (parser: any) => new VRMAnimationLoaderPlugin(parser as any),
    );
    p = loader.loadAsync(url).then((gltf) => {
      const anims = gltf.userData.vrmAnimations as VRMAnimation[] | undefined;
      if (!anims?.length) throw new Error(`VRMA 없음: ${url}`);
      return anims[0];
    });
    cache.set(url, p);
  }
  return p;
}

// 양 끝 도함수 0 — 우리 모션 레이어의 정착 곡선과 동일(오버슈트 금지, [[motion-smoothness-not-overshoot]])
const smootherstep = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

interface Playing {
  action: THREE.AnimationAction;
  bones: THREE.Object3D[];
  /** 본별 복귀 목표 (절차가 쓰는 본이면 이번 프레임 절차 출력, 아니면 rest0) */
  snap: THREE.Quaternion[];
  /** 제스처 직전 자세 — 절차 레이어가 **안 쓰는** 본의 복귀 목표 */
  rest0: THREE.Quaternion[];
  /** 직전 프레임에 우리가 써 넣은 값 — 절차가 이 본을 건드렸는지 판별하는 기준 */
  prevOut: THREE.Quaternion[];
  dur: number; // 초
  t: number;
  fadeIn: number; // 초
  fadeOut: number;
}

interface Options {
  /** 등장 시 손인사 1회 (컴패니언). 절차 WAVE 대신 이쪽이 소유 */
  greetOnReady?: boolean;
  enabled?: boolean;
}

export function useVrmaLayer(
  vrmRef: React.RefObject<VRM | null>,
  opts: Options = {},
) {
  const { greetOnReady = false, enabled = true } = opts;
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const mixerVrmRef = useRef<VRM | null>(null);
  const playingRef = useRef<Playing | null>(null);
  const genRef = useRef(0);
  const pendingRef = useRef<VrmaClipDef | null>(null);
  const greetedRef = useRef(false);
  const greetDelayRef = useRef(0);

  // ─── 트리거 (window 이벤트 — R3F 경계 우회, 기존 companion:* 패턴과 동일) ───────────
  useEffect(() => {
    if (!enabled) return;
    const onWave = () => {
      pendingRef.current = VRMA_WAVE;
    };
    // 임의 클립 재생 — 실험 패널(애셋 물색)에서 def 를 통째로 넘긴다
    const onVrma = (e: Event) => {
      const d = (e as CustomEvent).detail;
      const def: VrmaClipDef | undefined =
        typeof d?.id === 'string' && !d.url
          ? VRMA_CLIPS[d.id]
          : (d as VrmaClipDef);
      if (def?.url) pendingRef.current = def;
    };
    const onStop = () => {
      playingRef.current = null;
      mixerRef.current?.stopAllAction();
    };
    window.addEventListener('companion:wave', onWave);
    window.addEventListener('companion:vrma', onVrma);
    window.addEventListener('companion:vrma-stop', onStop);
    return () => {
      window.removeEventListener('companion:wave', onWave);
      window.removeEventListener('companion:vrma', onVrma);
      window.removeEventListener('companion:vrma-stop', onStop);
    };
  }, [enabled]);

  // ─── 재생 준비 (비동기 로드 → Playing 구성) ────────────────────────────────────
  const start = async (def: VrmaClipDef) => {
    const vrm = vrmRef.current;
    if (!vrm?.humanoid) return;
    const gen = ++genRef.current;
    try {
      const vrmAnimation = await loadVrma(def.url);
      if (genRef.current !== gen || vrmRef.current !== vrm) return;

      // 리타게팅 — 소스 리그가 아니라 **이 vrm** 기준. 캐릭터별 재튜닝이 필요 없는 지점.
      const raw = createVRMAnimationClip(vrmAnimation, vrm);

      // hips 이동만 걷어낸다 — 회전·전신은 그대로(부분 추출은 실측 반려, clips.ts 주석 참조).
      let clip = new THREE.AnimationClip(
        raw.name,
        raw.duration,
        filterTracks(raw.tracks, !def.keepHipsPosition),
      );
      if (def.from != null || def.to != null) {
        clip = THREE.AnimationUtils.subclip(
          clip,
          `${def.id}-trim`,
          Math.round((def.from ?? 0) * FPS),
          Math.round((def.to ?? raw.duration) * FPS),
          FPS,
        );
      }

      if (mixerRef.current && mixerVrmRef.current !== vrm)
        mixerRef.current = null;
      if (!mixerRef.current) {
        mixerRef.current = new THREE.AnimationMixer(vrm.scene);
        mixerVrmRef.current = vrm;
      }
      const mixer = mixerRef.current;
      mixer.stopAllAction();
      const action = mixer.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.reset().play();

      // 블렌드 대상 본 = 클립이 실제로 구동하는 노드. 회전만 블렌드한다
      // (position 트랙은 기본 제거됨 — 남길 거면 위치 블렌드도 추가해야 한다).
      const bones: THREE.Object3D[] = [];
      const seen = new Set<string>();
      for (const t of clip.tracks) {
        const dot = t.name.lastIndexOf('.');
        if (t.name.slice(dot + 1) !== 'quaternion') continue;
        const node = t.name.slice(0, dot);
        if (seen.has(node)) continue;
        seen.add(node);
        const obj = vrm.scene.getObjectByName(node);
        if (obj) bones.push(obj);
      }

      const fadeIn = (def.fadeIn ?? 250) / 1000;
      const fadeOut = (def.fadeOut ?? 400) / 1000;
      playingRef.current = {
        action,
        bones,
        snap: bones.map(() => new THREE.Quaternion()),
        rest0: bones.map((b) => b.quaternion.clone()),
        prevOut: bones.map((b) => b.quaternion.clone()),
        dur: clip.duration,
        t: 0,
        // 진입+복귀가 길이를 넘으면 최대 가중치에 못 닿는다 → 클립 길이에 맞춰 축소
        fadeIn: Math.min(fadeIn, clip.duration * 0.4),
        fadeOut: Math.min(fadeOut, clip.duration * 0.4),
      };
    } catch (err) {
      console.error('[vrma] 재생 실패', def.url, err);
    }
  };

  useFrame((_, delta) => {
    if (!enabled) return;
    const vrm = vrmRef.current;
    if (!vrm) return;

    // 등장 인사는 조금 늦춘다 — 파츠 조립이 끝나기 전에 손을 흔들면 팔만 먼저 움직인다.
    // (절차판 greetOnReady 도 같은 이유로 delay [700,900]ms 였다)
    if (greetOnReady && !greetedRef.current) {
      greetDelayRef.current += delta;
      if (greetDelayRef.current >= 0.8) {
        greetedRef.current = true;
        pendingRef.current = VRMA_WAVE;
      }
    }
    if (pendingRef.current) {
      const def = pendingRef.current;
      pendingRef.current = null;
      void start(def);
    }

    const p = playingRef.current;
    if (!p) return;

    // ① 복귀 목표 결정 — 본마다 다르다.
    //    절차 레이어가 **쓰는** 본(Head/Chest/Spine/팔)이면 방금 쓴 값(= 살아있는 idle, 위상까지 맞음).
    //    **안 쓰는** 본(Hips/목/어깨/다리/손가락)이면 제스처 직전 자세 rest0.
    //      ↳ 안 쓰는 본을 "직전 출력"으로 되돌리면 목표가 자기 자신이라 VRMA 자세에 머문다.
    //        그 상태에서 action.stop() 의 restoreOriginalState 가 액션 시작 시점 값으로 **한 프레임에**
    //        되돌려 튄다(실측: 몸통 yaw −22.9° → 0° 순간 이동). rest0 로 미리 수렴시켜 그 점프를 없앤다.
    //    소유 판별은 "직전에 우리가 써 넣은 값 그대로인가" — 절차가 안 건드리면 비트 동일하다.
    //    (channels.ts 의 본 목록을 복사해 오면 한쪽만 바뀔 때 조용히 어긋나므로 런타임 판별을 쓴다)
    for (let i = 0; i < p.bones.length; i++) {
      const cur = p.bones[i].quaternion;
      p.snap[i].copy(cur.equals(p.prevOut[i]) ? p.rest0[i] : cur);
    }

    // ② VRMA 덮어쓰기
    mixerRef.current?.update(delta);
    p.t += delta;

    // ③ 가중치만큼만 남기고 복귀 목표 쪽으로 되돌림
    const w = Math.min(
      smootherstep(p.t / p.fadeIn),
      smootherstep((p.dur - p.t) / p.fadeOut),
    );
    if (w < 1) {
      const back = 1 - w;
      for (let i = 0; i < p.bones.length; i++)
        p.bones[i].quaternion.slerp(p.snap[i], back);
    }
    for (let i = 0; i < p.bones.length; i++)
      p.prevOut[i].copy(p.bones[i].quaternion);

    if (p.t >= p.dur) {
      // ⚠️ `stop()` 은 three.js `PropertyMixer.restoreOriginalState` 를 부른다 — 바인딩된 본
      // **전부**를 액션 시작 시점(rest0) 값으로 되돌린다. 안 쓰는 본은 이미 rest0 로 수렴시켜
      // 무효지만, **절차가 쓰는 본**(머리·몸통·팔)은 블렌드가 살아있는 idle 로 수렴한 상태라
      // 이 한 프레임만 rest0 로 튀고 다음 프레임에 절차가 되돌린다 = 1프레임 블링크.
      // R3F 는 useFrame 이 다 돌고 렌더하므로 그 프레임이 그대로 화면에 나간다.
      // → 방금 만든 최종 자세(prevOut)를 다시 써 넣어 restore 를 무효화한다.
      p.action.stop();
      for (let i = 0; i < p.bones.length; i++)
        p.bones[i].quaternion.copy(p.prevOut[i]);
      playingRef.current = null; // 이 프레임에서 이미 w=0 → 다음 프레임부터 순수 절차
    }
  });
}
