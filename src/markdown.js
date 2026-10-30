// Small GFM-style renderer. Everything is escaped first, so output is safe for innerHTML.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => s.replace(/[&<>"']/g, (c) => ESC[c]);

function inline(raw) {
  const held = [];
  const hold = (html) => `\0${held.push(html) - 1}\0`;
  let s = esc(raw.replaceAll('\0', ''));

  s = s.replace(/`([^`]+)`/g, (_, code) => hold(`<code>${code}</code>`));
  s = s.replace(/\[([^\]]+)\]\((\S+?)\)/g, (m, text, url) =>
    /^(https?:\/\/|mailto:)/i.test(url) ? hold(`<a href="${url}" target="_blank" rel="noopener">${text}</a>`) : text,
  );
  s = s.replace(/https?:\/\/[^\s<]+[^\s<.,:;!?)]/g, (url) => hold(`<a href="${url}" target="_blank" rel="noopener">${url}</a>`));
  s = s
    .replace(/\*\*(?=\S)(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(?=\S)(.+?)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?=\S)(.+?)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_(?=\S)(.+?)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~(?=\S)(.+?)~~/g, '<del>$1</del>');

  // Link text can hold a code span, so restore until no placeholder is left.
  while (/\0\d+\0/.test(s)) s = s.replace(/\0(\d+)\0/g, (_, i) => held[i]);
  return s;
}

const isFence = (l) => /^\s*```/.test(l);
const isHeading = (l) => /^#{1,6}\s+\S/.test(l);
const isRule = (l) => /^\s*([-*_])(\s*\1){2,}\s*$/.test(l);
const isQuote = (l) => /^\s*>/.test(l);
const listMatch = (l) => /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(l);
const isTableRow = (l) => /\|/.test(l);
const isTableRule = (l) => /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(l) && l.includes('-');
const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

function list(lines, start) {
  const first = listMatch(lines[start]);
  const indent = first[1].length;
  const ordered = /\d/.test(first[2]);
  let i = start;
  let html = '';

  while (i < lines.length) {
    const m = listMatch(lines[i]);
    if (!m || m[1].length < indent || /\d/.test(m[2]) !== ordered) break;
    const task = /^\[([ xX])\]\s+(.*)$/.exec(m[3]);
    const body = task
      ? `<input type="checkbox" disabled${task[1] === ' ' ? '' : ' checked'}> ${inline(task[2])}`
      : inline(m[3]);
    i++;
    let nested = '';
    if (i < lines.length) {
      const next = listMatch(lines[i]);
      if (next && next[1].length > indent) {
        const sub = list(lines, i);
        nested = sub.html;
        i = sub.next;
      }
    }
    html += `<li${task ? ' class="task"' : ''}>${body}${nested}</li>`;
  }
  const tag = ordered ? 'ol' : 'ul';
  return { html: `<${tag}>${html}</${tag}>`, next: i };
}

function table(lines, start) {
  const align = cells(lines[start + 1]).map((c) =>
    c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : '',
  );
  const row = (line, tag) =>
    `<tr>${cells(line)
      .map((c, i) => `<${tag}${align[i] ? ` style="text-align:${align[i]}"` : ''}>${inline(c)}</${tag}>`)
      .join('')}</tr>`;
  let i = start + 2;
  let body = '';
  while (i < lines.length && lines[i].trim() && isTableRow(lines[i])) body += row(lines[i++], 'td');
  return { html: `<table><thead>${row(lines[start], 'th')}</thead><tbody>${body}</tbody></table>`, next: i };
}

export function renderMarkdown(src) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  let html = '';
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
    } else if (isFence(line)) {
      const code = [];
      i++;
      while (i < lines.length && !isFence(lines[i])) code.push(lines[i++]);
      i++;
      html += `<pre><code>${esc(code.join('\n'))}</code></pre>`;
    } else if (isHeading(line)) {
      const [, hashes, text] = /^(#{1,6})\s+(.*?)\s*#*$/.exec(line);
      html += `<h${hashes.length}>${inline(text)}</h${hashes.length}>`;
      i++;
    } else if (isRule(line)) {
      html += '<hr>';
      i++;
    } else if (isQuote(line)) {
      const quote = [];
      while (i < lines.length && isQuote(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''));
      html += `<blockquote>${renderMarkdown(quote.join('\n'))}</blockquote>`;
    } else if (listMatch(line)) {
      const out = list(lines, i);
      html += out.html;
      i = out.next;
    } else if (isTableRow(line) && i + 1 < lines.length && isTableRule(lines[i + 1])) {
      const out = table(lines, i);
      html += out.html;
      i = out.next;
    } else {
      const para = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !isFence(lines[i]) &&
        !isHeading(lines[i]) &&
        !isRule(lines[i]) &&
        !isQuote(lines[i]) &&
        !listMatch(lines[i])
      ) {
        para.push(inline(lines[i++]));
      }
      html += `<p>${para.join('<br>')}</p>`;
    }
  }
  return html;
}
