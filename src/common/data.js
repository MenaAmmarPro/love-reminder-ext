"use strict";

/*
 * love-reminder-ext — data + pure helpers.
 *
 * No browser APIs here, so this file can be unit-tested with plain Node.
 * Exposes `globalThis.LoveReminder`.
 */

(function (root) {
  /* ---------------- the sweet lines ---------------- */

  var MESSAGES = [
    "Thinking of you — drink a glass of water ♥",
    "Unclench your jaw and roll your shoulders. I've got you.",
    "Look away from the screen for a moment. Blink. Breathe.",
    "Have you eaten something today? Please do.",
    "Sit up a little, love. Your back will thank you.",
    "One deep breath in… and out. That's it.",
    "Stretch your arms up high. Pretend you're reaching for me.",
    "A sip of water now keeps the headache away later.",
    "You've been working hard — take one small break.",
    "Stand up and walk a few steps, just for me.",
    "Whatever it is, it can wait ten minutes. Rest.",
    "You're doing better than you think ♥",
    "Leave your desk for a moment. The world is still there.",
    "Some sunshine would suit you right now.",
    "I'm proud of you. Keep going, gently.",
    "Put your phone down, close your eyes, count to ten.",
    "Warm drink, warm hands, warm heart.",
    "One kind thing for yourself, right now.",
    "Remember to look up — the sky is the same one we share.",
    "Almost there. One step at a time, side by side."
  ];

  /* ---------------- the gentle starter set ---------------- */

  var DEFAULT_SETTINGS = {
    reminders: [
      { id: "water", label: "Drink a glass of water", icon: "💧", enabled: true, mode: "interval", intervalMinutes: 60 },
      { id: "posture", label: "Sit up and stretch", icon: "🌿", enabled: false, mode: "interval", intervalMinutes: 90 },
      { id: "eyes", label: "Rest your eyes", icon: "✨", enabled: false, mode: "interval", intervalMinutes: 45 },
      { id: "goodnight", label: "Say goodnight to each other", icon: "🌙", enabled: true, mode: "times", times: ["22:30"] }
    ],
    quiet: { enabled: true, start: "23:30", end: "07:00" },
    messages: MESSAGES.slice(),
    snoozeMinutes: 10
  };

  /* ---------------- time helpers ---------------- */

  function pad2(n) { return String(n).padStart(2, "0"); }

  function parseTime(value) {
    if (typeof value !== "string") return null;
    var m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (!m) return null;
    var h = Number(m[1]);
    var mi = Number(m[2]);
    if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
    return h * 60 + mi;
  }

  function formatTime(minutes) {
    var m = ((Math.round(Number(minutes)) % 1440) + 1440) % 1440;
    return pad2(Math.floor(m / 60)) + ":" + pad2(m % 60);
  }

  function minutesOfDay(date) {
    return date.getHours() * 60 + date.getMinutes();
  }

  /*
   * inQuietHours(date, quiet) -> boolean
   * Handles windows that wrap past midnight (e.g. 23:30 → 07:00).
   * An equal start/end is treated as "off".
   */
  function inQuietHours(date, quiet) {
    if (!quiet || !quiet.enabled) return false;
    var start = parseTime(quiet.start);
    var end = parseTime(quiet.end);
    if (start === null || end === null || start === end) return false;
    var now = minutesOfDay(date);
    if (start < end) return now >= start && now < end;
    return now >= start || now < end;
  }

  function shouldSilence(date, settings) {
    return inQuietHours(date, settings && settings.quiet);
  }

  /* A random line from the pool (deterministic when you pass your own rng). */
  function pickMessage(pool, rng) {
    var list = (pool && pool.length) ? pool : MESSAGES;
    var r = typeof rng === "function" ? rng() : Math.random();
    if (typeof r !== "number" || !isFinite(r) || r < 0) r = 0;
    if (r >= 1) r = 0.9999999;
    return list[Math.floor(r * list.length)];
  }

  /* The next Date at "HH:MM" strictly after `from` (today or tomorrow). */
  function nextTimeDate(time, from) {
    var mins = parseTime(time);
    if (mins === null) return null;
    from = from || new Date();
    var d = new Date(
      from.getFullYear(), from.getMonth(), from.getDate(),
      Math.floor(mins / 60), mins % 60, 0, 0
    );
    if (d.getTime() <= from.getTime()) d.setDate(d.getDate() + 1);
    return d;
  }

  function describeReminder(r) {
    if (!r) return "";
    if (r.mode === "times") {
      var times = (r.times && r.times.length) ? r.times.join(", ") : "—";
      return "At " + times;
    }
    var m = Math.max(1, Math.round(r.intervalMinutes || 60));
    if (m % 60 === 0) return "Every " + (m / 60) + (m === 60 ? " hour" : " hours");
    return "Every " + m + " min";
  }

  /* ---------------- settings ---------------- */

  function slugId() {
    return "r" + Math.random().toString(36).slice(2, 8);
  }

  function normaliseSettings(raw) {
    raw = (raw && typeof raw === "object") ? raw : {};

    var out = {
      reminders: [],
      quiet: { enabled: true, start: "23:30", end: "07:00" },
      messages: MESSAGES.slice(),
      snoozeMinutes: 10
    };

    if (raw.quiet && typeof raw.quiet === "object") {
      out.quiet.enabled = !!raw.quiet.enabled;
      var qs = parseTime(raw.quiet.start);
      var qe = parseTime(raw.quiet.end);
      if (qs !== null) out.quiet.start = formatTime(qs);
      if (qe !== null) out.quiet.end = formatTime(qe);
    }

    var snooze = Number(raw.snoozeMinutes);
    if (isFinite(snooze) && snooze > 0) {
      out.snoozeMinutes = Math.min(120, Math.round(snooze));
    }

    if (Array.isArray(raw.messages) && raw.messages.length) {
      var cleaned = raw.messages
        .map(function (s) { return String(s == null ? "" : s).trim().slice(0, 180); })
        .filter(function (s) { return s.length > 0; })
        .slice(0, 60);
      if (cleaned.length) out.messages = cleaned;
    }

    if (Array.isArray(raw.reminders)) {
      raw.reminders.forEach(function (r) {
        if (!r || typeof r !== "object") return;
        var mode = r.mode === "times" ? "times" : "interval";
        var item = {
          id: (typeof r.id === "string" && r.id) ? r.id.slice(0, 40) : slugId(),
          label: String(r.label == null ? "" : r.label).slice(0, 80) || "A little reminder",
          icon: String(r.icon == null ? "" : r.icon).slice(0, 4),
          enabled: !!r.enabled,
          mode: mode
        };
        if (mode === "times") {
          var times = (Array.isArray(r.times) ? r.times : [])
            .map(parseTime)
            .filter(function (t) { return t !== null; })
            .map(formatTime);
          item.times = times.length ? times : ["09:00"];
        } else {
          var iv = Number(r.intervalMinutes);
          item.intervalMinutes = (isFinite(iv) && iv >= 1) ? Math.min(1440, Math.round(iv)) : 60;
        }
        out.reminders.push(item);
      });
      if (!out.reminders.length) {
        out.reminders = DEFAULT_SETTINGS.reminders.map(function (r) { return JSON.parse(JSON.stringify(r)); });
      }
    } else {
      out.reminders = DEFAULT_SETTINGS.reminders.map(function (r) { return JSON.parse(JSON.stringify(r)); });
    }

    return out;
  }

  function enabledCount(settings) {
    if (!settings || !settings.reminders) return 0;
    return settings.reminders.filter(function (r) { return r.enabled; }).length;
  }

  function findReminder(settings, id) {
    if (!settings || !settings.reminders) return null;
    for (var i = 0; i < settings.reminders.length; i += 1) {
      if (settings.reminders[i].id === id) return settings.reminders[i];
    }
    return null;
  }

  root.LoveReminder = {
    MESSAGES: MESSAGES,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    pad2: pad2,
    parseTime: parseTime,
    formatTime: formatTime,
    minutesOfDay: minutesOfDay,
    inQuietHours: inQuietHours,
    shouldSilence: shouldSilence,
    pickMessage: pickMessage,
    nextTimeDate: nextTimeDate,
    describeReminder: describeReminder,
    normaliseSettings: normaliseSettings,
    enabledCount: enabledCount,
    findReminder: findReminder
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
