import { useEffect, useLayoutEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import * as THREE from 'three';
import { useLipsync } from './useLipsync';
import { useAnimator } from './anim/useAnimator';
import { useMotionProbe } from './anim/useMotionProbe';
import { type StateName } from './anim/scheduler';
import { useLookAt } from './useLookAt';
import { type SpeakPayload } from './tts';
import { type MoodName } from './locales';
import { useAvatarStore } from '../store';
import { getCharacter } from '../editor/constants';
import { useAssembledVrm } from '../editor/useAssembledVrm';
import { useVrmaLayer } from './anim/vrma/useVrmaLayer';

export interface CameraSettings {
  position: [number, number, number];
  target: [number, number, number];
}

interface Props {
  // 업로드 오버라이드(있으면 단일 VRM). 없으면 store 캐릭터 base + 선택 파츠를 조립(에디터와 동일).
  uploadUrl?: string | null;
  speaking: boolean;
  mood: MoodName;
  onReady: (speak: (payload: SpeakPayload) => void) => void;
  onCameraReady?: (s: CameraSettings) => void;
}

function computeUpperBodyCamera(vrm: VRM): CameraSettings {
  vrm.scene.updateWorldMatrix(true, true);

  const headBone = vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Head);
  const hipsBone = vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Hips);

  const headPos = new THREE.Vector3();
  const hipsPos = new THREE.Vector3();
  headBone?.getWorldPosition(headPos);
  hipsBone?.getWorldPosition(hipsPos);

  // 본이 없거나 origin에 있으면 표준 VRM 신장으로 fallback
  if (headPos.y < 0.1) headPos.y = 1.6;
  if (hipsPos.y < 0.1) hipsPos.y = 0.95;

  const torsoHeight = headPos.y - hipsPos.y; // hips → head 본 거리

  // 머리 위 한계: 본 기반 추정(고정 비율)은 헤어/모자 볼륨이 큰 모델에서 잘림.
  // 실제 메시 바운딩박스 최상단 = 머리카락 끝까지 정확히 포함 (모델 불문)
  const bbox = new THREE.Box3().setFromObject(vrm.scene);
  const headEstimate = headPos.y + torsoHeight * 0.3; // bbox 비정상 시 fallback
  const meshTop = isFinite(bbox.max.y) ? bbox.max.y : headEstimate;
  const spanTop = Math.max(meshTop, headEstimate) + torsoHeight * 0.05; // 머리 위 5% 여백
  const spanBot = hipsPos.y + torsoHeight * 0.15;
  const targetY = (spanTop + spanBot) / 2;
  const verticalSpan = spanTop - spanBot;

  // fov=28 기준으로 수직 범위가 딱 맞는 거리 계산 (10% 여백)
  const fov = 28;
  const dist = (verticalSpan / 2 / Math.tan((fov * Math.PI) / 180 / 2)) * 1.1;

  return {
    target: [0, targetY, 0],
    position: [0, targetY, dist],
  };
}

export function CompanionAvatar({
  uploadUrl,
  speaking,
  mood,
  onReady,
  onCameraReady,
}: Props) {
  // prop 최신값을 프레임 루프에 넘기는 통로(useAnimator 가 useFrame 안에서 읽는다).
  // 쓰기를 렌더가 아니라 **커밋 시점**에 한다 — 렌더 중 ref 변경은 버려지는 렌더(Suspense
  // 재시도·StrictMode 이중 렌더)에서도 일어나 커밋 안 된 값이 남을 수 있다.
  // useLayoutEffect 는 모든 useEffect·모든 프레임보다 먼저라 읽는 쪽이 낡은 값을 볼 수 없다.
  const stateRef = useRef<StateName>('idle');
  const moodRef = useRef<string>('neutral');
  useLayoutEffect(() => {
    stateRef.current = speaking ? 'speaking' : 'idle';
    moodRef.current = mood;
  });

  // 조립 소스: 업로드 VRM(파츠 0개) 또는 store 캐릭터 base + 카탈로그(에디터 store 공유).
  const characterId = useAvatarStore((s) => s.characterId);
  const character = getCharacter(characterId);
  const baseUrl = uploadUrl || character.baseUrl;
  const catalog = uploadUrl ? [] : character.catalog;

  const { vrm, vrmRef, syncFace } = useAssembledVrm(baseUrl, catalog);

  const { speak } = useLipsync(vrmRef);
  useAnimator(vrmRef, stateRef, moodRef, true, false); // 등장 인사는 아래 VRMA 레이어가 소유
  useVrmaLayer(vrmRef, { greetOnReady: true }); // 이산 제스처(손인사) — 끝나면 idle 로 블렌드 복귀
  useLookAt(vrmRef);

  // 조립 base 의 dispose/회전은 useAssembledVrm 이 담당. 여기선 ready/카메라만.
  useEffect(() => {
    if (!vrm) return;
    onReady(speak);
    onCameraReady?.(computeUpperBodyCamera(vrm));
  }, [vrm, onReady, speak, onCameraReady]);

  useFrame((_, delta) => {
    const v = vrmRef.current;
    if (!v) return;
    v.update(delta);
    syncFace(); // 얼굴 교체 시: base 표정/립싱크/시선 → 교체된 Face 미러
  });

  // 손동작 수치 프로브 — 위 vrm.update 다음에 등록해야 최종 자세를 잰다 (등록 순서 = 실행 순서)
  useMotionProbe(vrmRef);

  if (!vrm) return null;
  return <primitive object={vrm.scene} />;
}
