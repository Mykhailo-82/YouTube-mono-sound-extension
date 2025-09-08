const SVG_ICON = `<svg class="mono-sound__icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path style="fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;stroke:#f1f1f1;"d="M 3 11 L 3 13 M 6 8 L 6 16 M 9 10 L 9 14 M 12 7 L 12 17 M 15 4 L 15 20 M 18 9 L 18 15 M 21 11 L 21 13"/></svg>`;

// ------------- Audio -------------
const ctx = new (window.AudioContext || window.webkitAudioContext)();
const processed = new WeakMap();
const videos = new Set();

async function ensureAudioContext() {
  if (ctx.state === "suspended") await ctx.resume();
}

function connectVideo(video) {
  if (processed.has(video)) return processed.get(video);

  const source = ctx.createMediaElementSource(video);

  // Stereo
  const stereoGain = ctx.createGain();
  source.connect(stereoGain).connect(ctx.destination);

  // Mono
  const splitter = ctx.createChannelSplitter(2);
  const merger = ctx.createChannelMerger(1);
  const monoGain = ctx.createGain();

  source.connect(splitter);
  splitter.connect(merger, 0, 0);
  splitter.connect(merger, 1, 0);
  merger.connect(monoGain).connect(ctx.destination);

  const node = { stereoGain, monoGain };
  processed.set(video, node);
  videos.add(video);

  return node;
}

function setMono(enabled) {
  videos.forEach(v => {
    const node = processed.get(v);
    if (!node) return;
    node.monoGain.gain.value = enabled ? 1 : 0;
    node.stereoGain.gain.value = enabled ? 0 : 1;
  });
}

// ------------- Video observer -------------
function observeVideos() {
  document.querySelectorAll("video").forEach(connectVideo);

  new MutationObserver(muts => {
    muts.forEach(m => m.addedNodes.forEach(n => {
      if (n.tagName === "VIDEO") connectVideo(n);
    }));
  }).observe(document.body, { childList: true, subtree: true });
}

// ------------- Menu button -------------
function createToggleButton(state) {
  const btn = document.createElement("div");
  btn.className = "mono-sound";
  btn.dataset.monoButton = "true";
  btn.style.userSelect = "none";

  const icon = document.createElement("div");
  icon.className = `mono-sound__image-wrapper${state ? "" : " mono-sound--disabled"}`;
  icon.innerHTML = SVG_ICON;

  const text = document.createElement("p");
  text.className = "mono-sound__text";
  text.textContent = state ? textContentObj.disableMono || 'Disable Mono' : textContentObj.enableMono || 'Enable Mono';

  btn.append(icon, text);

  btn.addEventListener("click", async () => {
    state = !state;
    await chrome.storage.sync.set({ monoEnabled: state });
    icon.classList.toggle("mono-sound--disabled", !state);
    text.textContent = state ? textContentObj.disableMono || 'Disable Mono' : textContentObj.enableMono || 'Enable Mono';
    setMono(state);
  });

  return btn;
}

function observeMenu(state) {
  const inject = () => {
    const list = document.querySelector("tp-yt-paper-listbox#items");
    if (list && !list.querySelector("[data-mono-button]")) {
      list.appendChild(createToggleButton(state));
    }
  };

  inject();
  new MutationObserver(inject).observe(document.body, { childList: true, subtree: true });
}

// ------------- language -------------
let textContentObj = {}

async function getLang() {
  const data = await chrome.storage.sync.get({ lang: 'en' });
  const languageSaved = data.lang;

  try {
    const url = chrome.runtime.getURL(`locales/${languageSaved}.json`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    textContentObj = await res.json();
  } catch (err) {
    console.error('loadLanguage error', err);
  }

  console.log(textContentObj)
}


function updateTextContent() {
  const btnText = document.querySelector(".mono-sound__text");
  const btnIcon = document.querySelector(".mono-sound__image-wrapper");

  if (!btnText || !btnIcon) return;

  const state = !btnIcon.classList.contains("mono-sound--disabled");
  btnText.textContent = state ? textContentObj.disableMono || 'Disable Mono' : textContentObj.enableMono || 'Enable Mono';
}

// ------------- Init -------------
(async function init() {
  await ensureAudioContext();
  let { monoEnabled = false } = await chrome.storage.sync.get("monoEnabled");

  await getLang();

  observeMenu(monoEnabled);
  observeVideos();
  setMono(monoEnabled);
})();

// ------------- popup.js -------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  if (msg.action === 'SET_MONO'){
    try {
      setMono(Boolean(msg.value));
      sendResponse && sendResponse({ ok: true });
    } catch (err) {
      console.error('SET MONO handler error:', err);
      sendResponse && sendResponse({ ok: false, error: String(err) });
    }
  }

  if (msg.action === 'languageChanged') {
    (async () => {
      try {
        console.log('new lang')
        await getLang();
        updateTextContent();
        sendResponse && sendResponse({ ok: true });
      } catch (err) {
        console.error('languageChanged handler error:', err);
        sendResponse && sendResponse({ ok: false, error: String(err) });
      }
    })();
  }

  return true;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.monoEnabled) {
    setMono(Boolean(changes.monoEnabled.newValue));
  }
});
