// popup/popup.js

// ------------- polyfill -------------
if (typeof browser === 'undefined') {
  var browser = (function () {
    return window.chrome || {};
  })();
}

const storageGet = (key) => browser.storage.sync.get(key);
const storageSet = (data) => browser.storage.sync.set(data);
const queryTabs = (query) => browser.tabs.query(query);
const sendMessage = (tabId, message) => browser.tabs.sendMessage(tabId, message);


// ------------- language -------------
let textContentObj = {};

// const chromeStorageGet = (key) =>
//   new Promise((resolve) => chrome.storage.sync.get(key, resolve));

// const chromeStorageSet = (data) =>
//   new Promise((resolve) => chrome.storage.sync.set(data, resolve));

// const sendMessage = (tabId, message) =>
//   new Promise((resolve) => {
//     chrome.tabs.sendMessage(tabId, message, () => { resolve(!chrome.runtime.lastError); }
//   );
// });

window.addEventListener('DOMContentLoaded', async () => {
  const languageSaved = localStorage.getItem('lang') || 'en';
  await loadLanguage(languageSaved);
  await updateTextContent();
});

async function loadLanguage(language) {
  try {
    const res = await fetch(`../locales/${language}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    textContentObj = await res.json();

    const tabs = await queryTabs({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      await sendMessage(tabs[0].id, { action: 'languageChanged' });
    }
  } catch (err) {
    console.error('loadLanguage error:', err);
  }
}

document.getElementById('language-settings').addEventListener('click', () => {
  document.getElementById('languages').classList.toggle('languages--active');
});

document.getElementById('languages').addEventListener('click', async (e) => {
  const button = e.target.closest('[data-language]');
  if (!button) return;

  const language = button.dataset.language;
  localStorage.setItem('lang', language);
  await storageSet({ lang: language });

  await loadLanguage(language);
  await updateTextContent();

  document.getElementById('languages').classList.remove('languages--active');
});

// ---------- UI ----------
async function updateTextContent() {
  document.getElementById('header__title').textContent =
    textContentObj.headerTitle || 'YouTube Mono Sound';
  document.getElementById('header__description').textContent =
    textContentObj.headerDescription ||
    'Turn on mono sound for all videos on YouTube';

  const data = await storageGet('monoEnabled');
  updateUI(Boolean(data.monoEnabled));
}

const toggleBtn = document.getElementById('switch-container__toggle');
const toggleLabel = document.getElementById('switch-container__label');
const switchContainer = document.getElementById('switch-container');

function updateUI(enabled) {
  if (!toggleBtn || !toggleLabel) return;
  toggleBtn.classList.toggle('active', enabled);
  toggleLabel.textContent = enabled
    ? textContentObj.disableMono || 'Disable Mono'
    : textContentObj.enableMono || 'Enable Mono';
}

// ---------- switch logic ----------
if (!switchContainer) {
  console.warn('popup: switch container not found');
} else {
  switchContainer.addEventListener('click', async () => {
    const data = await storageGet('monoEnabled');
    const newValue = !Boolean(data.monoEnabled);

    await storageSet({ monoEnabled: newValue });
    updateUI(newValue);

    const activeTabs = await queryTabs({ active: true, currentWindow: true });
    const activeTab = activeTabs[0];

    if (activeTab?.id &&
       (activeTab.url?.startsWith('https://www.youtube.com') ||
       activeTab.url?.startsWith('https://music.youtube.com'))
    ){
      const success = await sendMessage(activeTab.id, {
        action: 'SET_MONO',
        value: newValue,
      });

      if (!success) await broadcastToYouTubeTabs(newValue);
    } else {
      await broadcastToYouTubeTabs(newValue);
    }
  });
}

async function broadcastToYouTubeTabs(newValue) {
  const ytTabs = await queryTabs({
    url: [
      '*://www.youtube.com/*',
      '*://music.youtube.com/*'
    ]
  });

  for (const tab of ytTabs) {
    if (tab.id) {
      await sendMessage(tab.id, { action: 'SET_MONO', value: newValue });
    }
  }
}
