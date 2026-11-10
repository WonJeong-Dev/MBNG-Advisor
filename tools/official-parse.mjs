/* 넥슨 공식 사이트(mabinogimobile.nexon.com) 글 읽기 공용 함수
   watch-official.mjs(1시간마다 감시)와 일회성 도구가 같이 쓴다. 화면 구조는 2026-11-11에 확인했다
   - 게시판 목록: data-threadid 글마다 제목 링크 안의 span, 날짜 div.date span
   - 이벤트 목록(진행중 필터 headlineId=2501): 글마다 div.type(진행중), 제목, div.date span(기간 원문)
   - 다음 쪽: ?pageno=N&blockStartNo=..&blockStartKey=.. (목록의 div.pagination 값, 총 개수 data-totalcount)
   - 점검 공지 제목: 'MM/DD(요일) 정기점검 안내 (06:00 ~ 11:00)'. 끝나면 앞에 '(완료)'가 붙고 시간이 실제 종료 시각으로 바뀐다(2026-11-05·11-06 공지) */
export const OFF = 'https://mabinogimobile.nexon.com/';
export const UA = 'MBNG-Advisor-watch/1.0 (+https://github.com/WonJeong-Dev/MBNG-Advisor)';
export const KST = 9 * 3600e3;
export const today = () => new Date(Date.now() + KST).toISOString().slice(0, 10);
export const nowIso = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function get(url) {
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
export const strip = s => s.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
// 글 본문: view_body_wrap부터 저작권 표시 앞까지
export function body(html) {
  const i = html.indexOf('view_body_wrap');
  if (i < 0) return null;
  let t = strip(html.slice(html.lastIndexOf('<', i)));
  const c = t.search(/©|&copy;|NEXON Korea Corp/);
  if (c > 0) t = t.slice(0, c);
  return t.replace(/게시글을 차단하여 내용을 가립니다\.?/g, '').trim();
}
export function parseList(html, board) {
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
// 목록 다음 쪽 주소에 필요한 값
export function pager(html) {
  const m = html.match(/data-pagingtype="thread" data-mm-paging data-blockstartno="(\d+)" data-blockstartkey="([^"]*)" data-totalcount="(\d+)"/);
  return m ? { no: m[1], key: m[2], total: +m[3] } : null;
}
export const pageUrl = (base, n, p) => n < 2 ? base : `${base}${base.includes('?') ? '&' : '?'}pageno=${n}&blockStartNo=${p.no}&blockStartKey=${encodeURIComponent(p.key)}`;

const pad = n => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

/* ---------- 점검 공지 ---------- */
const MAINT_RE = /^((?:\([^)]*\)\s*)*)(\d{1,2})\/(\d{1,2})\s*\(([일월화수목금토])\)\s*(정기|임시|긴급)?\s*(?:서버\s*)?점검\s*안내\s*\((\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})\)/;
// '9/24(목) 정기점검 미진행 안내'(2026-09-22·10-06 공지): 그 주 목요일 점검이 없다
const CANCEL_RE = /^((?:\([^)]*\)\s*)*)(\d{1,2})\/(\d{1,2})\s*\(([일월화수목금토])\)\s*(정기|임시|긴급)?\s*점검\s*미진행/;
export const maintKey = r => r.start_at || `${r.date}T00:00:00+09:00`;
// 게시판 글 하나 → 점검 일정 레코드(점검 공지가 아니면 null). 연도는 게시일에서 정한다(12월 글의 1월 점검 등)
export function parseMaint(p) {
  const c = p.title.match(CANCEL_RE), m = c ? null : p.title.match(MAINT_RE);
  if (!m && !c) return null;
  const x = m || c, py = +p.date.slice(0, 4), pm = +p.date.slice(5, 7), mo = +x[2], da = +x[3];
  const y = mo < pm - 6 ? py + 1 : mo > pm + 6 ? py - 1 : py;
  if (c) return { id: p.id, kind: c[5] || '점검', date: ymd(y, mo, da), start: null, end: null, start_at: null, end_at: null, completed: false, canceled: true, title: p.title, url: p.url, posted: p.date, src: ['board-notice'] };
  const tags = [...m[1].matchAll(/\(([^)]*)\)/g)].map(x => x[1].trim());
  const sh = +m[6], sm = +m[7], eh = +m[8], em = +m[9];
  if (sh > 23 || eh > 24 || sm > 59 || em > 59) return null;
  const date = ymd(y, mo, da), start = `${pad(sh)}:${pad(sm)}`, end = `${pad(eh)}:${pad(em)}`;
  const sAt = Date.parse(`${date}T${start}:00+09:00`);
  let eAt = Date.parse(`${date}T00:00:00+09:00`) + (eh * 60 + em) * 6e4;
  if (eAt <= sAt) eAt += 864e5;
  const iso = t => new Date(t + KST).toISOString().slice(0, 19) + '+09:00';
  return { id: p.id, kind: m[5] || '점검', date, start, end, start_at: iso(sAt), end_at: iso(eAt), completed: tags.includes('완료'), canceled: false, title: p.title, url: p.url, posted: p.date, src: ['board-notice'] };
}

/* ---------- 이벤트 목록 ---------- */
// '오후 11시 59분' → '23:59'. 오전 12시는 0시, 오후·낮 12시는 12시. 알 수 없으면 null
export function kTime(s) {
  const m = s.trim().match(/^(오전|오후|낮|밤|저녁|새벽|아침)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?$/);
  if (!m) return null;
  let h = +m[2]; const mi = +(m[3] || 0), ap = m[1] || '';
  if (h > 24 || mi > 59) return null;
  if (/오후|저녁|밤/.test(ap) && h < 12) h += 12;
  else if (/오전|새벽|아침/.test(ap) && h === 12) h = 0;
  else if (ap === '낮' && h < 6) h += 12;
  if (h > 23) return null;
  return `${pad(h)}:${pad(mi)}`;
}
// 기간 한쪽: '2026.11.5(목) 점검 후' → {date:'2026-11-05', time:null, note:'점검 후'}
function side(s) {
  s = s.replace(/\s+/g, ' ').trim().replace(/\s*까지$/, '');
  const m = s.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})\.?\s*\([일월화수목금토]\)\s*(.*)$/);
  if (!m) return { date: null, time: null, note: s || null };
  const rest = m[4].trim(), t = rest ? kTime(rest) : null;
  return { date: ymd(+m[1], +m[2], +m[3]), time: t, note: rest && !t ? rest : null };
}
export function parsePeriod(text) {
  const t = text.replace(/\s+/g, ' ').trim(), i = t.indexOf('~');
  if (!t) return { period: '', start_date: null, start_time: null, start_note: null, end_date: null, end_time: null, end_note: null };
  const a = side(i < 0 ? t : t.slice(0, i)), b = i < 0 ? { date: null, time: null, note: null } : side(t.slice(i + 1));
  return { period: t, start_date: a.date, start_time: a.time, start_note: a.note, end_date: b.date, end_time: b.time, end_note: b.note };
}
// 진행중 이벤트 목록 한 쪽 → 레코드. 글마다 따로 잘라 읽는다(기간 칸이 빈 글이 있어 2026-11-11 확인). 위쪽 배너(banner_item)는 data-threadid가 없어 잡히지 않는다
export function parseEvents(html) {
  const out = [], parts = html.split(/<li class="item[^"]*" data-mm-listitem /).slice(1);
  for (const p of parts) {
    const b = p.slice(0, p.indexOf('</li>') >= 0 ? p.indexOf('</li>') : undefined);
    const id = (b.match(/^data-threadid="(\d+)"/) || [])[1], type = (b.match(/<div class="type">([^<]*)<\/div>/) || [])[1];
    const title = (b.match(/class="title[^"]*">\s*<span>([\s\S]*?)<\/span>/) || [])[1], date = (b.match(/<div class="date">\s*<span>([\s\S]*?)<\/span>/) || [])[1];
    if (!id || !title || (type || '').trim() !== '진행중') continue;
    out.push({ id, title: strip(title), ...parsePeriod(date ? strip(date) : ''), url: `${OFF}News/Events/${id}`, src: ['board-events'] });
  }
  return out;
}
export const EVENTS_URL = `${OFF}News/Events?headlineId=2501`;
// 진행중 이벤트 전부(쪽마다 10건). 실패하면 null(일부만 읽힌 목록으로 지우지 않게)
export async function fetchEvents() {
  const first = await get(EVENTS_URL);
  if (!first) return null;
  const p = pager(first), L = parseEvents(first);
  if (!p) { console.warn('이벤트 목록 쪽 정보를 읽지 못함'); return null }
  for (let n = 2; n <= Math.ceil(p.total / 10) && n <= 10; n++) {
    await sleep(1500);
    const h = await get(pageUrl(EVENTS_URL, n, p));
    if (!h) return null;
    L.push(...parseEvents(h));
  }
  const U = [...new Map(L.map(e => [e.id, e])).values()];
  if (U.length !== p.total) { console.warn(`이벤트 수가 맞지 않음: 읽은 ${U.length}건, 목록 표시 ${p.total}건`); return null }
  return U;
}

/* ---------- 본문 비교 ---------- */
// 가이드 끝의 기준일 문장. 이 문장만 바뀌면 내용은 같다
export const BASIS_RE = /본 가이드는\s*(\d{4})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\(\s*.\s*\)\s*의 게임 상황을 기준으로/;
export const basisOf = t => { const m = t.match(BASIS_RE); return m ? ymd(+m[1], +m[2], +m[3]) : null };
export const sameExceptBasis = (a, b) => a.replace(BASIS_RE, '§') === b.replace(BASIS_RE, '§');
// 낱말 단위 차이. 바뀐 곳마다 앞 낱말 몇 개와 '- 예전'·'+ 지금'을 돌려준다
export function wordDiff(a, b, max = 10) {
  const A = a.split(/\s+/).filter(Boolean), B = b.split(/\s+/).filter(Boolean), n = A.length, m = B.length;
  if (n * m > 2e7) return [{ ctx: '', del: `(본문이 길어 낱말 비교를 생략: 예전 ${n}낱말, 지금 ${m}낱말)`, add: '' }];
  const W = m + 1, L = new Uint16Array((n + 1) * W);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i * W + j] = A[i] === B[j] ? L[(i + 1) * W + j + 1] + 1 : Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
  const H = []; let i = 0, j = 0, cur = null;
  const flush = () => { if (cur) { H.push(cur); cur = null } };
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) { flush(); i++; j++; continue }
    if (!cur) cur = { ctx: A.slice(Math.max(0, i - 6), i).join(' '), del: [], add: [] };
    if (j < m && (i >= n || L[i * W + j + 1] >= L[(i + 1) * W + j])) cur.add.push(B[j++]);
    else cur.del.push(A[i++]);
  }
  flush();
  return H.slice(0, max).map(h => ({ ctx: h.ctx, del: h.del.join(' '), add: h.add.join(' ') })).concat(H.length > max ? [{ ctx: '', del: `(바뀐 곳 ${H.length - max}군데 더 있음)`, add: '' }] : []);
}
