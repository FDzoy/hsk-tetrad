(function () {
'use strict';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CJK = /[\p{Script=Han}，。？！、：；“”《》（）]+/gu;
const inl = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(CJK, m => '<span class="zh">' + m + '</span>');
const rich = t => inl(t).split(/\n{2,}/).map(p => '<p>' + p.replace(/\n/g, '<br>') + '</p>').join('');
const LS = {
  get(k, d) { try { const v = localStorage.getItem('hsk:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('hsk:' + k, JSON.stringify(v)); } catch (e) {} }
};
const S = { py: LS.get('py', true), ru: LS.get('ru', true), present: LS.get('present', false), level: LS.get('level', 1) };
const LV = {
  1: { name: 'HSK 1', book: 'HSK标准教程 1', total: 150, ch: '一', note: 'Первые 150 слов: знакомство, числа, время, покупки.' },
  2: { name: 'HSK 2', book: 'HSK标准教程 2', total: 300, ch: '二', note: 'До 300 слов: сравнение, опыт, результат действия.' },
  3: { name: 'HSK 3', book: 'HSK标准教程 3', total: 600, ch: '三', note: 'До 600 слов: 把 и 被, дополнения, сложные предложения.' },
  4: { name: 'HSK 4', book: 'HSK标准教程 4 上 · 下', total: 1200, ch: '四', note: 'До 1200 слов: связки, оттенки значения, тексты.' }
};
const TABS = [['words', 'Слова'], ['grammar', 'Грамматика'], ['practice', 'Упражнения'], ['writing', 'Прописи'], ['speaking', 'Говорение']];
const POS = { 'сущ.': 'существительное', 'гл.': 'глагол', 'прил.': 'прилагательное', 'нар.': 'наречие', 'мест.': 'местоимение', 'числ.': 'числительное', 'сч.': 'счётное слово', 'предл.': 'предлог', 'союз': 'союз', 'част.': 'частица', 'межд.': 'междометие', 'мод.': 'модальный глагол', 'имя': 'имя собственное', 'выр.': 'выражение' };
const ZHN = n => { const d = '零一二三四五六七八九'; return n <= 10 ? (n === 10 ? '十' : d[n]) : n < 20 ? '十' + d[n - 10] : d[Math.floor(n / 10)] + '十' + (n % 10 ? d[n % 10] : ''); };

/* ---------- data ---------- */
const lines = s => (s || '').split('\n').map(x => x.trim()).filter(Boolean).map(x => x.split('|').map(y => y.trim()));
const ALL = [];
function prep() {
  for (const l of [1, 2, 3, 4]) {
    const arr = HSK.data[l]; arr.sort((a, b) => a.n - b.n);
    arr.forEach(L => {
      L.level = l; L.id = l + '-' + L.n;
      L.words = lines(L.w).map(([h, p, pos, ru]) => ({ h, p, pos, ru, L }));
      L.gram = (L.g || []).map(([h, f, d, ex]) => ({ h, f, d, ex: lines(ex).map(([z, p, r]) => ({ tok: z.split(/\s+/).filter(Boolean), z: z.replace(/\s+/g, ''), p, r })) }));
      L.quiz = lines(L.q).map(([s, a, w, hint]) => ({ s, a, w: (w || '').split(',').map(x => x.trim()).filter(Boolean), hint }));
      L.talk = lines(L.s).map(([z, r]) => ({ z, r }));
      L.words.forEach(w => ALL.push(w));
    });
  }
}
const lessonsOf = l => HSK.data[l] || [];
const findLesson = (l, n) => lessonsOf(l).find(x => x.n === +n);
const nameOf = L => LV[L.level].name + ' · урок ' + L.n;

/* ---------- ui helpers ---------- */
const IC = {
  sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>'
};
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 2800); }
async function copyText(t, okMsg) {
  try { await navigator.clipboard.writeText(t); toast(okMsg || 'Скопировано'); return true; }
  catch (e) { toast('Не получилось скопировать автоматически: выделите текст и нажмите Ctrl+C'); return false; }
}
function modal(html, onMount) {
  const m = $('#modal'); m.innerHTML = '<div class="modal-box" role="dialog" aria-modal="true">' + html + '</div>'; m.hidden = false;
  const close = () => { m.hidden = true; m.innerHTML = ''; };
  m.onclick = e => { if (e.target === m || e.target.closest('[data-close]')) close(); };
  if (onMount) onMount(m, close);
  const f = m.querySelector('input,select,textarea'); if (f) f.focus();
  return close;
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) { e.preventDefault(); $('#modal').hidden = true; $('#modal').innerHTML = ''; } });
const cells = (t, cls) => '<div class="cells ' + (cls || '') + '" aria-label="' + esc(t) + '">' + [...t].map(c => '<span class="cell' + (/\p{Script=Han}/u.test(c) ? '' : ' p') + '" aria-hidden="true">' + esc(c) + '</span>').join('') + '</div>';
const pyT = (t, cls) => '<span class="py py-t ' + (cls || '') + '">' + esc(t) + '</span>';
const ruT = (t, cls) => '<span class="ru-t ' + (cls || '') + '">' + inl(t) + '</span>';
const sayBtn = t => '<button class="ic" data-say="' + esc(t) + '" title="Озвучить" aria-label="Озвучить">' + IC.sound + '</button>';
const ava = (p, cls) => p && p.avatarUrl ? '<img class="ava ' + (cls || '') + '" src="' + esc(p.avatarUrl) + '" alt="">' : '<span class="ava ' + (cls || '') + '">' + esc(((p && p.name) || '?').slice(0, 1).toUpperCase()) + '</span>';

/* ---------- speech ---------- */
const TTS = {
  voice: null, ready: false,
  init() {
    if (!('speechSynthesis' in window)) return;
    const pick = () => {
      const vs = speechSynthesis.getVoices();
      const zh = vs.filter(v => /^zh([-_](CN|Hans|SG))?$/i.test(v.lang) || /^cmn/i.test(v.lang));
      const any = zh.length ? zh : vs.filter(v => /^zh/i.test(v.lang));
      const pref = ['Xiaoxiao', 'Yunxi', 'Xiaoyi', 'Google 普通话', 'Huihui', 'Yaoyao', 'Tingting', 'Kangkang'];
      this.voice = pref.map(p => any.find(v => v.name.includes(p))).find(Boolean) || any[0] || null;
      this.ready = true;
    };
    pick(); speechSynthesis.onvoiceschanged = pick;
  },
  say(t) {
    if (!('speechSynthesis' in window)) { toast('Озвучка недоступна в этом браузере'); return; }
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(t.replace(/\s+/g, '')); u.lang = 'zh-CN'; if (this.voice) u.voice = this.voice; u.rate = 0.8;
      speechSynthesis.speak(u);
      if (this.ready && !this.voice) toast('Нет китайского голоса: откройте сайт в Chrome или Edge');
    } catch (e) { toast('Озвучка недоступна'); }
  }
};

/* ---------- toggles ---------- */
function applyToggles() {
  document.body.classList.toggle('no-py', !S.py); document.body.classList.toggle('no-ru', !S.ru); document.body.classList.toggle('present', S.present);
  $('#t-py').setAttribute('aria-pressed', S.py); $('#t-ru').setAttribute('aria-pressed', S.ru); $('#t-present').setAttribute('aria-pressed', S.present);
}
function bindTop() {
  $('#t-py').onclick = () => { S.py = !S.py; LS.set('py', S.py); $$('.py-t.shown').forEach(e => e.classList.remove('shown')); applyToggles(); };
  $('#t-ru').onclick = () => { S.ru = !S.ru; LS.set('ru', S.ru); $$('.ru-t.shown').forEach(e => e.classList.remove('shown')); applyToggles(); };
  $('#t-present').onclick = () => {
    S.present = !S.present; LS.set('present', S.present); applyToggles();
    try { if (S.present && document.fullscreenEnabled && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); else if (!S.present && document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch (e) {}
  };
  document.addEventListener('click', e => {
    const say = e.target.closest('[data-say]'); if (say) { TTS.say(say.dataset.say); return; }
    const h = e.target.closest('.py-t,.ru-t');
    if (h && ((h.classList.contains('py-t') && !S.py) || (h.classList.contains('ru-t') && !S.ru))) h.classList.toggle('shown');
  });
}

/* ---------- top: nav + account ---------- */
let curNav = 'home';
function renderTop() {
  const Acc = A.Acc || { state: 'loading' }, ready = Acc.state === 'ready';
  const items = [['home', 'Курс'], ['dict', 'Словарь']];
  if (ready && Acc.isOwner) items.push(['students', 'Ученики', Acc.pendingCount ? Acc.pendingCount() : 0]);
  if (ready && !Acc.isOwner) items.push(['me', 'Мой кабинет', Acc.activeCount ? Acc.activeCount() : 0]);
  if (ready) items.push(['board', 'Холст']);
  $('#nav').innerHTML = items.map(([k, t, b]) => '<a href="#' + k + '" data-nav="' + k + '"' + (k === curNav ? ' aria-current="page"' : '') + '>' + t + (b ? '<span class="badge">' + b + '</span>' : '') + '</a>').join('');
  const box = $('#acct');
  if (Acc.state === 'loading') box.innerHTML = '';
  else if (!ready) box.innerHTML = '<span class="acct" title="Войдите в claude.ai и откройте сайт по приглашению преподавателя"><span class="ava">?</span><b>Гость</b></span>';
  else box.innerHTML = '<a class="acct" href="#' + (Acc.isOwner ? 'students' : 'me') + '">' + ava(Acc.me) + '<b>' + esc((Acc.me && Acc.me.name) || 'Вы') + '</b><span class="role' + (Acc.isOwner ? ' t' : '') + '">' + (Acc.isOwner ? 'Преподаватель' : 'Ученик') + '</span></a>';
}
function setNav(k) { curNav = k; renderTop(); }

/* ---------- sidebar ---------- */
function touched(L) { const r = A.Acc && A.Acc.st && A.Acc.st.results; if (!r) return false; return Object.keys(r).some(k => k.startsWith(L.id + ':')); }
function renderSide(level, n) {
  const ls = lessonsOf(level);
  let h = '<div class="levels" role="group" aria-label="Уровень">' + [1, 2, 3, 4].map(l => '<button class="lv' + l + '" data-level="' + l + '" aria-pressed="' + (l === level) + '"><span class="brush">' + LV[l].ch + '</span>HSK ' + l + '<small>' + lessonsOf(l).length + ' ур.</small></button>').join('') + '</div>';
  h += '<div class="book"><span class="zh">' + esc(LV[level].book) + '</span><a class="lnk" href="#hsk' + level + '">все уроки</a></div><ul class="lessons">';
  ls.forEach(L => {
    if (level === 4 && L.n === 1) h += '<li class="part">Часть 上 · уроки 1–10</li>';
    if (level === 4 && L.n === 11) h += '<li class="part">Часть 下 · уроки 11–20</li>';
    h += '<li><a href="#hsk' + level + '-' + L.n + '"' + (L.n === n ? ' aria-current="page"' : '') + '><span class="num">' + L.n + '</span><span><span class="zh">' + esc(L.t) + '</span><small>' + esc(L.r) + '</small></span>' + (touched(L) ? '<span class="done" title="Есть выполненные упражнения"></span>' : '<span></span>') + '</a></li>';
  });
  $('#side').innerHTML = h + '</ul>';
  $$('#side [data-level]').forEach(b => b.onclick = () => { location.hash = 'hsk' + b.dataset.level; });
  const cur = $('#side [aria-current="page"]'); if (cur) cur.scrollIntoView({ block: 'nearest' });
}
function mobilePick(level, n) {
  return '<div class="mobile-pick"><select id="mp-l" aria-label="Уровень">' + [1, 2, 3, 4].map(l => '<option value="' + l + '"' + (l === level ? ' selected' : '') + '>HSK ' + l + '</option>').join('') +
    '</select><select id="mp-n" aria-label="Урок"><option value="">Все уроки</option>' + lessonsOf(level).map(L => '<option value="' + L.n + '"' + (L.n === n ? ' selected' : '') + '>' + L.n + '. ' + esc(L.t) + ' — ' + esc(L.r) + '</option>').join('') + '</select></div>';
}
function bindMobilePick() {
  const l = $('#mp-l'), n = $('#mp-n'); if (!l) return;
  l.onchange = () => { location.hash = 'hsk' + l.value; };
  n.onchange = () => { location.hash = n.value ? 'hsk' + l.value + '-' + n.value : 'hsk' + l.value; };
}
function layout(side, lv) { document.body.classList.toggle('noside', !side); if (lv) document.body.dataset.lv = lv; else delete document.body.dataset.lv; }

/* ---------- home ---------- */
let wodIdx = null;
function greet() { const h = new Date().getHours(); return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер'; }
function wodHtml(anim) {
  if (wodIdx == null) wodIdx = Math.floor(Date.now() / 864e5) * 7919 % ALL.length;
  const w = ALL[wodIdx], n = [...w.h].length, size = n === 1 ? 128 : n === 2 ? 88 : n === 3 ? 60 : 46;
  return '<div class="label">Слово дня · ' + LV[w.L.level].name + '</div><div class="wod-cell"><span class="wod-zh' + (anim ? ' ink' : '') + '" style="font-size:' + size + 'px">' + esc(w.h) + '</span></div>' +
    '<div class="py py-t">' + esc(w.p) + '</div><div class="ru ru-t">' + inl(w.ru) + '</div><div class="meta">' + esc(LV[w.L.level].name) + ', урок ' + w.L.n + ' · <span class="zh">' + esc(w.L.t) + '</span></div>' +
    '<div class="cta" style="justify-content:center">' + sayBtn(w.h) + '<button class="btn sm" id="wod-next">Ещё слово</button><a class="btn sm" href="#hsk' + w.L.level + '-' + w.L.n + '">К уроку</a></div>';
}
function bindWod() { const b = $('#wod-next'); if (b) b.onclick = () => { wodIdx = Math.floor(Math.random() * ALL.length); $('#wod').innerHTML = wodHtml(true); bindWod(); TTS.say(ALL[wodIdx].h); }; }
function viewHome() {
  layout(false); setNav('home');
  const Acc = A.Acc || {}, ready = Acc.state === 'ready', name = ready && Acc.me && Acc.me.name;
  const plan = ready && !Acc.isOwner && Acc.st && Acc.st.plan, PL = plan && findLesson(plan.level, plan.n);
  let cta = '<a class="btn pri" href="#hsk' + (S.level || 1) + '">Открыть уроки</a><a class="btn" href="#dict">Словарь</a>';
  if (ready && Acc.isOwner) cta = '<a class="btn pri" href="#students">Ученики · ' + (Acc.students ? Acc.students.length : 0) + '</a><a class="btn" href="#board">Холст</a><a class="btn" href="#hsk' + (S.level || 1) + '">Уроки</a>';
  else if (ready) cta = (PL ? '<a class="btn pri" href="#hsk' + PL.level + '-' + PL.n + '">Продолжить: ' + esc(nameOf(PL)) + '</a>' : '<a class="btn pri" href="#hsk' + (S.level || 1) + '">Открыть уроки</a>') + '<a class="btn" href="#me">Мой кабинет</a><a class="btn" href="#board">Мой холст</a>';
  const prog = l => { if (!ready || Acc.isOwner) return ''; const ls = lessonsOf(l), d = ls.filter(touched).length; return '<div class="prog" title="Уроков с упражнениями: ' + d + ' из ' + ls.length + '"><i style="width:' + Math.round(d / ls.length * 100) + '%"></i></div>'; };
  const cnt = l => ({ les: lessonsOf(l).length, w: lessonsOf(l).reduce((a, L) => a + L.words.length, 0), g: lessonsOf(l).reduce((a, L) => a + L.gram.length, 0) });
  let h = '<div class="stack"><div class="hero2"><section class="sheet hero-txt"><div class="eyebrow">' + (name ? esc(greet() + ', ' + name) : 'HSK Standard Course · HSK标准教程') + '</div>' +
    '<h1>Тетрадь репетитора <em>HSK</em></h1><p>Все уроки учебника с первого по четвёртый уровень: слова с озвучкой, грамматика по формулам, упражнения, прописи и вопросы для разговора. У каждого ученика свой кабинет и свой холст, а преподаватель видит всех.</p>' +
    '<div class="cta">' + cta + '</div><div class="note"><span class="brush" style="font-size:1.35rem;color:var(--red)">学而时习之</span> — учиться и постоянно повторять. Конфуций</div></section>' +
    '<section class="sheet wod" id="wod">' + wodHtml(true) + '</section></div>';
  if (A.Acc && A.Acc.state === 'guest' && A.Acc.inViewer) h += '<div class="banner"><b>Вы не вошли в аккаунт.</b> Уроки доступны всем, а кабинет, задания и холст появятся, когда вы откроете сайт, войдя в claude.ai по приглашению преподавателя.</div>';
  h += '<div class="lv-grid">' + [1, 2, 3, 4].map(l => { const c = cnt(l); return '<a class="lv lv' + l + '" href="#hsk' + l + '"><span class="lvseal">' + LV[l].ch + '</span><b>' + LV[l].name + '</b><small class="zh">' + esc(LV[l].book) + '</small><small>' + esc(LV[l].note) + '</small><span class="meta"><span>' + c.les + ' уроков</span><span>' + c.w + ' слов</span><span>' + c.g + ' тем</span></span>' + prog(l) + '</a>'; }).join('') + '</div>';
  h += '<div class="how"><div><span class="brush">讲</span><b>Объясняйте</b><p>Грамматика разложена на формулы и примеры. Нажмите на иероглиф или пример, чтобы услышать произношение.</p></div>' +
    '<div><span class="brush">练</span><b>Тренируйте</b><p>Тесты, карточки и сборка предложений строятся из материала урока. Результаты учеников сохраняются автоматически.</p></div>' +
    '<div><span class="brush">写</span><b>Пишите на холсте</b><p>У каждого ученика свой холст в клетку. Преподаватель видит все холсты и может писать на них красным.</p></div>' +
    '<div><span class="brush">作</span><b>Задавайте ДЗ</b><p>Назначьте задание прямо в кабинет ученика. Баллы и статус придут вам сами.</p></div></div></div>';
  $('#main').innerHTML = h; bindWod();
}

/* ---------- level & lesson ---------- */
function viewLevel(l) {
  layout(true, l); setNav('home'); S.level = l; LS.set('level', l); renderSide(l, 0);
  let h = mobilePick(l, 0) + '<div class="sheet"><div class="hero"><div class="eyebrow"><span class="zh">' + esc(LV[l].book) + '</span><span class="sep"></span>' + lessonsOf(l).length + ' уроков<span class="sep"></span>до ' + LV[l].total + ' слов</div><h1>' + LV[l].name + ' <span class="brush" style="color:var(--lv)">' + LV[l].ch + '</span></h1><p>' + esc(LV[l].note) + ' Выберите урок: внутри слова, грамматика, упражнения и домашнее задание.</p></div><div class="lgrid">';
  lessonsOf(l).forEach(L => {
    h += '<a class="lcard" href="#hsk' + l + '-' + L.n + '"><span class="num">' + L.n + '</span><span><span class="zh">' + esc(L.t) + '</span><small>' + esc(L.r) + '</small><div class="gp">' + (L.gram.length ? L.gram.map(g => inl(g.h)).join(' · ') : 'Фонетика') + '</div></span></a>';
  });
  $('#main').innerHTML = h + '</div></div>'; bindMobilePick();
}
function viewLesson(l, n, tab, arg) {
  const L = findLesson(l, n); if (!L) { viewLevel(l); return; }
  layout(true, l); setNav('home'); S.level = l; LS.set('level', l); renderSide(l, L.n);
  tab = tab || 'words';
  const ls = lessonsOf(l), i = ls.indexOf(L), prev = ls[i - 1], next = ls[i + 1];
  let h = mobilePick(l, L.n) + '<article class="sheet"><header class="lesson-head"><span class="sealnum" aria-hidden="true">第' + ZHN(L.n) + '课</span><div class="eyebrow"><span>' + LV[l].name + '</span><span class="sep"></span><span>Урок ' + L.n + '</span><span class="sep"></span><span>' + L.words.length + ' слов</span>' + (L.gram.length ? '<span class="sep"></span><span>' + L.gram.length + ' темы грамматики</span>' : '') + '</div>' +
    cells(L.t) + '<div class="head-py py-t">' + esc(L.p) + '</div><div class="head-ru">' + esc(L.r) + '</div>' + (L.d ? '<p class="head-d">' + inl(L.d) + '</p>' : '') +
    '<div class="head-actions"><button class="btn pri owner-only" id="hw-new">Задать ДЗ по уроку</button><button class="btn owner-only" id="lx-edit">Материалы к уроку</button>' + sayBtn(L.t) +
    (prev ? '<a class="btn" href="#hsk' + l + '-' + prev.n + '-' + tab + '" title="' + esc(prev.t) + '">← Урок ' + prev.n + '</a>' : '') +
    (next ? '<a class="btn" href="#hsk' + l + '-' + next.n + '-' + tab + '" title="' + esc(next.t) + '">Урок ' + next.n + ' →</a>' : '') + '</div><div id="lx"></div></header>';
  const counts = { words: L.words.length, grammar: L.gram.length, speaking: L.talk.length };
  h += '<nav class="tabs" aria-label="Разделы урока">' + TABS.map(([k, t]) => '<a href="#hsk' + l + '-' + L.n + '-' + k + '"' + (k === tab ? ' aria-current="page"' : '') + '>' + t + (counts[k] ? '<span>' + counts[k] + '</span>' : '') + '</a>').join('') + '</nav><section class="pane" id="pane"></section></article>';
  $('#main').innerHTML = h; bindMobilePick();
  $('#hw-new').onclick = () => A.composer && A.composer(L);
  $('#lx-edit').onclick = () => A.editExtras && A.editExtras(L);
  if (A.lessonExtras) A.lessonExtras(L, $('#lx'));
  const pane = $('#pane');
  if (tab === 'words') paneWords(L, pane);
  else if (tab === 'grammar') paneGrammar(L, pane);
  else if (tab === 'speaking') paneSpeaking(L, pane);
  else if (tab === 'practice') A.practice(L, pane, arg);
  else if (tab === 'writing') A.writing(L, pane, arg);
}
function paneWords(L, el) {
  if (!L.words.length) { el.innerHTML = '<div class="empty"><b>В этом уроке слов нет</b></div>'; return; }
  let h = '<div class="pane-bar"><span class="grow">Нажмите на иероглиф, чтобы услышать. Скрытые пиньинь и перевод открываются по нажатию.</span><a class="btn sm" href="#hsk' + L.level + '-' + L.n + '-practice">Карточки и тесты</a></div>';
  h += '<div style="overflow-x:auto"><table class="words"><thead><tr><th>Слово</th><th>Пиньинь</th><th>Часть речи</th><th>Перевод</th><th></th></tr></thead><tbody>';
  L.words.forEach(w => {
    h += '<tr><td class="w-zh"><button data-say="' + esc(w.h) + '" title="Озвучить">' + esc(w.h) + '</button></td><td class="w-py">' + pyT(w.p) + '</td><td class="w-pos" title="' + esc(POS[w.pos] || '') + '">' + esc(w.pos || '') + '</td><td class="w-ru">' + ruT(w.ru) + '</td>' +
      '<td class="w-act">' + sayBtn(w.h) + ' <a class="ic" href="#hsk' + L.level + '-' + L.n + '-writing" data-char="' + esc(w.h) + '" title="Прописи" aria-label="Прописи">' + IC.pen + '</a></td></tr>';
  });
  el.innerHTML = h + '</tbody></table></div>';
  el.querySelectorAll('[data-char]').forEach(a => a.onclick = () => { A.writeChar = a.dataset.char; });
}
function exList(ex) { return '<ul class="g-ex">' + ex.map(e => '<li>' + sayBtn(e.z) + '<div><div class="ex-zh">' + esc(e.z) + '</div><div>' + pyT(e.p, 'ex-py') + '</div><div>' + ruT(e.r, 'ex-ru') + '</div></div></li>').join('') + '</ul>'; }
function paneGrammar(L, el) {
  if (!L.gram.length) { el.innerHTML = '<div class="empty"><b>В этом уроке грамматики нет</b><span>Урок посвящён фонетике.</span></div>'; return; }
  el.innerHTML = '<div class="gram">' + L.gram.map((g, i) => '<section class="g"><div class="g-h"><span class="g-n">' + (i + 1) + '</span><h3>' + inl(g.h) + '</h3></div>' + (g.f ? '<div class="g-f">' + inl(g.f) + '</div>' : '') + '<div class="g-d">' + rich(g.d) + '</div>' + exList(g.ex) + '</section>').join('') + '</div>';
}
function paneSpeaking(L, el) {
  if (!L.talk.length) { el.innerHTML = '<div class="empty"><b>Вопросов пока нет</b></div>'; return; }
  el.innerHTML = '<div class="pane-bar"><span class="grow">Задайте вопрос вслух. Ученик отвечает полным предложением с грамматикой урока.</span></div><ol class="speak">' +
    L.talk.map((t, i) => '<li><span class="num g-n">' + (i + 1) + '</span><div><div class="ex-zh">' + esc(t.z) + '</div><div>' + ruT(t.r, 'ex-ru') + '</div></div>' + sayBtn(t.z) + '</li>').join('') + '</ol>';
}
function normPy(s) { return (s || '').normalize('NFD').replace(/\p{M}/gu, '').replace(/[\s'’·-]/g, '').toLowerCase(); }
function viewDict() {
  layout(false); setNav('dict');
  $('#main').innerHTML = '<div class="sheet"><div class="hero"><div class="eyebrow">Все уровни · ' + ALL.length + ' слов</div><h1>Словарь курса</h1><p>Ищите по иероглифам, пиньиню без тонов (например, <span class="py">xuesheng</span>) или по-русски. В результатах видно, в каком уроке слово появилось.</p>' +
    '<input class="dict-in" id="dq" type="search" placeholder="学生, xuesheng или студент" autocomplete="off"></div><div class="pane" id="dres"></div></div>';
  const q = $('#dq'), out = $('#dres');
  const run = () => {
    const v = q.value.trim(); LS.set('dq', v);
    if (!v) { out.innerHTML = '<p class="note">Введите слово, чтобы начать поиск.</p>'; return; }
    const pv = normPy(v), lv = v.toLowerCase();
    const res = ALL.filter(w => w.h.includes(v) || (pv.length > 1 && normPy(w.p).includes(pv)) || w.ru.toLowerCase().includes(lv)).slice(0, 150);
    out.innerHTML = res.length ? '<div style="overflow-x:auto"><table class="words"><tbody>' + res.map(w => '<tr><td class="w-zh"><button data-say="' + esc(w.h) + '">' + esc(w.h) + '</button></td><td class="w-py">' + pyT(w.p) + '</td><td class="w-ru">' + ruT(w.ru) + '</td><td class="w-act"><a class="lnk" href="#hsk' + w.L.level + '-' + w.L.n + '">' + LV[w.L.level].name + ' · ур. ' + w.L.n + '</a></td></tr>').join('') + '</tbody></table></div>' : '<div class="empty"><b>Ничего не найдено</b><span>Попробуйте другое написание или часть слова.</span></div>';
  };
  q.value = LS.get('dq', ''); q.oninput = run; run(); q.focus();
}

/* ---------- router ---------- */
function loadingView(k) { layout(false); setNav(k); $('#main').innerHTML = '<div class="sheet sheet-pad"><p class="note">Проверяю аккаунт…</p></div>'; }
function needAccount(k) {
  layout(false); setNav(k);
  $('#main').innerHTML = '<div class="sheet sheet-pad"><div class="empty"><span class="brush" style="font-size:3rem;color:var(--red);line-height:1">门</span><b>Нужен вход в аккаунт</b><span>Кабинет, задания и холст открываются, когда вы заходите на сайт, войдя в claude.ai. Попросите преподавателя пригласить вас по email.</span><a class="btn" href="#home">К урокам</a></div></div>';
}
function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  let m;
  window.scrollTo(0, 0);
  if (TTS.ready && 'speechSynthesis' in window) speechSynthesis.cancel();
  if (A.leaveBoard) A.leaveBoard();
  if (A.Acc) A.Acc.viewFn = null;
  const mn = $('#main'); mn.classList.remove('enter'); void mn.offsetWidth; mn.classList.add('enter');
  clearTimeout(route.t); route.t = setTimeout(() => mn.classList.remove('enter'), 450);
  const Acc = A.Acc || { state: 'loading' };
  const acc = (k, fn) => { if (Acc.state === 'loading') loadingView(k); else if (Acc.state !== 'ready') needAccount(k); else { layout(false); setNav(k); fn($('#main')); } };
  if ((m = h.match(/^hsk([1-4])-(\d+)(?:-(words|grammar|practice|writing|speaking))?$/))) viewLesson(+m[1], +m[2], m[3]);
  else if ((m = h.match(/^hsk([1-4])$/))) viewLevel(+m[1]);
  else if (h === 'dict') viewDict();
  else if (h === 'me') acc('me', el => Acc.isOwner ? (location.hash = 'students') : A.cabinet(el));
  else if (h === 'students' || h === 'student') acc('students', el => Acc.isOwner ? (h === 'student' ? A.studentView(el) : A.studentsView(el)) : (location.hash = 'me'));
  else if (h === 'board') acc('board', el => A.boardView(el));
  else if (h === 'task') acc('me', el => A.taskView(el));
  else if ((m = h.match(/^hw-([1-4])-(\d+)-([a-z]+)(?:-(\d{4}))?$/))) { layout(false); setNav(''); A.hwView({ level: +m[1], n: +m[2], tasks: m[3], due: m[4] }, $('#main')); }
  else viewHome();
}

const A = window.APP = { $, $$, esc, rich, inl, LS, S, LV, IC, TTS, ZHN, toast, copyText, modal, cells, pyT, ruT, sayBtn, ava, exList, findLesson, lessonsOf, nameOf, ALL, route, renderTop, touched, layout };
A.start = function () {
  prep(); TTS.init(); applyToggles(); bindTop(); renderTop();
  window.addEventListener('hashchange', route); route();
  if (A.Acc) A.Acc.init();
};
})();
