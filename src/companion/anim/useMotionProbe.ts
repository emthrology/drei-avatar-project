// 손동작 프로브 녹화 훅 — `companion:probe` 이벤트로 팔 기하를 N초간 샘플링해 판정한다.
//
// **useAnimator 를 건드리지 않는다**(개발 원칙①=비퇴행). 자체 useFrame 으로 읽기만 하므로
// 애니메이션 파이프라인과 채널 소유에 무관하다. 프로브를 안 돌리면 프레임당 비용도 0.
//
// 호출 위치 중요: CompanionAvatar 의 `vrm.update(delta)` useFrame **다음**에 호출할 것.
// R3F 는 등록 순서대로 useFrame 을 돌리므로, 그래야 스프링본·표정까지 반영된 최종 자세를 잰다.
//
// 결과는 두 경로로 나간다:
//   1) `window.__probeResult` — scripts/probeMotion.mjs(puppeteer)가 읽는다
//   2) `companion:probe:done` 이벤트 — DebugPanel 이 화면에 띄운다 (R3F 경계 우회, 기존 관례)

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { VRM } from '@pixiv/three-vrm';
import { sampleArm, evaluateArm, type ArmSample, type ArmVerdict, type ArmTargets, type Side } from './probe';

export interface ProbeResult extends ArmVerdict {
  side: Side;
  durationMs: number;
  sampleCount: number;
  samples: ArmSample[];
}

declare global {
  interface Window {
    __probeResult?: ProbeResult | { error: string };
  }
}

interface Recording {
  side: Side;
  endAt: number; // performance.now() 기준
  startedAt: number;
  targets?: ArmTargets;
  samples: ArmSample[];
}

export function useMotionProbe(vrmRef: React.MutableRefObject<VRM | null>) {
  const recRef = useRef<Recording | null>(null);

  useEffect(() => {
    const onProbe = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      const ms: number = d.ms ?? 3000;
      const now = performance.now();
      // 재트리거 시 이전 녹화는 버리고 새로 시작 (겹침 방지)
      recRef.current = {
        side: d.side === 'L' ? 'L' : 'R',
        startedAt: now,
        endAt: now + ms,
        targets: d.targets,
        samples: [],
      };
      window.__probeResult = undefined;
    };
    window.addEventListener('companion:probe', onProbe);
    return () => window.removeEventListener('companion:probe', onProbe);
  }, []);

  useFrame(() => {
    const rec = recRef.current;
    if (!rec) return;
    const vrm = vrmRef.current;
    if (!vrm) return;

    const now = performance.now();
    const s = sampleArm(vrm, rec.side, (now - rec.startedAt) / 1000);
    if (s) rec.samples.push(s);

    if (now < rec.endAt) return;

    // ── 녹화 종료 → 판정 ──
    recRef.current = null;
    if (rec.samples.length === 0) {
      // Hand 본이 없는 모델(비VRoid 등)이거나 VRM 미로드 — 조용히 실패하지 않고 명시한다
      const err = { error: 'no samples — Hand/Hips 본 없음 또는 VRM 미로드' };
      window.__probeResult = err;
      window.dispatchEvent(new CustomEvent('companion:probe:done', { detail: err }));
      return;
    }

    const verdict = evaluateArm(rec.samples, rec.targets);
    const result: ProbeResult = {
      ...verdict,
      side: rec.side,
      durationMs: Math.round(now - rec.startedAt),
      sampleCount: rec.samples.length,
      samples: rec.samples,
    };
    window.__probeResult = result;
    window.dispatchEvent(new CustomEvent('companion:probe:done', { detail: result }));
  });
}
