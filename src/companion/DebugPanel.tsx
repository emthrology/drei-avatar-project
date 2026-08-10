import { useEffect, useRef, useState } from 'react';
import { type Lang, type Gender } from './locales';
import { MOODS, IDLE_POSES } from './anim/moods';
import type { ProbeResult } from './anim/useMotionProbe';

// 제스처 라벨 목록 (수동 트리거 버튼용). 인덱스가 MOODS.neutral.gestures와 일치
const GESTURE_LABELS = MOODS.neutral.gestures.map(
  (g, i) => g.label ?? `제스처 ${i}`,
);

// idle 포즈 라벨 (수동 트리거, 팔 + 몸통 둘러보기). 인덱스가 IDLE_POSES와 일치
const IDLE_POSE_LABELS = IDLE_POSES.map((p, i) => p.label ?? `포즈 ${i}`);

// 무드 목록 (표정 트리거 버튼용). MOODS 키 순서 = neutral/happy/sad/surprised/angry
const MOOD_NAMES = Object.keys(MOODS);

function triggerGesture(index: number) {
  window.dispatchEvent(
    new CustomEvent('companion:gesture', { detail: { index } }),
  );
}

function triggerMood(mood: string) {
  window.dispatchEvent(new CustomEvent('companion:mood', { detail: { mood } }));
}

function triggerIdlePose(index: number) {
  window.dispatchEvent(
    new CustomEvent('companion:idlepose', { detail: { index } }),
  );
}

function triggerWave() {
  window.dispatchEvent(new CustomEvent('companion:wave'));
}

// 인사(손인사+미소) — 컴패니언 진입 시 자동 재생되는 것과 **같은 경로**(VRMA_CLIPS 의 id).
// 탭을 다시 열지 않고 확인하려고 둔다.
function triggerGreet() {
  window.dispatchEvent(
    new CustomEvent('companion:vrma', { detail: { id: 'greet' } }),
  );
}

// 손동작 수치 프로브 — ms 동안 팔 기하를 샘플링해 판정(anim/probe.ts).
// 육안 대신 수치로 보므로 "덜렁덜렁" 같은 표현이 어느 지표 불합격인지로 환원된다.
function triggerProbe(ms = 3000, side: 'L' | 'R' = 'R') {
  window.dispatchEvent(
    new CustomEvent('companion:probe', { detail: { ms, side } }),
  );
}

interface Props {
  status: 'loading' | 'ready' | 'speaking';
  lastText: string;
  lang: Lang;
  gender: Gender;
  onEvent: (type: string) => void;
  onLangChange: (lang: Lang) => void;
  onGenderChange: (gender: Gender) => void;
  onAvatarLoad: (url: string, label: string) => void;
}

const EVENTS = [
  'level_clear',
  'player_die',
  'near_miss',
  'jump',
  'start',
] as const;
const GENDERS: Gender[] = ['male', 'female'];

const STATUS_COLOR: Record<Props['status'], string> = {
  loading: '#f59e0b',
  ready: '#22c55e',
  speaking: '#3b82f6',
};

const LANGS: Lang[] = ['en', 'ko'];

export function DebugPanel({
  status,
  lastText,
  lang,
  gender,
  onEvent,
  onLangChange,
  onGenderChange,
  onAvatarLoad,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loadedLabel, setLoadedLabel] = useState<string | null>(null);
  const [probe, setProbe] = useState<ProbeResult | { error: string } | null>(
    null,
  );
  const [probing, setProbing] = useState(false);

  // 프로브 결과 수신 (useMotionProbe → window 이벤트, R3F 경계 우회 — 기존 관례)
  useEffect(() => {
    const onDone = (e: Event) => {
      setProbe((e as CustomEvent).detail);
      setProbing(false);
    };
    window.addEventListener('companion:probe:done', onDone);
    return () => window.removeEventListener('companion:probe:done', onDone);
  }, []);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const label = file.name.replace(/\.vrm$/i, '');
    setLoadedLabel(label);
    onAvatarLoad(url, label);
    e.target.value = '';
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        left: 16,
        background: 'rgba(0,0,0,0.75)',
        color: '#fff',
        borderRadius: 10,
        padding: '12px 16px',
        fontFamily: 'monospace',
        fontSize: 13,
        minWidth: 220,
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        // 버튼이 늘면(제스처 추가·스윕) 패널이 세로로 길어져 아바타를 가린다 → 자체 스크롤로
        // 가둔다. 폭도 상한을 둬 긴 라벨이 패널을 옆으로 늘리지 않게(오버레이는 우하단).
        maxHeight: 'calc(100vh - 32px)',
        maxWidth: '32vw',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      {/* 상태 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: STATUS_COLOR[status],
            boxShadow: `0 0 6px ${STATUS_COLOR[status]}`,
          }}
        />
        <span style={{ color: STATUS_COLOR[status], fontWeight: 'bold' }}>
          {status.toUpperCase()}
        </span>
      </div>

      {/* 발화 텍스트 */}
      {lastText && (
        <div
          style={{
            marginBottom: 10,
            color: '#a5f3fc',
            wordBreak: 'keep-all',
            fontSize: 12,
          }}
        >
          💬 {lastText}
        </div>
      )}

      <hr
        style={{ border: 'none', borderTop: '1px solid #333', margin: '8px 0' }}
      />

      {/* 언어 토글 */}
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
        Language
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {LANGS.map((l) => (
          <button
            key={l}
            onClick={() => onLangChange(l)}
            style={{
              background: lang === l ? '#6366f1' : '#1e293b',
              color: lang === l ? '#fff' : '#94a3b8',
              border: `1px solid ${lang === l ? '#6366f1' : '#334155'}`,
              borderRadius: 6,
              padding: '4px 10px',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: lang === l ? 'bold' : 'normal',
            }}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      {/* 음성 성별 토글 (VRM에 성별 필드 없음 → 수동 선택) */}
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
        Voice
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {GENDERS.map((g) => (
          <button
            key={g}
            onClick={() => onGenderChange(g)}
            style={{
              background: gender === g ? '#6366f1' : '#1e293b',
              color: gender === g ? '#fff' : '#94a3b8',
              border: `1px solid ${gender === g ? '#6366f1' : '#334155'}`,
              borderRadius: 6,
              padding: '4px 10px',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: gender === g ? 'bold' : 'normal',
            }}
          >
            {g === 'male' ? '♂ Male' : '♀ Female'}
          </button>
        ))}
      </div>

      <hr
        style={{ border: 'none', borderTop: '1px solid #333', margin: '8px 0' }}
      />

      {/* VRM 로드 (파이프라인 없이 직접) */}
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
        Load VRM
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".vrm"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
      <button
        onClick={() => fileRef.current?.click()}
        style={{
          width: '100%',
          background: '#0f172a',
          color: '#94a3b8',
          border: '1px solid #334155',
          borderRadius: 6,
          padding: '5px 8px',
          cursor: 'pointer',
          fontSize: 11,
          marginBottom: 4,
          textAlign: 'left',
        }}
      >
        {loadedLabel ? `✅ ${loadedLabel}` : '📁 .vrm 파일 선택'}
      </button>

      <hr
        style={{ border: 'none', borderTop: '1px solid #333', margin: '8px 0' }}
      />

      {/* 이벤트 버튼 */}
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
        Game Events
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {EVENTS.map((type) => (
          <button
            key={type}
            onClick={() => onEvent(type)}
            style={{
              background: '#1e293b',
              color: '#e2e8f0',
              border: '1px solid #334155',
              borderRadius: 6,
              padding: '4px 8px',
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            {type}
          </button>
        ))}
      </div>

      <hr
        style={{ border: 'none', borderTop: '1px solid #333', margin: '8px 0' }}
      />

      {/* 무드(표정) 수동 트리거 — 발화 없이 표정만 검증. neutral로 되돌림 */}
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
        Moods (expression)
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {MOOD_NAMES.map((mood) => (
          <button
            key={mood}
            onClick={() => triggerMood(mood)}
            style={{
              background: '#422006',
              color: '#fed7aa',
              border: '1px solid #b45309',
              borderRadius: 6,
              padding: '4px 8px',
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            {mood}
          </button>
        ))}
      </div>

      <hr
        style={{ border: 'none', borderTop: '1px solid #333', margin: '8px 0' }}
      />

      {/* idle 팔 포즈 수동 트리거 — 축/진폭 검증용. 1.8s 유지 후 복귀 */}
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
        Idle Poses
      </div>
      <div
        style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}
      >
        {IDLE_POSE_LABELS.map((label, i) => (
          <button
            key={i}
            onClick={() => triggerIdlePose(i)}
            style={{
              background: '#064e3b',
              color: '#d1fae5',
              border: '1px solid #059669',
              borderRadius: 6,
              padding: '4px 8px',
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <hr
        style={{ border: 'none', borderTop: '1px solid #333', margin: '8px 0' }}
      />

      {/* 제스처 수동 트리거 */}
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
        Gestures
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <button
          onClick={triggerWave}
          style={{
            background: '#312e81',
            color: '#e0e7ff',
            border: '1px solid #4f46e5',
            borderRadius: 6,
            padding: '4px 8px',
            cursor: 'pointer',
            fontSize: 11,
          }}
        >
          👋 손인사
        </button>
        <button
          onClick={triggerGreet}
          style={{
            background: '#312e81',
            color: '#e0e7ff',
            border: '1px solid #4f46e5',
            borderRadius: 6,
            padding: '4px 8px',
            cursor: 'pointer',
            fontSize: 11,
          }}
        >
          😊 인사(등장)
        </button>
        {GESTURE_LABELS.map((label, i) => (
          <button
            key={i}
            onClick={() => triggerGesture(i)}
            style={{
              background: '#312e81',
              color: '#e0e7ff',
              border: '1px solid #4f46e5',
              borderRadius: 6,
              padding: '4px 8px',
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <hr
        style={{ border: 'none', borderTop: '1px solid #333', margin: '8px 0' }}
      />

      {/* 손동작 수치 프로브 — 육안 대신 지표로 판정 (docs/wave-gesture-attempts.md 실패 5건을 술어화) */}
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
        Motion Probe (손동작 수치 검증)
      </div>
      <div
        style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}
      >
        {(['R', 'L'] as const).map((side) => (
          <button
            key={side}
            disabled={probing}
            onClick={() => {
              setProbing(true);
              setProbe(null);
              triggerProbe(3000, side);
            }}
            style={{
              background: probing ? '#374151' : '#7c2d12',
              color: '#fed7aa',
              border: '1px solid #ea580c',
              borderRadius: 6,
              padding: '4px 8px',
              cursor: probing ? 'default' : 'pointer',
              fontSize: 11,
            }}
          >
            {probing ? '측정 중…' : `${side}팔 3초 측정`}
          </button>
        ))}
      </div>

      {probe && 'error' in probe && (
        <div style={{ fontSize: 11, color: '#f87171' }}>❌ {probe.error}</div>
      )}

      {probe && !('error' in probe) && (
        <div style={{ fontSize: 10, lineHeight: 1.6 }}>
          <div
            style={{
              color: probe.pass ? '#4ade80' : '#f87171',
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            {probe.pass ? '✅ PASS' : '❌ FAIL'} · {probe.side}팔 ·{' '}
            {probe.sampleCount}샘플 / {probe.durationMs}ms
          </div>
          {probe.checks.map((c) => (
            <div
              key={c.name}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <span style={{ color: c.pass ? '#4ade80' : '#f87171' }}>
                {c.pass ? '✓' : '✗'} {c.name}
              </span>
              <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>
                {c.value} <span style={{ color: '#64748b' }}>({c.want})</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
