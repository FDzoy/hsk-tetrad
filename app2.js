(function () {
'use strict';
const A = window.APP, { $, $$, esc, inl, cells, pyT, ruT, sayBtn, TTS } = A;
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const uniq = a => [...new Set(a)];
const PUNCT = /^[，。？！、：；…“”"'.,!?]+$/;

/* exercise catalogue: code -> meta (shared with homework) */
const EX = {
  f: { t: 'Карточки слов', d: 'Иероглиф → пиньинь и перевод. Отмечайте, что уже знаете.', k: '卡' },
  v: { t: 'Значение слова', d: 'Выберите перевод иероглифа.', k: '义' },
  p: { t: 'Чтение и тоны', d: 'Выберите правильный пиньинь с тонами.', k: '音' },
  h: { t: 'Иероглиф по переводу', d: 'Найдите слово по русскому значению.', k: '字' },
  g: { t: 'Грамматика', d: 'Вставьте пропущенное слово в предложение.', k: '法' },
  b: { t: 'Собери предложение', d: 'Расставьте слова в правильном порядке.', k: '句' },
  t: { t: 'Перевод на китайский', d: 'Переведите фразу и сверьтесь с ответом.', k: '译' },
  x: { t: 'Прописи', d: 'Пропишите иероглифы урока по клеткам.', k: '写' },
  s: { t: 'Говорение', d: 'Подготовьте устные ответы на вопросы урока.', k: '说' }
};
A.EX = EX;

/* ---------- tone variants for pinyin distractors ---------- */
const TONES = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', 'ü': 'ǖǘǚǜ' };
const BASE = {}; Object.entries(TONES).forEach(([b, s]) => [...s].forEach((c, i) => { BASE[c] = [b, i]; }));
function toneVariants(p) {
  const chars = [...p], pos = chars.map((c, i) => BASE[c] ? i : -1).filter(i => i >= 0), out = new Set();
  for (let k = 0; k < 12 && out.size < 4 && pos.length; k++) {
    const c = chars.slice(), n = Math.random() < .5 || pos.length === 1 ? 1 : 2;
    shuffle(pos).slice(0, n).forEach(i => { const [b, t] = BASE[c[i]]; let nt; do { nt = Math.floor(Math.random() * 4); } while (nt === t); c[i] = TONES[b][nt]; });
    const s = c.join(''); if (s !== p) out.add(s);
  }
  return [...out];
}

/* ---------- generators ---------- */
function pool(L) { return A.lessonsOf(L.level).flatMap(x => x.words); }
function distract(correct, own, wide, n = 3) {
  const a = shuffle(uniq(own.filter(x => x && x !== correct)));
  const b = shuffle(uniq(wide.filter(x => x && x !== correct && !a.includes(x))));
  return a.concat(b).slice(0, n);
}
function gen(code, L) {
  const W = shuffle(L.words).slice(0, 12), P = pool(L);
  if (code === 'v') return W.map(w => ({ type: 'mcq', q: 'Что значит это слово?', big: w.h, say: w.h, a: w.ru, opts: shuffle([w.ru, ...distract(w.ru, L.words.map(x => x.ru), P.map(x => x.ru))]), sub: w.p }));
  if (code === 'p') return W.map(w => { const tv = toneVariants(w.p).slice(0, 2); const o = uniq([w.p, ...tv, ...distract(w.p, L.words.map(x => x.p), P.map(x => x.p))]).slice(0, 4); return { type: 'mcq', q: 'Как читается это слово?', big: w.h, a: w.p, opts: shuffle(o), cls: 'pyopt', sub: w.ru, sayAfter: w.h }; });
  if (code === 'h') return W.map(w => ({ type: 'mcq', q: 'Как по-китайски:', text: w.ru, a: w.h, opts: shuffle([w.h, ...distract(w.h, L.words.map(x => x.h), P.map(x => x.h))]), cls: 'zhopt', sub: w.p, sayAfter: w.h }));
  if (code === 'g') return shuffle(L.quiz).map(q => ({ type: 'mcq', q: 'Вставьте пропущенное:', sent: q.s, a: q.a, opts: shuffle([q.a, ...q.w]), cls: 'zhopt', hint: q.hint }));
  const exs = L.gram.flatMap(g => g.ex);
  if (code === 'b') return shuffle(exs.filter(e => e.tok.filter(t => !PUNCT.test(t)).length >= 3 && e.tok.length <= 11)).slice(0, 8).map(e => ({ type: 'build', e }));
  if (code === 't') return shuffle(exs).slice(0, 8).map(e => ({ type: 'reveal', e }));
  if (code === 'f') return shuffle(L.words).map(w => ({ type: 'card', w }));
  return [];
}
A.gen = gen;
function available(code, L) {
  if (code === 'g') return L.quiz.length; if (code === 'b') return gen('b', L).length; if (code === 't') return L.gram.reduce((a, g) => a + g.ex.length, 0);
  if (code === 'x') return L.words.length; if (code === 's') return L.talk.length; return L.words.length >= 2 ? L.words.length : 0;
}
A.available = available;

/* ---------- runner ---------- */
function grade(p) { return p === 1 ? ['优', 'Отлично!'] : p >= .8 ? ['良', 'Хорошо'] : p >= .6 ? ['中', 'Неплохо, но есть ошибки'] : ['加油', 'Нужно повторить']; }
function runEx(el, code, L, onDone, onBack) {
  let items = gen(code, L);
  if (!items.length) { el.innerHTML = '<div class="empty"><b>Для этого упражнения в уроке мало материала</b></div>'; return; }
  let i = 0, score = 0; const total = items.length, mistakes = [];
  const again = []; let firstPass = true;
  const top = () => '<div class="run-top"><button class="btn sm" data-back>← ' + (onBack ? 'Назад' : 'Все упражнения') + '</button><div class="bar"><i style="width:' + Math.round(i / items.length * 100) + '%"></i></div><span class="run-cnt">' + Math.min(i + 1, items.length) + ' / ' + items.length + '</span></div>';
  const finish = () => {
    const pct = total ? score / total : 0, [g, w] = grade(pct);
    el.innerHTML = '<div class="runner"><div class="result"><div class="eyebrow">' + esc(EX[code].t) + ' · ' + esc(A.nameOf(L)) + '</div><div class="stamp"' + (g.length > 1 ? ' style="font-size:34px"' : '') + '>' + g + '</div><div class="score">' + score + ' из ' + total + '</div><div>' + w + '</div>' +
      (mistakes.length ? '<div class="mist"><b>Повторить:</b><ul>' + mistakes.map(m => '<li>' + inl(m) + '</li>').join('') + '</ul></div>' : '') +
      '<div class="run-nav" style="justify-content:center"><button class="btn" data-again>Ещё раз</button><button class="btn pri" data-back>' + (onBack ? 'Готово' : 'К упражнениям') + '</button></div></div></div>';
    el.querySelector('[data-again]').onclick = () => runEx(el, code, L, onDone, onBack);
    el.querySelector('[data-back]').onclick = () => onBack ? onBack() : A.practice(L, el);
    if (A.onResult) A.onResult(L, code, score, total);
    if (onDone) onDone(score, total);
  };
  const next = () => { i++; if (i >= items.length) { if (code === 'f' && again.length && firstPass) { firstPass = false; items = items.concat(again.splice(0)); } if (i >= items.length) return finish(); } show(); };
  const bindTop = () => { el.querySelector('[data-back]').onclick = () => onBack ? onBack() : A.practice(L, el); };
  function show() {
    const it = items[i];
    if (it.type === 'mcq') {
      el.innerHTML = '<div class="runner">' + top() + '<div class="q">' + esc(it.q) + '</div>' +
        (it.big ? '<div class="q-big">' + esc(it.big) + (it.say ? ' ' + sayBtn(it.say) : '') + '</div>' : '') +
        (it.text ? '<div class="q-sent" style="font-family:var(--ui);font-weight:600">' + inl(it.text) + '</div>' : '') +
        (it.sent ? '<div class="q-sent">' + esc(it.sent).replace('___', '<span class="blank" id="blank">&nbsp;</span>') + '</div>' : '') +
        (it.hint ? '<div class="q-hint">' + ruT(it.hint) + '</div>' : '') +
        '<div class="opts">' + it.opts.map((o, k) => '<button class="opt ' + (it.cls || '') + '" data-k="' + k + '">' + esc(o) + '</button>').join('') + '</div><div class="fb" id="fb"></div><div class="run-nav"><button class="btn pri" id="nx" hidden>Дальше →</button></div></div>';
      bindTop();
      $$('.opt', el).forEach(b => b.onclick = () => {
        const v = it.opts[+b.dataset.k], ok = v === it.a;
        $$('.opt', el).forEach(x => { x.disabled = true; if (it.opts[+x.dataset.k] === it.a) x.classList.add('ok'); });
        if (!ok) { b.classList.add('bad'); mistakes.push((it.big || it.text || it.sent.replace('___', it.a)) + ' — ' + it.a); } else score++;
        const bl = $('#blank', el); if (bl) bl.textContent = it.a;
        $('#fb', el).className = 'fb ' + (ok ? 'ok' : 'bad');
        $('#fb', el).innerHTML = (ok ? 'Верно' : 'Правильно: ' + inl(it.a)) + (it.sub ? ' <span class="py" style="font-weight:400">· ' + inl(it.sub) + '</span>' : '');
        if (it.sayAfter) TTS.say(it.sayAfter); else if (it.sent && ok) TTS.say(it.sent.replace('___', it.a));
        const nx = $('#nx', el); nx.hidden = false; nx.focus(); nx.onclick = next;
      });
    } else if (it.type === 'build') {
      const e = it.e, words = e.tok.filter(t => !PUNCT.test(t)), tail = e.tok.filter(t => PUNCT.test(t)).join('');
      let src = shuffle(words.map((t, k) => ({ t, k })));
      if (src.length > 1 && src.every((x, k) => x.k === k)) src.reverse();
      let picked = [];
      el.innerHTML = '<div class="runner">' + top() + '<div class="q">Соберите предложение:</div><div class="q-sent" style="font-family:var(--ui);font-weight:600;font-size:1.25rem">' + inl(e.r) + '</div><div class="tokens" id="dst" aria-label="Ваш ответ"></div><div class="tokens src" id="src"></div><div class="fb" id="fb"></div><div class="run-nav"><button class="btn" id="clr">Сбросить</button><button class="btn pri" id="chk">Проверить</button></div></div>';
      bindTop();
      const draw = () => {
        $('#src', el).innerHTML = src.map((x, k) => '<button class="tok' + (picked.includes(k) ? ' used' : '') + '" data-s="' + k + '">' + esc(x.t) + '</button>').join('');
        $('#dst', el).innerHTML = picked.map((k, j) => '<button class="tok" data-d="' + j + '">' + esc(src[k].t) + '</button>').join('') + (picked.length === src.length && tail ? '<span class="tok" style="border:0;box-shadow:none;background:none">' + esc(tail) + '</span>' : '');
        $$('[data-s]', el).forEach(b => b.onclick = () => { const k = +b.dataset.s; if (!picked.includes(k)) { picked.push(k); draw(); } });
        $$('[data-d]', el).forEach(b => b.onclick = () => { picked.splice(+b.dataset.d, 1); draw(); });
      };
      draw();
      $('#clr', el).onclick = () => { picked = []; draw(); };
      $('#chk', el).onclick = () => {
        if (picked.length < src.length) { $('#fb', el).className = 'fb bad'; $('#fb', el).textContent = 'Используйте все слова'; return; }
        const ans = picked.map(k => src[k].t).join(''), ok = ans === words.join('');
        if (ok) score++; else mistakes.push(e.z);
        $('#fb', el).className = 'fb ' + (ok ? 'ok' : 'bad');
        $('#fb', el).innerHTML = (ok ? 'Верно' : 'Образец:') + '<div class="answer"><div class="ex-zh">' + esc(e.z) + ' ' + sayBtn(e.z) + '</div><div>' + pyT(e.p, 'ex-py') + '</div></div>' +
          (!ok ? '<button class="btn sm" id="acc" style="margin-top:8px">Мой вариант тоже верный — засчитать</button>' : '');
        TTS.say(e.z);
        const acc = $('#acc', el); if (acc) acc.onclick = () => { score++; mistakes.pop(); acc.remove(); };
        $('#chk', el).textContent = 'Дальше →'; $('#chk', el).onclick = next; $('#clr', el).hidden = true;
      };
    } else if (it.type === 'reveal') {
      const e = it.e;
      el.innerHTML = '<div class="runner">' + top() + '<div class="q">Переведите на китайский (устно или письменно):</div><div class="q-sent" style="font-family:var(--ui);font-weight:600;font-size:1.3rem">' + inl(e.r) + '</div><div id="ans"></div><div class="run-nav"><button class="btn pri" id="show">Показать ответ</button></div></div>';
      bindTop();
      $('#show', el).onclick = () => {
        $('#ans', el).innerHTML = '<div class="answer"><div class="ex-zh">' + esc(e.z) + ' ' + sayBtn(e.z) + '</div><div>' + pyT(e.p, 'ex-py') + '</div></div>';
        TTS.say(e.z);
        $('.run-nav', el).innerHTML = '<button class="btn red" id="no">Ошибся</button><button class="btn pri" id="yes">Перевёл верно</button>';
        $('#yes', el).onclick = () => { score++; next(); };
        $('#no', el).onclick = () => { mistakes.push(e.z + ' — ' + e.r); next(); };
      };
    } else if (it.type === 'card') {
      const w = it.w; let flipped = false;
      el.innerHTML = '<div class="runner">' + top() + '<div class="card-fc" id="fc" tabindex="0" role="button" aria-label="Перевернуть карточку">' + cells(w.h) + '</div><p class="note" style="text-align:center">Нажмите на карточку или пробел, чтобы перевернуть</p><div class="run-nav" style="justify-content:center"><button class="btn red" id="no">Ещё повторю</button><button class="btn pri" id="yes">Знаю</button></div></div>';
      bindTop();
      const fc = $('#fc', el);
      const flip = () => { flipped = !flipped; fc.innerHTML = flipped ? '<div class="fc-back">' + cells(w.h) + '<div class="py">' + esc(w.p) + '</div><div class="ru">' + inl(w.ru) + '</div><div>' + sayBtn(w.h) + '</div></div>' : cells(w.h); if (flipped) TTS.say(w.h); };
      fc.onclick = e => { if (!e.target.closest('[data-say]')) flip(); };
      fc.onkeydown = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } };
      $('#yes', el).onclick = () => { if (firstPass || i < total) score++; next(); };
      $('#no', el).onclick = () => { if (i < total) { mistakes.push(w.h + ' ' + w.p + ' — ' + w.ru); again.push(it); } next(); };
      fc.focus();
    }
  }
  show();
}
A.runEx = runEx;

A.practice = function (L, el, code) {
  if (code && EX[code]) return runEx(el, code, L);
  const list = ['f', 'v', 'p', 'h', 'g', 'b', 't'];
  el.innerHTML = '<div class="pane-bar"><span class="grow">Упражнения собраны из слов и примеров этого урока. Каждый запуск перемешивает вопросы.</span></div><div class="ex-grid">' +
    list.map(c => { const n = available(c, L); return '<button class="ex-card" data-ex="' + c + '"' + (n ? '' : ' disabled style="opacity:.5"') + '><span class="k">' + EX[c].k + '</span><b>' + EX[c].t + '</b><small>' + EX[c].d + '</small><span class="cnt">' + (n ? (c === 'f' || c === 'v' || c === 'p' || c === 'h' ? Math.min(n, c === 'f' ? n : 12) + ' вопросов' : Math.min(n, c === 'g' ? n : 8) + ' заданий') : 'нет материала') + '</span>' + (A.bestFor && A.bestFor(L, c) != null ? '<span class="best">Лучший результат: ' + A.bestFor(L, c) + '%</span>' : '') + '</button>'; }).join('') + '</div>';
  $$('[data-ex]', el).forEach(b => b.onclick = () => runEx(el, b.dataset.ex, L));
};

/* ---------- writing (прописи) ---------- */
function charsOf(L) { return uniq([...L.words.map(w => w.h).join('')].filter(c => /\p{Script=Han}/u.test(c))); }
A.charsOf = charsOf;
A.writing = function (L, el, ch, onDone) {
  const chars = charsOf(L);
  if (!chars.length) { el.innerHTML = '<div class="empty"><b>В этом уроке нет иероглифов для прописей</b></div>'; return; }
  let cur = (A.writeChar && chars.includes([...A.writeChar][0])) ? [...A.writeChar][0] : (ch && chars.includes(ch) ? ch : chars[0]); A.writeChar = null;
  let guide = true;
  el.innerHTML = '<div class="write"><div><div class="canvas-box" id="cbox"><canvas id="cv-bg"></canvas><canvas id="cv-ink" aria-label="Поле для письма"></canvas></div>' +
    '<div class="run-nav" style="justify-content:flex-start"><button class="btn" id="w-clear">Стереть</button><button class="btn" id="w-guide" aria-pressed="true">Контур: вкл</button>' + sayBtn(cur) + '<button class="btn" id="w-prev">←</button><button class="btn" id="w-next">→</button>' + (onDone ? '<button class="btn pri" id="w-done">Прописи готовы</button>' : '') + '</div></div>' +
    '<div><div class="eyebrow" style="margin-bottom:8px">Иероглифы урока · ' + chars.length + '</div><div class="charpick" id="cp"></div><div id="w-info" style="margin-top:16px"></div><p class="note">Пишите мышью, пальцем или стилусом. Обведите контур, затем выключите его и напишите по памяти.</p></div></div>';
  const bg = $('#cv-bg', el), ink = $('#cv-ink', el), box = $('#cbox', el);
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  let dpr = 1, size = 0;
  function sizeUp() { size = box.clientWidth; dpr = window.devicePixelRatio || 1; [bg, ink].forEach(c => { c.width = size * dpr; c.height = size * dpr; c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0); }); drawBg(); }
  function drawBg() {
    const c = bg.getContext('2d'), s = size; c.clearRect(0, 0, s, s);
    c.fillStyle = css('--sheet'); c.fillRect(0, 0, s, s);
    c.strokeStyle = css('--grid'); c.lineWidth = 2; c.setLineDash([]); c.strokeRect(1, 1, s - 2, s - 2);
    c.strokeStyle = css('--grid'); c.lineWidth = 1; c.setLineDash([6, 6]);
    [[s / 2, 0, s / 2, s], [0, s / 2, s, s / 2], [0, 0, s, s], [s, 0, 0, s]].forEach(([a, b, x, y]) => { c.beginPath(); c.moveTo(a, b); c.lineTo(x, y); c.stroke(); });
    c.setLineDash([]);
    if (guide) { c.fillStyle = css('--grid'); c.globalAlpha = .55; c.font = '400 ' + Math.round(s * .78) + 'px "Noto Serif SC","KaiTi","SimSun",serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(cur, s / 2, s / 2 + s * .03); c.globalAlpha = 1; }
  }
  function clearInk() { ink.getContext('2d').clearRect(0, 0, size, size); }
  let drawing = false, last = null;
  ink.onpointerdown = e => { drawing = true; ink.setPointerCapture(e.pointerId); const r = ink.getBoundingClientRect(); last = [e.clientX - r.left, e.clientY - r.top]; dot(last); };
  ink.onpointermove = e => { if (!drawing) return; const r = ink.getBoundingClientRect(), p = [e.clientX - r.left, e.clientY - r.top]; line(last, p, e.pressure); last = p; };
  ink.onpointerup = ink.onpointercancel = () => { drawing = false; };
  function dot(p) { const c = ink.getContext('2d'); c.fillStyle = css('--ink'); c.beginPath(); c.arc(p[0], p[1], size * .018, 0, 7); c.fill(); }
  function line(a, b, pr) { const c = ink.getContext('2d'); c.strokeStyle = css('--ink'); c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = size * .036 * (pr && pr !== .5 ? .6 + pr * .8 : 1); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
  function info() {
    const ws = L.words.filter(w => w.h.includes(cur));
    $('#w-info', el).innerHTML = '<div class="eyebrow" style="margin-bottom:6px">Слова с иероглифом ' + esc(cur) + '</div>' + ws.map(w => '<div style="margin:4px 0"><span class="zh" style="font-size:1.25rem">' + esc(w.h) + '</span> ' + pyT(w.p) + ' — ' + ruT(w.ru) + '</div>').join('');
    $('#cp', el).innerHTML = chars.map(c => '<button data-c="' + esc(c) + '" aria-pressed="' + (c === cur) + '">' + esc(c) + '</button>').join('');
    $$('#cp [data-c]', el).forEach(b => b.onclick = () => go(b.dataset.c));
    const sb = el.querySelector('.run-nav [data-say]'); if (sb) sb.dataset.say = cur;
  }
  function go(c) { cur = c; clearInk(); drawBg(); info(); }
  $('#w-clear', el).onclick = clearInk;
  $('#w-guide', el).onclick = e => { guide = !guide; e.currentTarget.textContent = 'Контур: ' + (guide ? 'вкл' : 'выкл'); e.currentTarget.setAttribute('aria-pressed', guide); drawBg(); };
  $('#w-prev', el).onclick = () => go(chars[(chars.indexOf(cur) - 1 + chars.length) % chars.length]);
  $('#w-next', el).onclick = () => go(chars[(chars.indexOf(cur) + 1) % chars.length]);
  if (onDone) $('#w-done', el).onclick = onDone;
  info(); sizeUp();
  if (document.fonts && document.fonts.load) document.fonts.load('400 100px "Noto Serif SC"', chars.join('')).then(drawBg).catch(() => {});
  if (window.ResizeObserver) new ResizeObserver(() => { if (box.isConnected && box.clientWidth !== size) { sizeUp(); clearInk(); } }).observe(box);
};
})();
