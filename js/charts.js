// 누적 손익 선 그래프 (SVG, 의존성 없음)
import { esc, wonShort, won, dateLabel } from './utils.js';

function niceStep(range) {
  const raw = range / 3;
  const exp = 10 ** Math.floor(Math.log10(raw || 1));
  const f = raw / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
}

/**
 * points: [{ date, value, label }] — 날짜순
 * 탭하면 가장 가까운 점을 읽어 준다(onPick)
 */
export function lineChart(container, points, { onPick } = {}) {
  const W = 340, H = 180;
  const m = { top: 12, right: 10, bottom: 22, left: 42 };
  const iw = W - m.left - m.right, ih = H - m.top - m.bottom;
  const vals = points.map((p) => p.value);
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  if (lo === hi) { hi += 10000; lo -= 10000; }
  const step = niceStep(hi - lo);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const x = (i) => m.left + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v) => m.top + ih - ((v - lo) / (hi - lo)) * ih;

  const ticks = [];
  for (let v = lo; v <= hi + 1e-6; v += step) ticks.push(v);
  const grid = ticks.map((v) => `
    <line x1="${m.left}" x2="${W - m.right}" y1="${y(v)}" y2="${y(v)}" class="${v === 0 ? 'axis' : 'grid'}"></line>
    <text x="${m.left - 6}" y="${y(v)}" class="tick" text-anchor="end" dominant-baseline="middle">${v === 0 ? '0' : wonShort(v)}</text>`).join('');

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const first = points[0], last = points[points.length - 1];
  const xLabels = points.length > 1
    ? `<text x="${x(0)}" y="${H - 6}" class="tick" text-anchor="start">${esc(dateLabel(first.date, { short: true }))}</text>
       <text x="${x(points.length - 1)}" y="${H - 6}" class="tick" text-anchor="end">${esc(dateLabel(last.date, { short: true }))}</text>`
    : '';

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="line-chart" role="img" aria-label="누적 손익 추이, 최종 ${esc(won(last.value, { sign: true }))}">
      ${grid}
      <path d="${path}" class="line"></path>
      ${points.length <= 40 ? points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.value)}" r="2.5" class="dot"></circle>`).join('') : ''}
      <circle class="focus" r="5" cx="-10" cy="-10"></circle>
      <line class="focus-line" x1="-10" x2="-10" y1="${m.top}" y2="${m.top + ih}"></line>
      ${xLabels}
      <rect class="hit" x="${m.left}" y="0" width="${iw}" height="${H}"></rect>
    </svg>`;

  const svg = container.querySelector('svg');
  const focus = svg.querySelector('.focus');
  const fline = svg.querySelector('.focus-line');
  const pick = (i) => {
    focus.setAttribute('cx', x(i)); focus.setAttribute('cy', y(points[i].value));
    fline.setAttribute('x1', x(i)); fline.setAttribute('x2', x(i));
    onPick?.(points[i], i);
  };
  const locate = (clientX) => {
    const r = svg.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * W;
    let best = 0, bd = Infinity;
    points.forEach((_, i) => { const d = Math.abs(x(i) - sx); if (d < bd) { bd = d; best = i; } });
    pick(best);
  };
  svg.querySelector('.hit').addEventListener('pointerdown', (e) => locate(e.clientX));
  svg.querySelector('.hit').addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'mouse') locate(e.clientX); });
  pick(points.length - 1);
}
