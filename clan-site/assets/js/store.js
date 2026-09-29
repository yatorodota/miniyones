window.ClanStore = (function () {
  var KEY = "clan_site_data_v1";
  var PIN_KEY = "clan_site_pin_v1";

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function defaults() {
    return clone(window.CLAN_DEFAULTS);
  }

  function fixItem(item, prefix) {
    if (!item || typeof item !== "object") return null;
    if (!item.id) item.id = uid(prefix);
    return item;
  }

  function migrate(data) {
    var base = defaults();
    if (!data || typeof data !== "object") return base;
    data.config = Object.assign({}, base.config, data.config || {});
    ["discordGuildId", "discordClientId", "discordRequired", "discordOnline", "bases", "showVideos", "showGallery", "gallery", "videos"].forEach(function (k) {
      delete data.config[k];
    });
    var st = {};
    Object.keys(base.config.stats).forEach(function (k) { st[k] = (data.config.stats || {})[k] || 0; });
    data.config.stats = st;
    if (typeof data.version !== "number") data.version = 0;
    delete data.gallery;
    delete data.videos;
    if (!Array.isArray(data.codes)) data.codes = [];
    data.codes = data.codes.filter(Boolean).map(function (c) {
      if (!c || !c.code) return null;
      c.id = c.id || uid("i");
      c.code = String(c.code);
      c.note = String(c.note || "").slice(0, 60);
      c.nick = String(c.nick || "").trim().slice(0, 16);
      c.usedBy = c.usedBy || "";
      c.usedAt = c.usedAt || "";
      return c;
    }).filter(Boolean);
    if (!Array.isArray(data.ranks) || !data.ranks.length) data.ranks = base.ranks;
    if (!Array.isArray(data.members)) data.members = base.members;
    if (!Array.isArray(data.skills)) data.skills = base.skills || [];
    data.skills = data.skills.filter(Boolean).map(function (s) {
      if (typeof s === "string") s = { name: s, hint: "" };
      s.id = s.id || uid("s");
      s.name = s.name || "НАВЫК";
      s.hint = s.hint || "";
      return s;
    });
    data.members = data.members.filter(Boolean).map(function (m) {
      m = fixItem(m, "m") || m;
      m.nick = m.nick || "Player";
      m.status = m.status === "online" ? "game" : (m.status || "offline");
      m.joined = m.joined || "";
      m.note = m.note || "";
      m.realName = m.realName || "";
      return m;
    });
    data.ranks = data.ranks.filter(Boolean).map(function (r) {
      r = fixItem(r, "r") || r;
      r.name = r.name || "РАНГ";
      r.color = r.color || "#8b97a8";
      r.order = +r.order || 50;
      return r;
    });
    return data;
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      return migrate(JSON.parse(raw));
    } catch (e) {
      return defaults();
    }
  }

  function raw() {
    try {
      var r = localStorage.getItem(KEY);
      return r ? JSON.parse(r) : null;
    } catch (e) {
      return null;
    }
  }

  function syncWithFile(json, local) {
    if (!json || typeof json !== "object") return migrate(local);
    var fileVersion = typeof json.version === "number" ? json.version : 0;
    if (local && typeof local === "object" && local.version === fileVersion) {
      return migrate(local);
    }
    var fresh = migrate(clone(json));
    if (local && typeof local === "object") {
      if (Array.isArray(local.members) && local.members.length) fresh.members = clone(local.members);
      if (Array.isArray(local.ranks) && local.ranks.length) fresh.ranks = clone(local.ranks);
      if (Array.isArray(local.skills) && local.skills.length) fresh.skills = clone(local.skills);
    }
    return migrate(fresh);
  }

  function save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(migrate(data)));
      return true;
    } catch (e) {
      return false;
    }
  }

  function clear() {
    localStorage.removeItem(KEY);
    return defaults();
  }

  function exportJSON() {
    return JSON.stringify(load(), null, 2);
  }

  function importJSON(text) {
    var data = migrate(JSON.parse(text));
    save(data);
    return data;
  }

  function uid(prefix) {
    return (prefix || "id") + "_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
  }

  function hasLocal() {
    try {
      return !!localStorage.getItem(KEY);
    } catch (e) {
      return false;
    }
  }

  function getPin() {
    try {
      var custom = localStorage.getItem(PIN_KEY);
      if (custom !== null && custom !== "") return custom;
    } catch (e) {}
    return (window.CLAN_DEFAULTS && window.CLAN_DEFAULTS.pin) || "";
  }

  function setPin(pin) {
    try {
      if (pin) localStorage.setItem(PIN_KEY, pin);
      else localStorage.removeItem(PIN_KEY);
      return true;
    } catch (e) {
      return false;
    }
  }

  return {
    load: load,
    save: save,
    clear: clear,
    defaults: defaults,
    migrate: migrate,
    hasLocal: hasLocal,
    raw: raw,
    syncWithFile: syncWithFile,
    KEY: KEY,
    exportJSON: exportJSON,
    importJSON: importJSON,
    uid: uid,
    getPin: getPin,
    setPin: setPin
  };
})();
