"use strict";

/*
 * love-reminder-ext — popup.
 * Shows what's on, whether we're in quiet hours, and a "send one now" button.
 * `api` and `LoveReminder` are loaded by popup.html before this file.
 */

(function () {
  var D = globalThis.LoveReminder;

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
      } catch (e2) {
        resolve(defaults);
      }
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
      } catch (e2) {
        resolve(null);
      }
    });
  }

  function el(tag, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function setStatus(message) {
    var node = document.getElementById("status");
    if (node) node.textContent = message;
  }

  function nextLabel(reminder, now) {
    if (reminder.mode !== "times") return D.describeReminder(reminder);
    var soonest = null;
    (reminder.times || []).forEach(function (t) {
      var d = D.nextTimeDate(t, now);
      if (d && (!soonest || d.getTime() < soonest.date.getTime())) soonest = { date: d, time: t };
    });
    if (!soonest) return D.describeReminder(reminder);
    var sameDay = soonest.date.toDateString() === now.toDateString();
    return "Next " + (sameDay ? "today" : "tomorrow") + " at " + soonest.time;
  }

  function render(settings) {
    var now = new Date();
    var quiet = D.shouldSilence(now, settings);

    var chip = document.getElementById("quiet-chip");
    if (chip) chip.hidden = !quiet;

    var quietLine = document.getElementById("quiet-line");
    if (quietLine) {
      quietLine.textContent = settings.quiet.enabled
        ? "Quiet hours " + settings.quiet.start + " – " + settings.quiet.end +
          (quiet ? " (resting right now)" : "")
        : "Quiet hours are off";
    }

    var list = document.getElementById("rem-list");
    var empty = document.getElementById("rem-empty");
    if (list) {
      list.textContent = "";
      var enabledList = settings.reminders.filter(function (r) { return r.enabled; });
      settings.reminders.forEach(function (r) {
        var item = el("li", "rem-item" + (r.enabled ? "" : " is-off"));
        item.appendChild(el("span", "rem-icon")).textContent = r.icon || "♥";
        var body = el("div", "rem-body");
        body.appendChild(el("span", "rem-label")).textContent = r.label;
        body.appendChild(el("span", "rem-when")).textContent = r.enabled ? nextLabel(r, now) : "off";
        item.appendChild(body);
        list.appendChild(item);
      });
      if (empty) empty.hidden = enabledList.length > 0 || settings.reminders.length > 0;
    }
  }

  function wire(settings) {
    var sendNow = document.getElementById("send-now");
    if (sendNow) sendNow.addEventListener("click", function () {
      sendNow.disabled = true;
      send({ type: "test" }).then(function (response) {
        sendNow.disabled = false;
        setStatus(response && response.label ? "Sent: " + response.label : "Sent a little hello ♥");
      });
    });

    var options = document.getElementById("open-options");
    if (options) options.addEventListener("click", function () {
      try {
        if (api.runtime.openOptionsPage) {
          api.runtime.openOptionsPage();
          return;
        }
      } catch (e) { /* open manually below */ }
      try { api.tabs.create({ url: api.runtime.getURL("src/options/options.html") }); } catch (e2) { /* ignore */ }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    storageGet("settings", null).then(function (o) {
      var settings = D.normaliseSettings(o.settings);
      render(settings);
      wire(settings);
    });
  });
})();
