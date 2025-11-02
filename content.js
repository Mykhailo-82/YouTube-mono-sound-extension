// content.js

if (typeof browser === 'undefined') {
  var browser = (function () {
    return window.chrome || {};
  })();
}

const storageGet = (key) => browser.storage.sync.get(key);
const storageSet = (data) => browser.storage.sync.set(data);
const sendMsg = (id, msg) => browser.tabs.sendMessage(id, msg);
const runtimeURL = (path) => browser.runtime.getURL(path);

const SVG_ICON = `<svg class="mono-sound__icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path style="fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;stroke:#f1f1f1;" d="M 3 11 L 3 13 M 6 8 L 6 16 M 9 10 L 9 14 M 12 7 L 12 17 M 15 4 L 15 20 M 18 9 L 18 15 M 21 11 L 21 13"/></svg>`;

const ctx = new (window.AudioContext || window.webkitAudioContext)();
const processed = new WeakMap();
const videos = new Set();

async function ensureAudioContext() {
  if (ctx.state === "suspended") await ctx.resume();
}


function connectVideo(video) {
  if (processed.has(video)) return processed.get(video);

  const wasPlaying = !video.paused && !video.ended;

  const source = ctx.createMediaElementSource(video);

  const stereoGain = ctx.createGain();
  source.connect(stereoGain).connect(ctx.destination);

  const splitter = ctx.createChannelSplitter(2);
  source.connect(splitter);

  const gainLforMid = ctx.createGain();
  const gainRforMid = ctx.createGain();
  gainLforMid.gain.value = 0.5;
  gainRforMid.gain.value = 0.5;
  splitter.connect(gainLforMid, 0);
  splitter.connect(gainRforMid, 1);

  const mid = ctx.createGain();
  gainLforMid.connect(mid);
  gainRforMid.connect(mid);

  const gainLforDiff = ctx.createGain();
  gainLforDiff.gain.value = 1;
  splitter.connect(gainLforDiff, 0);

  const leftDiff = ctx.createGain();
  gainLforDiff.connect(leftDiff);
  mid.connect(leftDiff, 0, 0);
  leftDiff.gain.value = 1;

  const gainRforDiff = ctx.createGain();
  gainRforDiff.gain.value = 1;
  splitter.connect(gainRforDiff, 1);

  const rightDiff = ctx.createGain();
  gainRforDiff.connect(rightDiff);
  mid.connect(rightDiff, 0, 0);
  rightDiff.gain.value = 1;

  const merger = ctx.createChannelMerger(2);
  mid.connect(merger, 0, 0);
  leftDiff.connect(merger, 0, 0);
  mid.connect(merger, 0, 1);
  rightDiff.connect(merger, 0, 1);

  const monoGain = ctx.createGain();
  merger.connect(monoGain).connect(ctx.destination);

  const node = { stereoGain, monoGain };
  processed.set(video, node);
  videos.add(video);

  if (wasPlaying) {
    video.play().catch(() => {});
  }

  return node;
}


function setMono(enabled) {
  videos.forEach(v => {
    const node = processed.get(v);
    if (!node) return;
    node.monoGain.gain.value = enabled ? 0.5 : 0;
    node.stereoGain.gain.value = enabled ? 0 : 1;
  });
}

function observeVideos() {
  document.querySelectorAll("video").forEach(connectVideo);
  new MutationObserver(muts => {
    muts.forEach(m => m.addedNodes.forEach(n => {
      if (n.tagName === "VIDEO") connectVideo(n);
    }));
  }).observe(document.body, { childList: true, subtree: true });
}

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
  text.textContent = state ? textContentObj.disableMono || "Disable Mono" : textContentObj.enableMono || "Enable Mono";

  btn.append(icon, text);
  btn.addEventListener("click", async () => {
    state = !state;
    await browser.storage.sync.set({ monoEnabled: state });
    icon.classList.toggle("mono-sound--disabled", !state);
    text.textContent = state ? textContentObj.disableMono || "Disable Mono" : textContentObj.enableMono || "Enable Mono";
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

let textContentObj = {};

async function getLang() {
  const data = await browser.storage.sync.get({ lang: "en" });
  const languageSaved = data.lang;
  try {
    const url = browser.runtime.getURL(`locales/${languageSaved}.json`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    textContentObj = await res.json();
  } catch (err) {
    console.error("loadLanguage error", err);
  }
}

function updateTextContent() {
  const btnText = document.querySelector(".mono-sound__text");
  const btnIcon = document.querySelector(".mono-sound__image-wrapper");
  if (!btnText || !btnIcon) return;
  const state = !btnIcon.classList.contains("mono-sound--disabled");
  btnText.textContent = state ? textContentObj.disableMono || "Disable Mono" : textContentObj.enableMono || "Enable Mono";
}

(async function init() {
  await ensureAudioContext();
  let { monoEnabled = false } = await browser.storage.sync.get("monoEnabled");
  await getLang();
  observeMenu(monoEnabled);
  observeVideos();
  setMono(monoEnabled);
})();

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  if (msg.action === "SET_MONO") {
    try {
      setMono(Boolean(msg.value));
      sendResponse && sendResponse({ ok: true });
    } catch (err) {
      console.error("SET MONO handler error:", err);
      sendResponse && sendResponse({ ok: false, error: String(err) });
    }
  }

  if (msg.action === "languageChanged") {
    (async () => {
      try {
        await getLang();
        updateTextContent();
        sendResponse && sendResponse({ ok: true });
      } catch (err) {
        console.error("languageChanged handler error:", err);
        sendResponse && sendResponse({ ok: false, error: String(err) });
      }
    })();
  }
  return true;
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.monoEnabled) {
    setMono(Boolean(changes.monoEnabled.newValue));
  }
});
