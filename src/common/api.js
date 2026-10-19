"use strict";

/*
 * love-reminder-ext — the one place that reaches for the browser API.
 *
 * Loaded first (as a plain script) everywhere: in the background service
 * worker (via importScripts), in the popup and in the options page. Firefox
 * exposes `browser`, Chrome/Edge expose `chrome`; the promise-based `browser`
 * namespace is preferred when both exist.
 */

const api = globalThis.browser || globalThis.chrome;

if (!api) {
  // Never expected in a real extension context, but keeps the file safe to
  // load in a bare test sandbox.
  globalThis.api = globalThis.api || {};
}
