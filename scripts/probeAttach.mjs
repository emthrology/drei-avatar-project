// 살아있는 dev 서버·브라우저에 붙어 프로브를 돌린다 — 탐색용 빠른 경로.
//
// scripts/probeMotion.mjs 는 실행마다 vite 기동 + 브라우저 launch + 12MB VRM 로드로 ~30초를
// 쓰고 측정 구간은 3초뿐이다. 여기서는 전용 헤드리스 크롬 하나를 띄워두고 로드된 탭을 재사용해
// 4~6초에 끝낸다. 측정·판정 로직은 페이지 안(useMotionProbe)에 있으므로 **동일**하다 —
// 바뀌는 건 "브라우저와 서버를 어떻게 얻는가" 뿐이다.
//
// 역할 분담: 탐색은 이 스크립트, **확정은 `npm run verify`**. 다만 이 스크립트도 판정을
// exit code 로 내보내므로(probeMotion.mjs 와 동일 규약) && 체인에 끼워도 안전하다.
//
// 사용:
//   npm run dev            # 먼저 띄워둘 것 (포트는 자동 탐지 — vite.config.ts 참조)
//   npm run probe:tab -- --wave --char male1
//   npm run probe:tab -- --gesture 1,2,3
//   npm run probe:tab -- --wave --no-reload      # 소스가 안 바뀐 경우에만 리로드 생략

import puppeteer from 'puppeteer';
import { readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execSync } from 'node:child_process';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(REPO, 'node_modules/.cache');
const PROFILE_DIR = join(CACHE, 'probe-chrome');
const LASTUSE_FILE = join(CACHE, 'probe-chrome-lastuse');

// 이 저장소 전용 디버깅 포트 — 다른 프로젝트의 크롬(9222 등)과 겹치지 않게
const DEBUG_PORT = Number(process.env.PROBE_PORT ?? 9333);
// 마지막 프로브 후 이만큼 지나면 브라우저 자동 종료 (유령 방지).
// 바닥값 60초 — 3초로 두자 **측정 도중** 브라우저가 죽어 63초 타임아웃이 났다. 감시자 주기가
// 30초라 그보다 짧은 한계는 경합을 만든다.
const IDLE_KILL_MS = Math.max(
  60_000,
  Number(process.env.PROBE_IDLE_MS ?? 15 * 60 * 1000),
);

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const has = (name) => process.argv.includes(`--${name}`);

const SIDE = arg('side', 'R');
const CHAR = arg('char', null);
const WAVE = has('wave');
const GESTURE = arg('gesture', null);
// probeMotion.mjs 와 같은 값 — 측정 창을 클립 타이밍에 맞춘다(창이 길면 복귀 구간이 섞인다)
const WAIT = Number(arg('wait', WAVE ? 500 : 120));
const MS = Number(arg('ms', WAVE ? 1900 : 3000));
const RELOAD = !has('no-reload');
const PORT_OVERRIDE = arg('port', null);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const touchLastUse = () => {
  try {
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(LASTUSE_FILE, String(Date.now()));
  } catch {
    /* 캐시를 못 써도 프로브 자체는 진행 */
  }
};

/**
 * dev 서버를 **신원으로** 찾는다. 포트 번호만 믿으면 5173(vite 전역 기본값)을 선점한 다른
 * 프로젝트의 서버를 조용히 측정하게 된다 — 크롬 9222 에서 실제로 당한 실수와 같은 종류다.
 *
 * 살아있는 서버에게 직접 묻는다(vite.config.ts 의 probe-dev-server-identity).
 * 파일에 기록을 남기는 방식은 낡은 기록이 두 방식으로 깨져 폐기했다(그 파일의 주석 참조).
 */
async function findDevServer() {
  // 탐색 범위 = **사람의 dev 대역만**(5173~5189). vite 는 점유 시 5173 부터 위로 올라간다.
  // 스크립트 일회용 서버(probeMotion 5190·waveShots 5191·vrmaShots 5192·renderThumbs 5193)는
  // 같은 저장소를 서빙해 신원 검사를 그냥 통과하므로, 대역이 겹치면 `npm run probe` 가 도는
  // 중에 그 서버에 붙어 **사람의 서버 대신** 측정하게 된다. 대역을 안 겹치게 갈라 원천 차단.
  const ports = PORT_OVERRIDE
    ? [Number(PORT_OVERRIDE)]
    : Array.from({ length: 17 }, (_, i) => 5173 + i);
  const tried = [];
  for (const port of ports) {
    let id;
    try {
      const res = await fetch(`http://localhost:${port}/__probe_id`, {
        signal: AbortSignal.timeout(800),
      });
      id = await res.json();
    } catch {
      continue; // 아무도 안 듣거나 vite 가 아님
    }
    if (id?.root && resolve(id.root) === REPO) {
      return { port, why: `신원 확인됨 pid ${id.pid}` };
    }
    tried.push(`:${port}=${id?.root ?? '알 수 없음'}`);
  }
  throw new Error(
    tried.length
      ? `이 저장소의 dev 서버를 못 찾았다. 응답한 서버: ${tried.join(', ')}`
      : 'dev 서버를 찾을 수 없다 — `npm run dev` 를 먼저 실행할 것',
  );
}

/** 측정 결과를 바꿀 수 있는 입력의 최종 수정 시각. 세 곳 합쳐 138개 / 2ms — 넓게 잡아도 공짜다. */
function latestSourceMtime(roots) {
  let newest = 0;
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // 없는 경로는 무시
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else {
        const m = statSync(p).mtimeMs;
        if (m > newest) newest = m;
      }
    }
  };
  roots.forEach(walk);
  return newest;
}

/**
 * 프로브 전용 브라우저를 확보한다. 없으면 띄우고, 있으면 붙는다.
 * ⚠️ 포트만 보고 붙으면 안 된다 — 다른 프로젝트가 남긴 `--disable-gpu` 헤드리스 크롬에 붙으면
 * WebGL 이 없어 VRM 이 안 뜨고, 증상은 "ready 도달 실패"로만 보인다(실측 63초 낭비).
 */
async function acquireBrowser() {
  const endpoint = `http://127.0.0.1:${DEBUG_PORT}`;
  try {
    // /json/version 은 user-data-dir 을 안 알려준다 → 포트 소유 프로세스의 실행 인자를 직접 본다
    const owner = execSync(
      `lsof -tnP -iTCP:${DEBUG_PORT} -sTCP:LISTEN 2>/dev/null | head -1`,
      { encoding: 'utf8' },
    ).trim();
    if (!owner) throw new Error('리스너 없음');
    const cmd = execSync(`ps -o command= -p ${owner}`, { encoding: 'utf8' });
    if (!cmd.includes(PROFILE_DIR)) {
      throw new Error(
        `포트 ${DEBUG_PORT} 를 남의 브라우저가 쓰고 있다 (PID ${owner}) — 붙지 않는다`,
      );
    }
    const browser = await puppeteer.connect({
      browserURL: endpoint,
      defaultViewport: null,
    });
    return { browser, launched: false };
  } catch (e) {
    // 남의 브라우저면 우리 걸 띄워도 포트가 겹쳐 실패한다 → 조용히 넘어가지 말고 알린다
    if (String(e.message).includes('남의 브라우저')) throw e;

    const child = spawn(
      await puppeteer.executablePath(),
      [
        '--headless=new',
        `--remote-debugging-port=${DEBUG_PORT}`,
        `--user-data-dir=${PROFILE_DIR}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--use-gl=angle',
        '--use-angle=metal', // ⚠️ --disable-gpu 금지: WebGL 이 죽어 VRM 이 안 뜬다
        'about:blank',
      ],
      { detached: true, stdio: 'ignore' },
    );
    child.unref();

    // 유휴 자동 종료 — 없으면 세션이 끝나도 크롬 9개 프로세스(약 1.1GB)가 남아, 다음 세션에게
    // 우리가 겪은 것과 같은 유령이 된다. 감시자는 매 실행이 갱신하는 lastuse 파일만 본다.
    spawn(
      process.execPath,
      [
        '-e',
        `const fs=require('fs');
         const f=${JSON.stringify(LASTUSE_FILE)}, pid=${child.pid}, limit=${IDLE_KILL_MS};
         setInterval(() => {
           let last = 0;
           try { last = Number(fs.readFileSync(f, 'utf8')) } catch {}
           if (Date.now() - last > limit) { try { process.kill(pid) } catch {} process.exit(0) }
           try { process.kill(pid, 0) } catch { process.exit(0) }
         }, 30000)`,
      ],
      { detached: true, stdio: 'ignore' },
    ).unref();

    for (let i = 0; i < 40; i++) {
      await wait(250);
      try {
        const browser = await puppeteer.connect({
          browserURL: endpoint,
          defaultViewport: null,
        });
        return { browser, launched: true };
      } catch {
        /* 아직 안 뜸 */
      }
    }
    // cause 로 원인을 붙인다 — 기동 실패 원인이 "붙기 실패"인지 "실행 실패"인지 구분돼야 한다
    throw new Error(`프로브 브라우저 기동 실패 (포트 ${DEBUG_PORT})`, {
      cause: e,
    });
  }
}

function report(r) {
  if (!r) return console.error('❌ 결과 없음');
  if (r.error) return console.error(`❌ ${r.error}`);
  console.log(
    `\n${r.pass ? '✅ PASS' : '❌ FAIL'}  ${r.side}팔 · ${r.sampleCount}샘플 / ${r.durationMs}ms`,
  );
  console.log('─'.repeat(58));
  for (const c of r.checks) {
    console.log(
      `  ${c.pass ? '✓' : '✗'} ${c.name.padEnd(12)} ${String(c.value).padStart(10)}   기대 ${c.want}`,
    );
  }
  console.log('─'.repeat(58));
  if (r.tipSpan) {
    console.log(
      `  손끝  span x=${r.tipSpan.x.toFixed(4)} y=${r.tipSpan.y.toFixed(4)} z=${r.tipSpan.z.toFixed(4)}  주축=${r.tipSwingAxis}`,
    );
  }
  console.log();
}

async function main() {
  const t0 = Date.now();
  touchLastUse();
  // 실행 내내 살아있음을 알린다 — 시작·끝에만 찍으면 로드가 길어질 때 감시자가 유휴로 오판해
  // **측정 도중** 브라우저를 죽인다(실측). unref 로 프로세스 종료는 막지 않는다.
  setInterval(touchLastUse, 10_000).unref();

  const { port, why: portWhy } = await findDevServer();
  console.log(`  dev 서버 :${port} (${portWhy})`);

  const { browser, launched } = await acquireBrowser();
  console.log(
    `  ${launched ? '브라우저 기동' : '기존 브라우저 재사용'} (${Date.now() - t0}ms)`,
  );

  const url = `http://localhost:${port}/?mode=companion${CHAR ? `&char=${CHAR}` : ''}`;
  const pages = await browser.pages();
  let page = pages.find((p) => p.url().startsWith(`http://localhost:${port}/`));
  if (!page) page = await browser.newPage();
  page.on('pageerror', (e) => console.error('  [page error]', e.message));
  // HTTP 캐시를 끈다. dev 서버를 재기동하면 vite 가 모듈 URL/해시를 새로 발급하는데, 탭이 옛
  // 응답을 캐시하고 있으면 앱이 부팅하다 멈춘다(증상은 "ready 도달 실패"로만 보여 프로필 오염
  // 처럼 착각하기 쉽다 — 실측으로 여기까지 왔다). 12MB VRM 재다운로드 비용은 로컬이라 무시 가능.
  await page.setCacheEnabled(false);

  // 리로드 여부는 플래그가 아니라 **사실**로 정한다.
  // 페이지 로드 시각(performance.timeOrigin)보다 소스가 새로우면 그 페이지는 낡은 코드다 —
  // 그걸 재면 "값을 바꿨는데 수치가 안 움직인다"는 잘못된 결론이 나온다. HMR 이 이미 반영했을
  // 수도 있지만 밖에서 확인할 방법이 없고 R3F 씬은 HMR 후 상태가 어긋나기 쉬우므로,
  // **낡았을 가능성이 있으면 리로드**한다 (오판의 방향을 안전한 쪽으로).
  let why = null;
  if (page.url() !== url) why = 'URL 다름';
  else if (RELOAD) why = '기본 동작';
  else {
    const loadedAt = await page
      .evaluate(() => performance.timeOrigin)
      .catch(() => 0);
    // avatars 를 넣는 이유: 체형이 바뀌면 같은 클립도 이동폭이 달라진다(남자1 0.131 / 여자1 0.096)
    const srcMtime = latestSourceMtime([
      join(REPO, 'src'),
      join(REPO, 'public/animations'),
      join(REPO, 'public/avatars'),
    ]);
    if (srcMtime > loadedAt)
      why = `소스가 페이지보다 ${((srcMtime - loadedAt) / 1000).toFixed(0)}초 새로움`;
  }
  if (why) {
    console.log(`  리로드 (${why})`);
    await page.goto(url, { waitUntil: 'networkidle0' });
  } else {
    console.log('  리로드 생략 (소스 변경 없음)');
  }

  // ready 실패를 "그대로 진행"하면 아바타 없이 재서 21.9초 타임아웃만 나오고 원인이 안 보인다.
  const waitReady = (p, ms) =>
    p.waitForFunction(
      "document.body.innerText.includes('ready') || document.body.innerText.includes('speaking')",
      { timeout: ms },
    );

  try {
    // 재사용 탭은 20초만 준다 — 정상이면 2~4초에 도달하고, 망가진 탭을 60초 기다리면
    // 회복까지 68초가 걸린다(실측). 새 탭에는 아래에서 넉넉히 60초를 준다.
    await waitReady(page, 20000);
  } catch {
    // 재사용 탭이 망가지는 경우가 있다 — 콘솔 에러 없이 loading 에 머무는데 **같은 브라우저의
    // 새 탭은 정상**이다(vite 재기동·의존성 재최적화 뒤에 관측). 캐시를 꺼도 안 풀리므로
    // 리로드로는 못 고친다. 탭 하나 버리는 건 몇 초라, 사람을 부르기 전에 스스로 회복한다.
    console.log('  재사용 탭이 ready 에 실패 — 탭을 버리고 새 탭으로 재시도');
    await page.close().catch(() => {});
    page = await browser.newPage();
    page.on('pageerror', (e) => console.error('  [page error]', e.message));
    await page.setCacheEnabled(false);
    await page.goto(url, { waitUntil: 'networkidle0' });
    await waitReady(page, 60000).catch(() => {
      throw new Error(
        `아바타가 ready 에 도달하지 못했다 (새 탭에서도 실패).\n` +
          `  ① dev 서버(:${port})가 이 저장소를 서빙 중인지 확인\n` +
          `  ② 프로필 오염일 수 있다 → rm -rf ${PROFILE_DIR} 후 재실행`,
      );
    });
  }
  await wait(1500); // idle 루프 안정화
  console.log(`  준비 완료 (${Date.now() - t0}ms)`);

  async function runOnce(trigger, label) {
    await page.evaluate(() => {
      window.__probeResult = undefined;
    });
    if (trigger) await trigger();
    await wait(WAIT);
    await page.evaluate(
      (ms, side) => {
        window.dispatchEvent(
          new CustomEvent('companion:probe', { detail: { ms, side } }),
        );
      },
      MS,
      SIDE,
    );
    await page.waitForFunction('window.__probeResult !== undefined', {
      timeout: MS + 20000,
    });
    const r = await page.evaluate(() => window.__probeResult);
    if (r && r.samples) delete r.samples;
    if (label) console.log(`\n■ ${label}`);
    report(r);
    return r;
  }

  // 판정은 exit code 로 나간다 — probeMotion.mjs:173 과 동일 규약.
  // 출력만 하고 버리면 && 체인에서 FAIL 이 조용히 통과한다.
  const results = [];
  if (WAVE) {
    results.push(
      await runOnce(
        () =>
          page.evaluate(() =>
            window.dispatchEvent(new CustomEvent('companion:wave')),
          ),
        `손인사 (VRMA) · ${CHAR ?? 'default'}`,
      ),
    );
  } else if (GESTURE !== null) {
    for (const i of String(GESTURE).split(',')) {
      results.push(
        await runOnce(
          () =>
            page.evaluate((n) => {
              window.dispatchEvent(
                new CustomEvent('companion:gesture', {
                  detail: { index: Number(n) },
                }),
              );
            }, i),
          `제스처 ${i}`,
        ),
      );
      await wait(1600); // 팔이 rest 로 돌아올 시간
    }
  } else {
    results.push(await runOnce(null, 'idle'));
  }

  touchLastUse(); // 측정에 걸린 시간만큼 유휴 타이머를 뒤로 민다
  console.log(`  총 ${((Date.now() - t0) / 1000).toFixed(1)}초`);
  browser.disconnect(); // 재사용할 브라우저다 — close() 금지

  // 여러 제스처를 잰 경우 전부 통과해야 0 (probeMotion.mjs:163 과 동일)
  process.exitCode =
    results.length && results.every((r) => r && r.pass) ? 0 : 1;
}

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exit(1);
});
