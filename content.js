// --- API ---
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

const storageGet = async (key) => {
  try {
    const result = await browserAPI.storage.local.get(key);
    return result;
  } catch (err) {
    console.error('Storage get error:', err);
    return typeof key === 'string' ? {} : { ...key };
  }
};

const storageSet = async (data) => {
  try {
    await browserAPI.storage.local.set(data);
  } catch (err) {
    console.error('Storage set error:', err);
  }
};

// --- Audio ---
const ctx = new (window.AudioContext || window.webkitAudioContext)();
const processed = new WeakMap();
const videos = new Set();

async function ensureAudioContext() {
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch (err) {
      console.error('AudioContext resume error:', err);
    }
  }
}

function connectVideo(video) {
  if (processed.has(video)) return processed.get(video);
  
  try {
    const wasPlaying = !video.paused && !video.ended;
    const source = ctx.createMediaElementSource(video);

    const stereoGain = ctx.createGain();
    source.connect(stereoGain).connect(ctx.destination);

    const splitter = ctx.createChannelSplitter(2);
    source.connect(splitter);

    const allpassL = ctx.createBiquadFilter();
    allpassL.type = 'allpass';
    allpassL.frequency.value = 1000;
    allpassL.Q.value = 0.707;

    const allpassR = ctx.createBiquadFilter();
    allpassR.type = 'allpass';
    allpassR.frequency.value = 1000;
    allpassR.Q.value = 0.707;

    splitter.connect(allpassL, 0);
    splitter.connect(allpassR, 1);

    const gainL = ctx.createGain();
    const gainR = ctx.createGain();
    gainL.gain.value = 0.7071;
    gainR.gain.value = 0.7071;

    allpassL.connect(gainL);
    allpassR.connect(gainR);

    const sumNode = ctx.createGain();
    gainL.connect(sumNode);
    gainR.connect(sumNode);

    const merger = ctx.createChannelMerger(1);
    sumNode.connect(merger, 0, 0);

    const monoGain = ctx.createGain();
    merger.connect(monoGain).connect(ctx.destination);

    const node = { stereoGain, monoGain };
    processed.set(video, node);
    videos.add(video);

    if (wasPlaying) video.play().catch(() => {});
    
    console.log('Video connected to audio processor');
    return node;
  } catch (err) {
    console.error('Error connecting video:', err);
    return null;
  }
}

function setMono(enabled) {
  console.log('setMono called:', enabled, 'videos:', videos.size);
  videos.forEach((v) => {
    const node = processed.get(v);
    if (!node) return;
    node.monoGain.gain.value = enabled ? 1 : 0;
    node.stereoGain.gain.value = enabled ? 0 : 1;
  });
}

function observeVideos() {
  document.querySelectorAll('video').forEach(video => {
    console.log('Found video element');
    connectVideo(video);
  });
  
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.addedNodes.forEach((n) => {
        if (n.tagName === 'VIDEO') {
          console.log('New video element added');
          connectVideo(n);
        }
        if (n.querySelectorAll) {
          n.querySelectorAll('video').forEach(video => {
            console.log('Found nested video element');
            connectVideo(video);
          });
        }
      });
    });
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
}

// --- Language ---
let textContentObj = {};

async function getLang() {
  try {
    const data = await storageGet('lang');
    const lang = data.lang || 'en';
    const url = browserAPI.runtime.getURL(`_locales/${lang}/ui.json`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    textContentObj = await res.json();
    console.log('Language loaded:', lang);
  } catch (err) {
    console.error('loadLanguage error:', err);
    textContentObj = { enableMono: 'Enable Mono', disableMono: 'Disable Mono' };
  }
}

// --- Button ---

function createToggleButton(state) {
  const btn = document.createElement('div');
  btn.className = 'mono-sound';
  btn.dataset.monoButton = 'true';
  btn.style.userSelect = 'none';

  const icon = document.createElement('div');
  icon.className = `mono-sound__image-wrapper${state ? '' : ' mono-sound--disabled'}`;
  icon.innerHTML = `<svg class="mono-sound__icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path style="fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;stroke:#f1f1f1;" d="M 3 11 L 3 13 M 6 8 L 6 16 M 9 10 L 9 14 M 12 7 L 12 17 M 15 4 L 15 20 M 18 9 L 18 15 M 21 11 L 21 13"/></svg>`;

  const text = document.createElement('p');
  text.className = 'mono-sound__text';
  text.textContent = state ? (textContentObj.disableMono || 'Disable Mono') : (textContentObj.enableMono || 'Enable Mono');

  btn.append(icon, text);

  btn.addEventListener('click', async () => {
    state = !state;
    await storageSet({ monoEnabled: state });
    icon.classList.toggle('mono-sound--disabled', !state);
    text.textContent = state ? (textContentObj.disableMono || 'Disable Mono') : (textContentObj.enableMono || 'Enable Mono');
    setMono(state);
    console.log('Button clicked, new state:', state);
  });

  return btn;
}

function observeMenu(state) {
  const inject = () => {
    const list = document.querySelector('tp-yt-paper-listbox#items');
    if (list && !list.querySelector('[data-mono-button]')) {
      console.log('Injecting button into menu');
      list.appendChild(createToggleButton(state));
    }
  };
  
  inject();
  
  const observer = new MutationObserver(inject);
  observer.observe(document.body, { childList: true, subtree: true });
}

// --- Initialization ---
(async function init() {
  console.log('Content script initializing...');
  
  await ensureAudioContext();
  console.log('AudioContext state:', ctx.state);
  
  const data = await storageGet('monoEnabled');
  const monoEnabled = data.monoEnabled || false;
  console.log('Initial mono state:', monoEnabled);
  
  await getLang();
  
  observeMenu(monoEnabled);
  observeVideos();
  setMono(monoEnabled);
  
  console.log('Content script initialized');
})();

// --- Listeners ---
browserAPI.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('Message received:', msg);
  
  if (!msg) return;
  
  if (msg.action === 'SET_MONO') {
    try {
      setMono(Boolean(msg.value));
      sendResponse({ ok: true });
    } catch (err) {
      console.error('SET_MONO error:', err);
      sendResponse({ ok: false, error: String(err) });
    }
    return true;
  }
  
  if (msg.action === 'languageChanged') {
    (async () => {
      await getLang();
      const btnText = document.querySelector('.mono-sound__text');
      const btnIcon = document.querySelector('.mono-sound__image-wrapper');
      if (btnText && btnIcon) {
        const state = !btnIcon.classList.contains('mono-sound--disabled');
        btnText.textContent = state ? (textContentObj.disableMono || 'Disable Mono') : (textContentObj.enableMono || 'Enable Mono');
      }
      sendResponse({ ok: true });
    })();
    return true;
  }
});

browserAPI.storage.onChanged.addListener((changes, area) => {
  console.log('Storage changed:', changes, area);
  if (changes.monoEnabled) {
    setMono(Boolean(changes.monoEnabled.newValue));
  }
});