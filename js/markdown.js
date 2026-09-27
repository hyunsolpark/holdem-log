// 안전한 간단 마크다운 렌더러
// 원문을 먼저 이스케이프한 뒤, 허용한 문법만 태그로 바꾼다. (HTML·스크립트는 절대 통과하지 않음)
import { esc } from './utils.js';

function inline(text) {
  // text는 이미 이스케이프된 상태
  const codes = [];
  let s = text.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(`<code>${c}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  const links = [];
  // [글](http://...)
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => {
    links.push(`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`);
    return `\u0001${links.length - 1}\u0001`;
  });
  // 맨 URL
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)'"])/g, (_, pre, url) => {
    links.push(`<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
    return `${pre}\u0001${links.length - 1}\u0001`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  s = s.replace(/\u0001(\d+)\u0001/g, (_, i) => links[i]);
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[i]);
  return s;
}

export function renderMarkdown(src) {
  const lines = esc(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [];
  let list = null; // { type: 'ul'|'ol', items: [] }
  let quote = [];

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.type}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.type}>`);
    list = null;
  };
  const flushQuote = () => {
    if (quote.length) out.push(`<blockquote>${quote.map(inline).join('<br>')}</blockquote>`);
    quote = [];
  };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };

  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flushAll(); continue; }
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      flushAll();
      const lv = m[1].length + 2; // #→h3, ##→h4, ###→h5 (화면 제목과 겹치지 않게)
      out.push(`<h${lv}>${inline(m[2])}</h${lv}>`);
      continue;
    }
    if ((m = line.match(/^\s*&gt;\s?(.*)$/))) {
      flushPara(); flushList();
      quote.push(m[1]);
      continue;
    }
    if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) {
      flushPara(); flushQuote();
      if (!list || list.type !== 'ul') { flushList(); list = { type: 'ul', items: [] }; }
      list.items.push(m[1]);
      continue;
    }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushPara(); flushQuote();
      if (!list || list.type !== 'ol') { flushList(); list = { type: 'ol', items: [] }; }
      list.items.push(m[1]);
      continue;
    }
    flushList(); flushQuote();
    para.push(line);
  }
  flushAll();
  return out.join('');
}

/** 한 줄 미리보기용: 마크다운 기호 제거 */
export function plainPreview(src, max = 80) {
  const s = String(src ?? '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*`_]/g, '')
    .replace(/^\s*[-+]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
