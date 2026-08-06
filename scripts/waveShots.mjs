// 손인사 필름스트립 — 프로브가 재는 동작을 눈으로도 확인할 수 있게 연속 캡처.
// probeMotion.mjs 와 같은 경로(vite 기동 → puppeteer → companion 모드)를 쓰되,
// 판정 대신 캔버스를 N ms 간격으로 스크린샷한다.
//
//   node waveShots.mjs [--gesture N] [--frames 18] [--every 130] [--out dir]

import { spawn } from 'child_process';
import { mkdirSync } from 'fs';
import puppeteer from 'puppeteer';

const PORT = 5181;
const REPO = '/Users/Dongmin/new_workspace/drei-avatar-project';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : fallback;
}
const GESTURE = arg('gesture', null);
const FRAMES = Number(arg('frames', 18));
const EVERY = Number(arg('every', 130));
const CHAR = arg('char', null);
const OUT = arg('out', `${process.cwd()}/shots`);

function waitForServer(proc) {
  return new Promise((resolve, reject) => {
    const onData = (d) => {
      const s = d.toString();
      if (/Local:.*http/.test(s) || new RegExp(`localhost:${PORT}`).test(s))
        resolve();
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('exit', (code) => reject(new Error(`vite 종료(code ${code})`)));
    setTimeout(() => reject(new Error('vite 기동 타임아웃')), 30000);
  });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const server = spawn(
    'npx',
    ['vite', '--port', String(PORT), '--strictPort'],
    {
      stdio: 'pipe',
      cwd: REPO,
    },
  );
  let browser;
  try {
    await waitForServer(server);
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox'],
    });
    const page = await browser.newPage();
    // deviceScaleFactor 로 300×400 오버레이를 또렷하게 확대 캡처
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 3 });
    page.on('pageerror', (e) => console.error('  [page error]', e.message));

    const url = `http://localhost:${PORT}/?mode=companion${CHAR ? `&char=${CHAR}` : ''}`;
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page
      .waitForFunction(
        "document.body.innerText.includes('ready') || document.body.innerText.includes('speaking')",
        { timeout: 60000 },
      )
      .catch(() => console.error('  ⚠️ ready 확인 실패 — 그대로 진행'));
    await new Promise((r) => setTimeout(r, 1500));

    // DebugPanel(fixed, z-index 9999)이 캔버스를 덮으므로 캡처 동안 숨긴다
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('div')) {
        const st = getComputedStyle(el);
        if (
          st.position === 'fixed' &&
          Number(st.zIndex) >= 1000 &&
          !el.querySelector('canvas')
        ) {
          el.style.display = 'none';
        }
      }
    });

    const canvas = await page.$('canvas');
    if (!canvas) throw new Error('canvas 없음');

    const t0 = Date.now();
    if (GESTURE !== null) {
      await page.evaluate((i) => {
        window.dispatchEvent(
          new CustomEvent('companion:gesture', {
            detail: { index: Number(i) },
          }),
        );
      }, GESTURE);
    } else {
      await page.evaluate(() =>
        window.dispatchEvent(new CustomEvent('companion:wave')),
      );
    }

    for (let i = 0; i < FRAMES; i++) {
      const target = t0 + i * EVERY;
      const wait = target - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      const ms = Date.now() - t0;
      const path = `${OUT}/f${String(i).padStart(2, '0')}_${String(ms).padStart(4, '0')}ms.png`;
      await canvas.screenshot({ path });
      console.log(`  ${path}  (+${ms}ms)`);
    }
    console.log(`\n✅ ${FRAMES}컷 → ${OUT}`);
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
  }
}

main().catch((e) => {
  console.error('❌ waveShots 실패:', e);
  process.exit(1);
});
