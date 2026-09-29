window.Minty = (function () {
  var USERS = "minteny_users_v1";
  var SESSION = "minteny_session_v1";
  var POSTS = "minteny_posts_v1";
  var GUARD = "minteny_guard_v1";
  var BANS = "minteny_bans_v1";
  var CODES = "minteny_codes_v1";
  var MAX_POSTS = 60;
  var MAX_IMG_CHARS = 900000;

  /* ===== ЗАЩИТА ОТ МАССОВОЙ РЕГИСТРАЦИИ =====
     Регистрация — только по коду приглашения от главы клана.
     Лимитов на количество и частоту аккаунтов нет: сколько кодов выдал глава,
     столько игроков и смогут зайти. Считаем только неверные коды и входы. */
  var LIMITS = {
    codeFails: 5,                        // 5 неверных кодов -> пауза на codeLock            
    loginFails: 5,                       // 5 неверных паролей -> блокировка входа
    loginLock: 5 * 60 * 1000,            // блокировка входа на 5 минут
    loginLockHard: 60 * 60 * 1000,       // после 10 попыток — на час
    postCooldown: 10 * 60 * 1000,        // 1 публикация за 10 минут
    postMaxPending: 3,                   // не больше 3 постов в ожидании
    postMaxDay: 10                       // не больше 10 постов в сутки
  };

  /* Ники, которые нельзя занимать: служебные и названия рангов. */
  var RESERVED = [
    "admin", "админ", "администратор", "модератор", "модер", "support", "поддержка",
    "бот", "bot", "system", "система", "root", "null", "undefined", "me",
    "глава", "зам", "доверенный", "участник", "мод", "admin1"
  ];

  var TIERS = [
    { min: 0, name: "НОВИЧОК", note: "только появился в городе" },
    { min: 3, name: "ЖИТЕЛЬ", note: "свой дом и постоянство" },
    { min: 6, name: "СТРОИТЕЛЬ", note: "строит для города" },
    { min: 10, name: "МАСТЕР", note: "делает то, что не делают другие" },
    { min: 15, name: "ЛЕГЕНДА", note: "город строят вокруг него" }
  ];

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function uid(prefix) {
    return (prefix || "id") + "_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
  }

  function now() { return new Date().toISOString(); }

  /* ===== ХЕШ ПАРОЛЯ (не криптография для сайта, только чтобы не хранить пароль открыто).
     Префикс w1:/s1: — метка алгоритма, чтобы запись и проверка всегда считались одним способом. ===== */
  function weakHash(str) {
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      h1 = ((h1 ^ c) * 0x01000193) >>> 0;
      h2 = ((h2 + c) * 0x85ebca6b) >>> 0;
    }
    return "w1:" + ("00000000" + h1.toString(16)).slice(-8) + ("00000000" + h2.toString(16)).slice(-8);
  }

  function strongHash(text) {
    if (!(window.crypto && window.crypto.subtle)) return Promise.resolve(weakHash(text));
    return window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (buf) {
      return "s1:" + Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return ("00" + b.toString(16)).slice(-2);
      }).join("");
    }).catch(function () { return weakHash(text); });
  }

  /* Проверка всегда тем же способом, каким пароль был записан. */
  function hashAs(stored, salt, pass) {
    if (stored && stored.indexOf("s1:") === 0) return strongHash(salt + "|" + pass);
    return Promise.resolve(weakHash(salt + "|" + pass));
  }

  /* ===== ЗАЩИТА: СЧЁТЧИКИ, БЛОКИРОВКИ, БАНЫ ===== */
  function guard() {
    var g = read(GUARD, null);
    if (!g || typeof g !== "object") g = {};
    delete g.regTimes; /* лимитов регистрации больше нет */
    if (!g.login || typeof g.login !== "object") g.login = { fails: 0, lock: 0 };
    if (!g.post || typeof g.post !== "object") g.post = { times: [] };
    if (!Array.isArray(g.post.times)) g.post.times = [];
    if (typeof g.codeFails !== "number") g.codeFails = 0;
    if (typeof g.codeLock !== "number") g.codeLock = 0;
    return g;
  }

  function saveGuard(g) { return write(GUARD, g); }

  function ms() { return Date.now(); }

  function fmtWait(rest) {
    var s = Math.max(0, Math.ceil(rest / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    if (h) return h + " ч " + (m ? m + " мин" : "");
    if (m) return m + " мин " + (s % 60 ? s % 60 + " с" : "");
    return s + " с";
  }

  function trim(arr, window_) {
    var cut = ms() - window_;
    return (arr || []).filter(function (t) { return t > cut; });
  }

  /* ===== КОДЫ ПРИГЛАШЕНИЯ =====
     Глава клана создаёт коды в панели и отправляет игроку в личку.
     Один код — один аккаунт. Код можно привязать к нику. */
  var CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; /* без похожих символов 0/O, 1/I */

  function inviteCodes() {
    var list = read(CODES, []);
    return Array.isArray(list) ? list.filter(Boolean) : [];
  }

  function saveCodes(list) {
    if (!write(CODES, list)) return { ok: false, error: "Не удалось сохранить коды" };
    emit();
    return { ok: true };
  }

  function newCode() {
    function block() {
      var out = "";
      for (var i = 0; i < 4; i++) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      return out;
    }
    var code = "MNY-" + block() + "-" + block();
    var guard_ = 0;
    while (findCode(code) && guard_++ < 20) code = "MNY-" + block() + "-" + block();
    return code;
  }

  function normCode(code) {
    return String(code || "").trim().toUpperCase().replace(/\s+/g, "");
  }

  function findCode(code) {
    var key = normCode(code);
    if (!key) return null;
    return inviteCodes().filter(function (c) { return normCode(c.code) === key; })[0] || null;
  }

  function makeCodes(count, note, nick) {
    var n = Math.max(1, Math.min(50, parseInt(count, 10) || 1));
    var list = inviteCodes();
    var made = [];
    for (var i = 0; i < n; i++) {
      var c = {
        id: uid("i"),
        code: newCode(),
        note: String(note || "").slice(0, 60),
        nick: String(nick || "").trim().slice(0, 16),
        at: now(),
        usedBy: "",
        usedAt: ""
      };
      list.unshift(c);
      made.push(c);
    }
    var res = saveCodes(list);
    if (!res.ok) return res;
    return { ok: true, made: made, total: list.length };
  }

  function deleteCode(id) {
    return saveCodes(inviteCodes().filter(function (c) { return c.id !== id; }));
  }

  function resetCode(id) {
    var list = inviteCodes().map(function (c) {
      if (c.id !== id) return c;
      c.usedBy = "";
      c.usedAt = "";
      return c;
    });
    return saveCodes(list);
  }

  function codesInfo() {
    var list = inviteCodes();
    return {
      total: list.length,
      free: list.filter(function (c) { return !c.usedBy; }).length,
      used: list.filter(function (c) { return !!c.usedBy; }).length,
      required: true
    };
  }

  /* Коды ездят вместе с сайтом: глава выгружает clan.json (вкладка «Игроки»),
     игроки подтягивают коды из data/clan.json. Без этого игрок вводил бы верный
     код, а сайт отвечал «код не найден»: у него в браузере списка кодов нет. */
  function mergeCodes(fromFile) {
    var list = inviteCodes();
    var have = {};
    list.forEach(function (c) { have[normCode(c.code)] = true; });
    var added = 0;
    fromFile.forEach(function (c) {
      if (!c || !c.code) return;
      var k = normCode(c.code);
      if (!k || have[k]) return;
      have[k] = true;
      list.push({
        id: c.id || uid("i"),
        code: c.code,
        note: String(c.note || "с сайта").slice(0, 60),
        nick: String(c.nick || "").trim().slice(0, 16),
        at: c.at || now(),
        usedBy: c.usedBy || "",
        usedAt: c.usedAt || ""
      });
      added++;
    });
    if (added) saveCodes(list);
    return added;
  }

  /* Читает коды с залитого сайта. Cache-busting, чтобы старый файл не
     пришёл из кэша хостинга. merge: false - только посмотреть, не менять. */
  function fetchFileCodes(opts) {
    opts = opts || {};
    return fetch("data/clan.json?v=" + Date.now(), { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) return null;
        return r.json();
      })
      .then(function (json) {
        if (!json) return { ok: false, error: "файл data/clan.json не найден (404)" };
        var file = Array.isArray(json.codes) ? json.codes : [];
        var res = { ok: true, version: json.version, file: file, added: 0 };
        res.added = opts.merge === false ? 0 : mergeCodes(file);
        return res;
      })
      .catch(function () { return { ok: false, error: "файл data/clan.json не читается" }; });
  }

  function syncCodes() {
    if (syncCodes.promise) return syncCodes.promise;
    syncCodes.promise = fetchFileCodes().then(function (r) { return r.ok ? r.added : 0; });
    return syncCodes.promise;
  }

  /* Проверка кода при регистрации. Код тратится только при верном аккаунте. */
  function useInviteCode(code, nick) {
    var g = guard();
    if (g.codeLock > ms()) {
      return { ok: false, error: "Пауза после неверных кодов: подожди " + fmtWait(g.codeLock - ms()) + "." };
    }
    var key = normCode(code);
    if (!key) return { ok: false, error: "Введи код приглашения" };
    var found = findCode(key);
    if (!found) {
      g.codeFails = (g.codeFails || 0) + 1;
      if (g.codeFails >= LIMITS.codeFails) {
        g.codeLock = ms() + LIMITS.codeLock;
        g.codeFails = 0;
      }
      saveGuard(g);
      return { ok: false, error: inviteCodes().length
        ? "Код не найден. Проверь раскладку и что код ещё не использован."
        : "Код не найден: на сайте нет ни одного кода. Попроси главу клана выгрузить панель и залить clan.json." };
    }
    if (found.usedBy) {
      return { ok: false, error: "Этот код уже использован: " + found.usedBy };
    }
    if (found.nick && found.nick.toLowerCase() !== String(nick || "").trim().toLowerCase()) {
      return { ok: false, error: "Этот код выдан другому игроку" };
    }
    return { ok: true, entry: found };
  }

  function burnInviteCode(entry, nick) {
    var list = inviteCodes().map(function (c) {
      if (c.id !== entry.id) return c;
      c.usedBy = String(nick || "").trim();
      c.usedAt = now();
      return c;
    });
    return saveCodes(list);
  }

  /* Лимитов на количество и частоту аккаунтов нет — только код и пауза
     после серии неверных кодов. */
  function registerBlockReason(g) {
    if (g.codeLock > ms())
      return "Пауза после неверных кодов: подожди " + fmtWait(g.codeLock - ms()) + ".";
    return null;
  }

  function guardInfo() {
    var g = guard();
    return {
      accounts: users().length,
      loginLock: Math.max(0, (g.login.lock || 0) - ms()),
      codeLock: Math.max(0, g.codeLock - ms()),
      codes: codesInfo(),
      limits: LIMITS
    };
  }

  function bans() {
    var list = read(BANS, []);
    return Array.isArray(list) ? list.filter(Boolean) : [];
  }

  function isBanned(nick) {
    var key = String(nick || "").trim().toLowerCase();
    return bans().filter(function (b) { return String(b.nick || "").toLowerCase() === key; })[0] || null;
  }

  function ban(nick, reason) {
    var n = String(nick || "").trim();
    if (!n) return { ok: false, error: "Пустой ник" };
    if (isBanned(n)) return { ok: false, error: "Ник уже в бане" };
    var list = bans();
    list.unshift({ id: uid("b"), nick: n, reason: String(reason || "").slice(0, 120), at: now() });
    if (!write(BANS, list)) return { ok: false, error: "Не удалось сохранить бан" };
    emit();
    return { ok: true, total: list.length };
  }

  function unban(idOrNick) {
    var key = String(idOrNick || "").trim().toLowerCase();
    var list = bans().filter(function (b) {
      return b.id !== idOrNick && String(b.nick || "").toLowerCase() !== key;
    });
    if (!write(BANS, list)) return { ok: false, error: "Не удалось сохранить" };
    emit();
    return { ok: true, total: list.length };
  }

  function touch(user) {
    if (!user) return;
    var list = users().map(function (u) {
      if (u.id !== user.id) return u;
      u.lastSeen = now();
      return u;
    });
    write(USERS, list);
  }
  /* ===== РАНГИ ПО ЗВЁЗДАМ ===== */
  function tierOf(stars) {
    var n = Math.max(0, +stars || 0), out = TIERS[0];
    for (var i = 0; i < TIERS.length; i++) if (n >= TIERS[i].min) out = TIERS[i];
    return out;
  }

  function nextTier(stars) {
    var n = Math.max(0, +stars || 0);
    for (var i = 0; i < TIERS.length; i++) if (n < TIERS[i].min) return TIERS[i];
    return null;
  }

  /* ===== ПОЛЬЗОВАТЕЛИ ===== */
  function users() {
    var list = read(USERS, []);
    return Array.isArray(list) ? list.filter(Boolean) : [];
  }

  function saveUsers(list) {
    if (!write(USERS, list)) return { ok: false, error: "Не удалось сохранить: закончилось место в браузере" };
    return { ok: true };
  }

  function findUser(nick) {
    var key = String(nick || "").trim().toLowerCase();
    return users().filter(function (u) { return u.nick.toLowerCase() === key; })[0] || null;
  }

  function validNick(nick) {
    var v = String(nick || "").trim();
    if (v.length < 3 || v.length > 16) return "Ник: от 3 до 16 символов";
    if (!/^[A-Za-z0-9_\-]+$/.test(v)) return "Ник: только латиница, цифры, _ и -";
    if (RESERVED.indexOf(v.toLowerCase()) >= 0) return "Этот ник занят или зарезервирован";
    return null;
  }

  function validDiscord(d) {
    var v = String(d || "").trim().replace(/\s+/g, " ");
    if (!v) return "Укажи свой ник в Discord";
    if (v.length < 2) return "Ник в Discord: минимум 2 символа";
    if (v.length > 32) return "Ник в Discord: максимум 32 символа";
    if (!/^[A-Za-z0-9._\- ]+$/.test(v)) return "Ник в Discord: буквы, цифры, пробел и _ . -";
    return null;
  }

  /* opts: { code: "MNY-XXXX-XXXX", discord: "ник в Discord" } */
  function register(nick, pass, opts) {
    return syncCodes().then(function () { return doRegister(nick, pass, opts); });
  }

  function doRegister(nick, pass, opts) {
    opts = opts || {};
    var nErr = validNick(nick);
    if (nErr) return Promise.resolve({ ok: false, error: nErr });
    var dErr = validDiscord(opts.discord);
    if (dErr) return Promise.resolve({ ok: false, error: dErr });
    if (String(pass || "").length < 4) return Promise.resolve({ ok: false, error: "Пароль: минимум 4 символа" });
    if (isBanned(nick)) return Promise.resolve({ ok: false, error: "Этот ник заблокирован" });

    var g = guard();
    var blocked = registerBlockReason(g);
    if (blocked) return Promise.resolve({ ok: false, error: blocked, guard: guardInfo() });

    /* регистрация только по коду приглашения */
    var codeRes = useInviteCode(opts.code, nick);
    if (!codeRes.ok) return Promise.resolve({ ok: false, error: codeRes.error, guard: guardInfo() });

    if (findUser(nick)) return Promise.resolve({ ok: false, error: "Такой ник уже занят" });

    var salt = uid("s");
    return strongHash(salt + "|" + pass).then(function (hash) {
      var list = users();
      var user = {
        id: uid("u"), nick: String(nick).trim(), salt: salt, hash: hash,
        ds: String(opts.discord || "").trim().replace(/\s+/g, " "),
        stars: 0, role: "ИГРОК", note: "", joined: now(), approved: 0, lastSeen: now()
      };
      list.push(user);
      var res = saveUsers(list);
      if (!res.ok) return res;
      write(SESSION, { nick: user.nick, at: now() });
      var burned = burnInviteCode(codeRes.entry, user.nick);
      if (!burned.ok) return { ok: false, error: "Аккаунт создан, но код не списался — скажи главе" };
      g.codeFails = 0;
      g.codeLock = 0;
      saveGuard(g);
      emit();
      return { ok: true, user: publicUser(user), guard: guardInfo() };
    });
  }

  function login(nick, pass) {
    var g = guard();
    var lock = g.login.lock || 0;
    if (lock > ms()) {
      return Promise.resolve({
        ok: false,
        error: "Вход заблокирован на " + fmtWait(lock - ms()) + " — слишком много неверных паролей"
      });
    }
    var user = findUser(nick);
    if (!user) {
      g.login.fails = (g.login.fails || 0) + 1;
      lockLogin(g);
      return Promise.resolve({ ok: false, error: "Аккаунт не найден" });
    }
    if (isBanned(user.nick)) return Promise.resolve({ ok: false, error: "Аккаунт заблокирован" });
    return hashAs(user.hash, user.salt, pass).then(function (hash) {
      if (hash !== user.hash) {
        g.login.fails = (g.login.fails || 0) + 1;
        lockLogin(g);
        return { ok: false, error: "Неверный пароль" };
      }
      g.login = { fails: 0, lock: 0 };
      saveGuard(g);
      write(SESSION, { nick: user.nick, at: now() });
      touch(user);
      emit();
      return { ok: true, user: publicUser(user) };
    });
  }

  function lockLogin(g) {
    var f = g.login.fails || 0;
    if (f >= 10) g.login.lock = ms() + LIMITS.loginLockHard;
    else if (f >= LIMITS.loginFails) g.login.lock = ms() + LIMITS.loginLock;
    saveGuard(g);
  }

  function logout() {
    localStorage.removeItem(SESSION);
    emit();
  }

  function sessionNick() {
    var s = read(SESSION, null);
    return s && s.nick ? s.nick : null;
  }

  function me() {
    var nick = sessionNick();
    if (!nick) return null;
    var u = findUser(nick);
    if (!u) return null;
    touch(u);
    var out = publicUser(u);
    out.place = placeOf(u.id);
    return out;
  }

  /* ВНИМАНИЕ: placeOf() зовёт leaderboard(), поэтому publicUser() не может
     вызывать placeOf() — иначе бесконечная рекурсия. Место присваивает тот,
     кто строит рейтинг (leaderboard или me). */
  function publicUser(u) {
    return {
      id: u.id, nick: u.nick, stars: u.stars || 0, joined: u.joined,
      ds: u.ds || "",
      tier: tierOf(u.stars), next: nextTier(u.stars), place: 0,
      role: roleOf(u),
      lastSeen: u.lastSeen || "",
      banned: !!isBanned(u.nick)
    };
  }

  function leaderboard() {
    return users().map(publicUser).sort(function (a, b) {
      if (b.stars !== a.stars) return b.stars - a.stars;
      return a.nick.toLowerCase() < b.nick.toLowerCase() ? -1 : 1;
    }).map(function (u, i) { u.place = i + 1; return u; });
  }

  function placeOf(id) {
    var board = leaderboard();
    for (var i = 0; i < board.length; i++) if (board[i].id === id) return i + 1;
    return 0;
  }

  /* ===== УПРАВЛЕНИЕ АККАУНТАМИ ИГРОКОВ (ПАНЕЛЬ ГЛАВЫ) =====
     Аккаунты лежат в этом браузере (localStorage), поэтому глава видит и
     меняет только те, что зарегистрированы здесь же. С появлением бэкенда
     эти же функции будут работать со всеми игроками. */
  var ROLES = ["ИГРОК", "УЧАСТНИК", "СТРОИТЕЛЬ", "МОДЕРАТОР", "ЗАМ ГЛАВЫ", "ГЛАВА"];

  function roleOf(u) {
    var r = String((u && u.role) || "").trim().toUpperCase();
    return r || "ИГРОК";
  }

  function adminUser(u) {
    var pub = publicUser(u);
    var mine = posts().filter(function (p) { return p.userId === u.id; });
    pub.role = roleOf(u);
    pub.note = String(u.note || "").slice(0, 120);
    pub.approved = u.approved || 0;
    pub.postsTotal = mine.length;
    pub.postsApproved = mine.filter(function (p) { return p.status === "approved"; }).length;
    pub.code = (function () {
      var c = inviteCodes().filter(function (x) { return x.usedBy && x.usedBy.toLowerCase() === u.nick.toLowerCase(); })[0];
      return c ? c.code : "";
    })();
    return pub;
  }

  function adminUsers() {
    return users().map(adminUser).sort(function (a, b) {
      if (b.stars !== a.stars) return b.stars - a.stars;
      return a.nick.toLowerCase() < b.nick.toLowerCase() ? -1 : 1;
    });
  }

  function withUser(id, fn) {
    var list = users();
    var target = list.filter(function (u) { return u.id === id; })[0];
    if (!target) return { ok: false, error: "Аккаунт не найден" };
    var res = fn(target, list);
    if (res && res.ok === false) return res;
    var saved = saveUsers(list);
    if (!saved.ok) return saved;
    emit();
    return { ok: true, user: adminUser(target) };
  }

  /* ник, роль, заметка */
  function editUser(id, patch) {
    patch = patch || {};
    return withUser(id, function (u, list) {
      if (patch.nick !== undefined) {
        var nn = String(patch.nick || "").trim();
        var err = validNick(nn);
        if (err) return { ok: false, error: err };
        var twin = list.filter(function (x) {
          return x.id !== u.id && x.nick.toLowerCase() === nn.toLowerCase();
        })[0];
        if (twin) return { ok: false, error: "Ник уже занят: " + twin.nick };
        if (nn !== u.nick) {
          /* сожжённый код должен остаться за этим же игроком */
          saveCodes(inviteCodes().map(function (c) {
            if (c.usedBy && c.usedBy.toLowerCase() === u.nick.toLowerCase()) c.usedBy = nn;
            return c;
          }));
          var s = read(SESSION, null);
          if (s && s.nick && s.nick.toLowerCase() === u.nick.toLowerCase()) s.nick = nn;
          write(SESSION, s);
          u.nick = nn;
        }
      }
      if (patch.role !== undefined) {
        u.role = String(patch.role || "").trim().toUpperCase().slice(0, 24) || "ИГРОК";
      }
      if (patch.note !== undefined) {
        u.note = String(patch.note || "").slice(0, 120);
      }
      return { ok: true };
    });
  }

  function setRole(id, role) {
    return editUser(id, { role: role });
  }

  function addStars(id, delta) {
    return withUser(id, function (u) {
      var n = Math.max(0, Math.min(9999, (u.stars || 0) + (parseInt(delta, 10) || 0)));
      u.stars = n;
      return { ok: true };
    });
  }

  function setStars(id, value) {
    return withUser(id, function (u) {
      u.stars = Math.max(0, Math.min(9999, parseInt(value, 10) || 0));
      return { ok: true };
    });
  }

  /* Новый пароль по инициативе главы: соль меняется, хэш пересчитывается. */
  function setUserPassword(id, pass) {
    var p = String(pass || "");
    if (p.length < 4) return Promise.resolve({ ok: false, error: "Пароль: минимум 4 символа" });
    var list = users();
    var u = list.filter(function (x) { return x.id === id; })[0];
    if (!u) return Promise.resolve({ ok: false, error: "Аккаунт не найден" });
    u.salt = uid("s");
    return strongHash(u.salt + "|" + p).then(function (hash) {
      u.hash = hash;
      var saved = saveUsers(list);
      if (!saved.ok) return saved;
      emit();
      return { ok: true, user: adminUser(u) };
    });
  }

  /* opts: { keepPosts: true, freeCode: true } */
  function deleteUser(id, opts) {
    opts = opts || {};
    var list = users();
    var u = list.filter(function (x) { return x.id === id; })[0];
    if (!u) return { ok: false, error: "Аккаунт не найден" };
    var rest = list.filter(function (x) { return x.id !== id; });
    var saved = saveUsers(rest);
    if (!saved.ok) return saved;
    if (!opts.keepPosts) {
      write(POSTS, posts().filter(function (p) { return p.userId !== id; }));
    }
    if (opts.freeCode) {
      saveCodes(inviteCodes().map(function (c) {
        if (c.usedBy && c.usedBy.toLowerCase() === u.nick.toLowerCase()) {
          c.usedBy = "";
          c.usedAt = "";
        }
        return c;
      }));
    }
    var s = read(SESSION, null);
    if (s && s.nick && s.nick.toLowerCase() === u.nick.toLowerCase()) localStorage.removeItem(SESSION);
    var bl = bans().filter(function (b) { return String(b.nick || "").toLowerCase() !== u.nick.toLowerCase(); });
    if (bl.length !== bans().length) write(BANS, bl);
    emit();
    return { ok: true, nick: u.nick };
  }

  function banUser(id, reason) {
    var u = users().filter(function (x) { return x.id === id; })[0];
    if (!u) return { ok: false, error: "Аккаунт не найден" };
    return ban(u.nick, reason);
  }

  function unbanUser(id) {
    var u = users().filter(function (x) { return x.id === id; })[0];
    if (!u) return unban(id);
    return unban(u.nick);
  }

  /* Персональный код приглашения для конкретного игрока. */
  function codeForUser(id, note) {
    var u = users().filter(function (x) { return x.id === id; })[0];
    if (!u) return { ok: false, error: "Аккаунт не найден" };
    return makeCodes(1, note || "выдан главой", u.nick);
  }

  /* ===== ПУБЛИКАЦИИ (СКРИНЫ РАБОТЫ) ===== */
  function posts() {
    var list = read(POSTS, []);
    return Array.isArray(list) ? list.filter(Boolean) : [];
  }

  function savePosts(list) {
    if (list.length > MAX_POSTS) list = list.slice(0, MAX_POSTS);
    if (!write(POSTS, list)) return { ok: false, error: "Не удалось сохранить: закончилось место в браузере" };
    emit();
    return { ok: true };
  }

  function submit(user, post) {
    var title = String(post.title || "").trim();
    var text = String(post.text || "").trim();
    if (!title) return { ok: false, error: "Введите заголовок" };
    if (text.length < 10) return { ok: false, error: "Опиши подробнее, что сделал (от 10 символов)" };
    if (isBanned(user.nick)) return { ok: false, error: "Публикации заблокированы" };
    var img = String(post.image || "");
    if (img.length > MAX_IMG_CHARS) return { ok: false, error: "Скрин слишком большой — пришли поменьше" };

    var g = guard();
    var pending = posts().filter(function (p) { return p.userId === user.id && p.status === "pending"; });
    if (pending.length >= LIMITS.postMaxPending)
      return { ok: false, error: "У тебя уже " + LIMITS.postMaxPending + " публикации в ожидании — глава ещё не проверил" };
    var times = trim(g.post.times, 24 * 60 * 60 * 1000);
    g.post.times = times;
    if (times.length >= LIMITS.postMaxDay)
      return { ok: false, error: "Дневной лимит — " + LIMITS.postMaxDay + " публикаций в сутки" };
    if (times.length && ms() - times[times.length - 1] < LIMITS.postCooldown)
      return { ok: false, error: "Слишком часто: следующая публикация через " + fmtWait(times[times.length - 1] + LIMITS.postCooldown - ms()) };

    var list = posts();
    list.unshift({
      id: uid("p"),
      nick: user.nick,
      userId: user.id,
      title: title.slice(0, 80),
      text: text.slice(0, 600),
      image: img,
      status: "pending",
      created: now(),
      decided: ""
    });
    var res = savePosts(list);
    if (!res.ok) return res;
    g.post.times = trim(g.post.times, 24 * 60 * 60 * 1000).concat([ms()]);
    saveGuard(g);
    return { ok: true };
  }

  function setStatus(id, status) {
    var list = posts();
    var post = list.filter(function (p) { return p.id === id; })[0];
    if (!post) return { ok: false, error: "Публикация не найдена" };
    if (post.status === status) return { ok: true };
    post.status = status;
    post.decided = now();
    if (status === "approved" && !post.awarded) {
      var u = users().filter(function (x) { return x.id === post.userId; })[0];
      if (!u) u = findUser(post.nick);
      if (u) {
        u.stars = (u.stars || 0) + 1;
        u.approved = (u.approved || 0) + 1;
        var usersOk = write(USERS, users().map(function (x) { return x.id === u.id ? u : x; }));
        if (!usersOk) return { ok: false, error: "Не удалось сохранить звезду" };
      }
      post.awarded = true;
    }
    var res = write(POSTS, list);
    emit();
    if (!res) return { ok: false, error: "Не удалось сохранить" };
    return { ok: true };
  }

  function myPosts(user) {
    return posts().filter(function (p) { return p.userId === user.id; });
  }

  function approvedPosts() {
    return posts().filter(function (p) { return p.status === "approved"; });
  }

  function stats() {
    var list = users(), p = posts();
    return {
      users: list.length,
      posts: p.length,
      pending: p.filter(function (x) { return x.status === "pending"; }).length,
      stars: list.reduce(function (s, u) { return s + (u.stars || 0); }, 0)
    };
  }

  /* ===== СКРИН → СЖАТЫЙ JPEG ===== */
  function shrinkImage(file, maxW, quality) {
    maxW = maxW || 1100; quality = quality || 0.72;
    return new Promise(function (resolve, reject) {
      if (!file) return resolve("");
      if (!/^image\//.test(file.type)) return reject(new Error("Это не картинка"));
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error("Не удалось прочитать файл")); };
      fr.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error("Не удалось открыть картинку")); };
        img.onload = function () {
          var w = img.width, h = img.height;
          if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
          var cv = document.createElement("canvas");
          cv.width = w; cv.height = h;
          cv.getContext("2d").drawImage(img, 0, 0, w, h);
          var out = "";
          try { out = cv.toDataURL("image/jpeg", quality); } catch (e) { out = ""; }
          if (!out) return reject(new Error("Браузер не смог обработать картинку"));
          resolve(out);
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  /* ===== СОБЫТИЯ ===== */
  function emit() {
    try { window.dispatchEvent(new CustomEvent("minty:change")); } catch (e) {}
  }

  function onChange(cb) {
    window.addEventListener("minty:change", cb);
    window.addEventListener("storage", function (e) {
      if (e.key && e.key.indexOf("minteny_") === 0) cb();
    });
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function starStr(n) {
    return new Array(Math.min(20, Math.max(0, +n || 0)) + 1).join("*");
  }

  return {
    TIERS: TIERS,
    LIMITS: LIMITS,
    RESERVED: RESERVED,
    ROLES: ROLES,
    register: register,
    login: login,
    logout: logout,
    me: me,
    users: users,
    findUser: findUser,
    validNick: validNick,
    leaderboard: leaderboard,
    placeOf: placeOf,
    tierOf: tierOf,
    nextTier: nextTier,
    posts: posts,
    myPosts: myPosts,
    approvedPosts: approvedPosts,
    submit: submit,
    setStatus: setStatus,
    stats: stats,
    shrinkImage: shrinkImage,
    onChange: onChange,
    emit: emit,
    esc: esc,
    starStr: starStr,
    /* защита */
    guardInfo: guardInfo,
    fmtWait: fmtWait,
    bans: bans,
    isBanned: isBanned,
    ban: ban,
    unban: unban,
    /* коды приглашения */
    inviteCodes: inviteCodes,
    makeCodes: makeCodes,
    mergeCodes: mergeCodes,
    syncCodes: syncCodes,
    fetchFileCodes: fetchFileCodes,
    deleteCode: deleteCode,
    resetCode: resetCode,
    codesInfo: codesInfo,
    findCode: findCode,
    normCode: normCode,
    /* управление аккаунтами игроков (панель) */
    adminUsers: adminUsers,
    adminUser: adminUser,
    editUser: editUser,
    setRole: setRole,
    addStars: addStars,
    setStars: setStars,
    setUserPassword: setUserPassword,
    deleteUser: deleteUser,
    banUser: banUser,
    unbanUser: unbanUser,
    codeForUser: codeForUser,
    KEYS: { USERS: USERS, SESSION: SESSION, POSTS: POSTS, GUARD: GUARD, BANS: BANS, CODES: CODES }
  };
})();
