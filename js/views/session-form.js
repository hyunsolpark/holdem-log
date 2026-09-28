// 대회 추가·편집 (결과 입력 포함)
import {
  data, sessionById, ticketById, ticketsWonBy, activeVenues, addVenue, saveSession, actions, venueById,
} from '../store.js';
import { openSheet, bindNumber, dialog, toast, icon, ICONS, autosize } from '../ui.js';
import { esc, uuid, todayStr, isValidDateStr, won, gm, num, KIND, SESSION_STATUS, dateLabel } from '../utils.js';
import { venueRate } from '../money.js';
import { segmented } from './common.js';

export function openSessionForm(id = null, { status: presetStatus, date: presetDate, focusResult = false, prefill = null } = {}) {
  const orig = id ? sessionById(id) : null;
  const base = orig ?? prefill; // 복제 등록 시 대회 정보만 가져옴
  const today = todayStr();
  const date0 = orig?.date ?? presetDate ?? today;
  const f = {
    date: date0,
    startTime: base?.startTime ?? '',
    endTime: base?.endTime ?? '',
    venueId: base?.venueId ?? null,
    name: base?.name ?? '',
    kind: base?.kind ?? 'mtt',
    buyIn: base?.buyIn ?? null,
    entryTicketId: orig?.entryTicketId ?? null,
    reentries: orig?.reentries ?? 0,
    status: presetStatus ?? orig?.status ?? (date0 >= today ? 'planned' : 'done'),
    place: orig?.place ?? null,
    entrants: orig?.entrants ?? null,
    prize: orig?.prize ?? null,
    memo: orig?.memo ?? '',
    gm: orig ? !!orig.gm : prefill ? !!prefill.gm : !!data.settings.lastSessionGm,
    won: orig ? ticketsWonBy(orig.id).map((t) => ({ id: t.id, name: t.name, faceValue: t.faceValue, expiresAt: t.expiresAt ?? '', status: t.status })) : [],
  };
  let statusTouched = !!orig || !!presetStatus;
  let initial = '';
  let nums = {};

  const sheet = openSheet({
    title: orig ? (presetStatus === 'done' && orig.status === 'planned' ? '결과 입력' : '대회 편집') : '대회 추가',
    isDirty: () => snap() !== initial,
  });

  const gmVenueList = () => activeVenues().filter((v) => v.gameMoney);
  /** 구분(게임머니 / 현금·티켓)에 맞는 기본 플랫폼 */
  const defaultVenue = (gmMode) => {
    const list = gmMode ? gmVenueList() : activeVenues();
    const lastId = gmMode ? data.settings.lastGmVenueId : data.settings.lastCashVenueId;
    return (list.find((v) => v.id === lastId) ?? (gmMode ? list[0] : list.find((v) => v.type === 'offline') ?? list[0]))?.id ?? null;
  };
  if (!f.venueId) f.venueId = defaultVenue(f.gm);
  const unitOf = () => venueById(f.venueId)?.gmUnit ?? '억';
  const amt = (v) => (f.gm ? String(+v.toFixed(2)) : num(v));
  const availableTickets = () => data.tickets.filter((t) => t.status === 'held' || t.id === f.entryTicketId)
    .sort((a, b) => (a.expiresAt ?? '9') < (b.expiresAt ?? '9') ? -1 : 1);

  function read() {
    const b = sheet.body;
    if (!b.querySelector('#s-date')) return;
    f.date = b.querySelector('#s-date').value;
    f.startTime = b.querySelector('#s-start').value;
    f.endTime = b.querySelector('#s-end').value;
    f.name = b.querySelector('#s-name').value.trim();
    f.buyIn = nums.buyIn.get();
    f.reentries = nums.re.get() ?? 0;
    f.memo = b.querySelector('#s-memo').value;
    if (b.querySelector('#s-place')) {
      f.place = nums.place.get();
      f.entrants = nums.entrants.get();
      f.prize = nums.prize.get();
      f.won = [...b.querySelectorAll('.won-row')].map((row, i) => ({
        ...f.won[i],
        name: row.querySelector('[data-w=name]').value.trim(),
        faceValue: nums.won[i].get(),
        expiresAt: row.querySelector('[data-w=exp]').value,
      }));
    }
  }
  const snap = () => { read(); return JSON.stringify(f); };

  function render() {
    const b = sheet.body;
    const venues = f.gm ? gmVenueList() : activeVenues();
    const cur = f.venueId && !venues.some((v) => v.id === f.venueId) ? data.venues.find((v) => v.id === f.venueId) : null;
    const tickets = availableTickets();
    const done = f.status === 'done';
    b.innerHTML = `
      ${segmented('status', Object.entries(SESSION_STATUS).map(([k, v]) => ({ value: k, label: v.label })), f.status)}

      <div class="row-3">
        <div><label class="field-label" for="s-date">날짜</label><input id="s-date" class="field" type="date" value="${esc(f.date)}"></div>
        <div><label class="field-label" for="s-start">시작</label><input id="s-start" class="field" type="time" value="${esc(f.startTime)}"></div>
        <div><label class="field-label" for="s-end">종료</label><input id="s-end" class="field" type="time" value="${esc(f.endTime)}"></div>
      </div>

      ${gmVenueList().length || f.gm ? `
        <div class="field-label">구분</div>
        ${segmented('mode', [{ value: 'cash', label: '현금·티켓 대회' }, { value: 'gm', label: '게임머니 대회' }], f.gm ? 'gm' : 'cash', { small: true })}` : ''}

      <div class="field-label">${f.gm ? '플랫폼 (게임머니)' : '플랫폼·장소'}</div>
      <div class="chip-row">
        ${[...venues, ...(cur ? [cur] : [])].map((v) => `<button type="button" class="chip small ${v.id === f.venueId ? 'on' : ''}" aria-pressed="${v.id === f.venueId}" data-venue="${esc(v.id)}">${esc(v.name)}</button>`).join('')}
        <button type="button" class="chip small ghost-chip" id="venue-add">＋ 추가</button>
      </div>

      <label class="field-label" for="s-name">대회명 <span class="req">필수</span></label>
      <input id="s-name" class="field" type="text" maxlength="60" value="${esc(f.name)}" placeholder="예: HPT 서울 새틀라이트 30만" autocomplete="off">

      <div class="field-label">종류</div>
      ${segmented('kind', Object.entries(KIND).map(([k, v]) => ({ value: k, label: v })), f.kind, { small: true })}

      ${f.gm ? `<p class="info-line gm-info">${icon(ICONS.cash)}<span><b>게임머니 대회</b> · 바이인과 상금을 ${esc(unitOf())} 단위로 입력하면 ${esc(venueById(f.venueId)?.name ?? '')} 잔고에 반영돼요. 딴 오프라인 티켓은 원화 액면가로 적어 주세요.</span></p>` : `<div class="field-label">참가 방식</div>
      ${segmented('entry', [{ value: 'cash', label: '현금' }, { value: 'ticket', label: `티켓 사용${tickets.length ? ` (${tickets.length})` : ''}` }], f.entryTicketId ? 'ticket' : (f._entry ?? 'cash'), { small: true })}
      ${(f.entryTicketId || f._entry === 'ticket') ? (tickets.length ? `
        <div class="ticket-pick">
          ${tickets.map((t) => `<button type="button" class="ticket-opt ${t.id === f.entryTicketId ? 'on' : ''}" data-tpick="${esc(t.id)}" aria-pressed="${t.id === f.entryTicketId}">
            ${icon(ICONS.ticket)}<span><b>${esc(t.name)}</b><small>${won(t.faceValue)}${t.expiresAt ? ` · ~${dateLabel(t.expiresAt, { short: true })}` : ''}</small></span></button>`).join('')}
        </div>` : '<p class="muted small-line">보유 중인 티켓이 없어요. 새틀라이트 결과에서 티켓을 추가하거나 티켓 목록에서 직접 추가하세요.</p>') : ''}`}

      <div class="row-2">
        <div>
          <label class="field-label" for="s-buyin">바이인 <span class="req">필수</span></label>
          <div class="unit-input"><input id="s-buyin" class="field" type="text" inputmode="${f.gm ? 'decimal' : 'numeric'}" data-decimals="${f.gm ? 2 : 0}" value="${f.buyIn ? amt(f.buyIn) : ''}" placeholder="0"><span>${f.gm ? esc(unitOf()) : '원'}</span></div>
        </div>
        <div>
          <label class="field-label" for="s-re">리엔트리</label>
          <div class="unit-input"><input id="s-re" class="field" type="text" inputmode="numeric" data-decimals="0" value="${f.reentries || ''}" placeholder="0"><span>회</span></div>
        </div>
      </div>
      <p class="muted small-line cost-line"></p>

      ${done ? `
        <hr class="sep">
        <h3 class="sub-title" id="result-sec">결과</h3>
        <div class="row-3">
          <div><label class="field-label" for="s-place">순위</label><div class="unit-input"><input id="s-place" class="field" type="text" inputmode="numeric" data-decimals="0" value="${f.place ?? ''}" placeholder="-"><span>위</span></div></div>
          <div><label class="field-label" for="s-entrants">참가자</label><div class="unit-input"><input id="s-entrants" class="field" type="text" inputmode="numeric" data-decimals="0" value="${f.entrants ?? ''}" placeholder="-"><span>명</span></div></div>
          <div class="span-1"></div>
        </div>
        <label class="field-label" for="s-prize">상금 ${f.gm ? '(게임머니)' : '(현금)'}</label>
        <div class="unit-input"><input id="s-prize" class="field" type="text" inputmode="${f.gm ? 'decimal' : 'numeric'}" data-decimals="${f.gm ? 2 : 0}" value="${f.prize ? amt(f.prize) : ''}" placeholder="0"><span>${f.gm ? esc(unitOf()) : '원'}</span></div>

        <div class="field-label">획득 티켓 ${f.kind === 'satellite' ? '<span class="hint">새틀라이트에서 딴 티켓을 추가하세요</span>' : ''}</div>
        <div class="won-list">
          ${f.won.map((t, i) => `
            <div class="won-row card" data-i="${i}">
              <div class="won-top">
                <input class="field sm" data-w="name" type="text" maxlength="60" value="${esc(t.name)}" placeholder="예: HPT 서울 메인 티켓" ${t.status && t.status !== 'held' ? 'readonly' : ''}>
                <button type="button" class="icon-btn sm danger-text" data-wdel="${i}" aria-label="티켓 빼기" ${t.status && t.status !== 'held' ? 'disabled' : ''}>${icon(ICONS.x)}</button>
              </div>
              <div class="row-2">
                <div class="unit-input"><input class="field sm" data-w="face" type="text" inputmode="numeric" data-decimals="0" value="${t.faceValue ? num(t.faceValue) : ''}" placeholder="액면가"><span>원</span></div>
                <input class="field sm" data-w="exp" type="date" value="${esc(t.expiresAt)}" aria-label="유효기간">
              </div>
              ${t.status && t.status !== 'held' ? '<p class="muted small">이미 사용·처리된 티켓이라 빼거나 이름을 바꿀 수 없어요</p>' : ''}
            </div>`).join('')}
        </div>
        <button type="button" class="btn ghost block sm-btn" id="won-add">${icon(ICONS.ticket)}획득 티켓 추가</button>
        <div class="result-preview"></div>` : ''}

      <label class="field-label" for="s-memo">메모</label>
      <textarea id="s-memo" class="field" rows="2" placeholder="블라인드 구조, 컨디션, 느낀 점…">${esc(f.memo)}</textarea>
      <p class="form-hint" aria-live="polite"></p>`;
    sheet.foot.hidden = false;
    sheet.foot.innerHTML = `<button type="button" class="btn primary block big" id="s-save">${orig ? '저장' : f.status === 'planned' ? '일정 등록' : '기록하기'}</button>`;
    bind();
  }

  function updatePreview() {
    read();
    const b = sheet.body;
    if (f.gm) {
      const u = unitOf();
      const cost = (f.buyIn || 0) * (1 + (f.reentries || 0));
      b.querySelector('.cost-line').textContent = cost ? `총 비용 ${gm(cost, u)}` : '';
      const pv = b.querySelector('.result-preview');
      if (pv) {
        const tv = f.won.reduce((a, w) => a + (w.faceValue || 0), 0);
        const net = (f.prize || 0) - cost;
        const rate = venueRate(f.venueId);
        pv.innerHTML = `<span>게임머니</span><b class="${net > 0 ? 'gain' : net < 0 ? 'loss' : ''}">${gm(net, u, { sign: true })}</b>${tv ? `<span>티켓</span><b class="gain">+${won(tv)}</b>` : ''}<span class="muted">${rate != null ? `원화 환산 손익 ${won(Math.round(net * rate + tv), { sign: true })} (평균 충전 단가 기준)` : '충전 기록이 없어 원화 환산은 아직 안 돼요'}</span>`;
      }
      return;
    }
    const t = f.entryTicketId ? ticketById(f.entryTicketId) : null;
    const first = t ? t.faceValue : (f.buyIn || 0);
    const cost = first + (f.buyIn || 0) * (f.reentries || 0);
    b.querySelector('.cost-line').textContent = cost ? `총 비용 ${won(cost)}${t ? ` (티켓 ${won(t.faceValue)}${f.reentries ? ` + 현금 ${won((f.buyIn || 0) * f.reentries)}` : ''})` : ''}` : '';
    const pv = b.querySelector('.result-preview');
    if (pv) {
      const tv = f.won.reduce((a, w) => a + (w.faceValue || 0), 0);
      const profit = (f.prize || 0) + tv - cost;
      pv.innerHTML = `<span>손익</span><b class="${profit > 0 ? 'gain' : profit < 0 ? 'loss' : ''}">${won(profit, { sign: true })}</b><span class="muted">= 상금 ${won(f.prize || 0)}${tv ? ` + 티켓 ${won(tv)}` : ''} − 비용 ${won(cost)}</span>`;
    }
  }

  function bind() {
    const b = sheet.body;
    const numEl = (sel) => bindNumber(b.querySelector(sel));
    nums = { buyIn: numEl('#s-buyin'), re: numEl('#s-re') };
    if (b.querySelector('#s-place')) {
      Object.assign(nums, { place: numEl('#s-place'), entrants: numEl('#s-entrants'), prize: numEl('#s-prize') });
      nums.won = [...b.querySelectorAll('.won-row [data-w=face]')].map((el) => bindNumber(el));
    }
    b.querySelectorAll('input').forEach((el) => el.addEventListener('input', updatePreview));
    autosize(b.querySelector('#s-memo'));

    b.querySelectorAll('[data-status]').forEach((el) => el.addEventListener('click', () => {
      read(); f.status = el.dataset.status; statusTouched = true; render();
      if (f.status === 'done') sheet.body.querySelector('#result-sec')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }));
    b.querySelector('#s-date').addEventListener('change', () => {
      if (statusTouched) return;
      read();
      const next = f.date >= todayStr() ? 'planned' : 'done';
      if (next !== f.status) { f.status = next; render(); }
    });
    b.querySelectorAll('[data-venue]').forEach((el) => el.addEventListener('click', () => {
      read();
      f.venueId = el.dataset.venue;
      if (f.gm) { render(); return; } // 단위 표시(억 등) 갱신
      b.querySelectorAll('[data-venue]').forEach((x) => { x.classList.toggle('on', x === el); x.setAttribute('aria-pressed', String(x === el)); });
    }));
    b.querySelector('#venue-add').addEventListener('click', async () => {
      read();
      const r = await dialog({
        title: f.gm ? '게임머니 플랫폼 추가' : '플랫폼·장소 추가',
        input: { placeholder: f.gm ? '예: 한게임' : '예: 강남 ○○홀덤펍', maxlength: 30 },
        html: f.gm ? '' : `<div class="chip-row radio-row">
          <label class="mode-opt compact"><input type="radio" name="vt" value="offline" checked><span><b>오프라인</b></span></label>
          <label class="mode-opt compact"><input type="radio" name="vt" value="online"><span><b>온라인</b></span></label></div>`,
        buttons: [{ label: '취소', value: false }, { label: '추가', value: true, kind: 'primary' }],
      });
      if (!r.button || !r.value) return;
      const exist = activeVenues().find((v) => v.name === r.value);
      const v = exist ?? (f.gm
        ? await addVenue(r.value, 'online', { gameMoney: true, gmUnit: '억' })
        : await addVenue(r.value, r.choice || 'offline'));
      f.venueId = v.id;
      render();
    });
    b.querySelectorAll('[data-mode]').forEach((el) => el.addEventListener('click', () => {
      read();
      const next = el.dataset.mode === 'gm';
      if (next === f.gm) return;
      f.gm = next;
      if (f.gm) {
        f.entryTicketId = null; f._entry = 'cash';
        if (!venueById(f.venueId)?.gameMoney) f.venueId = defaultVenue(true);
      }
      const had = f.buyIn || f.prize;
      f.buyIn = null; f.prize = null; // 단위가 바뀌므로 금액은 다시 입력
      render();
      if (had) toast('단위가 바뀌어서 금액을 다시 입력해 주세요');
      if (f.gm && !gmVenueList().length) toast('설정에서 게임머니 플랫폼을 먼저 지정해 주세요');
    }));
    b.querySelectorAll('[data-kind]').forEach((el) => el.addEventListener('click', () => { read(); f.kind = el.dataset.kind; render(); }));
    b.querySelectorAll('[data-entry]').forEach((el) => el.addEventListener('click', () => {
      read();
      f._entry = el.dataset.entry;
      if (f._entry === 'cash') f.entryTicketId = null;
      render();
    }));
    b.querySelectorAll('[data-tpick]').forEach((el) => el.addEventListener('click', () => {
      read();
      const t = ticketById(el.dataset.tpick);
      const prev = f.entryTicketId ? ticketById(f.entryTicketId) : null;
      f.entryTicketId = t.id;
      f._entry = 'ticket';
      if (!f.buyIn || (prev && f.buyIn === prev.faceValue)) f.buyIn = t.faceValue;
      if (!f.name) f.name = t.name.replace(/\s*티켓$/, '');
      render();
    }));
    b.querySelector('#won-add')?.addEventListener('click', () => {
      read();
      f.won.push({ name: '', faceValue: null, expiresAt: '' });
      render();
      const rows = sheet.body.querySelectorAll('.won-row [data-w=name]');
      rows[rows.length - 1]?.focus();
    });
    b.querySelectorAll('[data-wdel]').forEach((el) => el.addEventListener('click', () => {
      read(); f.won.splice(Number(el.dataset.wdel), 1); render();
    }));
    sheet.foot.querySelector('#s-save').addEventListener('click', save);
    updatePreview();
  }

  async function save() {
    read();
    const hint = sheet.body.querySelector('.form-hint');
    const fail = (msg, sel) => {
      hint.textContent = msg;
      const el = sel && sheet.body.querySelector(sel);
      if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus?.({ preventScroll: true }); }
      else hint.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
    if (!isValidDateStr(f.date)) return fail('날짜를 확인해 주세요', '#s-date');
    if (!f.venueId) return fail('플랫폼·장소를 골라 주세요');
    if (!f.name) return fail('대회명을 입력해 주세요', '#s-name');
    if (f._entry === 'ticket' && !f.entryTicketId) return fail('사용할 티켓을 골라 주세요');
    if (!(f.buyIn > 0)) return fail('바이인을 입력해 주세요', '#s-buyin');
    if (Number.isNaN(f.reentries) || f.reentries < 0) return fail('리엔트리 횟수를 확인해 주세요', '#s-re');
    if (f.endTime && f.startTime && f.endTime <= f.startTime) { /* 자정 넘김 허용 */ }
    if (f.status === 'done') {
      if ([f.place, f.entrants, f.prize].some((v) => Number.isNaN(v))) return fail('결과 숫자를 확인해 주세요');
      if (f.place && f.entrants && f.place > f.entrants) return fail('순위가 참가자 수보다 클 수 없어요', '#s-place');
      for (const [i, w] of f.won.entries()) {
        if (!w.name) return fail(`${i + 1}번째 획득 티켓의 이름을 입력해 주세요`);
        if (!(w.faceValue > 0)) return fail(`'${w.name}' 티켓의 액면가를 입력해 주세요`);
        if (w.expiresAt && !isValidDateStr(w.expiresAt)) return fail(`'${w.name}' 티켓의 유효기간을 확인해 주세요`);
      }
    }
    const row = {
      id: orig?.id ?? uuid(),
      status: f.status, date: f.date, startTime: f.startTime || null, endTime: f.endTime || null,
      venueId: f.venueId, name: f.name, kind: f.kind, gm: f.gm, buyIn: f.buyIn, entryTicketId: f.gm ? null : f.entryTicketId,
      reentries: f.reentries || 0,
      place: f.status === 'done' ? f.place ?? null : orig?.place ?? null,
      entrants: f.status === 'done' ? f.entrants ?? null : orig?.entrants ?? null,
      prize: f.status === 'done' ? f.prize || 0 : orig?.prize || 0,
      memo: f.memo.trim(),
      createdAt: orig?.createdAt,
    };
    try {
      await saveSession(row, { wonTickets: f.won.map(({ id: tid, name, faceValue, expiresAt }) => ({ id: tid, name, faceValue, expiresAt })) });
    } catch (e) {
      return fail(e.message);
    }
    sheet.close();
    if (!orig) {
      const { setSetting } = await import('../store.js');
      await setSetting('lastSessionGm', f.gm);
      await setSetting(f.gm ? 'lastGmVenueId' : 'lastCashVenueId', f.venueId);
    }
    actions.refresh();
    if (row.status === 'planned') {
      const { openCalendarFor } = await import('./sheets.js');
      toast(orig ? '저장했어요' : '일정을 등록했어요', { action: '캘린더에 추가', onAction: () => openCalendarFor('session', row.id) });
    } else {
      toast(orig ? '저장했어요' : '기록했어요');
    }
  }

  render();
  initial = snap();
  if (focusResult) setTimeout(() => sheet.body.querySelector('#result-sec')?.scrollIntoView({ block: 'start' }), 240);
  else if (!orig) sheet.body.querySelector('#s-name')?.focus({ preventScroll: true });
}
