#!/usr/bin/env node
/* MBNG Advisor 데이터 빌드
   원본: data/sources.json · data/datasets/*.json · data/schemas.json · data/changes.json · data/watch.json
   만드는 것: api/v1/*.json(공개 API), api/v1/feed.xml(변경 RSS), api/v1/history/<id>/(값 판본), api/v1/openapi.json,
             그리고 'MBNG Advisor.html' 안의 @data:ID … @end:ID 주석 사이 구간
   판본: 데이터의 params·tables가 지난 판본과 다르면 새 판본을 만든다(확인일만 바뀌면 만들지 않음). 판본 파일은 다시 쓰지 않는다
   사용: node tools/build.mjs          → 검사 후 파일을 쓴다
         node tools/build.mjs --check  → 쓰지 않고, 원본과 결과가 어긋나면 실패(종료 코드 1) */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const rd = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const rj = (p, d) => fs.existsSync(path.join(ROOT, p)) ? JSON.parse(rd(p)) : d;
const APP = 'MBNG Advisor.html';
const BASE = 'https://wonjeong-dev.github.io/MBNG-Advisor/api';
const OFF = 'https://mabinogimobile.nexon.com/';
const LICENSE = { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/deed.ko' };
const ATTR = 'MBNG Advisor (https://wonjeong-dev.github.io/MBNG-Advisor/)';
const DISCLAIMER = '넥슨과 무관한 팬 프로젝트입니다. 게임 명칭과 콘텐츠의 권리는 넥슨코리아에 있습니다.';
const SOURCE_TYPES = { official: '넥슨 공식 공개 글', ingame: '게임 화면 직접 확인' };

const errs = [];
const fail = m => errs.push(m);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/* ---------- 원본 읽기 ---------- */
const sources = rj('data/sources.json');
const schemas = rj('data/schemas.json');
const changes = rj('data/changes.json', []);
const watch = rj('data/watch.json', { boards: {}, pages: {}, events: [] });
const ids = fs.readdirSync(path.join(ROOT, 'data/datasets')).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort();
const D = Object.fromEntries(ids.map(id => [id, rj(`data/datasets/${id}.json`)]));

/* ---------- 검사 ---------- */
const COMMON = schemas['#'];
const resolve = s => s && s.$ref ? COMMON[s.$ref.replace('#/', '')] : s;
function check(v, s, at) {
  s = resolve(s);
  const t = Array.isArray(v) ? 'array' : v === null ? 'null' : Number.isInteger(v) ? 'integer' : typeof v;
  const T = [].concat(s.type || []);
  if (T.length && !T.some(x => x === t || (x === 'number' && t === 'integer'))) return fail(`${at}: ${T.join('|')}이어야 하는데 ${t}`);
  if (t === 'null') return;
  if (s.enum && !s.enum.includes(v)) fail(`${at}: 허용 값이 아님 ${JSON.stringify(v)}`);
  if (s.pattern && !new RegExp(s.pattern).test(v)) fail(`${at}: 형식이 맞지 않음 ${v}`);
  if (s.minimum != null && v < s.minimum) fail(`${at}: ${s.minimum}보다 작음`);
  if (s.maximum != null && v > s.maximum) fail(`${at}: ${s.maximum}보다 큼`);
  if (t === 'array') {
    if (s.minItems && v.length < s.minItems) fail(`${at}: 항목이 ${s.minItems}개보다 적음`);
    if (s.items) v.forEach((x, i) => check(x, s.items, `${at}[${i}]`));
  }
  if (t === 'object' && s.properties) {
    for (const k of s.required || []) if (!(k in v)) fail(`${at}: ${k} 없음`);
    for (const [k, x] of Object.entries(v)) {
      if (s.properties[k]) check(x, s.properties[k], `${at}.${k}`);
      else if (s.additionalProperties === false) fail(`${at}: 정의되지 않은 필드 ${k}`);
    }
  }
}
for (const [k, s] of Object.entries(sources)) {
  if (!SOURCE_TYPES[s.type]) fail(`sources.${k}: 출처 종류는 official·ingame만 쓴다`);
  if (!s.title) fail(`sources.${k}: title 없음`);
  if (s.type === 'official' && !/^https:\/\/(mabinogimobile|now)\.nexon\.com\//.test(s.url || '')) fail(`sources.${k}: 공식 출처는 넥슨 공식 주소여야 함`);
  if (s.type === 'ingame' && !DATE.test(s.checked || '')) fail(`sources.${k}: 게임 확인 출처는 확인일(checked)이 필요`);
  for (const f of ['published', 'basis', 'checked']) if (s[f] && !DATE.test(s[f])) fail(`sources.${k}.${f}: 날짜 형식`);
}
const used = new Set();
for (const id of ids) {
  const d = D[id], sc = schemas[id];
  if (d.id !== id) fail(`${id}: 파일 이름과 id가 다름`);
  if (!DATE.test(d.verified_at || '')) fail(`${id}: verified_at 날짜 형식`);
  if (!d.title || !d.description) fail(`${id}: 제목·설명 필요`);
  if (!d.watch || !Array.isArray(d.watch.keywords) || (!d.auto && !d.watch.keywords.length)) fail(`${id}: 감시 키워드 필요(자동 데이터 auto:true는 빈 목록 가능)`);
  for (const p of d.watch?.pages || []) if (!sources[p]) fail(`${id}: 감시 문서 ${p}가 출처 사전에 없음`);
  if (!sc) { fail(`${id}: schemas.json에 형식이 없음`); continue }
  for (const t of Object.keys(sc)) if (!Array.isArray(d.tables?.[t]) || !d.tables[t].length) fail(`${id}: 표 ${t}가 비어 있음`);
  for (const [t, rows] of Object.entries(d.tables || {})) {
    if (!sc[t]) { fail(`${id}: 정의되지 않은 표 ${t}`); continue }
    rows.forEach((r, i) => {
      check(r, sc[t], `${id}.${t}[${i}]`);
      for (const s of r.src || []) { if (!sources[s]) fail(`${id}.${t}[${i}]: 출처 ${s} 없음`); used.add(s) }
    });
  }
  for (const s of Object.keys(d.source_notes || {})) if (!sources[s]) fail(`${id}: source_notes 출처 ${s} 없음`);
  for (const L of Object.values(d.params_src || {})) for (const s of L) { if (!sources[s]) fail(`${id}: params_src 출처 ${s} 없음`); used.add(s) }
}
for (const k of Object.keys(sources)) if (!used.has(k)) fail(`sources.${k}: 어느 데이터에서도 쓰지 않음`);
changes.forEach((c, i) => { if (!DATE.test(c.date || '') || !c.summary) fail(`changes[${i}]: 날짜·요약 필요`); if (c.at && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(c.at)) fail(`changes[${i}]: at 형식`); for (const s of c.src || []) if (!sources[s]) fail(`changes[${i}]: 출처 ${s} 없음`); for (const x of c.datasets || []) if (!D[x]) fail(`changes[${i}]: 없는 데이터 ${x}`) });
if (errs.length) { console.error('검사 실패\n- ' + errs.join('\n- ')); process.exit(1) }

/* ---------- 상태(재확인 필요) ---------- */
const evKey = e => e.key;
function statusOf(id) {
  const d = D[id], rv = new Set(d.reviewed || []);
  const pending = (watch.events || []).filter(e => e.datasets.includes(id) && !rv.has(evKey(e)) && !(e.date < d.verified_at));
  return { state: pending.length ? 'check_needed' : 'ok', pending: pending.map(e => ({ key: e.key, kind: e.kind, title: e.title, url: e.url, date: e.date, detected_at: e.detected_at, matched: e.matched?.[id] || [] })) };
}
const ST = Object.fromEntries(ids.map(id => [id, statusOf(id)]));
const maxDate = a => a.filter(Boolean).sort().pop();
const UPDATED = maxDate([...ids.map(id => D[id].verified_at), ...changes.map(c => c.date), ...(watch.events || []).map(e => (e.detected_at || '').slice(0, 10))]);

/* ---------- 판본 ---------- */
const TODAY = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const HV = {}, HN = {};
for (const id of ids) {
  const d = D[id], idx = rj(`api/v1/history/${id}/index.json`, null), V = idx ? [...idx.versions].sort((a, b) => a.revision - b.revision) : [];
  const content = { params: d.params || {}, data: d.tables }, hash = crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 16);
  if (!V.length || V[V.length - 1].hash !== hash) {
    const used = new Set(V.map(v => v.summary));
    const c = [...changes].reverse().find(c => (c.datasets || []).includes(id) && c.date === TODAY && !used.has(c.summary));
    const n = V.length + 1, v = { revision: n, date: TODAY, hash, summary: c ? c.summary : '값 변경', url: `${BASE}/v1/history/${id}/${n}.json` };
    V.push(v); HN[id] = { v, content };
  }
  HV[id] = V;
}

/* ---------- API 파일 ---------- */
const pubSource = (k, note) => {
  const s = sources[k], o = { id: k, type: s.type, type_label: SOURCE_TYPES[s.type], kind: s.kind, title: s.title };
  for (const f of ['url', 'published', 'basis', 'checked']) if (s[f]) o[f] = s[f];
  if (s.manual) o.monitoring = 'manual';
  if (note) o.note = note;
  return o;
};
const head = { api: 'MBNG Advisor 데이터 API', version: 'v1', license: LICENSE, attribution: ATTR, disclaimer: DISCLAIMER };
const out = {};
const J = o => JSON.stringify(o, null, 2) + '\n';
for (const id of ids) {
  const d = D[id], src = new Set();
  for (const rows of Object.values(d.tables)) for (const r of rows) r.src.forEach(s => src.add(s));
  for (const L of Object.values(d.params_src || {})) L.forEach(s => src.add(s));
  const body = {
    ...head, dataset: id, title: d.title, description: d.description, verified_at: d.verified_at,
    status: ST[id], params: d.params || {}, ...(d.params_src ? { params_sources: d.params_src } : {}),
    notes: d.notes || [], monitoring: { auto: !!d.auto, keywords: d.watch.keywords, pages: d.watch.pages || [] },
    sources: [...src].sort().map(k => pubSource(k, d.source_notes?.[k])),
    data: d.tables
  };
  out[`api/v1/${id}.json`] = J(body);
}
out['api/v1/index.json'] = J({
  ...head, updated_at: UPDATED, docs: `${BASE}/`, openapi: `${BASE}/v1/openapi.json`,
  principles: ['출처는 넥슨 공식 공개 글과 게임 화면 직접 확인 두 가지만 쓴다', '값마다 출처 id(src)를 붙이고 데이터마다 확인일(verified_at)을 둔다', '공식 글에 관련 변경이 올라오면 status가 check_needed로 바뀌고, 재확인 뒤 ok로 돌아온다', '점검 일정·진행 중 이벤트처럼 공식 게시판을 그대로 옮기는 데이터(auto)는 감시가 바로 갱신한다', '값이 바뀔 때마다 판본(history)을 남기고, 변경 기록은 RSS(feed.xml)로도 낸다'],
  datasets: ids.map(id => ({ id, title: D[id].title, url: `${BASE}/v1/${id}.json`, auto: !!D[id].auto, verified_at: D[id].verified_at, state: ST[id].state, revision: HV[id].length, history: `${BASE}/v1/history/${id}/index.json`, tables: Object.fromEntries(Object.entries(D[id].tables).map(([t, r]) => [t, r.length])) })),
  endpoints: { status: `${BASE}/v1/status.json`, changes: `${BASE}/v1/changes.json`, feed: `${BASE}/v1/feed.xml`, sources: `${BASE}/v1/sources.json`, history: `${BASE}/v1/history/{dataset}/index.json` }
});
out['api/v1/status.json'] = J({
  ...head, updated_at: UPDATED,
  monitoring: { boards: Object.keys(watch.boards || {}).map(b => OFF + b), pages: Object.keys(watch.pages || {}), interval: watch.runner?.interval || '정해지지 않음', runner: watch.runner?.where || '', not_monitored: ['NEXON NOW(로봇 접근 금지, 사람이 확인)'] },
  datasets: Object.fromEntries(ids.map(id => [id, { verified_at: D[id].verified_at, ...ST[id] }]))
});
out['api/v1/changes.json'] = J({ ...head, changes: [...changes].sort((a, b) => b.date.localeCompare(a.date)) });
out['api/v1/sources.json'] = J({ ...head, types: SOURCE_TYPES, sources: Object.keys(sources).sort().map(k => pubSource(k)) });
for (const id of ids) {
  out[`api/v1/history/${id}/index.json`] = J({ ...head, dataset: id, title: D[id].title, versions: [...HV[id]].reverse() });
  const nv = HN[id];
  if (nv) out[`api/v1/history/${id}/${nv.v.revision}.json`] = J({ ...head, dataset: id, title: D[id].title, revision: nv.v.revision, date: nv.v.date, summary: nv.v.summary, hash: nv.v.hash, ...nv.content });
}

/* ---------- RSS(변경 기록) ---------- */
const X = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const when = c => c.at || `${c.date}T00:00:00+09:00`;
const FEED = changes.map((c, i) => ({ c, i, t: Date.parse(when(c)) })).sort((a, b) => b.t - a.t || b.i - a.i).slice(0, 50);
const ITEM = ({ c, t }) => [
  '<item>',
  `<title>${X((c.datasets || []).map(id => D[id].title).join('·'))} · ${X(c.summary)}</title>`,
  `<link>${BASE}/v1/${(c.datasets || [])[0] ? `history/${c.datasets[0]}/index.json` : 'changes.json'}</link>`,
  `<guid isPermaLink="false">mbng-${crypto.createHash('sha1').update([c.date, c.at || '', c.summary, (c.datasets || []).join(',')].join('|')).digest('hex').slice(0, 16)}</guid>`,
  `<pubDate>${new Date(t).toUTCString()}</pubDate>`,
  ...(c.datasets || []).map(id => `<category>${X(id)}</category>`),
  `<description>${X([...(c.details || []), ...(c.src || []).map(s => `출처: ${sources[s].title}${sources[s].url ? ' ' + sources[s].url : ''}`)].join('\n'))}</description>`,
  '</item>'].join('\n');
out['api/v1/feed.xml'] = ['<?xml version="1.0" encoding="UTF-8"?>', '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">', '<channel>',
  '<title>MBNG Advisor 데이터 변경</title>', `<link>${BASE}/</link>`, `<atom:link href="${BASE}/v1/feed.xml" rel="self" type="application/rss+xml"/>`,
  `<description>마비노기 모바일 공식 글·게임 확인 기반 데이터의 값 변경과 재확인 기록. ${X(DISCLAIMER)}</description>`, '<language>ko</language>',
  `<lastBuildDate>${new Date(FEED.length ? FEED[0].t : 0).toUTCString()}</lastBuildDate>`,
  ...FEED.map(ITEM), '</channel>', '</rss>', ''].join('\n');

/* ---------- OpenAPI ---------- */
const deref = s => JSON.parse(JSON.stringify(s), (k, v) => v && v.$ref && v.$ref.startsWith('#/') && !v.$ref.startsWith('#/components') ? COMMON[v.$ref.slice(2)] : v);
const pascal = s => s.split(/[-_]/).map(w => w[0].toUpperCase() + w.slice(1)).join('');
const comp = {
  License: { type: 'object', properties: { name: { type: 'string' }, url: { type: 'string' } } },
  Source: { type: 'object', required: ['id', 'type', 'title'], properties: { id: { type: 'string' }, type: { type: 'string', enum: Object.keys(SOURCE_TYPES) }, type_label: { type: 'string' }, kind: { type: 'string' }, title: { type: 'string' }, url: { type: 'string' }, published: { type: 'string', description: '게시일' }, basis: { type: 'string', description: '문서에 적힌 기준일' }, checked: { type: 'string', description: '확인일' }, monitoring: { type: 'string', enum: ['manual'], description: '자동 감시하지 않고 사람이 확인하는 출처' }, note: { type: 'string', description: '이 데이터에서 이 출처가 맡는 부분' } } },
  Event: { type: 'object', properties: { key: { type: 'string' }, kind: { type: 'string', enum: ['post', 'post-edited', 'page-changed'] }, title: { type: 'string' }, url: { type: 'string' }, date: { type: 'string' }, detected_at: { type: 'string' }, matched: { type: 'array', items: { type: 'string' }, description: '글에서 찾은 감시 키워드' } } },
  Status: { type: 'object', properties: { state: { type: 'string', enum: ['ok', 'check_needed'], description: 'check_needed: 확인일 뒤에 관련 공식 글이 올라와 재확인 중' }, pending: { type: 'array', items: { $ref: '#/components/schemas/Event' } } } },
  Revision: { type: 'object', properties: { revision: { type: 'integer', description: '판본 번호(1부터)' }, date: { type: 'string', description: '이 판본을 기록한 날(한국 시간)' }, hash: { type: 'string', description: 'params·data의 SHA-256 앞 16자리' }, summary: { type: 'string' }, url: { type: 'string' } } },
  Change: { type: 'object', properties: { date: { type: 'string' }, at: { type: 'string', description: '감시가 자동으로 기록한 시각(UTC). 사람이 기록한 항목에는 없다' }, auto: { type: 'boolean', description: '감시가 자동으로 기록함' }, datasets: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' }, details: { type: 'array', items: { type: 'string' } }, src: { type: 'array', items: { type: 'string' } } } }
};
const envelope = (id) => ({
  type: 'object',
  properties: {
    api: { type: 'string' }, version: { type: 'string' }, license: { $ref: '#/components/schemas/License' }, attribution: { type: 'string' }, disclaimer: { type: 'string' },
    dataset: { type: 'string', enum: [id] }, title: { type: 'string' }, description: { type: 'string' }, verified_at: { type: 'string', description: '마지막으로 출처와 대조한 날' },
    status: { $ref: '#/components/schemas/Status' }, params: { type: 'object' }, notes: { type: 'array', items: { type: 'string' } },
    monitoring: { type: 'object', properties: { auto: { type: 'boolean', description: 'true: 공식 게시판을 감시가 그대로 옮겨 자동 갱신' }, keywords: { type: 'array', items: { type: 'string' } }, pages: { type: 'array', items: { type: 'string' } } } },
    sources: { type: 'array', items: { $ref: '#/components/schemas/Source' } },
    data: { type: 'object', properties: Object.fromEntries(Object.keys(schemas[id]).map(t => [t, { type: 'array', items: { $ref: `#/components/schemas/${pascal(id)}${pascal(t)}` } }])) }
  }
});
for (const id of ids) for (const [t, s] of Object.entries(schemas[id])) comp[`${pascal(id)}${pascal(t)}`] = deref(s);
const paths = {};
const get = (sum, desc, schema, tag) => ({ get: { summary: sum, description: desc, tags: [tag], responses: { 200: { description: '성공', content: { 'application/json': { schema } } } } } });
paths['/v1/index.json'] = get('데이터 목록', '공개 중인 데이터와 각 데이터의 확인일·상태', { type: 'object' }, '안내');
paths['/v1/status.json'] = get('최신 여부', '데이터별 상태. 공식 글에 관련 변경이 올라오면 check_needed와 해당 글이 나온다', { type: 'object' }, '안내');
paths['/v1/changes.json'] = get('변경 이력', '데이터 값이 바뀌거나 재확인한 기록(최신순)', { type: 'object', properties: { changes: { type: 'array', items: { $ref: '#/components/schemas/Change' } } } }, '안내');
paths['/v1/sources.json'] = get('출처 사전', '모든 출처. 종류는 넥슨 공식 공개 글(official)과 게임 화면 직접 확인(ingame)뿐이다', { type: 'object', properties: { sources: { type: 'array', items: { $ref: '#/components/schemas/Source' } } } }, '안내');
paths['/v1/feed.xml'] = { get: { summary: '변경 RSS', description: 'changes.json의 최근 50건을 RSS 2.0으로. RSS 리더·디스코드 봇으로 구독할 수 있다', tags: ['안내'], responses: { 200: { description: '성공', content: { 'application/rss+xml': { schema: { type: 'string' } } } } } } };
const pDataset = { name: 'dataset', in: 'path', required: true, schema: { type: 'string', enum: ids } };
paths['/v1/history/{dataset}/index.json'] = { get: { summary: '판본 목록', description: '데이터 값이 바뀔 때마다 남긴 판본(최신순). 확인일만 바뀐 경우는 판본을 만들지 않는다', tags: ['판본'], parameters: [pDataset], responses: { 200: { description: '성공', content: { 'application/json': { schema: { type: 'object', properties: { dataset: { type: 'string' }, versions: { type: 'array', items: { $ref: '#/components/schemas/Revision' } } } } } } } } } };
paths['/v1/history/{dataset}/{revision}.json'] = { get: { summary: '판본 하나', description: '그 판본의 params와 data(데이터 파일의 params·data와 같은 형식)', tags: ['판본'], parameters: [pDataset, { name: 'revision', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }], responses: { 200: { description: '성공', content: { 'application/json': { schema: { type: 'object', properties: { revision: { type: 'integer' }, date: { type: 'string' }, summary: { type: 'string' }, hash: { type: 'string' }, params: { type: 'object' }, data: { type: 'object' } } } } } } } } };
for (const id of ids) paths[`/v1/${id}.json`] = get(D[id].title, D[id].description, envelope(id), '데이터');
const desc = rd('api/intro.md').replace(/\r\n/g, '\n');
out['api/v1/openapi.json'] = J({
  openapi: '3.1.0',
  info: { title: 'MBNG Advisor 데이터 API', version: '1.0.0', description: desc, license: { name: 'CC BY 4.0', url: LICENSE.url } },
  servers: [{ url: BASE, description: 'GitHub Pages(키 없음, 모든 출처 허용)' }],
  tags: [{ name: '안내', description: '목록·상태·이력·출처·RSS' }, { name: '데이터', description: '데이터별 파일' }, { name: '판본', description: '값이 바뀔 때마다 남긴 예전 값' }],
  paths, components: { schemas: comp }
});

/* ---------- 앱 데이터 구간 ---------- */
const js = v => JSON.stringify(v).replace(/"((?:[^"\\]|\\.)*)"/g, (m, s) => `'${s.replace(/\\"/g, '"').replace(/'/g, "\\'")}'`);
const rowsJs = a => '[\n' + a.map(js).join(',\n') + ']';
const label = k => sources[k].label || sources[k].title;
const relPath = k => sources[k].url.replace(OFF, '');
const APPGEN = {
  'link-bonus': d => {
    const V = d.tables.values, S = [...new Set(V.map(v => v.star))].sort((a, b) => a - b);
    const M = f => S.map(s => V.filter(v => v.star === s).sort((a, b) => a.level - b.level).map(f));
    const LS = Object.keys(d.source_notes).map(k => [sources[k].title, sources[k].url, sources[k].published, d.source_notes[k]]);
    return `const LINK_DATE=${js(d.verified_at)},LINK_PCT=${d.params.diff_rate},LINK_SRC=${js(LS)};\nconst LK=${rowsJs(M(v => v.value))};\nconst LKH=${rowsJs(M(v => v.heal_value))};`;
  },
  'weekly': d => {
    const W = d.tables.items.map(w => [w.id, w.group, w.name, w.counts.map(c => [c.name, c.max]), w.description, w.src.map(k => [relPath(k), label(k)])]);
    return `const WK_DATE=${js(d.verified_at)},RAID_DATE=${js(d.params.raid_verified_at)};\nconst WEEKLY=${rowsJs(W)};\nconst WGRP=${js(d.params.groups)};`;
  },
  'soulstream': d => {
    const P = d.tables.production, names = [...new Set(P.map(p => p.soul))];
    const SO = names.map(n => { const r = P.filter(p => p.soul === n); return [n, r[0].stat, d.app.colors[n], r.map(p => [p.sum_from, p.sum_to, p.rate_min, p.rate_max])] });
    const game = [...new Set(d.tables.purchase.flatMap(p => p.src))].map(k => sources[k]).filter(s => s.type === 'ingame').map(s => s.checked).sort().pop();
    return `const SOUL_DATE=${js(d.verified_at)},SOUL_GAME=${js(game)};\nconst SOULS=${rowsJs(SO)};\nconst SOUL_PRICE=${js(d.tables.purchase.map(p => [p.count_from, p.count_to, p.start_price, p.step]))};`;
  },
  'leveling-materials': d => {
    const QCR = '{' + d.tables.recipes.map(r => `${/^[가-힣A-Za-z_]+$/.test(r.item) ? r.item : js(r.item)}:${js(r.materials.map(m => [m.name, m.qty]))}`).join(',') + '}';
    return `const QST_DATE=${js(d.params.list_received)},QCR=${QCR};\nconst QST=${rowsJs(d.tables.steps.map(s => [s.level, s.materials.map(m => [m.name, m.qty])]))};`;
  },
  'summon-barrier': d => `const OMEN_START=${d.tables.schedule[0].start_minute};`,
  'mado-resist': d => `const MD_CAP=${d.params.cap_pct},MD_FX=${js(d.tables.examples.map(e => [e.over, e.final_damage_pct]))};`,
  'rune-engraving-rate': d => `const RUNE_RATE=${js(d.tables.rates.map(r => [r.grade, r.stars, r.rate_pct]))},RUNE_EMB=${d.params.emblem_rate_pct};`,
  'abyss-hole': d => { const c = d.tables.cycle[0]; return `const HOLE_OPEN=${c.open_minutes}*6e4,HOLE_CY=${c.cycle_minutes}*6e4,HOLE_DATE=${js(d.verified_at)};` },
  'maintenance': d => `const MAINT=${rowsJs(d.tables.schedule.map(r => [r.date, r.start_at, r.end_at, r.kind, r.completed ? 1 : 0, r.canceled ? 1 : 0, r.url.replace(OFF, '')]))};`
};
let app = rd(APP);
for (const id of ids) {
  const g = APPGEN[id];
  const re = new RegExp(`/\\*@data:${id}\\*/[\\s\\S]*?/\\*@end:${id}\\*/`);
  if (!g) { if (re.test(app)) fail(`${id}: 앱에 구간이 있는데 생성 함수 없음`); continue }
  if (!re.test(app)) { fail(`${APP}: /*@data:${id}*/ 구간이 없음`); continue }
  app = app.replace(re, () => `/*@data:${id}*/${g(D[id])}/*@end:${id}*/`);
}
if (errs.length) { console.error('생성 실패\n- ' + errs.join('\n- ')); process.exit(1) }
out[APP] = app;

/* ---------- 쓰기 또는 대조 ---------- */
let stale = [];
for (const [p, s] of Object.entries(out)) {
  const f = path.join(ROOT, p), cur = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
  if (cur === s) continue;
  if (CHECK) stale.push(p);
  else { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s) }
}
// 원본에서 사라진 데이터의 API 파일도 찾는다
const keep = new Set(Object.keys(out).filter(p => p.startsWith('api/v1/')).map(p => path.basename(p)));
for (const f of fs.existsSync(path.join(ROOT, 'api/v1')) ? fs.readdirSync(path.join(ROOT, 'api/v1')) : []) if (!keep.has(f) && !fs.statSync(path.join(ROOT, 'api/v1', f)).isDirectory()) { if (CHECK) stale.push('api/v1/' + f + ' (남은 파일)'); else fs.unlinkSync(path.join(ROOT, 'api/v1', f)) }
if (CHECK) {
  if (stale.length) { console.error('원본과 어긋남. node tools/build.mjs 로 다시 만드세요\n- ' + stale.join('\n- ')); process.exit(1) }
  console.log(`검사 통과: 데이터 ${ids.length}종, 출처 ${Object.keys(sources).length}개`);
} else console.log(`빌드 완료: 데이터 ${ids.length}종(${ids.map(id => `${id} ${ST[id].state}`).join(', ')}), 갱신 ${UPDATED}`);
