window.ClanApp = (function () {
  var state = { data: null, rank: "all", query: "" };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function rankById(id) {
    var list = state.data.ranks || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return { id: id, name: "ОПЕРАТОР", color: "#616871", order: 99 };
  }

  function sortedRanks() {
    return (state.data.ranks || []).slice().sort(function (a, b) { return (a.order || 50) - (b.order || 50); });
  }

  function sortedMembers() {
    return (state.data.members || []).slice().sort(function (a, b) {
      var ra = rankById(a.rank).order || 50, rb = rankById(b.rank).order || 50;
      if (ra !== rb) return ra - rb;
      return a.nick.localeCompare(b.nick);
    });
  }

  function formatDate(d) {
    if (!d) return "";
    var months = ["ЯНВ", "ФЕВ", "МАР", "АПР", "МАЯ", "ИЮН", "ИЮЛ", "АВГ", "СЕН", "ОКТ", "НОЯ", "ДЕК"];
    var m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return String(d);
    return +m[3] + " " + months[+m[2] - 1] + " " + m[1];
  }

  function statusTitle(s) {
    return { game: "ИГРАЕТ", splash: "ОТДЫХАЕТ", offline: "ВНЕ ИГРЫ" }[s] || "ВНЕ ИГРЫ";
  }

  function headUrl(nick, size) {
    return "https://mc-heads.net/avatar/" + encodeURIComponent(nick) + "/" + (size || 160) + "?t=" + encodeURIComponent(nick);
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
    t._t = setTimeout(function () { t.classList.remove("is-show"); }, 2200);
  }

  /* ===== CONFIG FILL ===== */
  function fillConfig() {
    var c = state.data.config;
    document.title = c.clanName + " // клан в Minecraft";

    $$("[data-c]").forEach(function (el) {
      var key = el.getAttribute("data-c");
      var val = c[key];
      if (val == null) return;
      if (el.tagName === "A") {
        el.href = val;
        if (!/^https?:/i.test(val)) el.classList.add("hidden");
      } else {
        el.textContent = val;
        if (val === "") el.hidden = true;
      }
    });

    if (c.heroTitleTop) $("#heroTitleTop").textContent = c.heroTitleTop;
    if (c.heroTitleBottom) $("#heroTitleBottom").textContent = c.heroTitleBottom;
    if (c.heroCaption) $("#heroCaption").textContent = c.heroCaption;
    var hero = $("#heroImg");
    if (hero && c.heroImage) {
      hero.src = c.heroImage;
      hero.alt = (c.clanName || "") + " — миньон в повязке";
    }

    var mode = c.recruitment || "open";
    var open = mode !== "closed";
    var req = mode === "request";
    var st = $("#joinStatus");
    if (st) {
      st.textContent = req ? "Набор по заявке" : (open ? "Набор в клан открыт" : "Набор временно закрыт");
      var box = st.closest(".cta__status") || st.parentNode;
      var dot = box ? box.querySelector("i") : null;
      if (dot) dot.className = "dot-status " + (open ? "dot-status--game" : "dot-status--offline");
    }
    var jb = $("#joinBtn");
    if (jb) {
      jb.href = c.discord || "#join";
      var jbl = req ? "Оставить заявку" : (open ? "Присоединиться" : "Связаться с нами");
      jb.querySelector("span").textContent = jbl;
      jb.setAttribute("data-text", jbl);
    }

    $("#statsGrid").classList.toggle("hidden", !c.showStats);
    $("#join").classList.toggle("hidden", !c.showRecruitment);
    var sk = $("#skills");
    if (sk) sk.classList.toggle("hidden", !c.showSkills);

    [["fDiscord", c.discord]].forEach(function (p) {
      var a = $("#" + p[0]);
      if (!a) return;
      a.href = p[1] || "#";
      a.classList.toggle("hidden", !p[1]);
    });
  }

  /* ===== TICKER ===== */
  function renderTicker() {
    var words = ["BUILD // СТРОИМ", "SURVIVE // ВЫЖИВАЕМ", "RAID // ИГРАЕМ", "CONQUER // ПОБЕЖДАЕМ", "SEASON // " + (state.data.config.founded || ""), "UNIT // " + state.data.config.clanName];
    var html = words.map(function (w) { return "<span>" + esc(w) + "</span>"; }).join("");
    $("#ticker").innerHTML = html + html;
  }

  /* ===== STATS ===== */
  function renderStats() {
    var c = state.data.config;
    var s = c.stats || {};
    var members = state.data.members || [];
    var years = c.founded ? Math.max(1, new Date().getFullYear() - parseInt(c.founded, 10) + 1) : 0;
    var items = [
      { v: members.length, l: "Активных игроков", s: "+" },
      { v: s.seasons || 0, l: "Сезона" },
      { v: s.projects || 0, l: "Проектов", s: "+" },
      { v: s.goals || 1, l: "Общая цель" }
    ];
    var grid = $("#statsGrid");
    grid.innerHTML = items.map(function (it, i) {
      return '<div class="stat"><i>' + pad(i + 1) + "/04</i><b>" + esc(it.v) + (it.s || "") + "</b><span>" + esc(it.l) + "</span></div>";
    }).join("");
    var est = $("#statYears");
    if (est) est.textContent = years;
  }
  /* ===== СВЯЗЬ: ТОЛЬКО DISCORD ===== */
  function renderAccess() {
    var c = state.data.config;
    var link = c.discord || "";
    var inv = $("#accInvite");
    if (inv) inv.textContent = link ? link.replace(/^https?:\/\//, "") : "—";
    var join = $("#accJoin");
    if (join) {
      join.href = link || "#contacts";
      join.classList.toggle("hidden", !link);
    }
    var copy = $("#copyInvite");
    if (copy) {
      copy.setAttribute("data-copy", link);
      copy.classList.toggle("hidden", !link);
    }
    var box = $("#accessBox");
    if (box) box.classList.toggle("hidden", !c.showAccess);
  }

  /* ===== MEMBERS ===== */
  function renderFilters() {
    var box = $("#rankFilters");
    var all = state.data.members.length;
    var html = '<button class="chip' + (state.rank === "all" ? " is-active" : "") + '" data-rank="all">Все // ' + all + "</button>";
    sortedRanks().forEach(function (r) {
      var n = all === 0 ? 0 : state.data.members.filter(function (m) { return m.rank === r.id; }).length;
      html += '<button class="chip' + (state.rank === r.id ? " is-active" : "") + '" data-rank="' + esc(r.id) + '">' + esc(r.name) + " // " + n + "</button>";
    });
    box.innerHTML = html;
  }

  function leadCard(m) {
    var rank = rankById(m.rank);
    return '<article class="card card--lead" style="--rank:' + esc(rank.color) + '">' +
      '<span class="card__corner card__corner--tr"></span><span class="card__corner card__corner--bl"></span>' +
      '<div class="card__body">' +
      '<div class="card__head">' +
      '<img class="card__ava" loading="lazy" src="' + esc(headUrl(m.nick, 240)) + '" alt="' + esc(m.nick) + '" data-fallback="' + esc((m.nick.charAt(0) || "?").toUpperCase()) + '">' +
      "<div><h3 class=\"card__name\" data-copy=\"" + esc(m.nick) + "\">" + esc(m.nick) +
      '<i class="dot-status dot-status--' + esc(m.status) + '" title="' + esc(statusTitle(m.status)) + '"></i></h3>' +
      '<span class="card__role">' + esc(rank.name) + (m.joined ? " // с " + esc(formatDate(m.joined)) : "") + "</span></div>" +
      "</div>" +
      (m.note ? '<p class="card__note">' + esc(m.note) + "</p>" : "") +
      '<div class="card__meta"><span>UNIT // ' + esc(rank.id.toUpperCase()) + "</span><span>STATUS // " + esc(statusTitle(m.status)) + "</span></div>" +
      "</div></article>";
  }

  function deputyCard(m) {
    var rank = rankById(m.rank);
    return '<article class="card card--deputy" style="--rank:' + esc(rank.color) + '">' +
      '<span class="card__corner card__corner--tr"></span><span class="card__corner card__corner--bl"></span>' +
      '<div class="card__body">' +
      '<img class="card__ava" loading="lazy" src="' + esc(headUrl(m.nick, 200)) + '" alt="' + esc(m.nick) + '" data-fallback="' + esc((m.nick.charAt(0) || "?").toUpperCase()) + '">' +
      '<h3 class="card__name" style="margin-top:16px" data-copy="' + esc(m.nick) + '">' + esc(m.nick) +
      '<i class="dot-status dot-status--' + esc(m.status) + '" title="' + esc(statusTitle(m.status)) + '"></i></h3>' +
      '<span class="card__role">' + esc(rank.name) + "</span>" +
      (m.note ? '<p class="card__note" style="margin-top:14px">' + esc(m.note) + "</p>" : "") +
      "</div></article>";
  }

  function rosterRow(m, i) {
    var rank = rankById(m.rank);
    return '<div class="roster__row" style="--rank:' + esc(rank.color) + '">' +
      '<span class="roster__idx">' + pad(i + 1) + "</span>" +
      '<img class="roster__ava" loading="lazy" src="' + esc(headUrl(m.nick, 80)) + '" alt="" data-fallback="' + esc((m.nick.charAt(0) || "?").toUpperCase()) + '">' +
      '<div><button class="roster__nick" data-copy="' + esc(m.nick) + '">' + esc(m.nick) +
      '<i class="dot-status dot-status--' + esc(m.status) + '" title="' + esc(statusTitle(m.status)) + '"></i></button>' +
      '<div class="roster__role">' + esc(rank.name) + "</div></div>" +
      '<span class="roster__since">' + esc(formatDate(m.joined) || "—") + "</span>" +
      "</div>";
  }

  function renderMembers() {
    var q = state.query.trim().toLowerCase();
    var filtering = state.rank !== "all" || !!q;
    var list = sortedMembers().filter(function (m) {
      if (state.rank !== "all" && m.rank !== state.rank) return false;
      if (q && m.nick.toLowerCase().indexOf(q) === -1 && (m.realName || "").toLowerCase().indexOf(q) === -1) return false;
      return true;
    });

    var cards = $("#featuredCards");
    var rest = list.slice();
    var shown = 0;
    if (!filtering) {
      var lead = rest.shift();
      var dep = rest.shift();
      if (lead) { cards.innerHTML = leadCard(lead); shown++; }
      if (dep) { cards.innerHTML += deputyCard(dep); shown++; }
      if (!shown) cards.innerHTML = "";
      cards.classList.toggle("hidden", !shown);
    } else {
      cards.innerHTML = "";
      cards.classList.add("hidden");
    }

    var listEl = $("#membersList");
    listEl.innerHTML = rest.map(rosterRow).join("");
    shown += rest.length;
    listEl.classList.toggle("hidden", !rest.length);
    $("#membersEmpty").hidden = shown > 0;
    $("#rosterCount").textContent = state.data.members.length;
  }

  /* ===== SKILLS ===== */
  function renderSkills() {
    var list = state.data.skills || [];
    var grid = $("#skillsGrid");
    $("#skillsCount").textContent = pad(list.length);
    grid.innerHTML = list.map(function (s, i) {
      return '<article class="skill" data-delay="' + Math.min(i, 3) + '">' +
        '<span class="skill__n">' + pad(i + 1) + "</span>" +
        '<h3 class="skill__name">' + esc(s.name) + "</h3>" +
        (s.hint ? '<p class="skill__hint">' + esc(s.hint) + "</p>" : "") +
        '<span class="skill__code">SKILL // ' + esc(s.id || String(i + 1)).toUpperCase() + "</span>" +
        "</article>";
    }).join("");
    grid.classList.toggle("hidden", !list.length);
    $("#skillsEmpty").hidden = !!list.length;
  }

  /* ===== CLOCK ===== */
  function startClock() {
    var el = $("#sbClock");
    if (!el) return;
    (function tick() {
      var d = new Date();
      el.textContent = pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":" + pad(d.getUTCSeconds());
      setTimeout(tick, 1000);
    })();
  }

  /* ===== INTERACTIONS ===== */
  function copyText(text, msg) {
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); toast(msg); } catch (e) { toast(text); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { toast(msg); }, fallback);
    } else fallback();
  }

  function bind() {
    window.addEventListener("error", function (e) {
      var img = e.target;
      if (!img || img.tagName !== "IMG" || !img.getAttribute || !img.getAttribute("data-fallback")) return;
      var fb = document.createElement("div");
      fb.className = "card__ava roster__ava";
      fb.style.background = "#0a0c0f";
      fb.style.display = "grid";
      fb.style.placeItems = "center";
      fb.style.fontFamily = "var(--disp)";
      fb.style.color = "#6a7178";
      fb.textContent = img.getAttribute("data-fallback");
      img.replaceWith(fb);
    }, true);

    document.addEventListener("click", function (e) {
      var chip = e.target.closest(".chip");
      if (chip) {
        state.rank = chip.getAttribute("data-rank");
        renderFilters();
        renderMembers();
        return;
      }
      var copier = e.target.closest("[data-copy]");
      if (copier) {
        copyText(copier.getAttribute("data-copy"), "NICK COPIED // " + copier.getAttribute("data-copy"));
        return;
      }
    });

    var search = $("#memberSearch");
    search.addEventListener("input", function () {
      state.query = search.value;
      renderMembers();
    });

    var burger = $("#burger"), menu = $("#navMenu");
    burger.addEventListener("click", function () {
      var open = menu.classList.toggle("is-open");
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });
    menu.addEventListener("click", function (e) {
      if (e.target.closest("a")) menu.classList.remove("is-open");
    });

    var totop = document.createElement("a");
    totop.className = "totop";
    totop.href = "#top";
    totop.setAttribute("aria-label", "Наверх");
    totop.textContent = "▲";
    document.body.appendChild(totop);

    var nav = $("#nav");
    window.addEventListener("scroll", function () {
      totop.classList.toggle("is-show", window.scrollY > 600);
      nav.classList.toggle("is-stuck", window.scrollY > 30);
    }, { passive: true });

    var revealNodes = $$("[data-reveal]");
    function revealIn(node) {
      if (node.classList.contains("is-in")) return;
      node.classList.add("is-in");
    }
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { revealIn(en.target); io.unobserve(en.target); }
        });
      }, { rootMargin: "0px 0px -10% 0px", threshold: 0.04 });
      revealNodes.forEach(function (el) { io.observe(el); });
    }
    var revealTick = false;
    function revealScan() {
      revealTick = false;
      var limit = window.innerHeight * 0.9;
      revealNodes.forEach(function (el) {
        if (el.classList.contains("is-in")) return;
        if (el.getBoundingClientRect().top < limit) revealIn(el);
      });
    }
    window.addEventListener("scroll", function () {
      if (revealTick) return;
      revealTick = true;
      requestAnimationFrame(revealScan);
    }, { passive: true });
    window.addEventListener("resize", revealScan, { passive: true });
    revealScan();

    $("#year").textContent = new Date().getFullYear();
  }

  function parallax() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var layer = $("#heroLayer");
    var cta = $(".cta__bg");
    var ticking = false;
    function update() {
      var y = window.scrollY;
      if (layer && y < window.innerHeight * 1.4) {
        layer.style.transform = "translate3d(0," + (y * 0.16).toFixed(1) + "px,0)";
      }
      if (cta) {
        var r = cta.getBoundingClientRect();
        cta.style.transform = "translate3d(0," + (-r.top * 0.05).toFixed(1) + "px,0)";
      }
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
  }

  /* ===== ГОРОД // РЕЙТИНГ ПО ЗВЁЗДАМ ===== */
  function renderCity() {
    var box = $("#cityRank");
    if (!box || !window.Minty) return;
    var board = window.Minty.leaderboard();
    var me = window.Minty.me();
    var count = $("#cityCount");
    if (count) count.textContent = board.length;
    var empty = $("#cityEmpty");
    if (empty) empty.hidden = board.length > 0;
    if (!board.length) { box.innerHTML = ""; return; }

    var html = '<div class="rank__row rank__row--head"><span>#</span><span>Ник</span><span>Звёзды</span>' +
      '<span>Ранг в городе</span><span>Вход</span></div>';
    board.slice(0, 12).forEach(function (u) {
      var d = u.joined ? Math.max(0, Math.floor((Date.now() - new Date(u.joined).getTime()) / 86400000)) : 0;
      html += '<div class="rank__row' + (me && me.id === u.id ? " is-me" : "") + '">' +
        '<span class="rank__place">' + u.place + '</span>' +
        '<span class="rank__nick">' + esc(u.nick) +
        (u.role && u.role !== "ИГРОК" ? '<i class="rank__role">' + esc(u.role) + "</i>" : "") + "</span>" +
        '<span class="rank__stars">' + window.Minty.starStr(u.stars) + '</span>' +
        '<span class="rank__tier"><b>' + u.tier.name + '</b><i>' + u.tier.note + '</i></span>' +
        '<span class="rank__me">' + d + " дн</span></div>";
    });
    box.innerHTML = html;
  }

  function renderAll() {
    fillConfig();
    renderTicker();
    renderStats();
    renderAccess();
    renderFilters();
    renderMembers();
    renderSkills();
    renderCity();
  }

  function init() {
    state.data = window.ClanStore.load();
    bind();
    renderAll();
    startClock();
    parallax();

    if (window.Minty) {
      window.Minty.onChange(function () { renderCity(); });
      if ($("#logoutBtn")) {
        $("#logoutBtn").addEventListener("click", function () {
          window.Minty.logout();
          toast("ВЫ ВЫШЛИ");
          renderCity();
        });
      }
    }

    var localRaw = window.ClanStore.raw();
    fetch("data/clan.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (json) {
        if (!json) return;
        var merged = window.ClanStore.syncWithFile(json, localRaw);
        var changed = !localRaw || localRaw.version !== merged.version;
        if (changed && localRaw) window.ClanStore.save(merged);
        state.data = merged;
        renderAll();
      })
      .catch(function () {});

    window.addEventListener("storage", function (e) {
      if (e.key === window.ClanStore.KEY) {
        state.data = window.ClanStore.load();
        renderAll();
        toast("ДАННЫЕ ОБНОВЛЕНЫ");
      }
    });
  }

  return { init: init, refresh: renderAll, esc: esc, toast: toast, state: state };
})();

document.addEventListener("DOMContentLoaded", function () { window.ClanApp.init(); });
