(function () {
'use strict';
const A = window.APP, { $, $$, esc, toast } = A, Acc = A.Acc;
const W = 1000, H = 750, LIMIT = 230000;
const COLORS = [['ink', 'Чернила'], ['red', 'Красный'], ['l1', 'Зелёный'], ['l2', 'Синий'], ['l3', 'Фиолетовый'], ['gold', 'Охра']];
const SIZES = [[3, 'Тонкая'], [6, 'Средняя'], [12, 'Толстая']], TXT = { 3: 30, 6: 44, 12: 64 };
const BGS = [['grid', 'Клетка 田'], ['lines', 'Линейки'], ['blank', 'Чистый']];
const ICO = {
  pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7V5h16v2M9 19h6M12 5v14"/></svg>',
  erase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4-4 10-10 7 7-7 7z"/><path d="M22 21H7M5 11l7 7"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>'
};
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const colorOf = k => css('--' + k) || css('--ink');
let S = null;

A.leaveBoard = function () {
  if (!S) return;
  S.unsubs.forEach(u => { try { u(); } catch (e) {} }); if (S.pageUnsub) S.pageUnsub();
  if (S.ro) S.ro.disconnect(); document.removeEventListener('keydown', S.onKey); Acc.off(S.onAcc); S = null;
};

A.boardView = function (el) {
  A.leaveBoard();
  const owner = Acc.isOwner, target = owner ? (A.view.uid || Acc.uid) : Acc.uid, own = target === Acc.uid;
  const canWrite = owner || (own && !Acc.readOnly);
  const title = own ? (owner ? 'Моя доска' : 'Мой холст') : 'Холст: ' + Acc.person(target).name;
  S = { target, owner, canWrite, meta: null, page: null, doc: null, local: {}, gone: new Set(), mine: [], tool: 'pen', color: owner && !own ? 'red' : 'ink', size: 6, unsubs: [], drawing: null, dirty: false, creating: false };
  const metaPath = 'board/' + target, pagePath = id => 'board/' + target + '/pages/' + id;

  let h = '<div class="board">';
  if (!canWrite) h += '<div class="banner"><b>Только просмотр.</b> Чтобы писать на холсте, попросите преподавателя выдать вам доступ «Редактор» в меню «Поделиться».</div>';
  h += '<div class="board-who"><h1>' + esc(title) + '</h1>';
  if (owner) h += '<select id="bd-who" aria-label="Чей холст открыть" style="border:1px solid var(--line);background:var(--sheet);border-radius:10px;padding:7px 10px"><option value="' + esc(Acc.uid) + '"' + (own ? ' selected' : '') + '>Моя доска</option>' + Acc.students.map(s => '<option value="' + esc(s.uid) + '"' + (s.uid === target ? ' selected' : '') + '>' + esc(Acc.person(s.uid).name) + '</option>').join('') + '</select>';
  h += '<span class="note" id="bd-sync"></span></div>';
  h += '<div class="board-bar" role="toolbar" aria-label="Инструменты холста">' +
    [['pen', 'Ручка'], ['text', 'Текст'], ['erase', 'Ластик']].map(([k, t]) => '<button class="tool" data-tool="' + k + '" title="' + t + '" aria-label="' + t + '" aria-pressed="' + (k === 'pen') + '">' + ICO[k] + '</button>').join('') +
    '<span class="vsep"></span>' + COLORS.map(([k, t]) => '<button class="sw" data-color="' + k + '" title="' + t + '" aria-label="' + t + '" aria-pressed="' + (k === S.color) + '" style="background:var(--' + k + ')"></button>').join('') +
    '<span class="vsep"></span>' + SIZES.map(([s, t]) => '<button class="tool" data-size="' + s + '" title="' + t + '" aria-label="' + t + '" aria-pressed="' + (s === S.size) + '"><span style="display:block;width:' + (s + 4) + 'px;height:' + (s + 4) + 'px;border-radius:50%;background:currentColor"></span></button>').join('') +
    '<span class="vsep"></span><button class="tool" id="bd-undo" title="Отменить (Ctrl+Z)" aria-label="Отменить">' + ICO.undo + '</button>' +
    '<select id="bd-bg" class="tool" aria-label="Фон листа">' + BGS.map(([k, t]) => '<option value="' + k + '">' + t + '</option>').join('') + '</select>' +
    (owner ? '<span id="bd-clr"><button class="tool" id="bd-clear">Очистить лист</button></span>' : '') + '</div>';
  h += '<div class="pages" id="bd-pages"></div><div class="board-stage pen" id="bd-stage"><canvas id="bd-bgc"></canvas><canvas id="bd-ink" aria-label="Холст для письма"></canvas></div>' +
    '<p class="note">' + (owner ? (own ? 'Эту доску видите только вы: удобно показывать на уроке через демонстрацию экрана.' : 'Ученик видит этот холст и ваши пометки. Его стереть их не сможет.') : 'Холст видите вы и ваш преподаватель. Всё сохраняется автоматически.') + '</p></div>';
  el.innerHTML = h;

  const stage = $('#bd-stage', el), bg = $('#bd-bgc', el), ink = $('#bd-ink', el);
  let cw = 0, ch = 0, dpr = 1;
  const merged = () => Object.assign({}, (S.doc && S.doc.items) || {}, S.local);
  function size() {
    cw = stage.clientWidth; ch = stage.clientHeight; dpr = window.devicePixelRatio || 1;
    [bg, ink].forEach(c => { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0); });
    redraw();
  }
  function drawBg() {
    const c = bg.getContext('2d'), u = cw / W, mode = (S.doc && S.doc.bg) || 'grid';
    c.clearRect(0, 0, cw, ch); c.fillStyle = css('--sheet'); c.fillRect(0, 0, cw, ch);
    const ln = (a, b, x, y) => { c.beginPath(); c.moveTo(a, b); c.lineTo(x, y); c.stroke(); };
    if (mode === 'grid') {
      const cell = 125 * u; c.lineWidth = 1; c.strokeStyle = css('--grid');
      for (let x = 0; x <= cw + 1; x += cell) ln(x, 0, x, ch); for (let y = 0; y <= ch + 1; y += cell) ln(0, y, cw, y);
      c.setLineDash([4, 5]); c.strokeStyle = css('--grid'); c.globalAlpha = .45;
      for (let x = cell / 2; x < cw; x += cell) ln(x, 0, x, ch); for (let y = cell / 2; y < ch; y += cell) ln(0, y, cw, y);
      c.globalAlpha = 1; c.setLineDash([]);
    } else if (mode === 'lines') { c.lineWidth = 1; c.strokeStyle = css('--grid'); for (let y = 62.5 * u; y < ch; y += 62.5 * u) ln(0, y, cw, y); }
  }
  function strokeIt(c, it, u) {
    const p = it.p; if (!p || p.length < 2) return;
    c.strokeStyle = c.fillStyle = colorOf(it.c); c.lineWidth = it.w * u; c.lineCap = 'round'; c.lineJoin = 'round';
    if (p.length <= 4) { c.beginPath(); c.arc(p[0] * u, p[1] * u, Math.max(1, it.w * u / 2), 0, 7); c.fill(); return; }
    c.beginPath(); c.moveTo(p[0] * u, p[1] * u);
    for (let i = 2; i < p.length - 2; i += 2) c.quadraticCurveTo(p[i] * u, p[i + 1] * u, (p[i] + p[i + 2]) / 2 * u, (p[i + 1] + p[i + 3]) / 2 * u);
    c.lineTo(p[p.length - 2] * u, p[p.length - 1] * u); c.stroke();
  }
  function drawItems() {
    const c = ink.getContext('2d'), u = cw / W, all = merged(); c.clearRect(0, 0, cw, ch);
    Object.keys(all).sort().forEach(id => {
      const it = all[id]; if (!it || it.d || S.gone.has(id)) return;
      if (it.k === 't') { c.fillStyle = colorOf(it.c); c.font = Math.round(it.s * u) + 'px "Noto Serif SC","Onest",sans-serif'; c.textBaseline = 'alphabetic'; c.fillText(it.txt, it.x * u, it.y * u); }
      else strokeIt(c, it, u);
    });
  }
  function redraw() { if (!S) return; if (S.drawing) { S.dirty = true; return; } drawBg(); drawItems(); $('#bd-bg', el).value = (S.doc && S.doc.bg) || 'grid'; }
  const full = () => S.doc && JSON.stringify(S.doc).length + JSON.stringify(S.local).length > LIMIT;
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  function add(it) {
    if (full()) { toast('Лист заполнен. Добавьте новый лист'); redraw(); return; }
    const id = newId(); it.a = S.owner ? 't' : 's'; S.local[id] = it; S.mine.push(id);
    Acc.write(pagePath(S.page), { items: { [id]: it } }); sync(); redraw();
  }
  function erase(id) { S.gone.add(id); Acc.write(pagePath(S.page), { items: { [id]: { d: 1 } } }); sync(); redraw(); }
  function hit(x, y) {
    const all = merged();
    for (const id of Object.keys(all).sort().reverse()) {
      const it = all[id]; if (!it || it.d || S.gone.has(id)) continue;
      if (!S.owner && it.a === 't') continue;
      if (it.k === 't') { if (x >= it.x - 6 && x <= it.x + it.txt.length * it.s && y <= it.y + 8 && y >= it.y - it.s) return id; }
      else { const p = it.p, r = 10 + it.w / 2; for (let i = 0; i < p.length; i += 2) { const dx = p[i] - x, dy = p[i + 1] - y; if (dx * dx + dy * dy <= r * r) return id; } }
    }
    return null;
  }
  function sync() {
    const box = $('#bd-sync', el); if (!box) return;
    box.textContent = Acc.local ? 'Тестовый режим: данные хранятся в этом браузере' : Acc.busy() ? 'Сохраняю…' : 'Все изменения сохранены';
  }
  const pt = e => { const r = ink.getBoundingClientRect(); return [Math.round((e.clientX - r.left) / r.width * W), Math.round((e.clientY - r.top) / r.height * H)]; };

  /* рисование */
  ink.onpointerdown = e => {
    if (!S || !S.canWrite || !S.page) return;
    const [x, y] = pt(e);
    if (S.tool === 'text') { e.preventDefault(); textAt(x, y); return; }
    try { ink.setPointerCapture(e.pointerId); } catch (_) {}
    if (S.tool === 'erase') { S.drawing = { erase: true }; const id = hit(x, y); if (id) { S.drawing = null; erase(id); S.drawing = { erase: true }; } return; }
    S.drawing = { p: [x, y] }; const c = ink.getContext('2d'), u = cw / W;
    c.fillStyle = colorOf(S.color); c.beginPath(); c.arc(x * u, y * u, Math.max(1, S.size * u / 2), 0, 7); c.fill();
  };
  ink.onpointermove = e => {
    if (!S || !S.drawing) return;
    const [x, y] = pt(e);
    if (S.drawing.erase) { const id = hit(x, y); if (id) { const d = S.drawing; S.drawing = null; erase(id); S.drawing = d; } return; }
    const p = S.drawing.p, lx = p[p.length - 2], ly = p[p.length - 1];
    if ((x - lx) * (x - lx) + (y - ly) * (y - ly) < 6) return;
    p.push(x, y); const c = ink.getContext('2d'), u = cw / W;
    c.strokeStyle = colorOf(S.color); c.lineWidth = S.size * u; c.lineCap = 'round'; c.beginPath(); c.moveTo(lx * u, ly * u); c.lineTo(x * u, y * u); c.stroke();
  };
  ink.onpointerup = ink.onpointercancel = () => {
    if (!S || !S.drawing) return;
    const d = S.drawing; S.drawing = null;
    if (!d.erase && d.p) add({ k: 's', c: S.color, w: S.size, p: d.p });
    if (S.dirty) { S.dirty = false; redraw(); }
  };
  function textAt(x, y) {
    const old = $('.txt-in', stage); if (old) old.remove();
    const u = cw / W, fs = TXT[S.size], inp = document.createElement('input');
    inp.className = 'txt-in'; inp.placeholder = 'Введите текст и нажмите Enter';
    inp.style.left = Math.min(x * u, cw - 160) + 'px'; inp.style.top = Math.max(0, y * u - fs * u) + 'px'; inp.style.fontSize = Math.max(14, fs * u) + 'px'; inp.style.color = colorOf(S.color);
    stage.appendChild(inp); setTimeout(() => inp.focus(), 0);
    let done = false;
    const commit = ok => { if (done) return; done = true; const t = inp.value.trim(); inp.remove(); if (ok && t) add({ k: 't', c: S.color, s: fs, x, y, txt: t.slice(0, 200) }); };
    inp.onkeydown = e => { if (e.key === 'Enter') commit(true); else if (e.key === 'Escape') { e.preventDefault(); commit(false); } };
    inp.onblur = () => commit(true);
  }
  function undo() {
    while (S.mine.length) { const id = S.mine.pop(), it = merged()[id]; if (it && !it.d && !S.gone.has(id)) { erase(id); return; } }
    toast('Нечего отменять');
  }

  /* листы */
  function renderPages() {
    const pages = (S.meta && S.meta.pages) || [];
    $('#bd-pages', el).innerHTML = pages.map(p => '<button data-page="' + esc(p.id) + '" aria-pressed="' + (p.id === S.page) + '">' + esc(p.t) + '</button>').join('') + (S.canWrite ? '<button id="bd-addp">+ Лист</button>' : '');
    $$('[data-page]', el).forEach(b => b.onclick = () => openPage(b.dataset.page));
    const ad = $('#bd-addp', el); if (ad) ad.onclick = () => { const id = 'p' + Date.now().toString(36), list = pages.concat([{ id, t: 'Лист ' + (pages.length + 1) }]); S.meta = Object.assign({}, S.meta, { pages: list }); Acc.write(metaPath, { pages: list }); openPage(id); };
  }
  function openPage(id) {
    if (S.pageUnsub) S.pageUnsub();
    S.page = id; S.doc = null; S.local = {}; S.gone = new Set(); S.mine = []; renderPages(); redraw();
    S.pageUnsub = Acc.db.doc(pagePath(id)).onSnapshot(s => {
      if (!S || S.page !== id) return;
      S.doc = s.exists ? s.data() : { items: {}, bg: 'grid' };
      const srv = S.doc.items || {}; Object.keys(S.local).forEach(k => { if (srv[k]) delete S.local[k]; });
      redraw(); sync();
    }, () => { toast('Не удалось загрузить лист'); });
  }
  S.unsubs.push(Acc.db.doc(metaPath).onSnapshot(s => {
    if (!S) return;
    if (!s.exists) {
      S.meta = { pages: [{ id: 'p1', t: 'Лист 1' }] };
      if (S.canWrite && !S.creating) { S.creating = true; Acc.db.doc(metaPath).set({ pages: S.meta.pages, created: Date.now() }).catch(() => {}); }
    } else S.meta = s.data();
    const pages = S.meta.pages || [];
    if (!S.page || !pages.some(p => p.id === S.page)) openPage((pages[0] || { id: 'p1' }).id); else renderPages();
  }, () => { toast('Холст недоступен'); }));

  /* панель инструментов */
  $$('[data-tool]', el).forEach(b => b.onclick = () => { S.tool = b.dataset.tool; $$('[data-tool]', el).forEach(x => x.setAttribute('aria-pressed', x === b)); stage.className = 'board-stage ' + S.tool; });
  $$('[data-color]', el).forEach(b => b.onclick = () => { S.color = b.dataset.color; $$('[data-color]', el).forEach(x => x.setAttribute('aria-pressed', x === b)); if (S.tool === 'erase') $('[data-tool="pen"]', el).click(); });
  $$('[data-size]', el).forEach(b => b.onclick = () => { S.size = +b.dataset.size; $$('[data-size]', el).forEach(x => x.setAttribute('aria-pressed', x === b)); });
  $('#bd-undo', el).onclick = undo;
  $('#bd-bg', el).onchange = e => { if (!S.canWrite) return; S.doc = Object.assign({}, S.doc, { bg: e.target.value }); Acc.write(pagePath(S.page), { bg: e.target.value }); redraw(); };
  const clr = $('#bd-clear', el);
  if (clr) clr.onclick = () => {
    const box = $('#bd-clr', el); box.innerHTML = '<span class="note">Стереть весь лист?</span> <button class="tool" id="bd-cy" style="color:var(--red)">Стереть</button> <button class="tool" id="bd-cn">Отмена</button>';
    const back = () => { box.innerHTML = '<button class="tool" id="bd-clear">Очистить лист</button>'; $('#bd-clear', el).onclick = clr.onclick; };
    $('#bd-cn', el).onclick = back;
    $('#bd-cy', el).onclick = async () => { try { await Acc.db.doc(pagePath(S.page)).set({ items: {}, bg: (S.doc && S.doc.bg) || 'grid', cleared: Date.now() }); S.local = {}; S.mine = []; toast('Лист очищен'); } catch (e) { toast('Не удалось очистить лист'); } back(); };
  };
  const who = $('#bd-who', el); if (who) who.onchange = () => { A.view.uid = who.value; A.boardView(el); };
  if (!canWrite) $$('.board-bar button, .board-bar select', el).forEach(b => { b.disabled = true; });
  S.onKey = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !/INPUT|TEXTAREA/.test((document.activeElement || {}).tagName || '')) { e.preventDefault(); undo(); } };
  document.addEventListener('keydown', S.onKey);
  S.onAcc = m => { if (m === 'saved') sync(); }; Acc.on(S.onAcc);
  if (window.ResizeObserver) { S.ro = new ResizeObserver(() => { if (S && stage.clientWidth !== cw) size(); }); S.ro.observe(stage); }
  size(); sync();
};

A.start();
})();
