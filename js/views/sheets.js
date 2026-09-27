// 티켓 목록·편집, 캘린더 추가
import {
  data, ui, ticketById, sessionById, saveTicket, deleteTicket, newTicket, actions,
} from '../store.js';
import { openSheet, bindNumber, dialog, confirmDialog, promptDialog, toast, icon, ICONS } from '../ui.js';
import { esc, won, num, todayStr, isValidDateStr, dateLabel, TICKET_STATUS, parseNum } from '../utils.js';
import { segmented, ticketRow } from './common.js';
import { sessionEvent, ticketEvent, googleUrl, downloadIcs } from '../calendar.js';

/* ---------- 캘린더 ---------- */
export async function openCalendarFor(kind, id) {
  const ev = kind === 'session' ? sessionEvent(sessionById(id)) : ticketEvent(ticketById(id));
  if (!ev.date) { toast('날짜가 없어요'); return; }
  const r = await dialog({
    title: '캘린더에 추가',
    message: `${dateLabel(ev.date, { weekday: true })}${ev.start ? ` ${ev.start}` : ''} · ${ev.title}`,
    buttons: [
      { label: 'Google 캘린더', value: 'google', kind: 'primary' },
      { label: '.ics 파일 (삼성 캘린더 등)', value: 'ics' },
      { label: '취소', value: null },
    ],
  });
  if (r.button === 'google') window.open(googleUrl(ev), '_blank', 'noopener');
  if (r.button === 'ics') { downloadIcs(ev); toast('일정 파일을 저장했어요. 파일을 열어 캘린더에 추가하세요'); }
}

/* ---------- 티켓 목록 ---------- */
let listSheet = null;
export function openTickets(view) {
  if (view) ui.ticketsView = view;
  const sheet = openSheet({ title: '티켓', page: true, onClose: () => { listSheet = null; } });
  listSheet = { render };
  function render() {
    const counts = Object.fromEntries(Object.keys(TICKET_STATUS).map((k) => [k, data.tickets.filter((t) => t.status === k).length]));
    const list = data.tickets.filter((t) => t.status === ui.ticketsView)
      .sort((a, b) => (ui.ticketsView === 'held'
        ? ((a.expiresAt ?? '9999') < (b.expiresAt ?? '9999') ? -1 : 1)
        : b.updatedAt - a.updatedAt));
    const sum = list.reduce((a, t) => a + (t.status === 'sold' ? t.soldAmount ?? 0 : t.faceValue), 0);
    sheet.body.innerHTML = `
      ${segmented('tv', Object.entries(TICKET_STATUS).map(([k, v]) => ({ value: k, label: v, count: counts[k] })), ui.ticketsView)}
      <p class="list-sum">${list.length}장 · ${won(sum)}</p>
      ${list.length ? `<div class="ticket-list card">${list.map(ticketRow).join('')}</div>` : `<div class="empty small"><p class="muted">${TICKET_STATUS[ui.ticketsView]} 티켓이 없어요</p></div>`}
      <button type="button" class="btn ghost block" id="tk-add">${icon(ICONS.plus)}티켓 직접 추가</button>
      <p class="help">새틀라이트에서 딴 티켓은 대회 결과에서 추가하면 자동으로 연결돼요. 여기서는 선물·구매 등 대회 밖에서 얻은 티켓을 추가하세요.</p>`;
    sheet.body.querySelectorAll('[data-tv]').forEach((b) => b.addEventListener('click', () => { ui.ticketsView = b.dataset.tv; render(); }));
    sheet.body.querySelectorAll('[data-ticket]').forEach((b) => b.addEventListener('click', () => openTicket(b.dataset.ticket)));
    sheet.body.querySelector('#tk-add').addEventListener('click', () => openTicket(null));
  }
  render();
}
export const refreshTickets = () => listSheet?.render();

/* ---------- 티켓 상세·편집 ---------- */
export function openTicket(id) {
  const orig = id ? ticketById(id) : null;
  const f = orig ? { ...orig } : newTicket({ acquiredAt: todayStr() });
  let initial = '';
  let face;
  const locked = orig && orig.status !== 'held';
  const sheet = openSheet({
    title: orig ? '티켓' : '티켓 추가',
    headerRight: orig ? `<button type="button" class="icon-btn danger-text" data-del aria-label="삭제">${icon(ICONS.del)}</button>` : '',
    isDirty: () => snap() !== initial,
  });
  const src = orig?.sourceSessionId ? sessionById(orig.sourceSessionId) : null;
  const used = orig?.usedSessionId ? sessionById(orig.usedSessionId) : null;

  sheet.body.innerHTML = `
    ${orig ? `<div class="ticket-state"><span class="badge tk-${orig.status}">${TICKET_STATUS[orig.status]}</span>
      ${orig.status === 'sold' ? `<span>판매 ${won(orig.soldAmount ?? 0)}${orig.soldAt ? ` · ${dateLabel(orig.soldAt, { short: true })}` : ''}</span>` : ''}</div>` : ''}
    <label class="field-label" for="t-name">이름 (대상 대회) <span class="req">필수</span></label>
    <input id="t-name" class="field" type="text" maxlength="60" value="${esc(f.name)}" placeholder="예: HPT 서울 메인 이벤트 티켓">
    <label class="field-label" for="t-face">액면가 <span class="req">필수</span></label>
    <div class="unit-input"><input id="t-face" class="field" type="text" inputmode="numeric" data-decimals="0" value="${f.faceValue ? num(f.faceValue) : ''}" placeholder="0" ${locked ? 'readonly' : ''}><span>원</span></div>
    ${locked ? '<p class="muted small-line">사용·판매·만료된 티켓은 액면가를 바꿀 수 없어요 (손익 계산이 바뀌어서)</p>' : ''}
    <div class="row-2">
      <div><label class="field-label" for="t-acq">획득일</label><input id="t-acq" class="field" type="date" value="${esc(f.acquiredAt ?? '')}"></div>
      <div><label class="field-label" for="t-exp">유효기간</label><input id="t-exp" class="field" type="date" value="${esc(f.expiresAt ?? '')}"></div>
    </div>
    <label class="field-label" for="t-memo">메모</label>
    <input id="t-memo" class="field" type="text" maxlength="100" value="${esc(f.memo)}">
    ${src || used ? `<div class="link-list">
      ${src ? `<button type="button" class="link-row" data-open-session="${esc(src.id)}"><span class="k">획득</span><span>${esc(src.name)} · ${dateLabel(src.date, { short: true })}</span>${icon(ICONS.chevron)}</button>` : ''}
      ${used ? `<button type="button" class="link-row" data-open-session="${esc(used.id)}"><span class="k">사용</span><span>${esc(used.name)} · ${dateLabel(used.date, { short: true })}</span>${icon(ICONS.chevron)}</button>` : ''}
    </div>` : ''}
    ${orig ? `<div class="btn-row">
      ${orig.status === 'held' ? `<button type="button" class="btn ghost" data-act="sell">판매 처리</button><button type="button" class="btn ghost" data-act="expire">만료 처리</button>` : ''}
      ${orig.status === 'held' && orig.expiresAt ? `<button type="button" class="btn ghost" data-act="cal">${icon(ICONS.cal)}만료일 캘린더</button>` : ''}
      ${['sold', 'expired'].includes(orig.status) ? '<button type="button" class="btn ghost" data-act="restore">보유로 되돌리기</button>' : ''}
    </div>` : ''}
    <p class="form-hint" aria-live="polite"></p>`;
  sheet.foot.hidden = false;
  sheet.foot.innerHTML = `<button type="button" class="btn primary block big" id="t-save">${orig ? '저장' : '추가'}</button>`;
  face = bindNumber(sheet.body.querySelector('#t-face'));

  function read() {
    const b = sheet.body;
    f.name = b.querySelector('#t-name').value.trim();
    f.faceValue = face.get();
    f.acquiredAt = b.querySelector('#t-acq').value || null;
    f.expiresAt = b.querySelector('#t-exp').value || null;
    f.memo = b.querySelector('#t-memo').value.trim();
  }
  const snap = () => { read(); return JSON.stringify(f); };
  initial = snap();
  const done = (msg) => { sheet.close(); toast(msg); actions.refresh(); refreshTickets(); };

  sheet.foot.querySelector('#t-save').addEventListener('click', async () => {
    read();
    const hint = sheet.body.querySelector('.form-hint');
    if (!f.name) { hint.textContent = '이름을 입력해 주세요'; return; }
    if (!(f.faceValue > 0)) { hint.textContent = '액면가를 입력해 주세요'; return; }
    if ((f.acquiredAt && !isValidDateStr(f.acquiredAt)) || (f.expiresAt && !isValidDateStr(f.expiresAt))) { hint.textContent = '날짜를 확인해 주세요'; return; }
    await saveTicket(f);
    done(orig ? '저장했어요' : '티켓을 추가했어요');
  });
  sheet.body.querySelectorAll('[data-open-session]').forEach((b) => b.addEventListener('click', async () => {
    const { openSessionDetail } = await import('./session-detail.js');
    openSessionDetail(b.dataset.openSession);
  }));
  const act = (name, fn) => sheet.body.querySelector(`[data-act="${name}"]`)?.addEventListener('click', fn);
  act('sell', async () => {
    const v = await promptDialog({ title: '판매 금액', value: String(orig.faceValue), placeholder: '받은 금액', confirmText: '판매 처리' });
    if (v == null) return;
    const amt = parseNum(v);
    if (!(amt >= 0) || Number.isNaN(amt)) { toast('금액을 확인해 주세요'); return; }
    read();
    await saveTicket({ ...f, status: 'sold', soldAmount: Math.round(amt), soldAt: todayStr() });
    done(`판매 처리했어요 (${won(amt)})`);
  });
  act('expire', async () => {
    if (!await confirmDialog({ title: '만료 처리할까요?', message: `액면가 ${won(orig.faceValue)}만큼 뱅크롤에서 빠져요.`, confirmText: '만료 처리', danger: true })) return;
    read();
    await saveTicket({ ...f, status: 'expired' });
    done('만료 처리했어요');
  });
  act('restore', async () => {
    read();
    await saveTicket({ ...f, status: 'held', soldAmount: null, soldAt: null });
    done('보유로 되돌렸어요');
  });
  act('cal', () => openCalendarFor('ticket', id));
  sheet.el.querySelector('[data-del]')?.addEventListener('click', async () => {
    const usedS = orig.usedSessionId ? sessionById(orig.usedSessionId) : null;
    const fromS = orig.sourceSessionId ? sessionById(orig.sourceSessionId) : null;
    const msg = [
      usedS ? `'${usedS.name}'은(는) 현금 참가로 바뀌어요.` : '',
      fromS ? `'${fromS.name}'의 획득 티켓에서도 빠져서 그 대회 손익이 줄어요.` : '',
      '되돌릴 수 없어요.',
    ].filter(Boolean).join(' ');
    if (!await confirmDialog({ title: '티켓을 삭제할까요?', message: msg, confirmText: '삭제', danger: true })) return;
    await deleteTicket(id);
    done('삭제했어요');
  });
}
