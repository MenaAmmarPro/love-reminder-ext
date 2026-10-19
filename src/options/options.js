"use strict";

/*
 * love-reminder-ext — options page.
 * Edit the reminders, the quiet hours, the snooze length and the message pool.
 * `api` and `LoveReminder` are loaded by options.html before this file.
 */

(function () {
  var D = globalThis.LoveReminder;
  var settings = D.normaliseSettings(null);

  /* ---------------- browser helpers ---------------- */

  function storageGet(key, fallback) {
    return new Promise(function (resolve) {
      var defaults = {};
      defaults[key] = fallback;
      try {
        var maybe = api.storage.local.get(defaults);
        if (maybe && typeof maybe.then === "function") {
          maybe.then(function (o) { resolve(o || defaults); }, function () { resolve(defaults); });
          return;
        }
      } catch (e) { /* fall back */ }
      try {
        api.storage.local.get(defaults, function (o) { resolve(o || defaults); });
      } catch (e2) { resolve(defaults); }
    });
  }

  function storageSet(obj) {
    return new Promise(function (resolve) {
      try {
        var maybe = api.storage.local.set(obj);
        if (maybe && typeof maybe.then === "function") { maybe.then(resolve, resolve); return; }
      } catch (e) { /* fall back */ }
      try { api.storage.local.set(obj, function () { resolve(); }); } catch (e2) { resolve(); }
    });
  }

  function send(message) {
    return new Promise(function (resolve) {
      try {
        var maybe = api.runtime.sendMessage(message);
        if (maybe && typeof maybe.then === "function") { maybe.then(resolve, function () { resolve(null); }); return; }
      } catch (e) { /* fall back */ }
      try {
        api.runtime.sendMessage(message, function (response) {
          void api.runtime.lastError;
          resolve(response || null);
        });
      } catch (e2) { resolve(null); }
    });
  }

  /* ---------------- dom helpers ---------------- */

  function el(tag, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function byId(id) { return document.getElementById(id); }

  function setStatus(message) {
    var node = byId("status");
    if (node) node.textContent = message;
  }

  function label(text, control, className) {
    var wrap = el("label", className);
    wrap.appendChild(el("span")).textContent = text;
    wrap.appendChild(control);
    return wrap;
  }

  function input(type, value, className) {
    var node = el("input", className);
    node.type = type;
    node.value = value == null ? "" : value;
    return node;
  }

  function select(value, choices) {
    var node = el("select");
    choices.forEach(function (pair) {
      var option = el("option");
      option.value = pair[0];
      option.textContent = pair[1];
      if (pair[0] === value) option.selected = true;
      node.appendChild(option);
    });
    return node;
  }

  /* ---------------- rendering ---------------- */

  function reminderRow(reminder) {
    var row = el("div", "reminder");
    row.setAttribute("data-id", reminder.id);

    // line 1: enabled, icon, label, mode, remove
    var line1 = el("div", "reminder-row");

    var enabled = el("input");
    enabled.type = "checkbox";
    enabled.className = "r-enabled";
    enabled.checked = !!reminder.enabled;
    line1.appendChild(enabled);

    var icon = input("text", reminder.icon || "♥", "w-icon r-icon");
    icon.maxLength = 4;
    icon.setAttribute("aria-label", "Icon");
    line1.appendChild(icon);

    var name = input("text", reminder.label, "grow r-label");
    name.maxLength = 80;
    name.setAttribute("aria-label", "Reminder label");
    line1.appendChild(name);

    var mode = select(reminder.mode, [["interval", "Every…"], ["times", "At times…"]]);
    mode.className = "w-mode r-mode";
    line1.appendChild(mode);

    var remove = el("button", "remove");
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "Remove this reminder");
    remove.addEventListener("click", function () {
      syncFromDom();
      settings.reminders = settings.reminders.filter(function (r) { return r.id !== reminder.id; });
      renderReminders();
      setStatus("Removed — remember to save ♥");
    });
    line1.appendChild(remove);

    row.appendChild(line1);

    // line 2: interval OR times
    var line2 = el("div", "reminder-row");

    var intervalWrap = label("Every N minutes", input("number", reminder.intervalMinutes || 60, "r-interval"), "w-interval");
    intervalWrap.querySelector("input").min = 1;
    intervalWrap.querySelector("input").max = 1440;

    var timesWrap = label("Times (comma separated, 24h)",
      input("text", (reminder.times || []).join(", "), "r-times"), "grow w-times");

    function updateMode() {
      var isTimes = mode.value === "times";
      intervalWrap.classList.toggle("hidden", isTimes);
      timesWrap.classList.toggle("hidden", !isTimes);
    }
    mode.addEventListener("change", updateMode);
    updateMode();

    line2.appendChild(intervalWrap);
    line2.appendChild(timesWrap);
    row.appendChild(line2);

    return row;
  }

  function renderReminders() {
    var host = byId("reminder-list");
    if (!host) return;
    host.textContent = "";
    if (!settings.reminders.length) {
      var empty = el("p", "reminder-empty");
      empty.textContent = "No reminders yet — add one above.";
      host.appendChild(empty);
      return;
    }
    settings.reminders.forEach(function (r) { host.appendChild(reminderRow(r)); });
  }

  function renderSettingsFields() {
    if (byId("quiet-enabled")) byId("quiet-enabled").checked = !!settings.quiet.enabled;
    if (byId("quiet-start")) byId("quiet-start").value = settings.quiet.start;
    if (byId("quiet-end")) byId("quiet-end").value = settings.quiet.end;
    if (byId("snooze-minutes")) byId("snooze-minutes").value = String(settings.snoozeMinutes);
    if (byId("messages")) byId("messages").value = settings.messages.join("\n");
    updateMessageCount();
  }

  function updateMessageCount() {
    var node = byId("message-count");
    if (!node) return;
    var count = settings.messages.length;
    node.textContent = count + (count === 1 ? " line" : " lines") + " in the pool";
  }

  function render() {
    renderReminders();
    renderSettingsFields();
  }

  /* ---------------- reading the form back ---------------- */

  function syncFromDom() {
    var host = byId("reminder-list");
    if (host) {
      var rows = host.querySelectorAll(".reminder");
      var collected = [];
      Array.prototype.forEach.call(rows, function (row) {
        var id = row.getAttribute("data-id");
        var existing = D.findReminder(settings, id) || { id: id };
        var modeEl = row.querySelector(".r-mode");
        var mode = modeEl && modeEl.value === "times" ? "times" : "interval";
        var item = {
          id: id,
          label: (row.querySelector(".r-label") || {}).value || "",
          icon: (row.querySelector(".r-icon") || {}).value || "",
          enabled: !!(row.querySelector(".r-enabled") || {}).checked,
          mode: mode
        };
        if (mode === "times") {
          var raw = (row.querySelector(".r-times") || {}).value || "";
          item.times = raw.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
          if (!item.times.length && existing.times) item.times = existing.times;
        } else {
          item.intervalMinutes = Number((row.querySelector(".r-interval") || {}).value);
        }
        collected.push(item);
      });
      settings.reminders = collected;
    }

    if (byId("quiet-enabled")) settings.quiet.enabled = byId("quiet-enabled").checked;
    if (byId("quiet-start")) settings.quiet.start = byId("quiet-start").value || settings.quiet.start;
    if (byId("quiet-end")) settings.quiet.end = byId("quiet-end").value || settings.quiet.end;
    if (byId("snooze-minutes")) settings.snoozeMinutes = Number(byId("snooze-minutes").value) || settings.snoozeMinutes;
    if (byId("messages")) settings.messages = byId("messages").value.split("\n");

    settings = D.normaliseSettings(settings);
  }

  function save() {
    syncFromDom();
    return storageSet({ settings: settings }).then(function () {
      return send({ type: "reschedule" });
    }).then(function (response) {
      render();
      var count = response && typeof response.count === "number" ? response.count : D.enabledCount(settings);
      setStatus("Saved — " + count + " reminder" + (count === 1 ? "" : "s") + " on ♥");
    });
  }

  /* ---------------- wiring ---------------- */

  function wire() {
    if (byId("add-reminder")) byId("add-reminder").addEventListener("click", function () {
      syncFromDom();
      settings.reminders.push({
        id: "r" + Math.random().toString(36).slice(2, 8),
        label: "A new little reminder",
        icon: "♥",
        enabled: true,
        mode: "interval",
        intervalMinutes: 60
      });
      renderReminders();
      setStatus("Added — remember to save ♥");
    });

    if (byId("save")) byId("save").addEventListener("click", function () { save(); });

    if (byId("test")) byId("test").addEventListener("click", function () {
      send({ type: "test" }).then(function (response) {
        setStatus(response && response.label ? "Sent: " + response.label : "Sent a little hello ♥");
      });
    });

    if (byId("restore")) byId("restore").addEventListener("click", function () {
      settings = D.normaliseSettings(null);
      render();
      setStatus("Defaults loaded — press Save to keep them.");
    });

    if (byId("messages")) byId("messages").addEventListener("input", function () {
      settings.messages = byId("messages").value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 60);
      updateMessageCount();
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    storageGet("settings", null).then(function (o) {
      settings = D.normaliseSettings(o.settings);
      render();
      wire();
    });
  });
})();
