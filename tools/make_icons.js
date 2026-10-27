// MBNG Advisor 아이콘 SVG 생성: 무지갯빛 다면 나침반 별 + 금빛 대각 별·고리 + 오로라 배경
// 출력: icon.svg(둥근 모서리), icon-full.svg(가득 찬 정사각, 마스커블·애플용), favicon.svg(작은 크기용 단순형)
const fs = require('fs'), path = require('path');
const out = process.argv[2];
const f = n => +n.toFixed(2);
const pt = (c, r, deg) => [c + r * Math.cos(deg * Math.PI / 180), c + r * Math.sin(deg * Math.PI / 180)];
// 4갈래 별을 8개 삼각 면으로: 각 갈래의 위쪽·왼쪽(빛 받는 쪽) 면은 light, 반대쪽은 dark
function star(c, tips, waist, rot, light, dark, edge) {
  let L = '', D = '';
  for (let k = 0; k < 4; k++) {
    const th = rot + k * 90, T = pt(c, tips[k], th), A = pt(c, waist, th - 45), B = pt(c, waist, th + 45);
    const [lw, dw] = (A[0] + A[1] < B[0] + B[1]) ? [A, B] : [B, A];
    const tri = w => `M${f(c)} ${f(c)}L${f(T[0])} ${f(T[1])}L${f(w[0])} ${f(w[1])}Z`;
    L += tri(lw); D += tri(dw);
  }
  return `<path d="${L}" fill="${light}"/><path d="${D}" fill="${dark}"/>${edge ? `<path d="${L}" fill="none" stroke="#fff" stroke-opacity="${edge}" stroke-width="1.2" stroke-linejoin="round"/>` : ''}`;
}
function outline(c, tips, waist, rot) {
  let d = '';
  for (let k = 0; k < 4; k++) {
    const th = rot + k * 90, T = pt(c, tips[k], th), B = pt(c, waist, th + 45);
    d += (k ? 'L' : 'M') + f(T[0]) + ' ' + f(T[1]) + 'L' + f(B[0]) + ' ' + f(B[1]);
  }
  return d + 'Z';
}
const spark = (x, y, r, fill, op) => `<path d="M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z" fill="${fill}" opacity="${op}"/>`;

function big(rounded) {
  const c = 256, main = [196, 156, 196, 156], diag = [122, 122, 122, 122];
  const ticks = Array.from({ length: 24 }, (_, i) => i * 15).filter(a => a % 90).map(a => {
    const long = a % 45 === 0, [x1, y1] = pt(c, 137, a), [x2, y2] = pt(c, long ? 151 : 145, a);
    return `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="url(#gold)" stroke-width="${long ? 3 : 2}" stroke-linecap="round" opacity="${long ? .95 : .55}"/>`;
  }).join('');
  const bg = `<rect width="512" height="512" fill="url(#bg)"/><rect width="512" height="512" fill="url(#auB)"/><rect width="512" height="512" fill="url(#auM)"/><rect width="512" height="512" fill="url(#auV)"/><rect width="512" height="512" fill="url(#auR)"/><rect width="512" height="512" fill="url(#vig)"/>`;
  const body = `
<circle cx="256" cy="256" r="200" fill="url(#halo)"/>
<g filter="url(#blur)" opacity=".75"><path d="${outline(c, main, 40, -90)}" fill="#6fe3c1"/></g>
<g filter="url(#blur3)" opacity=".55"><path d="${outline(c, main.map(r => r * .55), 30, -90)}" fill="#fff"/></g>
<g filter="url(#blur2)" opacity=".45"><circle cx="256" cy="256" r="120" fill="#8b6cff"/></g>
<circle cx="256" cy="256" r="174" fill="none" stroke="#fff" stroke-opacity=".07" stroke-width="1.5"/>
<circle cx="256" cy="256" r="132" fill="none" stroke="url(#gold)" stroke-width="3"/>
<circle cx="256" cy="256" r="126" fill="none" stroke="url(#gold)" stroke-opacity=".35" stroke-width="1"/>
${ticks}
${star(c, diag, 22, -45, 'url(#gl)', 'url(#gd)', .3)}
${star(c, main, 37, -90, 'url(#il)', 'url(#id)', .4)}
<path d="M256 60L252 228" stroke="#fff" stroke-opacity=".55" stroke-width="2" stroke-linecap="round"/>
<path d="M100 256L230 252" stroke="#fff" stroke-opacity=".3" stroke-width="1.5" stroke-linecap="round"/>
<circle cx="256" cy="256" r="21" fill="url(#gem)" stroke="#fff" stroke-opacity=".7" stroke-width="1.5"/>
<ellipse cx="249" cy="249" rx="7" ry="4.5" fill="#fff" opacity=".85" transform="rotate(-35 249 249)"/>
${spark(112, 108, 16, '#fff', .9)}${spark(404, 404, 12, '#f6dd9a', .9)}${spark(410, 124, 8, '#fff', .55)}${spark(122, 398, 7, '#c7b2ff', .7)}
<circle cx="150" cy="150" r="2.2" fill="#fff" opacity=".6"/><circle cx="372" cy="94" r="1.8" fill="#fff" opacity=".5"/><circle cx="92" cy="330" r="1.6" fill="#fff" opacity=".45"/><circle cx="432" cy="300" r="2" fill="#f6dd9a" opacity=".6"/><circle cx="196" cy="68" r="1.4" fill="#fff" opacity=".5"/><circle cx="460" cy="214" r="1.5" fill="#fff" opacity=".45"/><circle cx="62" cy="196" r="1.3" fill="#c7b2ff" opacity=".6"/><circle cx="318" cy="452" r="1.6" fill="#fff" opacity=".4"/><circle cx="236" cy="470" r="1.2" fill="#9ff3db" opacity=".55"/>`;
  const defs = `<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#11211f"/><stop offset=".55" stop-color="#0c0e14"/><stop offset="1" stop-color="#0a0a12"/></linearGradient>
<radialGradient id="auM" cx="140" cy="110" r="300" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#6fe3c1" stop-opacity=".42"/><stop offset="1" stop-color="#6fe3c1" stop-opacity="0"/></radialGradient>
<radialGradient id="auB" cx="70" cy="450" r="280" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#2f7bd0" stop-opacity=".32"/><stop offset="1" stop-color="#2f7bd0" stop-opacity="0"/></radialGradient>
<radialGradient id="halo" cx="256" cy="256" r="200" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#e8fff8" stop-opacity=".16"/><stop offset=".6" stop-color="#9fe9d6" stop-opacity=".05"/><stop offset="1" stop-color="#9fe9d6" stop-opacity="0"/></radialGradient>
<radialGradient id="auV" cx="430" cy="400" r="320" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#7b5cff" stop-opacity=".5"/><stop offset="1" stop-color="#7b5cff" stop-opacity="0"/></radialGradient>
<radialGradient id="auR" cx="420" cy="110" r="200" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ff7eb6" stop-opacity=".22"/><stop offset="1" stop-color="#ff7eb6" stop-opacity="0"/></radialGradient>
<radialGradient id="vig" cx="256" cy="240" r="380" gradientUnits="userSpaceOnUse"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></radialGradient>
<linearGradient id="il" x1="120" y1="60" x2="392" y2="452" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#f2fffb"/><stop offset=".3" stop-color="#9ff3db"/><stop offset=".55" stop-color="#9cc9ff"/><stop offset=".8" stop-color="#cdb8ff"/><stop offset="1" stop-color="#ffc4e2"/></linearGradient>
<linearGradient id="id" x1="120" y1="60" x2="392" y2="452" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#3fc2a3"/><stop offset=".35" stop-color="#2a8fb8"/><stop offset=".65" stop-color="#5a4fd8"/><stop offset="1" stop-color="#b8508f"/></linearGradient>
<linearGradient id="gl" x1="160" y1="160" x2="352" y2="352" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff1c9"/><stop offset=".5" stop-color="#f3c77a"/><stop offset="1" stop-color="#f0a0a8"/></linearGradient>
<linearGradient id="gd" x1="160" y1="160" x2="352" y2="352" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#b8863a"/><stop offset=".5" stop-color="#8f5a2e"/><stop offset="1" stop-color="#7a3a62"/></linearGradient>
<linearGradient id="gold" x1="124" y1="124" x2="388" y2="388" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fbe9b4"/><stop offset=".45" stop-color="#d7ad5b"/><stop offset=".7" stop-color="#f6dd9a"/><stop offset="1" stop-color="#9c7432"/></linearGradient>
<radialGradient id="gem" cx=".38" cy=".35" r=".75"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#c8fff0"/><stop offset="1" stop-color="#4fcfae"/></radialGradient>
<linearGradient id="edge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".5" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#fff" stop-opacity=".14"/></linearGradient>
<filter id="blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="20"/></filter>
<filter id="blur3" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9"/></filter>
<filter id="blur2" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="40"/></filter>
${rounded ? '<clipPath id="clip"><rect width="512" height="512" rx="114"/></clipPath>' : ''}
</defs>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${defs}
${rounded ? `<g clip-path="url(#clip)">${bg}${body}</g><rect x="1.5" y="1.5" width="509" height="509" rx="112.5" fill="none" stroke="url(#edge)" stroke-width="3"/>` : bg + body}
</svg>`;
}

function fav() {
  const c = 32;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><defs>
<linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#16302b"/><stop offset=".6" stop-color="#0d0f16"/><stop offset="1" stop-color="#1a1238"/></linearGradient>
<radialGradient id="a" cx="16" cy="12" r="40" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#6fe3c1" stop-opacity=".45"/><stop offset="1" stop-color="#6fe3c1" stop-opacity="0"/></radialGradient>
<linearGradient id="l" x1="14" y1="6" x2="50" y2="58" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#f2fffb"/><stop offset=".35" stop-color="#9ff3db"/><stop offset=".65" stop-color="#a8c8ff"/><stop offset="1" stop-color="#ffc4e2"/></linearGradient>
<linearGradient id="d" x1="14" y1="6" x2="50" y2="58" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#3fc2a3"/><stop offset=".5" stop-color="#3a6fd0"/><stop offset="1" stop-color="#9a4fb0"/></linearGradient>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbe9b4"/><stop offset="1" stop-color="#c9963f"/></linearGradient>
<linearGradient id="e" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity=".06"/></linearGradient>
</defs>
<rect width="64" height="64" rx="15" fill="url(#b)"/><rect width="64" height="64" rx="15" fill="url(#a)"/>
${star(c, [18, 18, 18, 18], 4, -45, 'url(#g)', '#a8762f').replace(/<path/g, '<path opacity=".9"')}
${star(c, [27, 22, 27, 22], 6, -90, 'url(#l)', 'url(#d)', .35)}
<circle cx="32" cy="32" r="3.4" fill="#fff"/>
<rect x=".75" y=".75" width="62.5" height="62.5" rx="14.25" fill="none" stroke="url(#e)" stroke-width="1.5"/>
</svg>`;
}

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon.svg'), big(true));
fs.writeFileSync(path.join(out, 'icon-full.svg'), big(false));
fs.writeFileSync(path.join(out, 'favicon.svg'), fav());
for (const n of ['icon.svg', 'icon-full.svg', 'favicon.svg']) console.log(n, fs.statSync(path.join(out, n)).size);
