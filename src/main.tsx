import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { ThumbScene } from './editor/ui/ThumbScene';
import {
  CHARACTERS,
  type CharacterId,
  type PartCategory,
  type PartCategoryDef,
} from './editor/constants';
import { useAvatarStore } from './store';

// 썸네일 렌더 모드(오프라인 툴링): ?thumb=<category>:<variantId> → 파츠 1개 단독 렌더.
// 전 캐릭터 카탈로그 union 을 window.__CATALOG 로 노출 → scripts/renderThumbs.mjs 가 순회.
// variant id 는 전역 고유라 캐릭터 축이 필요 없다. App.tsx 는 건드리지 않고 엔트리에서 분기.
const ALL_CATEGORIES: PartCategoryDef[] = CHARACTERS.flatMap(
  (ch) => ch.catalog,
);
(window as unknown as { __CATALOG?: PartCategoryDef[] }).__CATALOG =
  ALL_CATEGORIES;

function parseThumb(): { category: PartCategory; variantId: string } | null {
  const raw = new URLSearchParams(window.location.search).get('thumb');
  if (!raw) return null;
  const [category, variantId] = raw.split(':');
  if (!ALL_CATEGORIES.some((c) => c.id === category)) return null;
  return { category: category as PartCategory, variantId };
}

const thumb = parseThumb();

// ?char=<id> → 시작 캐릭터 지정 (오프라인 툴링용). 손동작 프로브/스크린샷이 특정 캐릭터에서
// 검증할 수 있어야 한다 — 자세 값이 base 별로 다르게 보일 수 있어 남자1만 재면 놓친다.
const charId = new URLSearchParams(window.location.search).get('char');
if (charId && CHARACTERS.some((c) => c.id === charId)) {
  useAvatarStore.getState().setCharacter(charId as CharacterId);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {thumb ? (
      // 썸네일 모드는 배경 투명(puppeteer omitBackground 스냅샷)
      <div className="w-full h-full">
        <ThumbScene category={thumb.category} variantId={thumb.variantId} />
      </div>
    ) : (
      <App />
    )}
  </StrictMode>,
);
