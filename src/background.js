"use strict";

/*
 * love-reminder-ext — the background worker.
 *
 * Chrome/Edge load this as a service worker (MV3); Firefox loads it as an
 * event page after src/common/api.js and src/common/data.js. It schedules
 * alarms for every enabled reminder, shows a sweet notification (unless it's
 * quiet hours) and offers a snooze button.
 *
 * `api` comes from src/common/api.js; `LoveReminder` from src/common/data.js.
 */

(function () {
  // Chrome service worker: pull in the two shared files. Firefox lists them in
  // the manifest, so this guard keeps us from loading them twice.
  if (typeof importScripts === "function" && typeof globalThis.LoveReminder === "undefined") {
    try {
      importScripts("/src/common/api.js", "/src/common/data.js");
    } catch (e) {
      importScripts("../common/api.js", "../common/data.js");
    }
  }

  var D = globalThis.LoveReminder;
  var ALARM_PREFIX = "reminder:";
  var SNOOZE_PREFIX = "snooze:";
  var NOTIF_PREFIX = "lr:";

  /* ---------------- tiny promise wrappers ---------------- */

  function storageGet(key, fallback) {
    return new Promise(function (resolve) {
      var result = {};
      result[key] = fallback;
      try {
        var maybe = api.storage.local.get(result);
        if (maybe && typeof maybe.then === "function") {
          maybe.then(function (o) { resolve(o || result); }, function () { resolve(result); });
          return;
        }
      } catch (e) { /* fall through to the callback form */ }
      try {
        api.storage.local.get(result, function (o) { resolve(o || result); });
      } catch (e2) {
        resolve(result);
      }
    });
  }

  function storageSet(obj) {
    return new Promise(function (resolve) {
      try {
        var maybe = api.storage.local.set(obj);
        if (maybe && typeof maybe.then === "function") { maybe.then(resolve, resolve); return; }
      } catch (e) { /* fall through */ }
      try {
        api.storage.local.set(obj, function () { resolve(); });
      } catch (e2) {
        resolve();
      }
    });
  }

  function clearAllAlarms() {
    return new Promise(function (resolve) {
      try {
        var maybe = api.alarms.clearAll();
        if (maybe && typeof maybe.then === "function") { maybe.then(resolve, resolve); return; }
        resolve();
      } catch (e) {
        resolve();
      }
    });
  }

  function createAlarm(name, info) {
    try {
      var maybe = api.alarms.create(name, info);
      if (maybe && typeof maybe.then === "function") maybe.catch(function () {});
    } catch (e) { /* ignore */ }
  }

  /* ---------------- settings ---------------- */

  function getSettings() {
    return storageGet("settings", null).then(function (o) {
      return D.normaliseSettings(o.settings);
    });
  }

  function setBadge(settings) {
    var n = D.enabledCount(settings);
    var action = api.action || api.browserAction;
    if (!action) return;
    try {
      if (action.setBadgeText) action.setBadgeText({ text: n ? String(n) : "" });
      if (action.setBadgeBackgroundColor) action.setBadgeBackgroundColor({ color: "#ff72b8" });
    } catch (e) { /* ignore */ }
  }

  /* ---------------- scheduling ---------------- */

  function scheduleAll(settings) {
    return clearAllAlarms().then(function () {
      var now = new Date();
      settings.reminders.forEach(function (r) {
        if (!r.enabled) return;
        if (r.mode === "times") {
          (r.times || []).forEach(function (t) {
            var next = D.nextTimeDate(t, now);
            if (next) createAlarm(ALARM_PREFIX + r.id + ":" + t, { when: next.getTime() });
          });
        } else {
          var mins = Math.max(1, Math.round(r.intervalMinutes || 60));
          createAlarm(ALARM_PREFIX + r.id, { delayInMinutes: mins, periodInMinutes: mins });
        }
      });
      setBadge(settings);
      return settings;
    });
  }

  /* ---------------- notifications ---------------- */

  function notify(settings, reminder) {
    var line = D.pickMessage(settings.messages, Math.random);
    var title = (reminder.icon ? reminder.icon + " " : "") + reminder.label;
    var options = {
      type: "basic",
      title: title,
      message: line,
      priority: 1,
      requireInteraction: false,
      buttons: [
        { title: "Snooze " + settings.snoozeMinutes + " min" },
        { title: "I'm here ♥" }
      ]
    };
    try {
      options.iconUrl = api.runtime.getURL("icons/icon-128.png");
    } catch (e) { /* icon is optional */ }

    var id = NOTIF_PREFIX + reminder.id;
    try {
      var maybe = api.notifications.create(id, options);
      if (maybe && typeof maybe.then === "function") maybe.catch(function () {});
    } catch (e) { /* ignore */ }
    return id;
  }

  function snooze(reminderId, minutes) {
    createAlarm(SNOOZE_PREFIX + reminderId, { delayInMinutes: Math.max(1, Math.round(minutes || 10)) });
  }

  /* ---------------- event handlers ---------------- */

  function onAlarm(alarm) {
    if (!alarm || typeof alarm.name !== "string") return;

    // A snooze the person asked for fires even inside quiet hours.
    if (alarm.name.indexOf(SNOOZE_PREFIX) === 0) {
      var snoozeId = alarm.name.slice(SNOOZE_PREFIX.length);
      return getSettings().then(function (settings) {
        var r = D.findReminder(settings, snoozeId);
        if (r) notify(settings, r);
      });
    }

    if (alarm.name.indexOf(ALARM_PREFIX) !== 0) return;
    var parts = alarm.name.split(":");
    var id = parts[1];
    var time = parts[2];

    return getSettings().then(function (settings) {
      var r = D.findReminder(settings, id);
      if (!r || !r.enabled) return;

      if (D.shouldSilence(new Date(), settings)) return; // shhh — quiet hours

      notify(settings, r);

      // Fixed-time alarms are one-shot; line up the next day.
      if (r.mode === "times" && time) {
        var next = D.nextTimeDate(time, new Date());
        if (next) createAlarm(alarm.name, { when: next.getTime() });
      }
    });
  }

  function onButtonClicked(notificationId, buttonIndex) {
    if (typeof notificationId !== "string" || notificationId.indexOf(NOTIF_PREFIX) !== 0) return;
    var reminderId = notificationId.slice(NOTIF_PREFIX.length);
    try { api.notifications.clear(notificationId); } catch (e) { /* ignore */ }
    if (buttonIndex !== 0) return; // "I'm here ♥" needs no follow-up
    return getSettings().then(function (settings) {
      snooze(reminderId, settings.snoozeMinutes);
    });
  }

  function onMessage(message, sender, sendResponse) {
    var type = message && message.type;

    if (type === "test") {
      return getSettings().then(function (settings) {
        var r = (settings.reminders.filter(function (x) { return x.enabled; })[0]) ||
          { id: "test", label: "A little hello from Ammar", icon: "♥" };
        notify(settings, r);
        if (sendResponse) sendResponse({ ok: true, label: r.label });
      });
    }

    if (type === "snooze") {
      return getSettings().then(function (settings) {
        snooze(message.id || (settings.reminders[0] || {}).id || "all", message.minutes || settings.snoozeMinutes);
        if (sendResponse) sendResponse({ ok: true });
      });
    }

    if (type === "reschedule" || type === "save") {
      return getSettings().then(scheduleAll).then(function (settings) {
        if (sendResponse) sendResponse({ ok: true, count: D.enabledCount(settings) });
      });
    }

    if (type === "status") {
      return getSettings().then(function (settings) {
        if (sendResponse) {
          sendResponse({
            ok: true,
            settings: settings,
            enabled: D.enabledCount(settings),
            quiet: D.shouldSilence(new Date(), settings)
          });
        }
      });
    }

    return false;
  }

  function installDefaults(reason) {
    return storageGet("settings", null).then(function (o) {
      var settings = D.normaliseSettings(o.settings);
      return storageSet({ settings: settings }).then(function () {
        return scheduleAll(settings);
      });
    });
  }

  /* ---------------- wire it up ---------------- */

  try { api.runtime.onInstalled.addListener(function (details) { installDefaults(details && details.reason); }); } catch (e) { /* ignore */ }
  try { api.runtime.onStartup.addListener(function () { installDefaults("startup"); }); } catch (e) { /* ignore */ }
  try { api.alarms.onAlarm.addListener(onAlarm); } catch (e) { /* ignore */ }
  try { api.notifications.onButtonClicked.addListener(onButtonClicked); } catch (e) { /* ignore */ }
  try { api.runtime.onMessage.addListener(onMessage); } catch (e) { /* ignore */ }

  // A small surface for the test harness (and any future debugging).
  globalThis.LoveReminderBackground = {
    scheduleAll: scheduleAll,
    getSettings: getSettings,
    notify: notify,
    onAlarm: onAlarm,
    onButtonClicked: onButtonClicked,
    onMessage: onMessage,
    installDefaults: installDefaults,
    SNOOZE_PREFIX: SNOOZE_PREFIX,
    ALARM_PREFIX: ALARM_PREFIX,
    NOTIF_PREFIX: NOTIF_PREFIX
  };
})();
