// 대회 상세 (전체 화면 페이지)
import { sessionById, venueById, ticketById, ticketsWonBy, handsOf, venueName, deleteSession, canDeleteSession, saveSession, actions } from '../store.js';
import { sessionMoney, plannedCost } from '../money.js';
import { openSheet, dialog, confirmDialog, toast, icon, ICONS } from '../ui.js';
import { esc, won, gm, dateLabel, todayStr, plainPct } from '../utils.js';
import { rateText } from './wallet.js';
import { renderMarkdown } from '../markdown.js';
import { kindBadge, statusBadge, profitHtml, handCard, ticketRow, dueBadge } from './common.js';
import { openSessionForm } from './session-form.js';
import { openCalendarFor, openTicket } from './sheets.js';
import { openHandForm } from './hand-form.js';

const pages = new Set();
export const refreshSessionPages = () => pages.forEach((p) => p.render());

export function openSessionDetail(id) {
  if (!sessionById(id)) return;
  const sheet = openSheet({
    title: sessionById(id).name, page: true,
    headerRight: `<button type="button" class="icon-btn" data-more aria-label="더보기">${icon(ICONS.more)}</button>`,
    onClose: () => pages.delete(page),
  });
  const page = { render };
  pages.add(page);
  sheet.el.querySelector('[data-more]').addEventListener('click', more);

  function render() {
    const s = sessionById(id);
    if (!s) { pages.delete(page); return; }
    sheet.setTitle(s.name);
    const m = sessionMoney(s);
    const pc = plannedCost(s);
    const entryT = s.entryTicketId ? ticketById(s.entryTicketId) : null;
    const won_ = ticketsWonBy(id);
    const hands = handsOf(id);
    const pending = s.status === 'planned' && s.date < todayStr();
    const unit = venueById(s.venueId)?.gmUnit ?? '억';
    const y = sheet.body.scrollTop;

    sheet.body.innerHTML = `
      <section class="detail-head">
        <div class="dh-line">${statusBadge(s.status)} ${kindBadge(s.kind)} <span class="muted">${esc(venueName(s.venueId))}</span></div>
        <div class="dh-date">${dateLabel(s.date, { weekday: true })}${s.startTime ? ` ${s.startTime}${s.endTime ? `~${s.endTime}` : ''}` : ''} ${s.status === 'planned' && !pending ? dueBadge(s.date) : ''}</div>
      </section>

      ${s.status === 'planned' ? `
        ${pending ? '<p class="info-line warn">날짜가 지났어요. 결과를 입력하거나 불참으로 처리해 주세요.</p>' : ''}
        <div class="btn-row">
          <button type="button" class="btn primary" data-act="result">${icon(ICONS.trophy)}결과 입력</button>
          ${pending ? '<button type="button" class="btn ghost" data-act="skip">불참 처리</button>' : `<button type="button" class="btn ghost" data-act="cal">${icon(ICONS.cal)}캘린더에 추가</button>`}
        </div>
        <section class="card block money-card">
          <div class="mrow"><span>참가 방식</span><b>${s.gm ? '게임머니' : entryT ? `${icon(ICONS.ticket)}${esc(entryT.name)}` : '현금'}</b></div>
          <div class="mrow"><span>바이인</span><b>${s.gm ? gm(s.buyIn, unit) : won(s.buyIn)}</b></div>
          ${pc.ticket ? `<div class="mrow"><span>현금 지출</span><b>${won(0)}${s.reentries ? ` + 리엔트리` : ''}</b></div>` : ''}
        </section>` : ''}

      ${s.status === 'done' && m.gm ? `
        <section class="card block money-card">
          <div class="mrow big"><span>게임머니 손익</span><b class="${m.gmProfit > 0 ? 'gain' : m.gmProfit < 0 ? 'loss' : ''}">${gm(m.gmProfit, unit, { sign: true })}</b></div>
          <div class="mrow"><span>비용</span><b>${gm(m.gmCost, unit)}</b></div>
          ${s.reentries ? `<div class="msub">바이인 ${gm(s.buyIn, unit)} × ${1 + s.reentries}회</div>` : ''}
          <div class="mrow"><span>상금</span><b>${gm(m.gmPrize, unit)}</b></div>
          <div class="mrow"><span>획득 티켓</span><b>${won(m.ticketValue)}${m.ticketsWon ? ` (${m.ticketsWon}장)` : ''}</b></div>
          ${s.place ? `<div class="mrow"><span>순위</span><b>${s.place}위${s.entrants ? ` / ${s.entrants}명 (상위 ${plainPct(s.place / s.entrants)})` : ''}</b></div>` : ''}
          <div class="mrow"><span>원화 환산 손익</span><b>${m.unconverted ? '<span class="muted">충전 기록 없음</span>' : profitHtml(Math.round(m.profit))}</b></div>
          ${m.unconverted ? '' : `<div class="msub">${rateText(m.rate, unit)} (평균 충전 단가)</div>`}
          <button type="button" class="link-btn" data-act="edit">${icon(ICONS.edit)}결과 수정</button>
        </section>` : ''}
      ${s.status === 'done' && !m.gm ? `
        <section class="card block money-card">
          <div class="mrow big"><span>손익</span><b>${profitHtml(m.profit)}</b></div>
          <div class="mrow"><span>비용</span><b>${won(m.cost)}</b></div>
          <div class="msub">${entryT ? `티켓 ${esc(entryT.name)} ${won(entryT.faceValue)}` : `바이인 ${won(s.buyIn)}`}${s.reentries ? ` + 리엔트리 ${s.reentries}회 × ${won(s.buyIn)}` : ''}</div>
          <div class="mrow"><span>상금</span><b>${won(m.prize)}</b></div>
          <div class="mrow"><span>획득 티켓</span><b>${won(m.ticketValue)}${m.ticketsWon ? ` (${m.ticketsWon}장)` : ''}</b></div>
          ${s.place ? `<div class="mrow"><span>순위</span><b>${s.place}위${s.entrants ? ` / ${s.entrants}명 (상위 ${plainPct(s.place / s.entrants)})` : ''}</b></div>` : ''}
          <div class="mrow"><span>ROI</span><b>${m.cost ? plainPct(m.profit / m.cost) : '-'}</b></div>
          <button type="button" class="link-btn" data-act="edit">${icon(ICONS.edit)}결과 수정</button>
        </section>` : ''}
      ${s.status === 'done' && won_.length ? `<h3 class="sec-title">획득 티켓</h3><div class="ticket-list card">${won_.map(ticketRow).join('')}</div>` : ''}

      ${s.status === 'skipped' ? '<p class="info-line">불참 처리된 대회예요. 손익·통계에 포함되지 않아요.</p>' : ''}

      ${s.memo ? `<section class="card block"><h3 class="block-title">메모</h3><div class="markdown">${renderMarkdown(s.memo)}</div></section>` : ''}

      <section class="block plain">
        <div class="block-head"><h3>핸드 메모 <span class="count">${hands.length}</span></h3><button type="button" class="link-btn" data-act="hand">＋ 핸드 추가</button></div>
        ${hands.length ? `<div class="hand-list">${hands.map((h) => handCard(h, { showSession: false })).join('')}</div>` : '<p class="muted empty-line">이 대회에서 기억할 핸드를 남겨 두세요.</p>'}
      </section>`;
    sheet.body.scrollTop = y;

    const on = (a, fn) => sheet.body.querySelectorAll(`[data-act="${a}"]`).forEach((b) => b.addEventListener('click', fn));
    on('result', () => openSessionForm(id, { status: 'done', focusResult: true }));
    on('edit', () => openSessionForm(id, { focusResult: true }));
    on('cal', () => openCalendarFor('session', id));
    on('hand', () => openHandForm(null, { sessionId: id }));
    on('skip', skip);
    sheet.body.querySelectorAll('[data-hand]').forEach((b) => b.addEventListener('click', () => openHandForm(b.dataset.hand)));
    sheet.body.querySelectorAll('[data-ticket]').forEach((b) => b.addEventListener('click', () => openTicket(b.dataset.ticket)));
  }

  async function skip() {
    const s = sessionById(id);
    const ok = await confirmDialog({
      title: '불참으로 처리할까요?',
      message: s.entryTicketId ? '사용하려던 티켓은 보유로 돌아가고, 손익에서 빠져요.' : '손익·통계에서 빠져요.',
      confirmText: '불참 처리',
    });
    if (!ok) return;
    await saveSession({ ...s, status: 'skipped' });
    toast('불참으로 처리했어요');
    actions.refresh();
  }

  async function more() {
    const s = sessionById(id);
    const r = await dialog({
      title: s.name,
      buttons: [
        { label: '편집', value: 'edit' },
        ...(s.status === 'planned' ? [{ label: '캘린더에 추가', value: 'cal' }, { label: '불참 처리', value: 'skip' }] : []),
        ...(s.status === 'skipped' ? [{ label: '예정으로 되돌리기', value: 'unskip' }] : []),
        { label: '같은 대회 다시 등록', value: 'copy' },
        { label: '삭제', value: 'delete', kind: 'danger-ghost' },
        { label: '닫기', value: null },
      ],
    });
    if (r.button === 'edit') openSessionForm(id);
    if (r.button === 'cal') openCalendarFor('session', id);
    if (r.button === 'skip') skip();
    if (r.button === 'unskip') { await saveSession({ ...s, status: 'planned' }); actions.refresh(); toast('예정으로 되돌렸어요'); }
    if (r.button === 'copy') {
      const { openSessionCopy } = await import('./sessions.js');
      openSessionCopy(id);
    }
    if (r.button === 'delete') {
      const chk = canDeleteSession(id);
      if (!chk.ok) {
        await dialog({ title: '삭제할 수 없어요', message: `이 대회에서 딴 티켓(${chk.blocked.map((t) => t.name).join(', ')})이 이미 사용·판매·만료됐어요. 먼저 그 티켓 기록을 정리해 주세요.`, buttons: [{ label: '확인', value: true, kind: 'primary' }] });
        return;
      }
      const w = ticketsWonBy(id).length;
      const h = handsOf(id).length;
      const ok = await confirmDialog({
        title: '대회를 삭제할까요?',
        message: [w ? `획득 티켓 ${w}장도 함께 삭제돼요.` : '', s.entryTicketId ? '사용한 티켓은 보유로 돌아가요.' : '', h ? `핸드 메모 ${h}개는 남고 대회 연결만 풀려요.` : '', '되돌릴 수 없어요.'].filter(Boolean).join(' '),
        confirmText: '삭제', danger: true,
      });
      if (!ok) return;
      await deleteSession(id);
      sheet.close();
      toast('삭제했어요');
      actions.refresh();
    }
  }

  render();
}
