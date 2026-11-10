#!/usr/bin/env node
/* 공식 사이트 변경 감시
   - 업데이트·공지·개발자 노트 목록(첫 쪽)에서 새 글과 제목이 바뀐 글('(수정)' 등)을 찾는다
   - 새 글·고친 글 본문에 데이터별 감시 키워드가 있으면 그 데이터에 대한 사건(event)을 남긴다
   - 공지 목록의 점검 공지로 점검 일정(maintenance)을, 진행중 이벤트 목록으로 이벤트 일정(events)을 자동 갱신한다(사람 확인 없이 게시판을 그대로 옮기는 데이터)
   - 데이터가 근거로 삼는 공식 가이드 본문은 6시간마다 해시를 비교해, 바뀌면 사건을 남긴다
     --pages-dir를 주면 본문을 그 폴더에 보관해 바뀐 낱말을 요약에 보여 주고, 끝의 기준일 문장만 바뀌었으면 사건 없이 '자동 재확인'으로 기록한다
     (본문은 넥슨 글이라 저장소에 올리지 않고 감시 PC에만 둔다)
   - 결과는 data/watch.json·data/datasets·data/changes.json·data/sources.json에 쓴다. 상태 계산과 API 반영은 tools/build.mjs가 한다
   - mabinogimobile.nexon.com은 robots.txt가 전체 허용(2026-11-10 확인). NEXON NOW는 로봇 접근 금지라 감시하지 않는다
   사용: node tools/watch-official.mjs [--summary 파일] [--pages-dir 폴더] [--all-pages] */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { OFF, today, nowIso, sleep, get, body, parseList, parseMaint, maintKey, fetchEvents, basisOf, sameExceptBasis, wordDiff } from './official-parse.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOARDS = ['News/Update', 'News/Notice', 'News/Devnote'];
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null };
const ALL_PAGES = process.argv.includes('--all-pages') || new Date().getUTCHours() % 6 === 0;
const PAGES_DIR = arg('--pages-dir');
const rj = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const wj = (p, o) => fs.writeFileSync(path.join(ROOT, p), JSON.stringify(o, null, 2) + '\n');
const WF = path.join(ROOT, 'data/watch.json');

const sources = rj('data/sources.json');
const changes = rj('data/changes.json');
const D = Object.fromEntries(fs.readdirSync(path.join(ROOT, 'data/datasets')).filter(f => f.endsWith('.json')).map(f => { const d = rj('data/datasets/' + f); return [d.id, d] }));
const state = fs.existsSync(WF) ? JSON.parse(fs.readFileSync(WF, 'utf8')) : { boards: {}, pages: {}, events: [] };
const baseline = !Object.keys(state.boards).length;
const added = [], notes = {}, autoLog = [];
let srcDirty = false, chgDirty = false;

function match(text) {
  const r = {};
  for (const d of Object.values(D)) {
    if (d.auto) continue;
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
const logChange = c => { changes.push({ date: today(), at: nowIso(), auto: true, ...c }); chgDirty = true; autoLog.push(c.summary) };
// 자동 데이터: 내용이 바뀌었거나 오늘 처음 확인했을 때만 파일을 고친다(커밋은 하루 한 번 이하)
function saveAuto(id, rows, sortKey) {
  const d = D[id];
  if (!d) return false;
  rows.sort(sortKey);
  const t = Object.keys(d.tables)[0], same = JSON.stringify(d.tables[t]) === JSON.stringify(rows);
  if (same && d.verified_at >= today()) return false;
  d.tables[t] = rows; d.verified_at = today();
  wj(`data/datasets/${id}.json`, d);
  return !same;
}
const hm = r => `${r.date.slice(5).replace('-', '/')} ${r.kind}점검 ${r.canceled ? '미진행' : `${r.start}~${r.end}`}`;

/* 1. 게시판 */
let noticeList = null;
for (const board of BOARDS) {
  const html = await get(OFF + board);
  if (!html) continue;
  const L = parseList(html, board);
  if (!L.length) { console.warn(`목록을 읽지 못함 ${board} (길이 ${html.length}, 제목 ${(html.match(/<title>([^<]*)/) || [])[1] || '없음'}, 글 표시 ${(html.match(/data-threadid/g) || []).length}개)`); continue }
  if (board === 'News/Notice') noticeList = L;
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

/* 2. 점검 일정: 공지 첫 쪽의 점검 공지를 글 번호로 합친다. 끝나면 제목의 시간이 실제 종료 시각으로 바뀌므로, 처음 본 종료 시각은 planned_end로 남긴다 */
if (noticeList && D.maintenance) {
  const M = new Map(D.maintenance.tables.schedule.map(r => [r.id, { ...r }])), add = [], upd = [];
  for (const p of noticeList) {
    const r = parseMaint(p);
    if (!r) continue;
    const o = M.get(r.id);
    if (!o) { M.set(r.id, r); add.push(r); continue }
    if (o.end !== r.end && !o.completed && !o.planned_end) r.planned_end = o.end;
    else if (o.planned_end) r.planned_end = o.planned_end;
    if (JSON.stringify(o) !== JSON.stringify(r)) { M.set(r.id, r); upd.push(r) }
  }
  const by = (a, b) => maintKey(a).localeCompare(maintKey(b)) || a.id - b.id;
  const rows = [...M.values()].sort(by).slice(-40);
  if (saveAuto('maintenance', rows, by) && (add.length || upd.length))
    logChange({ datasets: ['maintenance'], summary: `점검 일정: ${[...add.map(r => `${hm(r)} 공지`), ...upd.map(r => `${hm(r)}${r.completed ? ' 완료' : ' 변경'}`)].join(', ')}`, details: [...add, ...upd].map(r => `${r.title} (${r.url})`), src: ['board-notice'] });
}

/* 3. 진행중 이벤트: 목록 전부를 읽었을 때만 바꾼다 */
if (D.events) {
  await sleep(1500);
  const E = await fetchEvents();
  if (E) {
    const O = new Map(D.events.tables.events.map(e => [e.id, e])), N = new Map(E.map(e => [e.id, e]));
    const add = E.filter(e => !O.has(e.id)), gone = [...O.values()].filter(e => !N.has(e.id)), chg = E.filter(e => O.has(e.id) && JSON.stringify(O.get(e.id)) !== JSON.stringify(e));
    if (saveAuto('events', E, (a, b) => b.id - a.id) && (add.length || gone.length || chg.length))
      logChange({ datasets: ['events'], summary: `진행 중 이벤트: ${[add.length && `추가 ${add.length}건`, chg.length && `변경 ${chg.length}건`, gone.length && `종료 ${gone.length}건`].filter(Boolean).join(', ')}`, details: [...add.map(e => `추가: ${e.title} (${e.period})`), ...chg.map(e => `변경: ${e.title} (${e.period})`), ...gone.map(e => `종료: ${e.title}`)], src: ['board-events'] });
  }
}

/* 4. 근거 가이드 본문 */
const pageOwners = {};
for (const d of Object.values(D)) {
  const ids = new Set(d.watch.pages || []);
  for (const rows of Object.values(d.tables)) for (const r of rows) for (const s of r.src) if (sources[s]?.type === 'official' && sources[s].kind === '가이드' && !sources[s].manual) ids.add(s);
  for (const s of ids) (pageOwners[s] = pageOwners[s] || []).push(d.id);
}
if (PAGES_DIR) fs.mkdirSync(PAGES_DIR, { recursive: true });
const snap = s => PAGES_DIR && path.join(PAGES_DIR, `${s}.txt`);
for (const [s, owners] of Object.entries(pageOwners)) {
  const P = state.pages[s];
  if (P && !ALL_PAGES) continue;
  const html = await get(sources[s].url);
  const t = html && body(html);
  if (!t) { console.warn(`가이드를 읽지 못함 ${s}`); continue }
  const h = crypto.createHash('sha256').update(t).digest('hex'), f = snap(s);
  const old = f && fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
  if (!P) state.pages[s] = { hash: h, since: today() };
  else if (P.hash !== h) {
    if (old && sameExceptBasis(old, t)) {
      const a = basisOf(old), b = basisOf(t);
      if (b && sources[s].basis !== b) sources[s].basis = b;
      sources[s].checked = today(); srcDirty = true;
      logChange({ datasets: owners.sort(), summary: `자동 재확인: ${sources[s].title} 기준일만 바뀜`, details: [`기준일 ${a || '?'} → ${b || '?'}`, '본문의 다른 부분은 이전 보관본과 낱말까지 같음'], src: [s] });
    } else {
      const e = { key: `page-${s}-${h.slice(0, 8)}`, kind: 'page-changed', page: s, title: `${sources[s].title} 본문 변경`, url: sources[s].url, date: today(), detected_at: nowIso(), datasets: owners.sort(), matched: {} };
      pushEvent(e);
      notes[e.key] = old ? wordDiff(old, t) : null;
    }
    state.pages[s] = { hash: h, since: today() };
  }
  // 보관본: 해시가 같을 때 처음 만들고, 바뀌면 예전 것을 .prev로 남긴다
  if (f && old !== t) { if (old) fs.writeFileSync(f.replace(/\.txt$/, '.prev.txt'), old); fs.writeFileSync(f, t) }
  await sleep(1500);
}

/* 5. 저장·요약 */
const sortObj = o => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a < b ? -1 : 1));
for (const b of Object.values(state.boards)) b.seen = sortObj(b.seen);
state.boards = sortObj(state.boards);
state.pages = sortObj(state.pages);
state.events.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
fs.writeFileSync(WF, JSON.stringify(state, null, 2) + '\n');
if (srcDirty) wj('data/sources.json', sources);
if (chgDirty) wj('data/changes.json', changes);
console.log(`${baseline ? '첫 실행(기준 저장) · ' : ''}새 사건 ${added.length}건${added.length ? ': ' + added.map(e => `${e.title} → ${e.datasets.join(', ')}`).join(' / ') : ''}${autoLog.length ? ' · 자동 반영: ' + autoLog.join(' / ') : ''}`);
const sum = arg('--summary');
const diffLines = k => notes[k] === undefined ? [] : notes[k] === null ? ['  - 이전 본문 보관본이 없어 바뀐 부분을 보여 드릴 수 없습니다(다음부터는 보관본과 비교합니다).'] : ['  - 바뀐 부분(낱말 단위):', ...notes[k].flatMap(x => [`    - …${x.ctx}`, ...(x.del ? [`      - 예전: ${x.del}`] : []), ...(x.add ? [`      - 지금: ${x.add}`] : [])])];
if (sum && added.length) fs.writeFileSync(sum, ['공식 글 감시에서 재확인이 필요한 변경을 찾았습니다.', '', ...added.flatMap(e => [`- [${e.title}](${e.url}) (${e.date}) → ${e.datasets.map(id => `\`${id}\``).join(', ')}${Object.keys(e.matched).length ? ' · 키워드: ' + [...new Set(Object.values(e.matched).flat())].join(', ') : ''}`, ...diffLines(e.key)]), '', '처리: 글을 읽고 값을 고치거나 변경 없음을 확인한 뒤, 데이터 파일의 verified_at을 갱신하고 changes.json에 기록합니다.'].join('\n') + '\n');
