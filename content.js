// content.js
// --- API ---
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

const storageGet = async (key) => {
  try {
    const result = await browserAPI.storage.local.get(key);
    return result;
  } catch (err) {
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

// --- Audio Logic ---
let currentMonoEnabled = false;
async function syncMonoState() {
  const data = await storageGet('monoEnabled');
  currentMonoEnabled = Boolean(data.monoEnabled);
}

const ctx = new (window.AudioContext || window.webkitAudioContext)();
const processed = new WeakMap();

async function ensureAudioContext() {
  if (ctx.state === 'suspended') {
    try { 
      await ctx.resume(); 
    } catch (e) {
      console.error('AudioContext resume failed:', e);
    }
  }
}

function connectVideo(video) {
  if (processed.has(video)) return processed.get(video);

  try {
    if (ctx.state === 'suspended') ctx.resume();

    const source = ctx.createMediaElementSource(video);
    const stereoGain = ctx.createGain();
    const monoGain = ctx.createGain();
    
    source.connect(stereoGain).connect(ctx.destination);

    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(1);
    const sumNode = ctx.createGain();
    sumNode.gain.value = 0.7071;

    source.connect(splitter);
    splitter.connect(sumNode, 0);
    splitter.connect(sumNode, 1);
    sumNode.connect(merger).connect(monoGain).connect(ctx.destination);

    monoGain.gain.value = currentMonoEnabled ? 1 : 0;
    stereoGain.gain.value = currentMonoEnabled ? 0 : 1;

    const node = { stereoGain, monoGain };
    processed.set(video, node);
    return node;
  } catch (err) {
    return null;
  }
}

function setMono(enabled) {
  const activeVideos = document.querySelectorAll('video');
  activeVideos.forEach((v) => {
    const node = processed.get(v);
    if (!node) return;
    
    const time = ctx.currentTime;
    node.monoGain.gain.setTargetAtTime(enabled ? 1 : 0, time, 0.01);
    node.stereoGain.gain.setTargetAtTime(enabled ? 0 : 1, time, 0.01);
  });
}

// --- Language & UI ---
let textContentObj = { enableMono: 'Enable Mono', disableMono: 'Disable Mono' };
let isAddingButton = false;

async function loadLanguage() {
  try {
    const data = await storageGet('lang');
    const lang = data.lang || 'en';
    if (textContentObj.isLoaded) return; 

    const url = browserAPI.runtime.getURL(`_locales/${lang}/ui.json`);
    const res = await fetch(url);
    
    if (res.ok) {
      textContentObj = await res.json();
      textContentObj.isLoaded = true;
    } else {
      console.warn(`[Mono] Locale ${lang} not found, falling back to EN`);
      textContentObj.isLoaded = true;
    }
  } catch (err) {
    textContentObj.isLoaded = true; 
    console.error('[Mono] Language load critical error');
  }
}

function isLightTheme() {
  return !document.documentElement.hasAttribute('dark') && !document.querySelector('html').hasAttribute('dark');
}

async function createToggleButton() {
  const data = await storageGet('monoEnabled');
  const isEnabled = Boolean(data.monoEnabled);
  const lightTheme = isLightTheme();

  const btn = document.createElement('div');
  btn.className = 'mono-sound';
  btn.dataset.monoButton = 'true';
  btn.tabIndex = 0;
  
  btn.setAttribute('role', 'button');
  btn.setAttribute('aria-pressed', isEnabled.toString());
  
  if (lightTheme) btn.classList.add('light');

  const iconWrapper = document.createElement('div');
  iconWrapper.className = 'mono-sound__image-wrapper';
  if (!isEnabled) iconWrapper.classList.add('mono-sound--disabled');

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.style.pointerEvents = 'none';
  svg.setAttribute('aria-hidden', 'true');

  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('stroke', lightTheme ? '#0f0f0f' : '#f1f1f1');
  path.setAttribute('d', 'M 3 11 L 3 13 M 6 8 L 6 16 M 9 10 L 9 14 M 12 7 L 12 17 M 15 4 L 15 20 M 18 9 L 18 15 M 21 11 L 21 13');

  svg.appendChild(path);
  iconWrapper.appendChild(svg);

  const text = document.createElement('p');
  text.className = 'mono-sound__text';
  if (lightTheme) text.classList.add('light');
  text.textContent = isEnabled ? textContentObj.disableMono : textContentObj.enableMono;

  btn.append(iconWrapper, text);

  const toggleState = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const currentData = await storageGet('monoEnabled');
    const newState = !Boolean(currentData.monoEnabled);
    await storageSet({ monoEnabled: newState });
    
    btn.setAttribute('aria-pressed', newState.toString());
    
    await ensureAudioContext();
  };

  btn.addEventListener('click', toggleState);

  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      toggleState(e);
    }
  });

  return btn;
}

// --- Observers ---

const listSelectors = [
  'tp-yt-paper-listbox#items',
  'ytmusic-menu-popup-renderer #items',
  '.style-scope.ytmusic-menu-popup-renderer',
  '#primary-items'
];

let menuTimeout;

function observeMenu() {
  const menuObserver = new MutationObserver(() => {
    clearTimeout(menuTimeout);
    menuTimeout = setTimeout(handleMenuChange, 100);
  });

  menuObserver.observe(document.body, { 
    childList: true, 
    subtree: true 
  });
}

async function handleMenuChange() {
  if (isAddingButton) return;

  const targetList = document.querySelector(listSelectors.join(', '));

  if (!targetList || targetList.querySelector('[data-mono-button="true"]')) return;

  isAddingButton = true;
  try {
    const newBtn = await createToggleButton();
    targetList.appendChild(newBtn);
    
    const container = targetList.closest('ytd-menu-popup-renderer, ytmusic-menu-popup-renderer, tp-yt-iron-dropdown');
    if (container) {
      container.classList.add('mono-menu-active');
      if (typeof container.notifyResize === 'function') container.notifyResize();
    }
    
    window.dispatchEvent(new Event('resize'));
    
  } catch (err) {
    console.error('[Mono] Injection failed:', err);
  } finally {
    isAddingButton = false;
  }
}

function observeVideos() {
  document.querySelectorAll('video').forEach(connectVideo);

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;

        if (node.tagName === 'VIDEO') {
          connectVideo(node);
        } else {
          node.querySelectorAll('video').forEach(connectVideo);
        }
      });
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

// --- Init ---
(async function init() {
  await loadLanguage();
  const data = await storageGet('monoEnabled');
  await syncMonoState();
  
  observeMenu();
  observeVideos();
  
  setTimeout(() => {
    setMono(Boolean(data.monoEnabled));
  }, 1000);
})();

// --- Listeners ---
browserAPI.storage.onChanged.addListener((changes) => {
  if (changes.monoEnabled) {
    const newValue = Boolean(changes.monoEnabled.newValue);
    currentMonoEnabled = newValue;
    setMono(newValue);

    const btnIcon = document.querySelector('.mono-sound__image-wrapper');
    const btnText = document.querySelector('.mono-sound__text');
    
    if (btnIcon && btnText) {
      btnIcon.classList.toggle('mono-sound--disabled', !newValue);
      btnText.textContent = newValue ? textContentObj.disableMono : textContentObj.enableMono;
    }
  }
});

browserAPI.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg && msg.action === 'languageChanged') {
    await loadLanguage();
    
    const btnText = document.querySelector('.mono-sound__text');
    const btnIcon = document.querySelector('.mono-sound__image-wrapper');

    if (btnText && btnIcon) {
      const isEnabled = !btnIcon.classList.contains('mono-sound--disabled');
      btnText.textContent = isEnabled ? textContentObj.disableMono : textContentObj.enableMono;
    }

    if (sendResponse) sendResponse({ ok: true });
  }
  return true;
});