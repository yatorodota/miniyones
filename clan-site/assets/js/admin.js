window.ClanAdmin = (function () {
  var data = null;
  var filterText = "";
  var saveTimer = null;

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toast(msg) {
    var t = $("#toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      t.className = "toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("is-show");
    clearTimeout(t._t);
    t._t = setTimeout(function () { t.classList.remove("is-show"); }, 2000);
  }

  function commit(msg) {
    window.ClanStore.save(data);
    var flag = $("#savedFlag");
    if (!flag) return;
    flag.textContent = msg || "СОХРАНЕНО";
    flag.classList.add("is-save");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      flag.classList.remove("is-save");
      flag.textContent = "СОХРАНЕНО";
    }, 2000);
  }

  function rankById(id) {
    for (var i = 0; i < data.ranks.length; i++) if (data.ranks[i].id === id) return data.ranks[i];
    return { id: id, name: "ОПЕРАТОР", color: "#6b737b", order: 99 };
  }

  function sortedRanks() {
    return data.ranks.slice().sort(function (a, b) { return (a.order || 50) - (b.order || 50); });
  }

  function sortedMembers() {
    return data.members.slice().sort(function (a, b) {
      var ra = rankById(a.rank).order || 50, rb = rankById(b.rank).order || 50;
      if (ra !== rb) return ra - rb;
      return a.nick.localeCompare(b.nick);
    });
  }

  function actBtns(attrs) {
    return '<div class="list__acts">' + attrs + "</div>";
  }

  function fillRankSelects() {
    var current = $("#mRank").value;
    $("#mRank").innerHTML = sortedRanks().map(function (r) {
      return '<option value="' + esc(r.id) + '">' + esc(r.name) + "</option>";
    }).join("");
    if (current) $("#mRank").value = current;
  }

  function renderMembers() {
    $("#membersCount").textContent = data.members.length;
    var q = filterText.trim().toLowerCase();
    var list = sortedMembers().filter(function (m) {
      if (!q) return true;
      return (m.nick + " " + rankById(m.rank).name + " " + (m.note || "")).toLowerCase().indexOf(q) > -1;
    });
    $("#membersList").innerHTML = list.map(function (m) {
      var r = rankById(m.rank);
      return '<li class="list__row" style="--rank:' + esc(r.color) + '">' +
        '<img class="list__ava" loading="lazy" src="https://mc-heads.net/avatar/' + encodeURIComponent(m.nick) + '/40" alt="">' +
        '<div class="list__body"><div class="list__name">' + esc(m.nick) +
        '<span class="dot-status dot-status--' + esc(m.status) + '"></span></div>' +
        '<div class="list__meta">' + esc(r.name) + (m.joined ? " // " + esc(m.joined) : "") + (m.note ? " // " + esc(m.note) : "") + "</div></div>" +
        actBtns('<button class="mini" type="button" data-edit-m="' + esc(m.id) + '">ИЗМ.</button>' +
          '<button class="mini mini--del" type="button" data-del-m="' + esc(m.id) + '">УДАЛ.</button>') +
        "</li>";
    }).join("");
    $("#mEmpty").hidden = list.length > 0;
  }

  function renderRanks() {
    $("#ranksCount").textContent = data.ranks.length;
    $("#ranksList").innerHTML = sortedRanks().map(function (r) {
      var n = data.members.filter(function (m) { return m.rank === r.id; }).length;
      return '<li class="list__row" style="--rank:' + esc(r.color) + '">' +
        '<div class="list__body"><div class="list__name">' + esc(r.name) +
        '<span class="tag" style="color:' + esc(r.color) + '">#' + esc(r.id) + "</span></div>" +
        '<div class="list__meta">' + n + " УЧАСТНИКОВ // ВЕС " + (r.order || 50) + "</div></div>" +
        actBtns('<button class="mini" type="button" data-edit-r="' + esc(r.id) + '">ИЗМ.</button>' +
          '<button class="mini mini--del" type="button" data-del-r="' + esc(r.id) + '">УДАЛ.</button>') +
        "</li>";
    }).join("");
  }

  function renderJson() {
    $("#jsonView").value = window.ClanStore.exportJSON();
  }

  /* ===== ПУБЛИКАЦИИ И ЗВЁЗДЫ ===== */
  function renderPosts() {
    var box = $("#postsList");
    if (!box || !window.Minty) return;
    var list = window.Minty.posts();
    var stat = $("#postsStat");
    var s = window.Minty.stats();
    if (stat) stat.textContent = "ЗАЯВОК: " + s.posts + " // НА ПРОВЕРКЕ: " + s.pending;
    var empty = $("#postsEmpty");
    if (empty) empty.hidden = list.length > 0;
    box.innerHTML = list.map(function (p) {
      var st = p.status === "approved" ? "ЗАСЧИТАНО +1★" : (p.status === "rejected" ? "НЕ ЗАСЧИТАНО" : "НА ПРОВЕРКЕ");
      var img = p.image
        ? '<img class="pa-img" src="' + p.image + '" alt="Скрин: ' + esc(p.title) + '">'
        : '<div class="pa-img pa-img--none">БЕЗ СКРИНА</div>';
      var btns = p.status === "pending"
        ? '<button class="btn btn--sm" data-pa="ok" data-id="' + p.id + '"><span>Засчитать</span></button>' +
          '<button class="btn btn--sm btn--ghost" data-pa="no" data-id="' + p.id + '"><span>Отклонить</span></button>'
        : '<button class="btn btn--sm btn--danger" data-pa="reset" data-id="' + p.id + '"><span>Вернуть в очередь</span></button>';
      return '<div class="pa">' + img + '<div class="pa-body">' +
        '<div class="pa-head"><b>' + esc(p.nick) + '</b><span class="tag">' + st + '</span></div>' +
        '<h3>' + esc(p.title) + '</h3><p>' + esc(p.text) + '</p>' +
        '<div class="form-actions">' + btns + '</div></div></div>';
    }).join("");

    var ubox = $("#usersList");
    var uempty = $("#usersEmpty");
    if (ubox) {
      var board = window.Minty.leaderboard();
      if (uempty) uempty.hidden = board.length > 0;
      ubox.innerHTML = board.length ? '<div class="rank">' +
        '<div class="rank__row rank__row--head"><span>#</span><span>Ник</span><span>Звёзды</span><span>Ранг</span><span>Вход</span></div>' +
        board.map(function (u) {
          var d = u.joined ? Math.max(0, Math.floor((Date.now() - new Date(u.joined).getTime()) / 86400000)) : 0;
          return '<div class="rank__row"><span class="rank__place">' + u.place + '</span>' +
            '<span class="rank__nick">' + esc(u.nick) + '</span>' +
            '<span class="rank__stars">' + window.Minty.starStr(u.stars) + '</span>' +
            '<span class="rank__tier"><b>' + u.tier.name + '</b></span>' +
            '<span class="rank__me">' + d + " дн</span></div>";
        }).join("") + '</div>' : '';
    }
  }

  /* ===== КОДЫ ПРИГЛАШЕНИЯ И БЛОКИРОВКИ ===== */
  function renderCodes() {
    var box = $("#codesList");
    if (!box || !window.Minty) return;
    var list = window.Minty.inviteCodes();
    var info = window.Minty.codesInfo();
    var stat = $("#codesStat");
    if (stat) stat.textContent = "СВОБОДНО " + info.free + " // ИСПОЛЬЗОВАНО " + info.used;
    var empty = $("#codesEmpty");
    if (empty) empty.hidden = list.length > 0;
    box.innerHTML = list.map(function (c) {
      var used = !!c.usedBy;
      var when = used && c.usedAt
        ? new Date(c.usedAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
        : "";
      var tag = used
        ? '<span class="tag">ИСПОЛЬЗОВАН · ' + esc(c.usedBy) + (when ? " · " + esc(when) : "") + "</span>"
        : '<span class="tag tag--ok">СВОБОДЕН</span>';
      var who = c.nick ? 'только для ника ' + c.nick : "без привязки к нику";
      return '<li class="code-row' + (used ? " is-used" : "") + '">' +
        '<div class="code-row__meta"><code class="code">' + esc(c.code) + "</code>" + tag +
        '<span class="code-row__who">' + esc(who) + (c.note ? " · " + esc(c.note) : "") + "</span></div>" +
        '<div class="form-actions">' +
        '<button class="btn btn--sm btn--ghost" data-code="copy" data-id="' + c.id + '"><span>Копировать</span></button>' +
        (used ? '<button class="btn btn--sm btn--ghost" data-code="reset" data-id="' + c.id + '"><span>Вернуть в свободные</span></button>' : "") +
        '<button class="btn btn--sm btn--danger" data-code="del" data-id="' + c.id + '"><span>Удалить</span></button>' +
        "</div></li>";
    }).join("");

    var bbox = $("#bansList");
    if (bbox) {
      var bans = window.Minty.bans();
      var bempty = $("#bansEmpty");
      if (bempty) bempty.hidden = bans.length > 0;
      bbox.innerHTML = bans.map(function (b) {
        var why = b.reason ? " · " + esc(b.reason) : "";
        var at = b.at ? new Date(b.at).toLocaleDateString("ru-RU") : "";
        return '<li class="code-row"><div class="code-row__meta"><b>' + esc(b.nick) + "</b>" +
          '<span class="code-row__who">заблокирован' + (at ? " " + esc(at) : "") + esc(why) + "</span></div>" +
          '<div class="form-actions"><button class="btn btn--sm btn--ghost" data-unban="' + esc(b.nick) + '"><span>Разблокировать</span></button></div></li>';
      }).join("");
    }
  }

  /* ===== УПРАВЛЕНИЕ АККАУНТАМИ ИГРОКОВ ===== */
  var pFilter = "";
  var pRole = "";
  var pSort = "stars";

  function roleOptions(sel) {
    var roles = (window.Minty && window.Minty.ROLES) || ["ИГРОК"];
    var cur = sel.value;
    sel.innerHTML = sel.id === "pRole"
      ? '<option value="">Любая роль</option>' + roles.map(function (r) {
        return '<option value="' + esc(r) + '">' + esc(r) + "</option>";
      }).join("")
      : roles.map(function (r) {
        return '<option value="' + esc(r) + '">' + esc(r) + "</option>";
      }).join("");
    sel.value = cur;
    if (sel.value !== cur) sel.selectedIndex = sel.id === "pRole" ? 0 : 0;
  }

  function seenText(u) {
    if (!u.lastSeen) return "не заходил";
    var t = new Date(u.lastSeen).getTime();
    if (isNaN(t)) return "не заходил";
    var min = Math.floor((Date.now() - t) / 60000);
    if (min < 1) return "только что";
    if (min < 60) return min + " мин назад";
    if (min < 1440) return Math.floor(min / 60) + " ч назад";
    return Math.floor(min / 1440) + " дн назад";
  }

  function renderPlayers() {
    var box = $("#playersList");
    if (!box || !window.Minty || !window.Minty.adminUsers) return;
    var all = window.Minty.adminUsers();
    var roles = (window.Minty.ROLES || []).slice();

    var stat = $("#playersStat");
    if (stat) {
      stat.textContent = "ВСЕГО: " + all.length + " // В БАНЕ: " +
        all.filter(function (u) { return u.banned; }).length;
    }
    var cnt = $("#playersCount");
    if (cnt) cnt.textContent = all.length;
    roleOptions($("#pRole"));
    roleOptions($("#bulkRole"));

    var q = pFilter.trim().toLowerCase();
    var list = all.filter(function (u) {
      if (pRole && u.role !== pRole) return false;
      if (!q) return true;
      return (u.nick + " " + (u.ds || "") + " " + u.role + " " + (u.note || ""))
        .toLowerCase().indexOf(q) >= 0;
    });
    list.sort(function (a, b) {
      if (pSort === "nick") return a.nick.toLowerCase() < b.nick.toLowerCase() ? -1 : 1;
      if (pSort === "joined") return String(b.joined || "").localeCompare(String(a.joined || ""));
      if (pSort === "seen") return String(b.lastSeen || "").localeCompare(String(a.lastSeen || ""));
      if (b.stars !== a.stars) return b.stars - a.stars;
      return a.nick.toLowerCase() < b.nick.toLowerCase() ? -1 : 1;
    });

    var empty = $("#playersEmpty");
    if (empty) empty.hidden = list.length > 0;

    box.innerHTML = list.length ? list.map(function (u) {
      var flags = [];
      if (u.banned) flags.push('<span class="tag tag--bad">БАН</span>');
      var roleSel = '<select class="row-sel" data-play-role="' + u.id + '">' +
        roles.map(function (r) {
          return '<option value="' + esc(r) + '"' + (r === u.role ? " selected" : "") + ">" + esc(r) + "</option>";
        }).join("") +
        (roles.indexOf(u.role) < 0 ? '<option value="' + esc(u.role) + '" selected>' + esc(u.role) + "</option>" : "") +
        "</select>";
      return '<div class="pl' + (u.banned ? " is-banned" : "") + '">' +
        '<div class="pl__head"><b>' + esc(u.nick) + "</b>" + flags.join("") + "</div>" +
        '<div class="pl__meta">' +
        "<span>звёзды: <b>" + u.stars + "</b> (" + esc(u.tier.name) + ")</span>" +
        "<span>discord: <b>" + (u.ds ? esc(u.ds) : "—") + "</b></span>" +
        "<span>вход: " + (u.joined ? esc(new Date(u.joined).toLocaleDateString("ru-RU")) : "—") + "</span>" +
        "<span>" + esc(seenText(u)) + "</span>" +
        "<span>публикаций: " + u.postsApproved + "/" + u.postsTotal + "</span>" +
        (u.code ? "<span>код: <code>" + esc(u.code) + "</code></span>" : "") +
        (u.note ? "<span>заметка: " + esc(u.note) + "</span>" : "") +
        "</div>" +
        '<div class="pl__row">' + roleSel +
        '<button class="btn btn--sm" data-play="star" data-id="' + u.id + '"><span>+1★</span></button>' +
        '<button class="btn btn--sm btn--ghost" data-play="minus" data-id="' + u.id + '"><span>−1★</span></button>' +
        '<button class="btn btn--sm btn--ghost" data-play="stars" data-id="' + u.id + '"><span>Звёзды…</span></button>' +
        '<button class="btn btn--sm btn--ghost" data-play="nick" data-id="' + u.id + '"><span>Ник…</span></button>' +
        '<button class="btn btn--sm btn--ghost" data-play="note" data-id="' + u.id + '"><span>Заметка…</span></button>' +
        '<button class="btn btn--sm btn--ghost" data-play="pass" data-id="' + u.id + '"><span>Пароль…</span></button>' +
        '<button class="btn btn--sm btn--ghost" data-play="code" data-id="' + u.id + '"><span>Код</span></button>' +
        (u.banned
          ? '<button class="btn btn--sm btn--ghost" data-play="unban" data-id="' + u.id + '"><span>Разбанить</span></button>'
          : '<button class="btn btn--sm btn--ghost" data-play="ban" data-id="' + u.id + '"><span>Забанить</span></button>') +
        '<button class="btn btn--sm btn--danger" data-play="del" data-id="' + u.id + '"><span>Удалить</span></button>' +
        "</div></div>";
    }).join("") : "";
  }

  function playerById(id) {
    return window.Minty.adminUsers().filter(function (u) { return u.id === id; })[0] || null;
  }

  function playAction(act, id) {
    var u = playerById(id);
    if (!u && act !== "role") { toast("Аккаунт не найден"); renderPlayers(); return; }
    if (act === "star" || act === "minus") {
      var res = window.Minty.addStars(id, act === "star" ? 1 : -1);
      if (!res.ok) { toast(res.error); return; }
      toast("У " + res.user.nick + ": " + res.user.stars + " звёзд · " + res.user.tier.name);
    } else if (act === "stars") {
      var val = prompt("Сколько звёзд у " + u.nick + " сейчас " + u.stars + ". Введи новое число:", String(u.stars));
      if (val === null) return;
      var r2 = window.Minty.setStars(id, val);
      if (!r2.ok) { toast(r2.error); return; }
      toast("У " + r2.user.nick + ": " + r2.user.stars + " звёзд");
    } else if (act === "nick") {
      var nn = prompt("Новый ник для " + u.nick + " (3–16 символов, латиница):", u.nick);
      if (nn === null) return;
      var r3 = window.Minty.editUser(id, { nick: nn });
      if (!r3.ok) { toast(r3.error); return; }
      toast("НИК: " + r3.user.nick);
    } else if (act === "note") {
      var nt = prompt("Заметка для " + u.nick + ":", u.note || "");
      if (nt === null) return;
      window.Minty.editUser(id, { note: nt });
      toast("ЗАМЕТКА СОХРАНЕНА");
    } else if (act === "pass") {
      var pw = prompt("Новый пароль для " + u.nick + " (минимум 4 символа). Передай его игроку:", "");
      if (pw === null) return;
      window.Minty.setUserPassword(id, pw).then(function (r4) {
        if (!r4.ok) { toast(r4.error); return; }
        toast("ПАРОЛЬ ОБНОВЛЁН");
      });
    } else if (act === "code") {
      var rc = window.Minty.codeForUser(id, "выдан главой");
      if (!rc.ok) { toast(rc.error); return; }
      toast("КОД ДЛЯ " + u.nick + ": " + rc.made[0].code);
    } else if (act === "ban") {
      var why = prompt("Причина бана для " + u.nick + ":", "");
      if (why === null) return;
      var rb = window.Minty.banUser(id, why);
      if (!rb.ok) { toast(rb.error); return; }
      toast("ЗАБАНЕН: " + u.nick);
    } else if (act === "unban") {
      window.Minty.unbanUser(id);
      toast("РАЗБАНЕН: " + u.nick);
    } else if (act === "del") {
      if (!confirm("Удалить аккаунт " + u.nick + "?\nПубликации игрока тоже удалятся, а его код приглашения станет свободным.")) return;
      var rd = window.Minty.deleteUser(id, { freeCode: true });
      if (!rd.ok) { toast(rd.error); return; }
      toast("АККАУНТ УДАЛЁН: " + rd.nick);
    }
    renderAll();
  }

  function renderAll() {
    fillRankSelects();
    renderMembers();
    renderRanks();
    renderJson();
    renderPosts();
    renderPlayers();
    renderCodes();
  }

  var TEXT_FIELDS = {
    cClanName: "clanName",
    cTag: "tag",
    cMotto: "motto",
    cDescription: "description",
    cFounded: "founded",
    cHeroTitleTop: "heroTitleTop",
    cHeroTitleBottom: "heroTitleBottom",
    cHeroImage: "heroImage",
    cHeroCaption: "heroCaption",
    cHeroSubtitle: "heroSubtitle",
    cRecruitment: "recruitment",
    cRecruitmentText: "recruitmentText",
    cDiscord: "discord",
    cDonate: "donate"
  };
  var NUM_FIELDS = { cSeasons: "seasons", cProjects: "projects", cGoals: "goals" };
  var TOGGLES = {
    cShowStats: "showStats",
    cShowAccess: "showAccess",
    cShowSkills: "showSkills",
    cShowRecruitment: "showRecruitment"
  };

  function fillSettings() {
    var c = data.config;
    Object.keys(TEXT_FIELDS).forEach(function (id) {
      $("#" + id).value = c[TEXT_FIELDS[id]] == null ? "" : c[TEXT_FIELDS[id]];
    });
    Object.keys(NUM_FIELDS).forEach(function (id) {
      var v = (c.stats || {})[NUM_FIELDS[id]];
      $("#" + id).value = v == null ? "" : v;
    });
    Object.keys(TOGGLES).forEach(function (id) { $("#" + id).checked = !!c[TOGGLES[id]]; });
    $("#cSkills").value = (data.skills || []).map(function (s) {
      return s.hint ? s.name + " | " + s.hint : s.name;
    }).join("\n");
  }

  function readSettings() {
    var c = data.config;
    Object.keys(TEXT_FIELDS).forEach(function (id) { c[TEXT_FIELDS[id]] = $("#" + id).value.trim(); });
    c.stats = c.stats || {};
    Object.keys(NUM_FIELDS).forEach(function (id) {
      c.stats[NUM_FIELDS[id]] = +$("#" + id).value || 0;
    });
    Object.keys(TOGGLES).forEach(function (id) { c[TOGGLES[id]] = $("#" + id).checked; });
    data.skills = $("#cSkills").value.split(/\r?\n/).map(function (line) {
      var parts = line.split("|");
      var name = (parts.shift() || "").trim();
      var hint = parts.join("|").trim();
      if (!name && !hint) return null;
      return { name: name, hint: hint };
    }).filter(Boolean);
  }

  function download(name, text) {
    var blob = new Blob([text], { type: "application/json;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function openMember(id) {
    var m = data.members.filter(function (x) { return x.id === id; })[0];
    if (!m) return;
    $("#mId").value = m.id;
    $("#mNick").value = m.nick || "";
    $("#mReal").value = m.realName || "";
    $("#mRank").value = m.rank || "member";
    $("#mStatus").value = m.status || "offline";
    $("#mJoined").value = m.joined || "";
    $("#mNote").value = m.note || "";
    $("#memberFormTitle").textContent = "Изменить участника";
    $("#mSubmit").querySelector("span").textContent = "Сохранить";
    $("#mCancel").hidden = false;
  }

  function resetMemberForm() {
    $("#memberForm").reset();
    $("#mId").value = "";
    $("#memberFormTitle").textContent = "Добавить участника";
    $("#mSubmit").querySelector("span").textContent = "Добавить";
    $("#mCancel").hidden = true;
  }

  function openRank(id) {
    var r = rankById(id);
    $("#rId").value = r.id;
    $("#rName").value = r.name;
    $("#rColor").value = r.color;
    $("#rOrder").value = r.order || 50;
    $("#rSubmit").querySelector("span").textContent = "Сохранить";
    $("#rCancel").hidden = false;
  }

  function resetRankForm() {
    $("#rankForm").reset();
    $("#rId").value = "";
    $("#rSubmit").querySelector("span").textContent = "Добавить";
    $("#rCancel").hidden = true;
  }

  function bind() {
    $("#tabs").addEventListener("click", function (e) {
      var tab = e.target.closest(".tab");
      if (!tab) return;
      $$(".tab").forEach(function (t) { t.classList.toggle("is-active", t === tab); });
      $$(".panel").forEach(function (p) {
        p.classList.toggle("is-active", p.getAttribute("data-panel") === tab.getAttribute("data-tab"));
      });
      if (tab.getAttribute("data-tab") === "codes") renderCodes();
      if (tab.getAttribute("data-tab") === "posts") renderPosts();
    });

    $("#mFilter").addEventListener("input", function () { filterText = this.value; renderMembers(); });

    $("#memberForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var id = $("#mId").value;
      var payload = {
        nick: $("#mNick").value.trim(),
        realName: $("#mReal").value.trim(),
        rank: $("#mRank").value,
        status: $("#mStatus").value,
        joined: $("#mJoined").value,
        note: $("#mNote").value.trim()
      };
      if (!payload.nick) return;
      if (id) {
        data.members = data.members.map(function (m) { return m.id === id ? Object.assign(m, payload) : m; });
        toast("УЧАСТНИК ОБНОВЛЁН");
      } else {
        payload.id = window.ClanStore.uid("m");
        data.members.push(payload);
        toast("ДОБАВЛЕН // " + payload.nick.toUpperCase());
      }
      commit();
      renderAll();
      resetMemberForm();
    });
    $("#mCancel").addEventListener("click", resetMemberForm);

    $("#bulkAdd").addEventListener("click", function () {
      var lines = $("#bulkInput").value.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
      if (!lines.length) { toast("СПИСОК ПУСТ"); return; }
      var added = 0;
      lines.forEach(function (line) {
        var parts = line.split("|").map(function (p) { return p.trim(); });
        var nick = parts[0];
        if (!nick) return;
        if (data.members.some(function (m) { return m.nick.toLowerCase() === nick.toLowerCase(); })) return;
        var rank = (parts[1] || "member").toLowerCase();
        if (!data.ranks.some(function (r) { return r.id === rank; })) {
          var newRank = rank.replace(/[^a-zа-я0-9]+/gi, "") || window.ClanStore.uid("r");
          if (data.ranks.some(function (r) { return r.id === newRank; })) newRank = newRank + data.ranks.length;
          data.ranks.push({ id: newRank, name: parts[1] || "Оператор", color: "#6b737b", order: 90 });
        }
        data.members.push({
          id: window.ClanStore.uid("m"),
          nick: nick,
          realName: "",
          rank: rank,
          status: "offline",
          joined: /^\d{4}-\d{2}-\d{2}$/.test(parts[2] || "") ? parts[2] : "",
          note: parts[3] || ""
        });
        added++;
      });
      commit();
      renderAll();
      $("#bulkInput").value = "";
      toast("ДОБАВЛЕНО // " + added);
    });

    $("#settingsForm").addEventListener("submit", function (e) {
      e.preventDefault();
      readSettings();
      commit("НАСТРОЙКИ СОХРАНЕНЫ");
      renderJson();
      toast("НАСТРОЙКИ СОХРАНЕНЫ");
    });

    $("#rankForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var id = $("#rId").value;
      var name = $("#rName").value.trim();
      if (!name) return;
      var payload = { name: name, color: $("#rColor").value, order: +$("#rOrder").value || 50 };
      if (id) {
        data.ranks = data.ranks.map(function (r) { return r.id === id ? Object.assign(r, payload) : r; });
        toast("РАНГ ОБНОВЛЁН");
      } else {
        var newId = name.toLowerCase().replace(/[^a-zа-я0-9]+/gi, "").slice(0, 20) || window.ClanStore.uid("r");
        if (data.ranks.some(function (r) { return r.id === newId; })) newId = newId + data.ranks.length;
        payload.id = newId;
        data.ranks.push(payload);
        toast("РАНГ ДОБАВЛЕН");
      }
      commit();
      renderAll();
      resetRankForm();
    });
    $("#rCancel").addEventListener("click", resetRankForm);

    var CLICK_SEL = "[data-del-m],[data-edit-m],[data-del-r]," +
      "[data-edit-r],[data-pa],[data-code],[data-unban],[data-play]";

    document.addEventListener("click", function (e) {
      var t = (e.target && e.target.closest) ? e.target.closest(CLICK_SEL) : e.target;
      var id, at, act;
      if (!t || !(at = t.getAttribute)) return;

      if ((id = at.call(t, "data-del-m"))) {
        if (!confirm("Удалить участника?")) return;
        data.members = data.members.filter(function (m) { return m.id !== id; });
        commit(); renderAll(); toast("УЧАСТНИК УДАЛЁН");
      } else if ((id = at.call(t, "data-edit-m"))) {
        openMember(id);
      } else if ((id = at.call(t, "data-del-r"))) {
        var used = data.members.filter(function (m) { return m.rank === id; }).length;
        if (used && !confirm("Ранг используют " + used + " участников. Они останутся без ранга. Удалить?")) return;
        data.ranks = data.ranks.filter(function (r) { return r.id !== id; });
        commit(); renderAll(); toast("РАНГ УДАЛЁН");
      } else if ((id = at.call(t, "data-edit-r"))) {
        openRank(id);
      } else if ((act = t.getAttribute("data-pa"))) {
        id = t.getAttribute("data-id");
        var res = window.Minty.setStatus(id, act === "ok" ? "approved" : (act === "no" ? "rejected" : "pending"));
        if (!res.ok) { toast(res.error); return; }
        renderAll();
        toast(act === "ok" ? "ЗАСЧИТАНО +1 ЗВЕЗДА" : (act === "no" ? "ОТКЛОНЕНО" : "ВОЗВРАЩЕНО В ОЧЕРЕДЬ"));
      } else if ((act = t.getAttribute("data-code"))) {
        id = t.getAttribute("data-id");
        var entry = window.Minty.inviteCodes().filter(function (c) { return c.id === id; })[0];
        if (!entry) { renderCodes(); return; }
        if (act === "copy") {
          if (navigator.clipboard) navigator.clipboard.writeText(entry.code).then(function () { toast("КОД СКОПИРОВАН"); });
          else toast("КОД: " + entry.code);
        } else if (act === "reset") {
          window.Minty.resetCode(id);
          renderCodes();
          toast("КОД СНОВА СВОБОДНЫЙ");
        } else if (act === "del") {
          if (!confirm("Удалить код " + entry.code + "?")) return;
          window.Minty.deleteCode(id);
          renderCodes();
          toast("КОД УДАЛЁН");
        }
      } else if ((act = t.getAttribute("data-unban"))) {
        window.Minty.unban(act);
        renderCodes();
        toast("РАЗБЛОКИРОВАН");
      } else if ((act = t.getAttribute("data-play"))) {
        id = t.getAttribute("data-id");
        playAction(act, id);
      }
    });

    document.addEventListener("change", function (e) {
      var el = e.target;
      if (!el || !el.getAttribute) return;
      var rid = el.getAttribute("data-play-role");
      if (!rid) return;
      var res = window.Minty.setRole(rid, el.value);
      if (!res.ok) { toast(res.error); renderPlayers(); return; }
      toast("РОЛЬ: " + res.user.nick + " — " + res.user.role);
      renderAll();
    });

    $("#pFilter").addEventListener("input", function () { pFilter = this.value; renderPlayers(); });
    $("#pRole").addEventListener("change", function () { pRole = this.value; renderPlayers(); });
    $("#pSort").addEventListener("change", function () { pSort = this.value; renderPlayers(); });
    $("#bulkApply").addEventListener("click", function () {
      var all = window.Minty.adminUsers();
      if (!all.length) { toast("Аккаунтов нет"); return; }
      var role = $("#bulkRole").value;
      var stars = parseInt($("#bulkStars").value, 10) || 0;
      if (!role && !stars) { toast("Выбери роль или укажи звёзды"); return; }
      if (!confirm("Применить к " + all.length + " аккаунтам:\n" +
        (role ? "роль: " + role : "") + (role && stars ? "\n" : "") +
        (stars ? "звёзды: " + (stars > 0 ? "+" : "") + stars : "") + "?")) return;
      all.forEach(function (u) {
        if (role) window.Minty.setRole(u.id, role);
        if (stars) window.Minty.addStars(u.id, stars);
      });
      renderAll();
      var log = $("#bulkLog");
      if (log) log.textContent = "Применено к " + all.length + " аккаунтам.";
      toast("ГОТОВО: " + all.length);
    });

    $("#codeForm").addEventListener("submit", function (e) {
      e.preventDefault();
      makeCodesNow($("#cCount").value);
    });

    $$("[data-quick]").forEach(function (b) {
      b.addEventListener("click", function () {
        var n = b.getAttribute("data-quick");
        $("#cCount").value = n;
        makeCodesNow(n);
      });
    });

    function makeCodesNow(n) {
      var res = window.Minty.makeCodes(n, $("#cNote").value, $("#cNick").value);
      if (!res.ok) { toast(res.error || "НЕ УДАЛОСЬ СОЗДАТЬ КОДЫ"); return; }
      $("#cNote").value = "";
      $("#cNick").value = "";
      renderCodes();
      var out = $("#codesCheckOut");
      if (out) {
        out.innerHTML = "<b>ВАЖНО:</b> коды пока только в этом браузере. Нажми «Скачать clan.json с кодами», замени файл <code>data/clan.json</code> в проекте и залей на хостинг — иначе у игроков будет «код не найден». Проверить: «Проверить файл на сайте».";
      }
      toast("СОЗДАНО КОДОВ: " + res.made.length + " // НУЖЕН ЭКСПОРТ");
    }

    $("#codesCopyAll").addEventListener("click", function () {
      var text = window.Minty.inviteCodes()
        .filter(function (c) { return !c.usedBy; })
        .map(function (c) { return c.code + (c.nick ? " — только " + c.nick : ""); })
        .join("\n");
      if (!text) { toast("СВОБОДНЫХ КОДОВ НЕТ"); return; }
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { toast("КОДЫ СКОПИРОВАНЫ"); });
      else toast("СВОБОДНЫХ КОДОВ: " + window.Minty.codesInfo().free);
    });

  function clanJSON() {
    var out = window.ClanStore.load();
    out.codes = (window.Minty && window.Minty.inviteCodes) ? window.Minty.inviteCodes() : [];
    return JSON.stringify(out, null, 2);
  }

  $("#exportFile").addEventListener("click", function () {
    download("clan.json", clanJSON());
    toast("CLAN.JSON СКАЧАН");
  });
  $("#copyJson").addEventListener("click", function () {
    var text = clanJSON();
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { toast("JSON СКОПИРОВАН"); });
    else { $("#jsonView").select(); document.execCommand("copy"); toast("JSON СКОПИРОВАН"); }
  });

    $("#codesExport").addEventListener("click", function () {
      download("clan.json", clanJSON());
      toast("CLAN.JSON С КОДАМИ // ЗАЛЕЙ ЕГО НА ХОСТИНГ");
    });

    $("#codesCheck").addEventListener("click", function () {
      var out = $("#codesCheckOut");
      if (!window.Minty || !window.Minty.fetchFileCodes) return;
      out.textContent = "ПРОВЕРЯЮ ФАЙЛ НА САЙТЕ…";
      window.Minty.fetchFileCodes({ merge: false }).then(function (r) {
        var mine = window.Minty.inviteCodes();
        if (!r || !r.ok) {
          out.innerHTML = "<b>ПЛОХО:</b> " + window.Minty.esc(r && r.error ? r.error : "файл не прочитан") +
            " — коды с сайта не загрузятся, игроки получат «код не найден».";
          return;
        }
        var fileKeys = {}, mineKeys = {};
        r.file.forEach(function (c) { fileKeys[window.Minty.normCode(c.code)] = 1; });
        mine.forEach(function (c) { mineKeys[window.Minty.normCode(c.code)] = 1; });
        var missing = mine.filter(function (c) { return !fileKeys[window.Minty.normCode(c.code)]; });
        var free = r.file.filter(function (c) { return !c.usedBy; }).length;
        if (!r.file.length) {
          out.innerHTML = "<b>ПЛОХО:</b> на сайте 0 кодов. Скачай clan.json с кодами и залей его как <code>data/clan.json</code>.";
        } else if (missing.length) {
          out.innerHTML = "<b>НЕ ЗАГРУЖЕНО:</b> на сайте " + r.file.length + " кодов (свободных " + free +
            "), а у тебя " + mine.length + ". Не хватает в файле: " + window.Minty.esc(missing.slice(0, 6).map(function (c) { return c.code; }).join(", ")) +
            (missing.length > 6 ? "…" : "") + ". Скачай и залей clan.json заново.";
        } else {
          out.innerHTML = "<b>ОК:</b> на сайте " + r.file.length + " кодов, свободных " + free +
            " — все твои коды на месте, игроки смогут зарегистрироваться.";
        }
      });
    });

    function doImport(text, label) {
    try {
      var parsed = JSON.parse(text);
      data = window.ClanStore.importJSON(text);
      if (parsed && Array.isArray(parsed.codes) && window.Minty && window.Minty.mergeCodes) {
        var added = window.Minty.mergeCodes(parsed.codes);
        if (added) renderCodes();
      }
      fillSettings();
      renderAll();
      toast("ИМПОРТ ВЫПОЛНЕН" + (label ? " // " + label : ""));
    } catch (err) {
      toast("НЕКОРРЕКТНЫЙ JSON // " + err.message);
    }
  }

    $("#importBtn").addEventListener("click", function () {
      var text = $("#importInput").value.trim();
      if (!text) { toast("ВСТАВЬТЕ JSON"); return; }
      doImport(text);
    });
    $("#importFile").addEventListener("change", function () {
      var file = this.files && this.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () { doImport(reader.result, file.name); };
      reader.readAsText(file);
    });
    $("#resetBtn").addEventListener("click", function () {
      if (!confirm("Сбросить все данные к значениям по умолчанию? Действие нельзя отменить.")) return;
      data = window.ClanStore.clear();
      commit();
      fillSettings();
      renderAll();
      toast("ДАННЫЕ СБРОШЕНЫ");
    });

    $("#pinSave").addEventListener("click", function () {
      var pin = $("#pinInput").value.trim();
      window.ClanStore.setPin(pin);
      updatePinState();
      $("#pinInput").value = "";
      toast(pin ? "КОД СОХРАНЁН" : "КОД УДАЛЁН");
    });

    $("#lockBtn").addEventListener("click", function () {
      sessionStorage.removeItem("clan_site_unlocked");
      location.reload();
    });
  }

  function updatePinState() {
    var pin = window.ClanStore.getPin();
    var def = (window.CLAN_DEFAULTS || {}).pin;
    $("#pinState").textContent = pin || "—";
    $("#pinIsDefault").textContent = !localStorage.getItem("clan_site_pin_v1") ? "(КОД ПО УМОЛЧАНИЮ)" : "(КОД ИЗМЕНЁН)";
  }

  function showUI() {
    $("#gate").hidden = true;
    $("#tabs").hidden = false;
    $("#panels").hidden = false;
  }

  function init() {
    data = window.ClanStore.load();

    var pin = window.ClanStore.getPin();
    var unlocked = sessionStorage.getItem("clan_site_unlocked") === "1";

    function boot() {
      fillSettings();
      renderAll();
      updatePinState();
      showUI();
    }

    bind();

    /* Аккаунты игроков меняются в другой вкладке или на сайте — обновляем панель. */
    if (window.Minty && window.Minty.onChange) {
      window.Minty.onChange(function () { if (data) renderAll(); });
    }

    if (pin && !unlocked) {
      $("#gate").hidden = false;
      var gateErr = $("#gateError");
      var gateInput = $("#gateInput");
      var gateBtn = $("#gateForm button[type=submit]");
      function tryGate() {
        var val = (gateInput.value || "").trim();
        if (val && val === pin) {
          gateErr.hidden = true;
          sessionStorage.setItem("clan_site_unlocked", "1");
          boot();
        } else {
          gateErr.hidden = false;
          gateInput.select();
        }
      }
      $("#gateForm").addEventListener("submit", function (e) {
        e.preventDefault();
        tryGate();
      });
      if (gateBtn) {
        gateBtn.addEventListener("click", function (e) {
          e.preventDefault();
          tryGate();
        });
      }
      gateInput.addEventListener("input", function () { gateErr.hidden = true; });
      setTimeout(function () { gateInput.focus(); }, 60);
    } else {
      boot();
    }

    var localRaw = window.ClanStore.raw();
    fetch("data/clan.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (json) {
        if (!json) return;
        var changed = !localRaw || localRaw.version !== (typeof json.version === "number" ? json.version : 0);
        data = window.ClanStore.syncWithFile(json, localRaw);
        window.ClanStore.save(data);
        fillSettings();
        renderAll();
        if (changed) toast("ЗАГРУЖЕНО // DATA/CLAN.JSON");
      })
      .catch(function () {});
  }

  return { init: init };
})();

document.addEventListener("DOMContentLoaded", function () { window.ClanAdmin.init(); });
