(function () {
'use strict';
/* Вход через Google и по почте для версии на GitHub Pages (Firebase Auth + Firestore).
   Включается, когда в firebase-config.js заполнены apiKey и projectId. */
const A = window.APP, Acc = A.Acc, $ = A.$, $$ = A.$$, esc = A.esc;
const CFG = window.HSK_FIREBASE || {};
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const FB = A.FB = { enabled: !!(CFG.apiKey && CFG.projectId), auth: null, fs: null, user: null, lastEmail: '' };

/* ---------- загрузка SDK ---------- */
const load = src => new Promise((res, rej) => {
  const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Не загрузился ' + src)); document.head.appendChild(s);
});
// запасной адрес, если gstatic.com не отвечает (бывает у некоторых провайдеров)
const SDK2 = 'https://unpkg.com/firebase@10.12.2/';
const loadAny = async name => { try { await load(SDK + name); } catch (e) { await load(SDK2 + name); } };
async function sdk() {
  if (window.firebase && firebase.auth && firebase.firestore) return;
  await loadAny('firebase-app-compat.js');
  await Promise.all([loadAny('firebase-auth-compat.js'), loadAny('firebase-firestore-compat.js')]);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- Firestore с тем же API, что у базы claude ---------- */
// update в базе claude сливает вложенные объекты (как deepMerge), а Firestore заменил бы их целиком.
// Поэтому раскладываем патч на пути до листьев: { items: { a: { s: 1 } } } -> items.a.s = 1.
function leaves(obj, pre, out) {
  Object.keys(obj).forEach(k => {
    const v = obj[k], p = pre.concat(k);
    if (v === undefined) return;
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length) leaves(v, p, out);
    else out.push(new firebase.firestore.FieldPath(...p), v);
  });
  return out;
}
function wrap(fs) {
  const noop = () => {};
  const doc = ref => ({
    id: ref.id, path: ref.path,
    get: () => ref.get(),
    set: v => ref.set(v),
    update: v => { const a = leaves(v, [], []); return a.length ? ref.update(...a) : Promise.resolve(); },
    delete: () => ref.delete(),
    onSnapshot: (next, err) => ref.onSnapshot(next, err || noop),
    collection: c => coll(ref.collection(c))
  });
  const coll = ref => ({
    path: ref.path,
    doc: id => doc(id ? ref.doc(id) : ref.doc()),
    get: () => ref.get(),
    onSnapshot: (next, err) => ref.onSnapshot(next, err || noop)
  });
  return { doc: p => doc(fs.doc(p)), collection: p => coll(fs.collection(p)) };
}

/* ---------- профиль ---------- */
const isPassword = u => (u.providerData || []).some(p => p && p.providerId === 'password');
const profileOf = u => ({ id: u.uid, name: (FB.profile && FB.profile.name) || u.displayName || (u.email ? u.email.split('@')[0] : 'Без имени'), avatarUrl: u.photoURL || '', email: u.email || '', isOwner: !!Acc.isOwner });
function saveProfile(u) {
  const p = profileOf(u), d = { avatarUrl: p.avatarUrl, email: p.email, lastSeen: Date.now() };
  if (!(FB.profile && FB.profile.name)) d.name = p.name; // имя из анкеты не перетираем именем из Google
  return FB.fs.doc('users/' + u.uid).set(d, { merge: true }).catch(() => {});
}

/* ---------- роли ----------
   admin — администратор (главный задан почтой в firestore.rules), teacher — преподаватель,
   student — ученик (сразу, если в анкете выбран «Ученик»), parent — родитель ученика. Менять роли может только администратор. */
const ROLES = A.ROLES = { admin: 'Администратор', teacher: 'Преподаватель', student: 'Ученик', parent: 'Родитель' };

/* ---------- запуск ---------- */
function fail(text) {
  FB.user = null; Acc.uid = null; Acc.me = null; Acc.db = null;
  Acc.fbError = text; Acc.state = 'guest'; Acc.emit(); A.route();
}
FB.init = async function () {
  try { await sdk(); } catch (e) { console.error(e); fail('Не удалось загрузить вход. Проверьте интернет и обновите страницу.'); return; }
  if (!firebase.apps.length) firebase.initializeApp(CFG);
  FB.auth = firebase.auth(); FB.auth.languageCode = 'ru';
  FB.fs = firebase.firestore();
  try { FB.fs.settings({ ignoreUndefinedProperties: true }); } catch (e) {}
  FB.auth.getRedirectResult().catch(e => { if (!quiet(e)) A.toast(errText(e)); });
  FB.auth.onAuthStateChanged(u => {
    if (FB.user) {
      // вышли или сменили аккаунт: проще всего начать с чистой страницы
      if (!u || u.uid !== FB.user.uid) { history.replaceState(null, '', location.pathname + location.search + (u ? location.hash : '#home')); location.reload(); }
      return;
    }
    if (u) signedIn(u);
    else { Acc.state = 'guest'; Acc.emit(); A.route(); }
  });
};
async function signedIn(u) {
  FB.user = u; Acc.fbError = '';
  Acc.uid = u.uid; Acc.me = profileOf(u);
  // почту подтвердили в другой вкладке: обновляем токен, чтобы правила это увидели
  if (isPassword(u) && !u.emailVerified) { try { await u.reload(); if (u.emailVerified) await u.getIdToken(true); } catch (e) {} }
  // Администратор — тот, кому правила Firestore разрешают читать meta/admin (см. firestore.rules)
  let admin = null;
  for (let i = 0; i < 3 && admin === null; i++) {
    try { await FB.fs.doc('meta/admin').get(); admin = true; }
    catch (e) { if (e && e.code === 'permission-denied') admin = false; else await sleep(1200); }
  }
  if (admin === null) { fail('Нет связи с базой. Обновите страницу чуть позже.'); return; }
  const [rs, ps] = await Promise.all([FB.fs.doc('roles/' + u.uid).get().catch(() => null), FB.fs.doc('users/' + u.uid).get().catch(() => null)]);
  const roleDoc = rs && rs.exists ? rs.data() : null;
  FB.profile = ps && ps.exists ? ps.data() : null;
  FB.root = admin && !(roleDoc && roleDoc.role === 'admin'); // главный администратор (по почте)
  Acc.me = profileOf(u);
  let role = admin ? 'admin' : roleDoc && ROLES[roleDoc.role] ? roleDoc.role : null;
  Acc.db = wrap(FB.fs);
  // анкета: имя, возраст, кто вы — один раз, до входа на сайт (администратору и преподавателю не нужна)
  if (role !== 'admin' && role !== 'teacher' && !(FB.profile && FB.profile.done)) {
    FB.pendingRole = roleDoc; Acc.state = 'onboard'; Acc.emit(); A.route(); return;
  }
  if (!role) role = await autoRole();
  finish(role, roleDoc);
}
// ученик сразу получает роль «Ученик», родитель — «Родитель»; дальше роль меняет администратор
async function autoRole() {
  const role = FB.profile && FB.profile.type === 'parent' ? 'parent' : 'student';
  try { await FB.fs.doc('roles/' + FB.user.uid).set({ role, kids: [], at: Date.now() }); } catch (e) { console.error(e); }
  return role;
}
function finish(role, roleDoc) {
  const u = FB.user;
  Acc.role = role; Acc.isAdmin = role === 'admin'; Acc.isOwner = role === 'admin' || role === 'teacher'; Acc.isParent = role === 'parent';
  Acc.kids = (roleDoc && roleDoc.kids) || [];
  Acc.me = profileOf(u); Acc.me.isOwner = Acc.isOwner;
  Acc.user = {
    me: async () => Acc.me,
    profiles: async ids => {
      const out = {};
      await Promise.all(ids.map(id => FB.fs.doc('users/' + id).get().then(s => {
        if (s.exists) { const d = s.data(); out[id] = { name: d.name || d.email || '', avatarUrl: d.avatarUrl || '', email: d.email || '', age: d.age || null }; }
      }).catch(() => {})));
      return out;
    }
  };
  saveProfile(u);
  // администратор поменял роль — перезагружаем страницу; для родителя обновляем список детей
  if (!FB.root) FB.fs.doc('roles/' + u.uid).onSnapshot(s => {
    const d = s.exists ? s.data() : null, r = d && ROLES[d.role] ? d.role : null;
    if (r && r !== Acc.role) { location.reload(); return; }
    const kids = (d && d.kids) || [];
    if (JSON.stringify(kids) !== JSON.stringify(Acc.kids)) { Acc.kids = kids; if (Acc.watchKids) Acc.watchKids(); Acc.emit(); }
  }, () => {});
  Acc.start();
}
// анкета заполнена (roles.js)
FB.onboarded = async function (data) {
  const u = FB.user;
  await FB.fs.doc('users/' + u.uid).set(Object.assign({ email: u.email || '', avatarUrl: u.photoURL || '', done: true, joined: Date.now(), lastSeen: Date.now() }, data), { merge: true });
  FB.profile = Object.assign({}, FB.profile, data, { done: true });
  const roleDoc = FB.pendingRole, role = roleDoc && ROLES[roleDoc.role] ? roleDoc.role : await autoRole();
  FB.pendingRole = null;
  finish(role, roleDoc);
};

/* ---------- ошибки ---------- */
const quiet = e => /popup-closed-by-user|cancelled-popup-request|user-cancelled/.test((e && e.code) || '');
const ERR = {
  'invalid-email': 'Проверьте адрес почты',
  'missing-email': 'Введите почту',
  'missing-password': 'Введите пароль',
  'weak-password': 'Слишком простой пароль: нужно не меньше 6 символов',
  'email-already-in-use': 'Эта почта уже зарегистрирована. Войдите или восстановите пароль',
  'invalid-credential': 'Неверная почта или пароль',
  'invalid-login-credentials': 'Неверная почта или пароль',
  'wrong-password': 'Неверная почта или пароль',
  'user-not-found': 'Неверная почта или пароль',
  'user-disabled': 'Этот аккаунт отключён',
  'too-many-requests': 'Слишком много попыток. Подождите пару минут и попробуйте снова',
  'network-request-failed': 'Нет связи. Проверьте интернет',
  'account-exists-with-different-credential': 'Эта почта уже зарегистрирована другим способом. Войдите по почте и паролю',
  'popup-blocked': 'Браузер заблокировал окно входа. Разрешите всплывающие окна для этого сайта',
  'unauthorized-domain': 'Этот адрес сайта не добавлен в Firebase: Authentication → Settings → Authorized domains',
  'operation-not-allowed': 'Этот способ входа не включён в Firebase: Authentication → Sign-in method'
};
function errText(e) {
  const c = ((e && e.code) || '').replace(/^auth\//, '');
  return ERR[c] || ('Не получилось: ' + (c || (e && e.message) || 'неизвестная ошибка'));
}

/* ---------- окно входа и регистрации ---------- */
const G_ICON = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
const TITLE = { in: 'Вход', up: 'Регистрация', reset: 'Новый пароль' };
const GO = { in: 'Войти', up: 'Зарегистрироваться', reset: 'Отправить ссылку' };
A.authModal = function (mode) {
  if (!FB.auth) { A.toast(Acc.fbError || 'Вход ещё загружается, подождите пару секунд'); return; }
  mode = TITLE[mode] ? mode : 'in';
  let b = '';
  if (mode === 'reset') b += '<p class="note" style="margin:0">Введите почту, с которой регистрировались. Пришлём ссылку, по которой можно задать новый пароль.</p>';
  else b += '<button type="button" class="btn gbtn" id="au-g">' + G_ICON + 'Продолжить с Google</button><div class="au-or">или по почте</div>';
  b += '<form id="au-f" class="au-f" novalidate>';
  b += '<label class="field">Почта<input id="au-e" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com"></label>';
  if (mode !== 'reset') b += '<label class="field">Пароль<input id="au-p" type="password" autocomplete="' + (mode === 'up' ? 'new-password' : 'current-password') + '"' + (mode === 'up' ? ' placeholder="Не короче 6 символов"' : '') + '></label>';
  b += '<p class="au-msg" id="au-msg" role="alert" hidden></p><button class="btn pri au-go" id="au-go">' + GO[mode] + '</button></form>';
  b += '<div class="au-links">' + (mode === 'in' ? '<button type="button" class="au-lnk" data-auth="reset">Забыли пароль?</button><button type="button" class="au-lnk" data-auth="up">Нет аккаунта? <b>Регистрация</b></button>'
    : mode === 'up' ? '<button type="button" class="au-lnk" data-auth="in">Уже есть аккаунт? <b>Войти</b></button>'
    : '<button type="button" class="au-lnk" data-auth="in">← Ко входу</button>') + '</div>';
  if (mode === 'up') b += '<p class="au-small">После регистрации попросим указать имя, возраст и кто вы: ученик или родитель ученика.</p>';
  A.modal('<div class="modal-h"><h2>' + TITLE[mode] + '</h2><button class="ic" data-close aria-label="Закрыть">' + A.IC.x + '</button></div><div class="modal-b">' + b + '</div>', (m, close) => {
    m.querySelector('.modal-box').classList.add('narrow');
    const g = $('#au-g', m), go = $('#au-go', m), em = $('#au-e', m), pw = $('#au-p', m);
    const msg = (t, ok) => { const p = $('#au-msg', m); p.textContent = t || ''; p.hidden = !t; p.classList.toggle('ok', !!ok); };
    const busy = on => { if (g) g.disabled = on; go.disabled = on; go.textContent = on ? 'Подождите…' : GO[mode]; };
    em.value = FB.lastEmail; em.oninput = () => { FB.lastEmail = em.value.trim(); };
    if (g) g.onclick = async () => {
      const p = new firebase.auth.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
      msg(''); busy(true);
      try { await FB.auth.signInWithPopup(p); close(); A.toast('Вы вошли'); }
      catch (e) {
        if (/popup-blocked|operation-not-supported/.test(e.code || '')) { try { await FB.auth.signInWithRedirect(p); return; } catch (e2) { e = e2; } }
        busy(false); if (!quiet(e)) msg(errText(e));
      }
    };
    $('#au-f', m).onsubmit = async ev => {
      ev.preventDefault();
      const email = em.value.trim(), pass = pw ? pw.value : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg('Проверьте адрес почты'); em.focus(); return; }
      if (pw && !pass) { msg('Введите пароль'); pw.focus(); return; }
      if (mode === 'up' && pass.length < 6) { msg('Пароль должен быть не короче 6 символов'); pw.focus(); return; }
      msg(''); busy(true);
      try {
        if (mode === 'reset') { await FB.auth.sendPasswordResetEmail(email); busy(false); msg('Готово. Если эта почта зарегистрирована, письмо придёт через пару минут. Загляните и в «Спам».', true); return; }
        if (mode === 'in') await FB.auth.signInWithEmailAndPassword(email, pass);
        else {
          const c = await FB.auth.createUserWithEmailAndPassword(email, pass);
          c.user.sendEmailVerification().catch(() => {});
        }
        close(); A.toast(mode === 'up' ? 'Аккаунт создан. Осталось рассказать о себе' : 'Вы вошли');
      } catch (e) { busy(false); if (!quiet(e)) msg(errText(e)); }
    };
  });
  if (mode === 'in' && FB.lastEmail) { const p = $('#au-p'); if (p) p.focus(); }
};

/* ---------- кнопки для страниц ---------- */
A.signOut = () => { if (FB.auth) FB.auth.signOut().catch(e => A.toast(errText(e))); };
A.accountBtns = () => (Acc.fb && Acc.state === 'ready' ? '<button class="btn" data-signout>Выйти</button>' : '');
A.verifyBanner = () => {
  const u = FB.user;
  if (!Acc.fb || !u || u.emailVerified || !isPassword(u)) return '';
  return '<div class="banner"><span><b>Подтвердите почту.</b> Ссылка в письме на ' + esc(u.email || '') + '. Так вы сможете восстановить пароль, если забудете его.</span><button class="btn sm" data-verify>Отправить письмо ещё раз</button></div>';
};
document.addEventListener('click', e => {
  const t = e.target.closest('[data-auth],[data-signout],[data-verify]'); if (!t) return;
  e.preventDefault();
  if (t.hasAttribute('data-auth')) A.authModal(t.dataset.auth);
  else if (t.hasAttribute('data-signout')) A.signOut();
  else if (FB.user) FB.user.sendEmailVerification().then(() => A.toast('Письмо отправлено на ' + FB.user.email)).catch(err => A.toast(errText(err)));
});
})();
