// 통계 탭
import { ui, data } from '../store.js';
import { stats } from '../money.js';
import { esc, won, gm, plainPct, pct, dateLabel, KIND, TICKET_STATUS } from '../utils.js';
import { segmented, profitHtml } from './common.js';
import { lineChart } from '../charts.js';

const PERIODS = [
  { value: 'all', label: '전체' },
  { value: 'year', label: '올해' },
  { value: '3m', label: '3개월' },
  { value: 'month', label: '이번 달' },
];

function table(rows, labelFn) {
  if (!rows.length) return '<p class="muted empty-line">기록이 없어요</p>';
  return `<div class="table-wrap"><table class="data-table">
    <thead><tr><th></th><th>참가</th><th>손익</th><th>ROI</th><th>입상</th></tr></thead>
    <tbody>${rows.map((r) => `<tr>
      <td class="t-label">${esc(labelFn(r))}</td><td>${r.count}</td><td>${profitHtml(r.profit)}</td>
      <td class="${r.roi > 0 ? 'gain' : r.roi < 0 ? 'loss' : ''}">${r.roi == null ? '-' : pct(r.roi, 0)}</td><td>${plainPct(r.itmRate, 0)}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

export function renderStats(root) {
  const S = stats(ui.statsPeriod);
  const T = S.total;
  root.innerHTML = `
    <header class="page-head"><h1>통계</h1></header>
    ${segmented('period', PERIODS, ui.statsPeriod, { small: true })}

    ${T.count ? `
      <section class="card stat-hero">
        <div class="sh-main"><span class="k">순손익</span><span class="sh-big ${T.profit > 0 ? 'gain' : T.profit < 0 ? 'loss' : ''}">${won(T.profit, { sign: true })}</span></div>
        <div class="stat-grid">
          <div><span class="k">ROI</span><span class="v ${T.roi > 0 ? 'gain' : T.roi < 0 ? 'loss' : ''}">${T.roi == null ? '-' : pct(T.roi)}</span></div>
          <div><span class="k">입상률</span><span class="v">${plainPct(T.itmRate)}</span></div>
          <div><span class="k">참가</span><span class="v">${T.count}회</span></div>
          <div><span class="k">총 비용</span><span class="v">${won(T.cost)}</span></div>
          <div><span class="k">총 수익</span><span class="v">${won(T.winnings)}</span></div>
          <div><span class="k">평균 바이인</span><span class="v">${won(T.avgBuyIn)}</span></div>
        </div>
        ${T.best && T.best.profit > 0 ? `<button type="button" class="best-row" data-session="${esc(T.best.session.id)}"><span class="k">최고 성적</span><span>${esc(T.best.session.name)} · ${dateLabel(T.best.session.date, { short: true })}</span>${profitHtml(T.best.profit)}</button>` : ''}
      </section>

      ${T.gmCount ? `<p class="info-line small-info">게임머니 대회 ${T.gmCount}건은 플랫폼별 평균 충전 단가로 원화 환산해서 합쳤어요.${T.unconverted ? ` 충전 기록이 없는 ${T.unconverted}건은 티켓 가치만 반영했어요.` : ''}</p>` : ''}

      <section class="card block">
        <h3 class="block-title">누적 손익</h3>
        <div id="chart" class="no-swipe"></div>
        <p class="chart-readout" aria-live="polite"></p>
      </section>

      <section class="card block">
        <h3 class="block-title">새틀라이트</h3>
        ${S.satellite.count ? `
          <div class="stat-grid">
            <div><span class="k">참가</span><span class="v">${S.satellite.count}회</span></div>
            <div><span class="k">티켓 획득</span><span class="v">${S.satellite.ticketsWon}장</span></div>
            <div><span class="k">성공률</span><span class="v">${plainPct(S.satellite.successRate)}</span></div>
            <div><span class="k">새틀라이트 비용</span><span class="v">${won(S.satellite.cost)}</span></div>
            <div class="span-2"><span class="k">티켓 1장당 평균 비용</span><span class="v">${S.satellite.costPerTicket != null ? won(S.satellite.costPerTicket) : '아직 획득 없음'}</span></div>
          </div>
          <p class="help">${!S.satellite.successRate ? '아직 티켓을 따지 못했어요.' : S.satellite.successRate >= 1 ? '참가할 때마다 티켓을 땄어요.' : `약 ${Math.round((1 / S.satellite.successRate) * 10) / 10}번 참가에 1번꼴로 티켓을 땄어요.`}</p>`
    : '<p class="muted empty-line">이 기간에 새틀라이트 기록이 없어요</p>'}
      </section>

      ${S.platforms.length ? `
      <section class="card block">
        <h3 class="block-title">온라인 플랫폼 (전체 기간)</h3>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th></th><th>충전</th><th>딴 티켓</th><th>회수율</th><th>잔고</th></tr></thead>
          <tbody>${S.platforms.map((b) => `<tr data-platform="${esc(b.venueId)}">
            <td class="t-label">${esc(b.venue.name)}</td><td>${won(b.topupKrw)}</td><td>${won(b.ticketValue)}</td>
            <td class="${b.recovery >= 1 ? 'gain' : ''}">${b.recovery != null ? plainPct(b.recovery, 0) : '-'}</td><td>${gm(b.balance, b.venue.gmUnit)}</td>
          </tr>`).join('')}</tbody></table></div>
        <p class="help">회수율 = 딴 티켓 액면가 ÷ 충전한 현금. 100%를 넘으면 충전한 돈보다 더 큰 가치의 티켓을 딴 거예요.</p>
      </section>` : ''}

      <section class="card block">
        <h3 class="block-title">플랫폼·장소별</h3>
        ${table(S.byVenue, (r) => r.label)}
      </section>

      <section class="card block">
        <h3 class="block-title">종류별</h3>
        ${table(S.byKind, (r) => KIND[r.key])}
      </section>` : `
      <div class="empty"><p>${data.sessions.some((s) => s.status === 'done') ? '이 기간에 완료한 대회가 없어요' : '완료한 대회가 쌓이면 통계가 나와요'}</p></div>`}

    <section class="card block">
      <div class="block-head"><h3>티켓 현황</h3><button type="button" class="link-btn" data-act="tickets">전체 보기 →</button></div>
      <div class="ticket-stats">
        ${Object.entries(TICKET_STATUS).map(([k, v]) => `<button type="button" class="ts-item" data-tview="${k}"><span class="k">${v}</span><span class="v">${S.tickets[k][0]}장</span><span class="s">${won(S.tickets[k][1])}</span></button>`).join('')}
      </div>
    </section>`;

  root.querySelectorAll('[data-period]').forEach((b) => b.addEventListener('click', () => { ui.statsPeriod = b.dataset.period; renderStats(root); }));
  root.querySelectorAll('[data-tview], [data-act="tickets"]').forEach((b) => b.addEventListener('click', async () => (await import('./sheets.js')).openTickets(b.dataset.tview || 'held')));
  root.querySelectorAll('[data-session]').forEach((b) => b.addEventListener('click', async () => (await import('./session-detail.js')).openSessionDetail(b.dataset.session)));
  root.querySelectorAll('tr[data-platform]').forEach((r) => r.addEventListener('click', async () => (await import('./wallet.js')).openPlatform(r.dataset.platform)));
  const chart = root.querySelector('#chart');
  if (chart && S.series.length) {
    const readout = root.querySelector('.chart-readout');
    lineChart(chart, S.series, {
      onPick: (p, i) => {
        readout.innerHTML = `<b>${dateLabel(p.date, { short: true })}</b> ${esc(p.session.name)} · 누적 ${profitHtml(p.value)} <span class="muted">(${i + 1}번째)</span>`;
      },
    });
  }
}
