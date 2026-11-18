(function () {
'use strict';
/* Анкета при первом входе, роли пользователей (страница администратора) и кабинет родителя.
   Работает в версии с Firebase (auth.js). */
const A = window.APP, Acc = A.Acc, FB = A.FB || {}, $ = A.$, $$ = A.$$, esc = A.esc;
const ROLES = A.ROLES || {};
A.years = n => { n = +n; const a = n % 10, b = n % 100; return n + ' ' + (a === 1 && b !== 11 ? 'год' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'года' : 'лет'); };
const TYPE = { student: 'Ученик', parent: 'Родитель ученика' };

/* ---------- анкета: имя, возраст, кто вы ---------- */
A.onboardView = function (el) {
  const p = FB.profile || {}, u = FB.user || {};
  const nm = p.name || u.displayName || '';
  el.innerHTML = '<div class="sheet sheet-pad onb">' +
    '<div class="onb-top"><span class="onb-seal" aria-hidden="true">欢迎</span><div><div class="eyebrow">Добро пожаловать · 欢迎</div><h1>Расскажите о себе</h1><p>Это нужно один раз. Ответы увидит только преподаватель.</p></div></div>' +
    '<form id="ob-f" class="onb-f" novalidate>' +
    '<label class="field">Имя и фамилия<input id="ob-n" autocomplete="name" maxlength="60" placeholder="Например: Маша Петрова" value="' + esc(nm) + '"></label>' +
    '<label class="field onb-age">Возраст<input id="ob-a" type="number" inputmode="numeric" min="3" max="99" placeholder="Например: 12" value="' + esc(p.age || '') + '"></label>' +
    '<fieldset class="who"><legend>Кто вы</legend>' +
    '<label class="who-c"><input type="radio" name="ob-t" value="student"' + (p.type === 'student' ? ' checked' : '') + '><span class="brush" aria-hidden="true">学</span><b>Ученик</b><small>Учу китайский: уроки, задания, холст</small></label>' +
    '<label class="who-c"><input type="radio" name="ob-t" value="parent"' + (p.type === 'parent' ? ' checked' : '') + '><span class="brush" aria-hidden="true">家</span><b>Родитель ученика</b><small>Слежу за заданиями и успехами ребёнка</small></label>' +
    '</fieldset>' +
    '<label class="field" id="ob-kid" hidden>Как зовут вашего ребёнка<input id="ob-k" maxlength="60" placeholder="Чтобы преподаватель связал ваши аккаунты" value="' + esc(p.childName || '') + '"></label>' +
    '<p class="au-msg" id="ob-msg" role="alert" hidden></p>' +
    '<div class="cta"><button class="btn pri" id="ob-go">Продолжить</button><button type="button" class="btn" data-signout>Выйти</button></div>' +
    '<p class="note" style="margin:0">Вы вошли как ' + esc(u.email || '') + '</p></form></div>';
  const f = $('#ob-f', el), kid = $('#ob-kid', el), go = $('#ob-go', el);
  const msg = t => { const m = $('#ob-msg', el); m.textContent = t || ''; m.hidden = !t; };
  const type = () => { const r = f.querySelector('input[name="ob-t"]:checked'); return r ? r.value : ''; };
  const sync = () => { kid.hidden = type() !== 'parent'; };
  $$('input[name="ob-t"]', el).forEach(r => { r.onchange = sync; }); sync();
  f.onsubmit = async e => {
    e.preventDefault();
    const name = $('#ob-n', el).value.trim(), age = parseInt($('#ob-a', el).value, 10), t = type();
    if (name.length < 2) { msg('Введите имя'); $('#ob-n', el).focus(); return; }
    if (!(age >= 3 && age <= 99)) { msg('Укажите возраст числом, например 12'); $('#ob-a', el).focus(); return; }
    if (!t) { msg('Выберите, кто вы: ученик или родитель ученика'); return; }
    msg(''); go.disabled = true; go.textContent = 'Сохраняю…';
    try {
      await FB.onboarded({ name, age, type: t, childName: t === 'parent' ? $('#ob-k', el).value.trim() : '' });
      A.toast('Готово! Вы вошли как ' + (t === 'parent' ? 'родитель ученика' : 'ученик'));
    } catch (err) { console.error(err); go.disabled = false; go.textContent = 'Продолжить'; msg('Не удалось сохранить (' + ((err && err.code) || 'ошибка') + '). Попробуйте ещё раз.'); }
  };
  if (!nm) $('#ob-n', el).focus();
};

/* ---------- родитель: данные привязанных детей ---------- */
let kidUnsubs = [];
Acc.kidData = {};
Acc.watchKids = function () {
  kidUnsubs.forEach(f => { try { f(); } catch (e) {} }); kidUnsubs = [];
  const data = this.kidData = {};
  (this.kids || []).forEach(id => {
    const d = data[id] = { st: null, hw: null, prof: null, err: '' };
    const on = (path, key) => kidUnsubs.push(this.db.doc(path).onSnapshot(s => { d[key] = s.exists ? s.data() : null; this.emit(); }, e => { d.err = (e && e.code) || 'ошибка'; this.emit(); }));
    on('st/' + id, 'st'); on('hw/' + id, 'hw'); on('users/' + id, 'prof');
  });
  this.emit();
};
A.parentView = function (el) {
  const U = A.ui;
  const draw = () => {
    const kids = Acc.kids || [];
    let h = '<div class="stack"><section class="sheet sheet-pad stack"><div class="me-head">' + A.ava(Acc.me, 'lg') + '<div><div class="eyebrow">Кабинет родителя</div><h1>' + esc((Acc.me && Acc.me.name) || 'Родитель') + '</h1><p>Задания, результаты и прогресс вашего ребёнка. Всё обновляется само, как только ребёнок что-то сделает.</p></div></div>' +
      '<div class="cta"><a class="btn" href="#hsk' + (A.S.level || 1) + '">Уроки</a><a class="btn" href="#dict">Словарь</a>' + A.accountBtns() + '</div></section>';
    if (!kids.length) h += '<div class="empty"><span class="brush" style="font-size:3rem;color:var(--red);line-height:1">家</span><b>Ребёнок пока не привязан</b><span>Преподаватель свяжет ваш аккаунт с аккаунтом ребёнка, и здесь появятся его задания и успехи.' +
      (FB.profile && FB.profile.childName ? ' Вы указали имя ребёнка: ' + esc(FB.profile.childName) + '.' : '') + '</span></div>';
    kids.forEach(id => {
      const d = Acc.kidData[id] || {}, st = d.st || {}, items = Acc.items(d.hw), pr = d.prof || {}, name = pr.name || 'Ученик';
      const plan = st.plan && A.findLesson(st.plan.level, st.plan.n);
      h += '<section class="sheet sheet-pad stack"><div class="me-head">' + A.ava({ name, avatarUrl: pr.avatarUrl || '' }, 'lg') + '<div><div class="eyebrow">Ученик' + (pr.age ? ' · ' + A.years(pr.age) : '') + '</div><h2 class="kid-h">' + esc(name) + '</h2><p>' +
        (st.lastSeen ? 'Заходил(а) ' + A.ago(st.lastSeen) : 'Ещё не занимался(ась) на сайте') + (plan ? ' · сейчас изучает: ' + esc(A.nameOf(plan)) : '') + '</p></div></div>' +
        (d.err ? '<p class="note" style="color:var(--red)">Не удалось загрузить данные (' + esc(d.err) + ').</p>' : '') + U.kpis(st, items) +
        '<h3>Задания от преподавателя</h3>' + (items.length ? '<div class="hw-list">' + items.map(it => U.stuHw(it, true)).join('') + '</div>' : '<div class="empty"><b>Заданий пока нет</b><span>Когда преподаватель назначит задание, оно появится здесь.</span></div>') +
        '<h3>Последние результаты</h3>' + U.resultsTable(st.results, 10) + '</section>';
    });
    el.innerHTML = h + '</div>';
  };
  Acc.viewFn = U.safe(el, draw); draw();
};

/* ---------- администратор: все пользователи и их роли ---------- */
const FILTERS = [['all', 'Все'], ['student', 'Ученики'], ['parent', 'Родители'], ['staff', 'Преподаватели'], ['none', 'Без роли']];
A.usersView = function (el) {
  const S = { users: {}, roles: {}, got: 0, err: '', f: (A.view && A.view.uf) || 'all', q: '' };
  const subs = [];
  const watch = (col, key, bit) => subs.push(Acc.db.collection(col).onSnapshot(s => {
    const m = {}; s.docs.forEach(d => { m[d.id] = d.data(); }); S[key] = m; S.got |= bit; redraw();
  }, e => { S.err = (e && e.code) || 'ошибка'; S.got = 3; redraw(); }));
  watch('users', 'users', 1); watch('roles', 'roles', 2);
  A.leaveView = () => subs.forEach(f => { try { f(); } catch (e) {} });

  const roleOf = id => (id === Acc.uid && FB.root) ? 'admin' : (S.roles[id] && ROLES[S.roles[id].role] ? S.roles[id].role : '');
  const nameOf = id => (S.users[id] && S.users[id].name) || (S.users[id] && S.users[id].email) || 'Без имени';
  const people = () => Object.keys(Object.assign({}, S.users, S.roles)).map(id => ({ id, u: S.users[id] || {}, role: roleOf(id), kids: (S.roles[id] && S.roles[id].kids) || [] }))
    .sort((a, b) => (b.u.joined || b.u.lastSeen || 0) - (a.u.joined || a.u.lastSeen || 0));
  const inF = (p, f) => f === 'all' || (f === 'staff' ? p.role === 'admin' || p.role === 'teacher' : f === 'none' ? !p.role : p.role === f);

  function row(p, students) {
    const u = p.u, me = p.id === Acc.uid, root = me && FB.root;
    const sel = '<select data-role="' + esc(p.id) + '" aria-label="Роль: ' + esc(nameOf(p.id)) + '"' + (me ? ' disabled' : '') + '>' + (p.role ? '' : '<option value="" selected>— без роли —</option>') +
      Object.keys(ROLES).map(r => '<option value="' + r + '"' + (r === p.role ? ' selected' : '') + '>' + ROLES[r] + '</option>').join('') + '</select>';
    let h = '<div class="usr"><div class="usr-main">' + A.ava({ name: nameOf(p.id), avatarUrl: u.avatarUrl || '' }, 'lg') + '<div class="usr-txt"><b>' + esc(nameOf(p.id)) + (me ? ' <span class="note">(это вы)</span>' : '') + '</b>' +
      '<small>' + esc(u.email || '') + '</small><small>' + [u.age ? A.years(u.age) : '', u.type ? 'в анкете: ' + TYPE[u.type] : '', u.joined ? 'с нами с ' + A.day(u.joined) : '', u.lastSeen ? 'был(а) ' + A.ago(u.lastSeen) : ''].filter(Boolean).map(esc).join(' · ') + '</small></div></div>' +
      '<label class="field usr-role">' + (root ? 'Роль · главный, по почте' : 'Роль') + sel + '</label>';
    if (p.role === 'parent') {
      h += '<div class="usr-kids"><span class="note">Дети:</span>' + (p.kids.length ? p.kids.map(k => '<span class="kid">' + esc(nameOf(k)) + '<button type="button" data-unkid="' + esc(p.id) + '" data-k="' + esc(k) + '" aria-label="Отвязать ' + esc(nameOf(k)) + '">×</button></span>').join('') : '<span class="note">не привязаны</span>') +
        '<select data-kid="' + esc(p.id) + '" aria-label="Привязать ученика"><option value="">+ привязать ученика</option>' + students.filter(s => !p.kids.includes(s.id)).map(s => '<option value="' + esc(s.id) + '">' + esc(nameOf(s.id)) + (s.u.age ? ', ' + A.years(s.u.age) : '') + '</option>').join('') + '</select>' +
        (u.childName ? '<span class="note">в анкете указал(а): ' + esc(u.childName) + '</span>' : '') + '</div>';
    }
    return h + '</div>';
  }
  function draw() {
    const all = people(), students = all.filter(p => p.role === 'student'), q = S.q.toLowerCase();
    const shown = all.filter(p => inF(p, S.f) && (!q || (nameOf(p.id) + ' ' + (p.u.email || '')).toLowerCase().includes(q)));
    let h = '<div class="stack"><section class="sheet sheet-pad stack"><div class="me-head">' + A.ava(Acc.me, 'lg') + '<div><div class="eyebrow">Администратор</div><h1>Пользователи · ' + all.length + '</h1><p>Все, кто зарегистрировался на сайте. Выберите роль — она применится сразу. Родителя привяжите к ученику, чтобы он видел его задания и успехи.</p></div></div>' +
      '<div class="usr-bar"><div class="usr-f" role="group" aria-label="Кого показать">' + FILTERS.map(([k, t]) => '<button class="chip" data-f="' + k + '" aria-pressed="' + (k === S.f) + '">' + t + ' <span>' + all.filter(p => inF(p, k)).length + '</span></button>').join('') + '</div>' +
      '<input class="dict-in usr-q" id="u-q" type="search" placeholder="Поиск по имени или почте" value="' + esc(S.q) + '"></div></section>';
    if (S.err) h += '<div class="banner"><b>Не удалось загрузить пользователей.</b> ' + esc(S.err) + '. Проверьте правила базы в Firebase.</div>';
    else if (S.got !== 3) h += '<p class="note">Загружаю пользователей…</p>';
    else if (!shown.length) h += '<div class="empty"><b>' + (all.length ? 'Никого не нашлось' : 'Пока никто не зарегистрировался') + '</b><span>' + (all.length ? 'Попробуйте другой фильтр или поиск.' : 'Отправьте ссылку на сайт ученикам и родителям.') + '</span></div>';
    else h += '<div class="usr-list">' + shown.map(p => row(p, students)).join('') + '</div>';
    el.innerHTML = h + '</div>';
    $$('[data-f]', el).forEach(b => { b.onclick = () => { S.f = A.view.uf = b.dataset.f; draw(); }; });
    const qi = $('#u-q', el); qi.oninput = () => { S.q = qi.value; const pos = qi.selectionStart; draw(); const n = $('#u-q', el); n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} };
    $$('[data-role]', el).forEach(s => { s.onchange = () => setRole(s.dataset.role, s.value); });
    $$('[data-kid]', el).forEach(s => { s.onchange = () => { if (s.value) setKids(s.dataset.kid, k => k.concat(s.value)); }; });
    $$('[data-unkid]', el).forEach(b => { b.onclick = () => setKids(b.dataset.unkid, k => k.filter(x => x !== b.dataset.k)); });
  }
  const redraw = A.ui.safe(el, draw);
  async function save(id, patch, ok) {
    const cur = S.roles[id] || {};
    try { await Acc.db.doc('roles/' + id).set(Object.assign({ kids: [] }, cur, patch, { by: Acc.uid, at: Date.now() })); A.toast(ok); }
    catch (e) { A.toast('Не удалось сохранить: ' + ((e && e.code) || 'ошибка')); draw(); }
  }
  const setRole = (id, r) => { if (ROLES[r]) save(id, { role: r }, 'Роль изменена: ' + nameOf(id) + ' — ' + ROLES[r]); };
  const setKids = (id, fn) => { const k = [...new Set(fn(((S.roles[id] || {}).kids) || []))]; save(id, { kids: k }, 'Список детей сохранён · ' + nameOf(id)); };
  Acc.viewFn = null; draw();
};
})();
