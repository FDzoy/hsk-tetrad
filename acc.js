(function () {
'use strict';
const A = window.APP;
const clone = v => JSON.parse(JSON.stringify(v));
function deepMerge(a, b) {
  for (const k in b) { const v = b[k]; if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) deepMerge(a[k], v); else a[k] = clone(v); }
  return a;
}
A.deepMerge = deepMerge;

/* Локальная база только для проверки на localhost: повторяет нужную часть API claude db. */
function LocalDB(ns) {
  const KEY = 'hskdb:' + ns; let data = {};
  try { data = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
  const subs = new Set();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} };
  const emit = () => setTimeout(() => subs.forEach(f => f()), 0);
  const snap = p => { const v = data[p]; return { id: p.split('/').pop(), exists: !!v, data: () => (v ? clone(v) : undefined), metadata: { fromCache: false, hasPendingWrites: false } }; };
  const kids = c => Object.keys(data).filter(p => p.startsWith(c + '/') && !p.slice(c.length + 1).includes('/')).sort().map(snap);
  const qs = c => { const docs = kids(c); return { docs, size: docs.length, empty: !docs.length, metadata: { fromCache: false }, docChanges: () => [] }; };
  const doc = p => ({
    id: p.split('/').pop(), path: p,
    get: async () => snap(p),
    set: async v => { data[p] = clone(v); save(); emit(); },
    update: async v => { if (!data[p]) throw { code: 'invalid_argument', message: 'missing' }; deepMerge(data[p], v); save(); emit(); },
    delete: async () => { delete data[p]; save(); emit(); },
    onSnapshot(next) { const f = () => next(snap(p)); subs.add(f); setTimeout(f, 0); return () => subs.delete(f); },
    collection: c => coll(p + '/' + c)
  });
  const coll = c => ({
    path: c, doc: id => doc(c + '/' + (id || Math.random().toString(36).slice(2, 12))),
    get: async () => qs(c),
    onSnapshot(next) { const f = () => next(qs(c)); subs.add(f); setTimeout(f, 0); return () => subs.delete(f); }
  });
  return { doc, collection: coll };
}

/* ---------- аккаунт ---------- */
const queues = {};
const Acc = A.Acc = {
  state: 'loading', inViewer: false, local: false, user: null, db: null, uid: null, me: null, isOwner: false, readOnly: false,
  st: null, hw: null, students: [], map: {}, names: {}, note: '', viewFn: null, fns: [],
  on(f) { this.fns.push(f); }, off(f) { this.fns = this.fns.filter(x => x !== f); },
  emit() { A.renderTop(); if (this.viewFn) { try { this.viewFn(); } catch (e) { console.error(e); } } this.fns.slice().forEach(f => { try { f(); } catch (e) { console.error(e); } }); },
  async init() {
    const fbOnLocal = new URLSearchParams(location.search).has('fb');
    try {
      if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !fbOnLocal) {
        const as = new URLSearchParams(location.search).get('as') || 'tutor';
        this.local = true; this.db = LocalDB('test'); this.isOwner = as === 'tutor';
        this.uid = this.isOwner ? 'u_tutor' : 'u_' + as;
        this.me = { id: this.uid, name: this.isOwner ? 'Анна (тест)' : 'Ученик ' + as, avatarUrl: '', isOwner: this.isOwner };
      } else if (window.claude && typeof window.claude.use === 'function') {
        this.inViewer = true;
        const [user, db] = await Promise.all([window.claude.use('user').catch(() => null), window.claude.use('db').catch(() => null)]);
        this.user = user; this.db = db;
        if (user) { this.me = await user.me(); this.uid = this.me.id; this.isOwner = !!this.me.isOwner; }
      } else if (A.FB && A.FB.enabled) {
        /* GitHub Pages: вход через Google или почту (auth.js), дальше снова this.start() */
        this.fb = true; A.FB.init(); return;
      }
    } catch (e) { console.error(e); }
    if (!this.db || !this.uid) { this.state = 'guest'; this.emit(); A.route(); return; }
    this.start();
  },
  start() {
    this.state = 'ready';
    document.body.classList.add(this.isOwner ? 'is-owner' : this.isParent ? 'is-parent' : 'is-student');
    /* преподаватель видит всех учеников, родитель — своих детей (roles.js), ученик — свой кабинет */
    if (this.isOwner) this.watchAll(); else if (this.isParent) { if (this.watchKids) this.watchKids(); } else this.register();
    this.emit(); A.route();
  },
  async register() {
    const ref = this.db.doc('st/' + this.uid), now = Date.now();
    try { const s = await ref.get(); if (!s.exists) await ref.set({ joined: now, lastSeen: now, results: {}, recent: [] }); else await ref.update({ lastSeen: now }); }
    catch (e) { this.readOnly = true; }
    ref.onSnapshot(s => { this.st = s.exists ? s.data() : null; this.emit(); }, () => {});
    this.db.doc('hw/' + this.uid).onSnapshot(s => { this.hw = s.exists ? s.data() : null; this.emit(); }, () => {});
  },
  watchAll() {
    const map = this.map, get = id => map[id] || (map[id] = { uid: id, st: null, hw: null, roster: null, role: null });
    const upd = () => {
      // в списке учеников только роль «Ученик» (или аккаунты без роли — версия claude.ai)
      this.students = Object.values(map).filter(x => x.st && x.uid !== this.uid && (!x.role || x.role.role === 'student')).sort((a, b) => (b.st.lastSeen || 0) - (a.st.lastSeen || 0));
      this.resolve(this.students.map(s => s.uid)); this.emit();
    };
    const timer = setTimeout(() => { if (!this.loaded) { this.note = 'Список учеников пока не загрузился. Проверьте подключение.'; this.emit(); } }, 10000);
    const sub = (col, key) => this.db.collection(col).onSnapshot(s => {
      Object.values(map).forEach(x => { x[key] = null; }); s.docs.forEach(d => { get(d.id)[key] = d.data(); });
      if (key === 'st') { this.loaded = true; this.note = ''; clearTimeout(timer); } upd();
    }, e => { this.note = 'Не удалось загрузить учеников (' + ((e && e.code) || 'ошибка') + ').'; this.loaded = true; clearTimeout(timer); this.emit(); });
    sub('st', 'st'); sub('hw', 'hw'); sub('roster', 'roster'); if (this.fb) sub('roles', 'role');
  },
  async resolve(ids) {
    const need = ids.filter(id => !this.names[id]); if (!need.length) return;
    if (this.local) { need.forEach(id => { this.names[id] = { name: 'Ученик ' + id.slice(2), avatarUrl: '' }; }); return; }
    if (!this.user) return;
    try { const ps = await this.user.profiles(need); need.forEach(id => { const p = ps[id] || {}; this.names[id] = { name: p.name || '', avatarUrl: p.avatarUrl || '', email: p.email || '', age: p.age || null }; }); this.emit(); } catch (e) {}
  },
  person(uid) {
    const s = this.map[uid] || {}, n = this.names[uid] || {};
    return { name: (s.roster && s.roster.alias) || n.name || 'Ученик без имени', avatarUrl: n.avatarUrl || '', real: n.name || '', email: n.email || '', age: n.age || null };
  },
  items(hwDoc) { const it = (hwDoc && hwDoc.items) || {}; return Object.keys(it).map(id => Object.assign({ id }, it[id])).filter(x => !x.del).sort((a, b) => (a.status - b.status) || String(a.due || '9').localeCompare(String(b.due || '9')) || (b.created - a.created)); },
  activeCount() { return this.items(this.hw).filter(x => !x.status).length; },
  pendingCount() { return this.students.reduce((a, s) => a + this.items(s.hw).filter(x => x.status === 1).length, 0); },
  write(path, patch) {
    const q = queues[path] || (queues[path] = { patch: null, busy: false, waiters: [] });
    q.patch = q.patch ? deepMerge(q.patch, patch) : clone(patch);
    const p = new Promise(res => q.waiters.push(res)); flush(path); return p;
  },
  writeFailed(e) {
    if (!this.isOwner) this.readOnly = true;
    A.toast('Не удалось сохранить: ' + ((e && e.code) || 'нет доступа')); this.emit();
  },
  busy() { return Object.values(queues).some(q => q.busy || q.patch); }
};
async function flush(path) {
  const q = queues[path]; if (q.busy || !q.patch) return;
  q.busy = true; const patch = q.patch, waiters = q.waiters; q.patch = null; q.waiters = [];
  const ref = Acc.db.doc(path); let ok = true;
  try { await ref.update(patch); }
  catch (e) {
    try { const s = await ref.get(); if (!s.exists) await ref.set(patch); else throw e; }
    catch (e2) { ok = false; Acc.writeFailed(e2); }
  }
  q.busy = false; waiters.forEach(w => w(ok)); Acc.fns.forEach(f => { try { f('saved'); } catch (e) {} });
  if (q.patch) flush(path);
}

/* ---------- результаты упражнений ---------- */
A.onResult = function (L, code, s, t) {
  if (Acc.state !== 'ready' || Acc.isOwner || Acc.isParent || Acc.readOnly || !t) return;
  const key = L.id + ':' + code, now = Date.now(), prev = Acc.st && Acc.st.results && Acc.st.results[key];
  const best = Math.max(prev && prev.b != null ? prev.b : 0, s / t);
  const recent = [{ k: key, s, t, at: now }].concat((Acc.st && Acc.st.recent) || []).slice(0, 40);
  Acc.write('st/' + Acc.uid, { results: { [key]: { s, t, at: now, b: Math.round(best * 100) / 100, n: ((prev && prev.n) || 0) + 1 } }, recent, lastSeen: now });
};
A.bestFor = function (L, code) {
  const r = Acc.state === 'ready' && !Acc.isOwner && !Acc.isParent && Acc.st && Acc.st.results && Acc.st.results[L.id + ':' + code];
  return r ? Math.round((r.b != null ? r.b : r.s / r.t) * 100) : null;
};

/* ---------- материалы преподавателя к уроку ---------- */
A.lessonExtras = async function (L, el) {
  if (Acc.state !== 'ready' || !el) return;
  let h = '';
  try {
    const ex = await Acc.db.doc('extra/' + L.id).get();
    if (ex.exists && ex.data().text) h += '<div class="extra"><b>От преподавателя</b><p>' + A.inl(ex.data().text) + '</p></div>';
    if (Acc.isOwner) { const nt = await Acc.db.doc('notes/' + L.id).get(); if (nt.exists && nt.data().text) h += '<div class="extra mine"><b>Моя заметка · видна только вам</b><p>' + A.inl(nt.data().text) + '</p></div>'; }
  } catch (e) {}
  if (el.isConnected) el.innerHTML = h;
};
A.editExtras = async function (L) {
  if (!Acc.isOwner) return;
  let ex = '', nt = '';
  try { const a = await Acc.db.doc('extra/' + L.id).get(), b = await Acc.db.doc('notes/' + L.id).get(); ex = a.exists ? a.data().text || '' : ''; nt = b.exists ? b.data().text || '' : ''; } catch (e) {}
  A.modal('<div class="modal-h"><h2>Материалы к уроку ' + L.n + ' · ' + A.esc(A.LV[L.level].name) + '</h2><button class="ic" data-close aria-label="Закрыть">' + A.IC.x + '</button></div><div class="modal-b">' +
    '<label class="field">Для учеников: увидят все, кто открывает урок<textarea id="x-ex" style="min-height:140px" placeholder="Например: обратите внимание на тон 不 перед 4-м тоном. Ссылка на видео: …">' + A.esc(ex) + '</textarea></label>' +
    '<label class="field">Заметка для себя: видите только вы<textarea id="x-nt" placeholder="План урока, что повторить с конкретными учениками">' + A.esc(nt) + '</textarea></label></div>' +
    '<div class="modal-f"><button class="btn" data-close>Отмена</button><button class="btn pri" id="x-save">Сохранить</button></div>', (m, close) => {
    A.$('#x-save', m).onclick = async () => {
      const now = Date.now();
      try { await Acc.db.doc('extra/' + L.id).set({ text: A.$('#x-ex', m).value.trim(), updated: now }); await Acc.db.doc('notes/' + L.id).set({ text: A.$('#x-nt', m).value.trim(), updated: now }); A.toast('Материалы сохранены'); }
      catch (e) { A.toast('Не удалось сохранить: ' + ((e && e.code) || 'ошибка')); }
      close(); A.lessonExtras(L, A.$('#lx'));
    };
  });
};

/* ---------- время ---------- */
const MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
A.MON = MON;
A.ago = function (t) {
  if (!t) return 'ещё не заходил';
  const d = (Date.now() - t) / 1000;
  if (d < 90) return 'только что'; if (d < 3600) return Math.round(d / 60) + ' мин назад'; if (d < 86400) return Math.round(d / 3600) + ' ч назад';
  if (d < 172800) return 'вчера'; if (d < 604800) return Math.round(d / 86400) + ' дн. назад';
  const x = new Date(t); return x.getDate() + ' ' + MON[x.getMonth()];
};
A.day = t => { const x = new Date(t); return x.getDate() + ' ' + MON[x.getMonth()]; };
})();
