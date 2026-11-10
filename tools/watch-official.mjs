#!/usr/bin/env node
/* 공식 사이트 변경 감시
   - 업데이트·공지·개발자 노트 목록(첫 쪽)에서 새 글과 제목이 바뀐 글('(수정)' 등)을 찾는다
   - 새 글·고친 글 본문에 데이터별 감시 키워드가 있으면 그 데이터에 대한 사건(event)을 남긴다
   - 데이터가 근거로 삼는 공식 가이드 본문은 6시간마다 해시를 비교해, 바뀌면 사건을 남긴다
   - 결과는 data/watch.json에 쓴다. 상태 계산과 API 반영은 tools/build.mjs가 한다
   - mabinogimobile.nexon.com은 robots.txt가 전체 허용(2026-11-10 확인). NEXON NOW는 로봇 접근 금지라 감시하지 않는다
   사용: node tools/watch-official.mjs [--summary 파일] [--all-pages] */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OFF = 'https://mabinogimobile.nexon.com/';
const BOARDS = ['News/Update', 'News/Notice', 'News/Devnote'];
const UA = 'MBNG-Advisor-watch/1.0 (+https://github.com/WonJeong-Dev/MBNG-Advisor)';
const KST = 9 * 3600e3;
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null };
const ALL_PAGES = process.argv.includes('--all-pages') || new Date().getUTCHours() % 6 === 0;
const today = () => new Date(Date.now() + KST).toISOString().slice(0, 10);
const nowIso = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const rj = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const WF = path.join(ROOT, 'data/watch.json');

const sources = rj('data/sources.json');
const D = Object.fromEntries(fs.readdirSync(path.join(ROOT, 'data/datasets')).filter(f => f.endsWith('.json')).map(f => { const d = rj('data/datasets/' + f); return [d.id, d] }));
const state = fs.existsSync(WF) ? JSON.parse(fs.readFileSync(WF, 'utf8')) : { boards: {}, pages: {}, events: [] };
const baseline = !Object.keys(state.boards).length;
const added = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url) {
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko' } });
      const t = await r.text();
      if (r.ok && !/__cf_chl_|Just a moment/.test(t)) return t;
      console.warn(`받기 실패 ${r.status} ${url}`);
    } catch (e) { console.warn(`연결 실패 ${url} ${e.message}`) }
    await sleep(3000);
  }
  return null;
}
const strip = s => s.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
// 글 본문: view_body_wrap부터 저작권 표시 앞까지
function body(html) {
  const i = html.indexOf('view_body_wrap');
  if (i < 0) return null;
  let t = strip(html.slice(html.lastIndexOf('<', i)));
  const c = t.search(/©|&copy;|NEXON Korea Corp/);
  if (c > 0) t = t.slice(0, c);
  return t.replace(/게시글을 차단하여 내용을 가립니다\.?/g, '').trim();
}
function parseList(html, board) {
  const out = [];
  // 글 앞에 분류 표시(<div class="type"><span>완료</span>)가 붙기도 하므로 제목은 글 링크 안의 span에서 읽는다
  const re = /data-threadid="(\d+)"[\s\S]*?<a href='[^']*'[^>]*>\s*<span>([\s\S]*?)<\/span>[\s\S]*?<div class="date">\s*<span>([^<]*)<\/span>/g;
  let m;
  while ((m = re.exec(html))) {
    const d = m[3].trim().match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
    out.push({ id: m[1], title: strip(m[2]), date: d ? `${d[1]}-${d[2]}-${d[3]}` : today(), url: `${OFF}${board}/${m[1]}` });
  }
  return out;
}
function match(text) {
  const r = {};
  for (const d of Object.values(D)) {
    const hit = d.watch.keywords.filter(k => text.includes(k));
    if (hit.length) r[d.id] = hit;
  }
  return r;
}
const pushEvent = e => {
  if (state.events.some(x => x.key === e.key)) return;
  state.events.push(e);
  added.push(e);
};

/* 1. 게시판 */
for (const board of BOARDS) {
  const html = await get(OFF + board);
  if (!html) continue;
  const L = parseList(html, board);
  if (!L.length) { console.warn(`목록을 읽지 못함 ${board} (구조 변경 가능성)`); continue }
  const B = state.boards[board] || (state.boards[board] = { seen: {} });
  for (const p of L) {
    const prev = B.seen[p.id];
    const isNew = prev === undefined, edited = !isNew && prev !== p.title;
    B.seen[p.id] = p.title;
    if (!isNew && !edited) continue;
    // 처음 실행: 각 데이터의 확인일 이후 글만 본다
    if (baseline && !Object.values(D).some(d => p.date >= d.verified_at)) continue;
    await sleep(1500);
    const a = await get(p.url);
    const t = a && body(a);
    if (!t) { console.warn(`본문을 읽지 못함 ${p.url}`); continue }
    let hit = match(p.title + '\n' + t);
    if (baseline) hit = Object.fromEntries(Object.entries(hit).filter(([id]) => p.date >= D[id].verified_at));
    if (!Object.keys(hit).length) continue;
    pushEvent({ key: `${board.split('/')[1].toLowerCase()}-${p.id}${edited ? '-' + crypto.createHash('sha1').update(p.title).digest('hex').slice(0, 6) : ''}`, kind: edited ? 'post-edited' : 'post', board, post_id: p.id, title: p.title, url: p.url, date: edited ? today() : p.date, detected_at: nowIso(), datasets: Object.keys(hit).sort(), matched: hit });
  }
  // 오래된 글 기록은 200개까지만
  const ks = Object.keys(B.seen).sort((a, b) => b - a);
  for (const k of ks.slice(200)) delete B.seen[k];
  await sleep(1500);
}

/* 2. 근거 가이드 본문 */
const pageOwners = {};
for (const d of Object.values(D)) {
  const ids = new Set(d.watch.pages || []);
  for (const rows of Object.values(d.tables)) for (const r of rows) for (const s of r.src) if (sources[s]?.type === 'official' && sources[s].kind === '가이드' && !sources[s].manual) ids.add(s);
  for (const s of ids) (pageOwners[s] = pageOwners[s] || []).push(d.id);
}
for (const [s, owners] of Object.entries(pageOwners)) {
  const P = state.pages[s];
  if (P && !ALL_PAGES) continue;
  const html = await get(sources[s].url);
  const t = html && body(html);
  if (!t) { console.warn(`가이드를 읽지 못함 ${s}`); continue }
  const h = crypto.createHash('sha256').update(t).digest('hex');
  if (!P) state.pages[s] = { hash: h, since: today() };
  else if (P.hash !== h) {
    pushEvent({ key: `page-${s}-${h.slice(0, 8)}`, kind: 'page-changed', page: s, title: `${sources[s].title} 본문 변경`, url: sources[s].url, date: today(), detected_at: nowIso(), datasets: owners.sort(), matched: {} });
    state.pages[s] = { hash: h, since: today() };
  }
  await sleep(1500);
}

/* 3. 저장·요약 */
const sortObj = o => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a < b ? -1 : 1));
for (const b of Object.values(state.boards)) b.seen = sortObj(b.seen);
state.boards = sortObj(state.boards);
state.pages = sortObj(state.pages);
state.events.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
fs.writeFileSync(WF, JSON.stringify(state, null, 2) + '\n');
console.log(`${baseline ? '첫 실행(기준 저장) · ' : ''}새 사건 ${added.length}건${added.length ? ': ' + added.map(e => `${e.title} → ${e.datasets.join(', ')}`).join(' / ') : ''}`);
const sum = arg('--summary');
if (sum && added.length) fs.writeFileSync(sum, ['공식 글 감시에서 재확인이 필요한 변경을 찾았습니다.', '', ...added.map(e => `- [${e.title}](${e.url}) (${e.date}) → ${e.datasets.map(id => `\`${id}\``).join(', ')}${Object.keys(e.matched).length ? ' · 키워드: ' + [...new Set(Object.values(e.matched).flat())].join(', ') : ''}`), '', '처리: 글을 읽고 값을 고치거나 변경 없음을 확인한 뒤, 데이터 파일의 verified_at을 갱신하고 changes.json에 기록합니다.'].join('\n') + '\n');
