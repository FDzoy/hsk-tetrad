(function () {
'use strict';
const A = window.APP, { $, $$, esc, inl, LV, toast, copyText, modal } = A;
const Acc = A.Acc, EX = A.EX, MON = A.MON;
const SITE = 'https://claude.ai/artifact/QHxcdhYooppWh4awrzPRqR';
const ORDER = 'fvphgbtxs', ST = ['Выдано', 'Сдано', 'Проверено'];
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const human = s => { if (!s) return ''; const [, m, d] = s.split('-').map(Number); return d + ' ' + MON[m - 1]; };
const today = () => iso(new Date());
const sortT = t => [...new Set(t)].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).join('');
const pct = r => r && r.t ? Math.round(r.s / r.t * 100) : null;
const scls = p => p >= 80 ? 'sc-hi' : p >= 60 ? 'sc-mid' : 'sc-lo';
const pill = r => r ? (r.t ? '<span class="scorepill ' + scls(pct(r)) + '">' + r.s + '/' + r.t + '</span>' : '<span class="scorepill sc-hi">готово</span>') : '<span class="scorepill" style="background:var(--grid2);color:var(--ink3)">—</span>';
A.view = A.view || { uid: null, hid: null, tab: 'hw' };

/* перерисовка без потери набранного текста */
function safe(el, draw) {
  return () => {
    const a = document.activeElement;
    if (a && el.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) { if (!el._pending) { el._pending = true; a.addEventListener('blur', () => { el._pending = false; if (el.isConnected) draw(); }, { once: true }); } return; }
    if (el.isConnected) draw();
  };
}
function taskLine(c, L) {
  const n = A.available(c, L);
  const x = { f: 'выучить ' + L.words.length + ' слов', v: Math.min(n, 12) + ' вопросов', p: 'тоны, ' + Math.min(n, 12) + ' вопросов', h: Math.min(n, 12) + ' вопросов', g: n + ' предложений с пропуском', b: Math.min(n, 8) + ' предложений', t: Math.min(n, 8) + ' фраз', x: A.charsOf(L).length + ' иероглифов', s: n + ' вопросов вслух' }[c];
  return EX[c].t + ' — ' + x;
}
function lessonTitle(it) { const L = A.findLesson(it.level, it.n); return L ? LV[it.level].name + ' · урок ' + it.n + ' <span class="zh">' + esc(L.t) + '</span>' : 'Урок'; }
function message(it, forAccount) {
  const L = A.findLesson(it.level, it.n); if (!L) return '';
  let t = 'Домашнее задание · ' + LV[it.level].name + ', урок ' + it.n + '\n«' + L.t + '» — ' + L.r + '\n' + (it.due ? 'Срок: до ' + human(it.due) + '\n' : '');
  t += '\n' + sortT(it.tasks).split('').map((c, i) => (i + 1) + '. ' + taskLine(c, L)).join('\n') + '\n' + (it.note ? '\nКомментарий: ' + it.note + '\n' : '');
  if (forAccount) t += '\nЗадание уже в вашем кабинете: ' + SITE + '#me';
  else { const d = it.due ? '-' + it.due.slice(5, 7) + it.due.slice(8, 10) : ''; t += '\nОткрыть задание: ' + SITE + '#hw-' + it.level + '-' + it.n + '-' + sortT(it.tasks) + d + '\nПосле выполнения скопируйте отчёт внизу страницы и пришлите мне.'; }
  return t;
}

/* ---------- конструктор ДЗ (преподаватель) ---------- */
A.composer = function (L, preset) {
  if (Acc.state === 'ready' && !Acc.isOwner) return;
  const studs = Acc.state === 'ready' ? Acc.students : [];
  const it = preset && preset.item ? Object.assign({}, preset.item) : { id: uid('h'), level: L ? L.level : (A.S.level || 1), n: L ? L.n : 1, tasks: 'fvgb', due: iso(new Date(Date.now() + 7 * 864e5)), note: '', status: 0, created: Date.now() };
  let target = (preset && preset.uid) || (studs[0] && studs[0].uid) || '';
  const lv = () => [1, 2, 3, 4].map(l => '<option value="' + l + '"' + (l === it.level ? ' selected' : '') + '>HSK ' + l + '</option>').join('');
  const ls = () => A.lessonsOf(it.level).map(x => '<option value="' + x.n + '"' + (x.n === it.n ? ' selected' : '') + '>' + x.n + '. ' + esc(x.t) + ' — ' + esc(x.r) + '</option>').join('');
  modal('<div class="modal-h"><h2>' + (preset && preset.item ? 'Изменить задание' : 'Домашнее задание') + '</h2><button class="ic" data-close aria-label="Закрыть">' + A.IC.x + '</button></div><div class="modal-b">' +
    '<label class="field">Кому<select id="c-u"' + (preset && preset.item ? ' disabled' : '') + '>' + studs.map(s => '<option value="' + esc(s.uid) + '"' + (s.uid === target ? ' selected' : '') + '>' + esc(Acc.person(s.uid).name) + '</option>').join('') + '<option value=""' + (!target ? ' selected' : '') + '>Ученик без аккаунта: только текст со ссылкой</option></select></label>' +
    '<div class="row"><label class="field" style="flex:0 1 110px">Уровень<select id="c-l">' + lv() + '</select></label><label class="field" style="flex:1 1 280px">Урок<select id="c-n">' + ls() + '</select></label><label class="field" style="flex:0 1 170px">Срок<input id="c-d" type="date" value="' + esc(it.due) + '"></label></div>' +
    '<div class="field">Задания<div class="checks" id="c-t"></div></div>' +
    '<label class="field">Комментарий для ученика<textarea id="c-note" placeholder="Например: обратите внимание на тоны в словах 学生 и 老师">' + esc(it.note) + '</textarea></label>' +
    '<div class="field">Текст для мессенджера<pre class="msg" id="c-msg"></pre></div></div>' +
    '<div class="modal-f"><button class="btn" data-close>Отмена</button><button class="btn" id="c-copy">Скопировать текст</button><button class="btn pri" id="c-save"></button></div>', (m, close) => {
    const drawT = () => { const Lc = A.findLesson(it.level, it.n); $('#c-t', m).innerHTML = ORDER.split('').map(c => { const n = Lc ? A.available(c, Lc) : 0; return '<label' + (n ? '' : ' style="opacity:.5"') + '><input type="checkbox" value="' + c + '"' + (it.tasks.includes(c) && n ? ' checked' : '') + (n ? '' : ' disabled') + '><span><b style="font-weight:600">' + EX[c].t + '</b><br><span class="note">' + EX[c].d + '</span></span></label>'; }).join(''); $$('#c-t input', m).forEach(i => i.onchange = sync); };
    const sync = () => {
      target = $('#c-u', m).value; it.level = +$('#c-l', m).value; it.n = +$('#c-n', m).value; it.due = $('#c-d', m).value; it.note = $('#c-note', m).value.trim();
      it.tasks = $$('#c-t input:checked', m).map(i => i.value).join('');
      $('#c-msg', m).textContent = it.tasks ? message(it, !!target) : 'Выберите хотя бы одно задание.';
      $('#c-save', m).textContent = target ? (preset && preset.item ? 'Сохранить' : 'Назначить в кабинет') : 'Скопировать и закрыть';
    };
    $('#c-l', m).onchange = () => { it.level = +$('#c-l', m).value; it.n = 1; $('#c-n', m).innerHTML = ls(); drawT(); sync(); };
    $('#c-n', m).onchange = () => { drawT(); sync(); };
    ['#c-u', '#c-d', '#c-note'].forEach(s => { $(s, m).oninput = sync; $(s, m).onchange = sync; });
    drawT(); sync();
    $('#c-copy', m).onclick = () => { sync(); if (it.tasks) copyText(message(it, !!target), 'Текст задания скопирован'); };
    $('#c-save', m).onclick = async () => {
      sync(); if (!it.tasks) { toast('Выберите хотя бы одно задание'); return; }
      if (!target) { await copyText(message(it, false), 'Текст со ссылкой скопирован'); close(); return; }
      const ok = await Acc.write('hw/' + target, { items: { [it.id]: it } });
      if (ok) toast((preset && preset.item ? 'Задание обновлено: ' : 'Задание назначено: ') + Acc.person(target).name);
      close();
    };
  });
};

/* ---------- кабинет ученика ---------- */
function resultsTable(res, limit) {
  const keys = Object.keys(res || {}).sort((a, b) => res[b].at - res[a].at).slice(0, limit || 40);
  if (!keys.length) return '<div class="empty"><b>Пока нет результатов</b><span>Откройте любой урок и выполните упражнение — результат появится здесь.</span></div>';
  return '<div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Урок</th><th>Упражнение</th><th>Последний</th><th>Лучший</th><th>Когда</th></tr></thead><tbody>' + keys.map(k => {
    const [lid, c] = k.split(':'), [l, n] = lid.split('-').map(Number), L = A.findLesson(l, n), r = res[k];
    return '<tr><td>' + (L ? '<a href="#hsk' + l + '-' + n + '-practice">' + LV[l].name + ' · ' + n + '</a> <span class="zh">' + esc(L.t) + '</span>' : esc(lid)) + '</td><td>' + esc(EX[c] ? EX[c].t : c) + '</td><td>' + pill(r) + '</td><td class="num">' + (r.b != null ? Math.round(r.b * 100) + '%' : '') + '</td><td class="num">' + A.ago(r.at) + '</td></tr>';
  }).join('') + '</tbody></table></div>';
}
function kpis(st, items) {
  const res = (st && st.results) || {}, keys = Object.keys(res);
  const avg = keys.length ? Math.round(keys.reduce((a, k) => a + (res[k].t ? res[k].s / res[k].t : 1), 0) / keys.length * 100) : null;
  const lessons = new Set(keys.map(k => k.split(':')[0])).size;
  return '<div class="kpis"><div class="kpi"><b>' + items.filter(x => !x.status).length + '</b><span>заданий к выполнению</span></div><div class="kpi"><b>' + keys.length + '</b><span>упражнений пройдено</span></div><div class="kpi"><b>' + (avg == null ? '—' : avg + '%') + '</b><span>средний результат</span></div><div class="kpi"><b>' + lessons + '</b><span>уроков начато</span></div></div>';
}
function stuHw(it) {
  const tasks = sortT(it.tasks).split(''), res = it.results || {}, done = tasks.filter(c => res[c]).length, late = it.due && it.due < today() && !it.status;
  return '<div class="hw"><div class="hw-top"><b>' + lessonTitle(it) + '</b><span class="pill s' + (it.status || 0) + '">' + ST[it.status || 0] + '</span>' + (it.due ? '<span class="due' + (late ? ' late' : '') + '">' + (late ? 'просрочено · ' : 'до ') + human(it.due) + '</span>' : '') + '</div>' +
    '<div class="tags">' + tasks.map(c => '<span class="tag' + (res[c] ? ' ok' : '') + '">' + (res[c] ? '✓ ' : '') + EX[c].t + (res[c] && res[c].t ? ' ' + res[c].s + '/' + res[c].t : '') + '</span>').join('') + '</div>' +
    (it.note ? '<p class="hw-note">' + inl(it.note) + '</p>' : '') + (it.feedback ? '<p class="fbk"><b>Преподаватель:</b> ' + inl(it.feedback) + '</p>' : '') +
    '<div class="hw-act"><button class="btn sm' + (it.status ? '' : ' pri') + '" data-task="' + esc(it.id) + '">' + (it.status ? 'Открыть' : done ? 'Продолжить' : 'Выполнить') + '</button><span class="note">' + done + ' из ' + tasks.length + ' готово</span></div></div>';
}
A.cabinet = function (el) {
  const draw = () => {
    const st = Acc.st || {}, items = Acc.items(Acc.hw), plan = st.plan && A.findLesson(st.plan.level, st.plan.n);
    let h = '<div class="stack">';
    if (Acc.readOnly) h += '<div class="banner"><b>Сейчас можно только смотреть.</b> Чтобы сохранялись результаты и холст, попросите преподавателя выдать вам доступ «Редактор» в меню «Поделиться».</div>';
    h += '<section class="sheet sheet-pad stack"><div class="me-head">' + A.ava(Acc.me, 'lg') + '<div><div class="eyebrow">Личный кабинет</div><h1>' + esc((Acc.me && Acc.me.name) || 'Мой кабинет') + '</h1><p>Здесь ваши задания, результаты и холст. Их видите только вы и ваш преподаватель.</p></div></div>' + kpis(st, items) +
      (plan ? '<div class="banner ' + 'lv' + plan.level + '" style="background:var(--lv-bg);border-color:transparent"><span>Сейчас изучаем: <b style="color:var(--lv)">' + esc(A.nameOf(plan)) + '</b> <span class="zh">' + esc(plan.t) + '</span></span><a class="btn sm pri" href="#hsk' + plan.level + '-' + plan.n + '">Открыть урок</a></div>' : '') +
      '<div class="cta"><a class="btn pri" href="#board">Мой холст</a><a class="btn" href="#hsk' + (plan ? plan.level : A.S.level || 1) + '">Уроки</a></div></section>';
    h += '<section class="sheet sheet-pad stack"><h2>Задания от преподавателя</h2>' + (items.length ? '<div class="hw-list">' + items.map(stuHw).join('') + '</div>' : '<div class="empty"><b>Заданий пока нет</b><span>Когда преподаватель назначит задание, оно появится здесь.</span></div>') + '</section>';
    h += '<section class="sheet sheet-pad stack"><h2>Мои результаты</h2>' + resultsTable(st.results, 30) + '</section></div>';
    el.innerHTML = h;
    $$('[data-task]', el).forEach(b => b.onclick = () => { A.view.hid = b.dataset.task; location.hash = 'task'; });
  };
  Acc.viewFn = safe(el, draw); draw();
};

/* ---------- выполнение задания из кабинета ---------- */
A.taskView = function (el) {
  const hid = A.view.hid, cur = () => Acc.hw && Acc.hw.items && Acc.hw.items[hid];
  if (Acc.isOwner || !cur()) { location.hash = Acc.isOwner ? 'students' : 'me'; return; }
  const it0 = cur(), L = A.findLesson(it0.level, it0.n);
  if (!L) { location.hash = 'me'; return; }
  const tasks = sortT(it0.tasks).split('').filter(c => EX[c] && A.available(c, L));
  const save = (c, s, t) => {
    const it = cur() || it0, res = Object.assign({}, it.results, { [c]: { s, t, at: Date.now() } }), all = tasks.every(x => res[x]);
    Acc.write('hw/' + Acc.uid, { items: { [hid]: { results: { [c]: { s, t, at: Date.now() } }, status: all ? Math.max(it.status || 0, 1) : (it.status || 0), doneAt: all ? Date.now() : null } } });
    if (all && !(it.status)) toast('Задание сдано. Преподаватель увидит результаты');
  };
  function list() {
    Acc.viewFn = safe(el, list);
    const it = cur() || it0, res = it.results || {}, done = tasks.filter(c => res[c]).length;
    let h = '<div class="sheet lv' + L.level + '"><div class="lesson-head"><span class="sealnum" aria-hidden="true">作业</span><div class="eyebrow"><span>Домашнее задание</span><span class="sep"></span><span>' + esc(A.nameOf(L)) + '</span>' + (it.due ? '<span class="sep"></span><span>срок до ' + human(it.due) + '</span>' : '') + '</div>' + A.cells(L.t) + '<div class="head-ru">' + esc(L.r) + '</div>' +
      (it.note ? '<p class="hw-note">' + inl(it.note) + '</p>' : '') + (it.feedback ? '<p class="fbk"><b>Преподаватель:</b> ' + inl(it.feedback) + '</p>' : '') +
      '<div class="head-actions"><a class="btn" href="#me">← В кабинет</a><a class="btn" href="#hsk' + L.level + '-' + L.n + '-grammar">Повторить грамматику</a></div></div>' +
      '<div class="pane" id="tpane"><div class="pane-bar"><span class="grow">Готово ' + done + ' из ' + tasks.length + '. Результаты сохраняются автоматически и сразу видны преподавателю.</span></div><div class="hw-list">' +
      tasks.map((c, i) => { const r = res[c]; return '<div class="task' + (r ? ' done' : '') + '"><span class="tick" aria-hidden="true">' + (r ? '✓' : i + 1) + '</span><div><b>' + EX[c].t + '</b><small>' + esc(taskLine(c, L).split(' — ')[1] || '') + (r && r.t ? ' · результат ' + r.s + ' из ' + r.t : r ? ' · выполнено' : '') + '</small></div><button class="btn sm' + (r ? '' : ' pri') + '" data-go="' + c + '">' + (r ? 'Ещё раз' : 'Начать') + '</button></div>'; }).join('') + '</div></div></div>';
    el.innerHTML = h;
    $$('[data-go]', el).forEach(b => b.onclick = () => run(b.dataset.go));
  }
  function run(c) {
    Acc.viewFn = null; window.scrollTo(0, 0);
    const pane = $('#tpane', el);
    if (c === 'x' || c === 's') {
      pane.innerHTML = '<div class="pane-bar"><button class="btn sm" id="bk">← К заданиям</button><span class="grow">' + (c === 'x' ? 'Пропишите каждый иероглиф несколько раз.' : 'Ответьте на каждый вопрос вслух полным предложением.') + '</span></div><div id="wr"></div>';
      $('#bk', pane).onclick = list;
      if (c === 'x') A.writing(L, $('#wr', pane), null, () => { save('x', 0, 0); list(); });
      else { $('#wr', pane).innerHTML = '<ol class="speak">' + L.talk.map((t, i) => '<li><span class="num g-n">' + (i + 1) + '</span><div><div class="ex-zh">' + esc(t.z) + '</div><div>' + A.ruT(t.r, 'ex-ru') + '</div></div>' + A.sayBtn(t.z) + '</li>').join('') + '</ol><div class="run-nav"><button class="btn pri" id="sd">Я подготовил ответы</button></div>'; $('#sd', pane).onclick = () => { save('s', 0, 0); list(); }; }
      return;
    }
    A.runEx(pane, c, L, (s, t) => save(c, s, t), list);
  }
  list();
};

/* ---------- панель преподавателя: все ученики ---------- */
function stuStats(s) {
  const items = Acc.items(s.hw), res = (s.st && s.st.results) || {}, keys = Object.keys(res);
  const avg = keys.length ? Math.round(keys.reduce((a, k) => a + (res[k].t ? res[k].s / res[k].t : 1), 0) / keys.length * 100) : null;
  return { items, active: items.filter(x => !x.status).length, pending: items.filter(x => x.status === 1).length, avg, n: keys.length };
}
const inviteHelp = open => '<details class="help"' + (open ? ' open' : '') + '><summary>Как добавить ученика</summary><ol>' +
  '<li>Нажмите «Поделиться» у этого сайта и пригласите ученика по email.</li><li>Выберите уровень доступа «Редактор»: без него ученик сможет только смотреть, а его результаты и холст не сохранятся.</li>' +
  '<li>Не включайте доступ по публичной ссылке: тогда приглашённые ученики теряют права на запись.</li><li>Ученик открывает сайт, войдя в свой аккаунт claude.ai, и сразу появляется в этом списке со своим кабинетом и холстом.</li></ol></details>';
A.studentsView = function (el) {
  const draw = () => {
    const ss = Acc.students;
    let h = '<div class="stack"><section class="sheet sheet-pad stack"><div class="me-head">' + A.ava(Acc.me, 'lg') + '<div><div class="eyebrow">Панель преподавателя</div><h1>Ученики · ' + ss.length + '</h1><p>Все зарегистрированные ученики, их задания, результаты и холсты. Ученики видят только своё.</p></div></div>' +
      '<div class="cta"><button class="btn pri" id="s-hw">Задать ДЗ</button><button class="btn" id="s-board">Моя доска</button><a class="btn" href="#hsk' + (A.S.level || 1) + '">Уроки</a></div>' + (Acc.note ? '<p class="note" style="color:var(--red)">' + esc(Acc.note) + '</p>' : '') + '</section>';
    if (!Acc.loaded) h += '<p class="note">Загружаю учеников…</p>';
    else if (!ss.length) h += '<div class="empty"><span class="brush" style="font-size:3rem;color:var(--red);line-height:1">生</span><b>Пока никто не зарегистрировался</b><span>Пригласите учеников — они появятся здесь, как только откроют сайт под своим аккаунтом.</span></div>';
    else h += '<div class="stu-grid">' + ss.map(s => {
      const p = Acc.person(s.uid), x = stuStats(s), live = s.st.lastSeen && Date.now() - s.st.lastSeen < 6e5, last = s.st.recent && s.st.recent[0];
      const pl = s.st.plan && A.findLesson(s.st.plan.level, s.st.plan.n);
      let lastTxt = 'Ещё ничего не выполнял';
      if (last) { const [lid, c] = last.k.split(':'); lastTxt = 'Последнее: ' + lid.replace('-', ' · ') + ', ' + (EX[c] ? EX[c].t.toLowerCase() : c) + (last.t ? ' ' + last.s + '/' + last.t : '') + ', ' + A.ago(last.at); }
      return '<div class="stu"><div class="stu-top">' + A.ava(p, 'lg') + '<div><b>' + esc(p.name) + '</b><small><span class="dotlive' + (live ? ' on' : '') + '"></span> ' + (live ? 'сейчас на сайте' : 'был(а) ' + A.ago(s.st.lastSeen)) + '</small></div></div>' +
        '<div class="stu-stats"><div><b>' + x.active + '</b><span>заданий</span></div><div><b' + (x.pending ? ' style="color:var(--gold)"' : '') + '>' + x.pending + '</b><span>на проверку</span></div><div><b>' + (x.avg == null ? '—' : x.avg + '%') + '</b><span>средний балл</span></div></div>' +
        '<small class="note">' + (pl ? 'Изучает: ' + esc(A.nameOf(pl)) + ' · ' : '') + esc(lastTxt) + '</small>' +
        '<div class="stu-act"><button class="btn sm pri" data-open="' + esc(s.uid) + '">Открыть</button><button class="btn sm" data-board="' + esc(s.uid) + '">Холст</button><button class="btn sm" data-hw="' + esc(s.uid) + '">Задать ДЗ</button></div></div>';
    }).join('') + '</div>';
    h += inviteHelp(!ss.length) + '</div>';
    el.innerHTML = h;
    $('#s-hw', el).onclick = () => A.composer(null);
    $('#s-board', el).onclick = () => { A.view.uid = Acc.uid; location.hash = 'board'; };
    $$('[data-open]', el).forEach(b => b.onclick = () => { A.view.uid = b.dataset.open; A.view.tab = 'hw'; location.hash = 'student'; });
    $$('[data-board]', el).forEach(b => b.onclick = () => { A.view.uid = b.dataset.board; location.hash = 'board'; });
    $$('[data-hw]', el).forEach(b => b.onclick = () => A.composer(null, { uid: b.dataset.hw }));
  };
  Acc.viewFn = safe(el, draw); draw();
};

/* ---------- карточка одного ученика ---------- */
A.studentView = function (el) {
  const id = A.view.uid;
  const draw = () => {
    const s = Acc.map[id];
    if (!s || !s.st) { el.innerHTML = '<div class="sheet sheet-pad"><div class="empty"><b>Ученик не найден</b><a class="btn" href="#students">К списку учеников</a></div></div>'; return; }
    const p = Acc.person(id), x = stuStats(s), st = s.st, tab = A.view.tab || 'hw', pl = st.plan || { level: 1, n: 1 };
    let h = '<div class="stack"><section class="sheet sheet-pad stack"><div class="me-head">' + A.ava(p, 'lg') + '<div><div class="eyebrow"><a class="lnk" href="#students">← Все ученики</a></div><h1>' + esc(p.name) + '</h1><p>' + (p.real && p.real !== p.name ? 'Аккаунт: ' + esc(p.real) + ' · ' : '') + 'с нами с ' + A.day(st.joined || Date.now()) + ' · был(а) ' + A.ago(st.lastSeen) + '</p></div></div>' + kpis(st, x.items) +
      '<div class="row"><label class="field">Имя в списке<input id="d-alias" value="' + esc((s.roster && s.roster.alias) || '') + '" placeholder="' + esc(p.real || 'Как подписать ученика') + '"></label>' +
      '<label class="field" style="flex:0 1 110px">Уровень<select id="d-l">' + [1, 2, 3, 4].map(l => '<option value="' + l + '"' + (l === pl.level ? ' selected' : '') + '>HSK ' + l + '</option>').join('') + '</select></label>' +
      '<label class="field" style="flex:1 1 220px">Текущий урок<select id="d-n">' + A.lessonsOf(pl.level).map(L => '<option value="' + L.n + '"' + (L.n === pl.n ? ' selected' : '') + '>' + L.n + '. ' + esc(L.t) + '</option>').join('') + '</select></label><button class="btn" id="d-save" style="flex:0 0 auto">Сохранить</button></div>' +
      '<div class="cta"><button class="btn pri" id="d-hw">Задать ДЗ</button><button class="btn" id="d-board">Открыть холст</button><span id="d-del"><button class="btn red" id="d-rm">Убрать из списка</button></span></div></section>';
    h += '<section class="sheet"><nav class="tabs" role="tablist">' + [['hw', 'Задания', x.items.length], ['res', 'Результаты', x.n], ['act', 'Активность', (st.recent || []).length]].map(([k, t, n]) => '<button role="tab" data-tab="' + k + '" aria-selected="' + (k === tab) + '">' + t + '<span>' + n + '</span></button>').join('') + '</nav><div class="pane">';
    if (tab === 'hw') h += x.items.length ? '<div class="hw-list">' + x.items.map(it => {
      const tasks = sortT(it.tasks).split(''), res = it.results || {}, late = it.due && it.due < today() && !it.status;
      return '<div class="hw"><div class="hw-top"><b>' + lessonTitle(it) + '</b><span class="pill s' + (it.status || 0) + '">' + ST[it.status || 0] + '</span>' + (it.due ? '<span class="due' + (late ? ' late' : '') + '">' + (late ? 'просрочено · ' : 'до ') + human(it.due) + '</span>' : '') + '</div>' +
        '<div class="tags">' + tasks.map(c => '<span class="tag' + (res[c] ? ' ok' : '') + '">' + EX[c].t + ' ' + (res[c] ? (res[c].t ? res[c].s + '/' + res[c].t : '✓') : '—') + '</span>').join('') + '</div>' + (it.note ? '<p class="hw-note">' + inl(it.note) + '</p>' : '') +
        '<label class="field">Отзыв ученику<textarea data-fb="' + esc(it.id) + '" style="min-height:56px" placeholder="Например: отлично, но повтори тоны">' + esc(it.feedback || '') + '</textarea></label>' +
        '<div class="hw-act" id="a-' + esc(it.id) + '"><button class="btn sm pri" data-ok="' + esc(it.id) + '">Проверено</button><button class="btn sm" data-back="' + esc(it.id) + '">Вернуть на доработку</button><button class="btn sm" data-edit="' + esc(it.id) + '">Изменить</button><button class="btn sm" data-msg="' + esc(it.id) + '">Текст для мессенджера</button><button class="btn sm red" data-rmhw="' + esc(it.id) + '">Удалить</button></div></div>';
    }).join('') + '</div>' : '<div class="empty"><b>Заданий нет</b><span>Нажмите «Задать ДЗ», чтобы назначить первое.</span></div>';
    else if (tab === 'res') h += resultsTable(st.results, 80);
    else h += (st.recent && st.recent.length) ? '<table class="tbl"><tbody>' + st.recent.map(r => { const [lid, c] = r.k.split(':'), [l, n] = lid.split('-').map(Number), L = A.findLesson(l, n); return '<tr><td class="num">' + A.ago(r.at) + '</td><td>' + (L ? LV[l].name + ' · ' + n + ' <span class="zh">' + esc(L.t) + '</span>' : esc(lid)) + '</td><td>' + esc(EX[c] ? EX[c].t : c) + '</td><td>' + pill(r) + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="empty"><b>Активности пока нет</b></div>';
    el.innerHTML = h + '</div></section></div>';
    $('#d-l', el).onchange = () => { $('#d-n', el).innerHTML = A.lessonsOf(+$('#d-l', el).value).map(L => '<option value="' + L.n + '">' + L.n + '. ' + esc(L.t) + '</option>').join(''); };
    $('#d-save', el).onclick = async () => { const a = $('#d-alias', el).value.trim(); await Acc.write('roster/' + id, { alias: a }); await Acc.write('st/' + id, { plan: { level: +$('#d-l', el).value, n: +$('#d-n', el).value } }); toast('Сохранено'); };
    $('#d-hw', el).onclick = () => A.composer(null, { uid: id });
    $('#d-board', el).onclick = () => { A.view.uid = id; location.hash = 'board'; };
    $('#d-rm', el).onclick = () => { $('#d-del', el).innerHTML = '<span class="note">Удалить ученика, его задания, результаты и холст? Это нельзя отменить.</span> <button class="btn red sm" id="d-y">Удалить</button> <button class="btn sm" id="d-n2">Отмена</button>'; $('#d-n2', el).onclick = draw; $('#d-y', el).onclick = () => removeStudent(id); };
    $$('[data-tab]', el).forEach(b => b.onclick = () => { A.view.tab = b.dataset.tab; draw(); });
    const fb = hid => { const t = el.querySelector('[data-fb="' + hid + '"]'); return t ? t.value.trim() : ''; };
    $$('[data-ok]', el).forEach(b => b.onclick = async () => { await Acc.write('hw/' + id, { items: { [b.dataset.ok]: { status: 2, feedback: fb(b.dataset.ok), checkedAt: Date.now() } } }); toast('Отмечено как проверенное'); });
    $$('[data-back]', el).forEach(b => b.onclick = async () => { await Acc.write('hw/' + id, { items: { [b.dataset.back]: { status: 0, feedback: fb(b.dataset.back) } } }); toast('Задание возвращено ученику'); });
    $$('[data-edit]', el).forEach(b => b.onclick = () => A.composer(null, { uid: id, item: s.hw.items[b.dataset.edit] && Object.assign({ id: b.dataset.edit }, s.hw.items[b.dataset.edit]) }));
    $$('[data-msg]', el).forEach(b => b.onclick = () => copyText(message(s.hw.items[b.dataset.msg], true), 'Текст для мессенджера скопирован'));
    $$('[data-rmhw]', el).forEach(b => b.onclick = () => { const box = $('#a-' + b.dataset.rmhw, el); box.innerHTML = '<span class="note">Удалить задание?</span><button class="btn sm red" id="y">Удалить</button><button class="btn sm" id="n">Отмена</button>'; $('#n', box).onclick = draw; $('#y', box).onclick = () => Acc.write('hw/' + id, { items: { [b.dataset.rmhw]: { del: true } } }); });
  };
  Acc.viewFn = safe(el, draw); draw();
};
async function removeStudent(id) {
  try {
    const pages = await Acc.db.doc('board/' + id).collection('pages').get();
    for (const d of pages.docs) await Acc.db.doc('board/' + id).collection('pages').doc(d.id).delete();
    for (const p of ['board/', 'hw/', 'roster/', 'st/']) await Acc.db.doc(p + id).delete();
    toast('Ученик удалён из списка. Закройте ему доступ в меню «Поделиться», если нужно');
  } catch (e) { toast('Не удалось удалить: ' + ((e && e.code) || 'ошибка')); }
  location.hash = 'students';
}

/* ---------- задание по ссылке (ученик без аккаунта) ---------- */
A.hwView = function (p, el) {
  const L = A.findLesson(p.level, p.n);
  if (!L) { el.innerHTML = '<div class="sheet sheet-pad"><div class="empty"><b>Задание не найдено</b><span>Проверьте ссылку или попросите преподавателя прислать её ещё раз.</span><a class="btn" href="#home">На главную</a></div></div>'; return; }
  const key = 'hwp:' + location.hash.slice(1), tasks = sortT(p.tasks.split('').filter(c => EX[c] && A.available(c, L)).join('')).split('');
  const prog = A.LS.get(key, {}), save = () => A.LS.set(key, prog);
  const due = p.due ? (+p.due.slice(2)) + ' ' + MON[+p.due.slice(0, 2) - 1] : '';
  function list() {
    const done = tasks.filter(c => prog[c]).length;
    el.innerHTML = '<div class="sheet lv' + L.level + '"><div class="lesson-head"><span class="sealnum" aria-hidden="true">作业</span><div class="eyebrow"><span>Домашнее задание</span><span class="sep"></span><span>' + esc(A.nameOf(L)) + '</span>' + (due ? '<span class="sep"></span><span>срок до ' + due + '</span>' : '') + '</div>' + A.cells(L.t) + '<div class="head-ru">' + esc(L.r) + '</div><p class="head-d">Выполните задания по порядку. В конце скопируйте отчёт и отправьте преподавателю.</p><div class="head-actions"><a class="btn" href="#hsk' + L.level + '-' + L.n + '">Открыть урок целиком</a></div></div>' +
      '<div class="pane" id="hw-pane"><div class="pane-bar"><span class="grow">Выполнено ' + done + ' из ' + tasks.length + '</span></div><div class="hw-list">' +
      tasks.map((c, i) => { const r = prog[c]; return '<div class="task' + (r ? ' done' : '') + '"><span class="tick">' + (r ? '✓' : i + 1) + '</span><div><b>' + EX[c].t + '</b><small>' + esc(taskLine(c, L).split(' — ')[1] || '') + (r && r.t ? ' · ' + r.s + ' из ' + r.t : r ? ' · выполнено' : '') + '</small></div><button class="btn sm' + (r ? '' : ' pri') + '" data-go="' + c + '">' + (r ? 'Ещё раз' : 'Начать') + '</button></div>'; }).join('') +
      '</div><div style="margin-top:22px;display:grid;gap:10px"><div class="eyebrow">Отчёт для преподавателя</div><label class="field">Ваше имя<input id="hw-name" value="' + esc(A.LS.get('stuname', '')) + '"></label><pre class="report" id="hw-rep"></pre><div class="run-nav" style="justify-content:flex-start"><button class="btn pri" id="hw-copy">Скопировать отчёт</button></div></div></div></div>';
    const rep = () => { const nm = $('#hw-name', el).value.trim(); A.LS.set('stuname', nm); let t = 'Отчёт о ДЗ · ' + LV[L.level].name + ', урок ' + L.n + ' «' + L.t + '»\n' + (nm ? 'Ученик: ' + nm + '\n' : ''); tasks.forEach(c => { const r = prog[c]; t += '• ' + EX[c].t + ': ' + (r ? (r.t ? r.s + ' из ' + r.t : 'выполнено') : 'не выполнено') + '\n'; }); $('#hw-rep', el).textContent = t; return t; };
    rep(); $('#hw-name', el).oninput = rep; $('#hw-copy', el).onclick = () => copyText(rep(), 'Отчёт скопирован. Отправьте его преподавателю');
    $$('[data-go]', el).forEach(b => b.onclick = () => run(b.dataset.go));
  }
  function run(c) {
    const pane = $('#hw-pane', el); window.scrollTo(0, 0);
    if (c === 'x' || c === 's') { pane.innerHTML = '<div class="pane-bar"><button class="btn sm" id="bk">← К заданиям</button></div><div id="wr"></div>'; $('#bk', pane).onclick = list; if (c === 'x') A.writing(L, $('#wr', pane), null, () => { prog.x = { s: 0, t: 0 }; save(); list(); }); else { $('#wr', pane).innerHTML = '<ol class="speak">' + L.talk.map((t, i) => '<li><span class="num g-n">' + (i + 1) + '</span><div><div class="ex-zh">' + esc(t.z) + '</div><div>' + A.ruT(t.r, 'ex-ru') + '</div></div>' + A.sayBtn(t.z) + '</li>').join('') + '</ol><div class="run-nav"><button class="btn pri" id="sd">Я подготовил ответы</button></div>'; $('#sd', pane).onclick = () => { prog.s = { s: 0, t: 0 }; save(); list(); }; } return; }
    A.runEx(pane, c, L, (s, t) => { prog[c] = { s, t }; save(); }, list);
  }
  list();
};
})();
