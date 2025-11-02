// browser-polyfill.js

if (typeof browser === 'undefined') {
  var browser = (function () {
    return window.chrome || {};
  })();
}

browser.storage = browser.storage || {};
browser.storage.sync = browser.storage.sync || {
  get: (keys) =>
    new Promise((resolve) => chrome.storage.sync.get(keys, resolve)),
  set: (data) =>
    new Promise((resolve) => chrome.storage.sync.set(data, resolve)),
};

browser.tabs = browser.tabs || {
  query: (queryInfo) =>
    new Promise((resolve) => chrome.tabs.query(queryInfo, resolve)),
  sendMessage: (tabId, message) =>
    new Promise((resolve) => {
      try {
        chrome.tabs.sendMessage(tabId, message, () => {
          resolve(!chrome.runtime.lastError);
        });
      } catch {
        resolve(false);
      }
    }),
};

browser.runtime = browser.runtime || {
  getURL: (path) =>
    (chrome?.runtime?.getURL ? chrome.runtime.getURL(path) : path),
};
