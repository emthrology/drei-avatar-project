// VRMA vs 절차 손인사 필름스트립 비교 — waveShots.mjs 와 같은 경로(companion 프레이밍)
//   node vrmaShots.mjs [--char female1] [--frames 16] [--every 200]
//   클립 지정은 --file /animations/VRMA_03.vrma [--from 1 --to 5] 로 한다.
import { spawn } from 'child_process';
import { mkdirSync } from 'fs';
import puppeteer from 'puppeteer';

const PORT = 5192; // 5190 대 = 스크립트 일회용 서버 (5173~5189 는 사람의 dev 몫)
const REPO = '/Users/Dongmin/new_workspace/drei-avatar-project';
const arg = (n, f) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : f;
};
const CHAR = arg('char', null);
const FRAMES = Number(arg('frames', 16));
const EVERY = Number(arg('every', 200));
const OUT = arg('out', `${process.cwd()}/vrma-shots`);
const DELAY = Number(arg('delay', 0)); // 트리거~첫 컷 대기(ms)

function waitForServer(proc) {
  return new Promise((resolve, reject) => {
    const onData = (d) => {
      if (/Local:.*http/.test(d.toString())) resolve();
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('exit', (c) => reject(new Error(`vite 종료(${c})`)));
    setTimeout(() => reject(new Error('vite 타임아웃')), 30000);
  });
}

async function capture(page, canvas, label, trigger, triggerArg) {
  const logs = [];
  const onLog = (m) => {
    const t = m.text();
    if (t.includes('[vrma]')) logs.push(t);
  };
  page.on('console', onLog);
  const t0 = Date.now();
  await page.evaluate(trigger, triggerArg);
  if (DELAY) await new Promise((r) => setTimeout(r, DELAY)); // 특정 구간(복귀 등)만 보고 싶을 때
  for (let i = 0; i < FRAMES; i++) {
    const wait = t0 + i * EVERY - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const ms = Date.now() - t0;
    await canvas.screenshot({
      path: `${OUT}/${label}_f${String(i).padStart(2, '0')}_${String(ms).padStart(4, '0')}ms.png`,
    });
  }
  page.off('console', onLog);
  logs.forEach((l) => console.log('   ', l));
  console.log(`  ✅ ${label} ${FRAMES}컷`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const server = spawn(
    'npx',
    ['vite', '--port', String(PORT), '--strictPort'],
    { stdio: 'pipe', cwd: REPO },
  );
  let browser;
  try {
    await waitForServer(server);
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 3 });
    page.on('pageerror', (e) => console.error('  [page error]', e.message));
    await page.goto(
      `http://localhost:${PORT}/?mode=companion&vrma=1${CHAR ? `&char=${CHAR}` : ''}`,
      { waitUntil: 'networkidle0' },
    );
    await page
      .waitForFunction("document.body.innerText.includes('ready')", {
        timeout: 60000,
      })
      .catch(() => {});
    await new Promise((r) => setTimeout(r, 2500));
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('div')) {
        const st = getComputedStyle(el);
        if (
          st.position === 'fixed' &&
          Number(st.zIndex) >= 1000 &&
          !el.querySelector('canvas')
        )
          el.style.display = 'none';
      }
    });
    const canvas = await page.$('canvas');
    if (!canvas) throw new Error('canvas 없음');

    // --keep 로 부위 조합을 바꿔가며 같은 구간을 비교(쉼표 구분, 예: armR,fingersR,torso,head).
    // 지정 없으면 절차 기준선 + 정식 채택본 2종을 찍는다.
    // 임의 파일 전신 재생: --file /animations/VRMA_03.vrma [--from 1 --to 5]
    const FILE = arg('file', null);
    // 부위 조합 실험: --keep armR,fingersR --relative head,torso (콜론으로 여러 조합)
    const KEEPS = arg('keep', null);
    const RELS = arg('relative', null);
    if (FILE) {
      const from = arg('from', null);
      const to = arg('to', null);
      for (const url of FILE.split(':')) {
        console.log(`\n▶ ${url} 전신 재생 (hips 이동만 제거)`);
        await capture(
          page,
          canvas,
          url.split('/').pop().replace('.vrma', ''),
          (o) =>
            window.dispatchEvent(
              new CustomEvent('companion:vrma', {
                detail: {
                  id: 'f',
                  label: 'f',
                  drop: ['hipsPosition'],
                  fadeIn: 200,
                  fadeOut: 300,
                  ...o,
                },
              }),
            ),
          {
            url,
            from: from ? Number(from) : undefined,
            to: to ? Number(to) : undefined,
          },
        );
        await new Promise((r) => setTimeout(r, 2000));
      }
    } else if (KEEPS || RELS) {
      const keeps = (KEEPS ?? 'armR,fingersR').split(':');
      const rels = (RELS ?? '').split(':');
      const n = Math.max(keeps.length, rels.length);
      for (let i = 0; i < n; i++) {
        const keep = (keeps[Math.min(i, keeps.length - 1)] ?? '')
          .split(',')
          .filter(Boolean);
        const relative = (rels[Math.min(i, rels.length - 1)] ?? '')
          .split(',')
          .filter(Boolean);
        const label = `k-${keep.join('+') || 'none'}_r-${relative.join('+') || 'none'}`;
        console.log(
          `\n▶ keep=[${keep.join(' ')}] relative=[${relative.join(' ')}]`,
        );
        await capture(
          page,
          canvas,
          label,
          (o) =>
            window.dispatchEvent(
              new CustomEvent('companion:vrma', {
                detail: {
                  id: 'probe',
                  label: 'probe',
                  url: '/animations/VRMA_02.vrma',
                  from: 2.6,
                  to: 5.6,
                  fadeIn: 260,
                  fadeOut: 420,
                  ...o,
                },
              }),
            ),
          { keep, relative },
        );
        await new Promise((r) => setTimeout(r, 2500));
      }
    } else {
      console.log('\n▶ 절차 손인사 (기준선)');
      await capture(page, canvas, 'proc', () =>
        window.dispatchEvent(new Event('companion:wave-proc')),
      );
      await new Promise((r) => setTimeout(r, 2500));

      console.log('\n▶ VRMA 손인사 (정식) — 뒤쪽 컷은 idle 복귀 확인용');
      await capture(page, canvas, 'vrma', () =>
        window.dispatchEvent(new Event('companion:wave')),
      );
    }
    console.log(`\n📁 ${OUT}`);
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
  }
}
main().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
