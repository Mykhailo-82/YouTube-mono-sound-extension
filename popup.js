// ------------- language -------------

let textContentObj = {}

window.addEventListener('DOMContentLoaded', async () => {
  const languageSaved = localStorage.getItem('lang') || 'en';
  await loadLanguage(languageSaved);
  updateTextContent();
});


async function loadLanguage(language) {
  try {
    const res = await fetch(`./locales/${language}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    textContentObj = await res.json();

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'languageChanged'});
    });
  } catch (err) {
    console.error('loadLanguage error', err);
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
  await chrome.storage.sync.set({ lang: language });

  await loadLanguage(language);
  updateTextContent();

  document.getElementById('languages').classList.remove('languages--active');
});

function updateTextContent() {
  document.getElementById('header__title').textContent = textContentObj.headerTitle || 'YouTube Mono Sound';
  document.getElementById('header__description').textContent = textContentObj.headerDescription || 'Turn on mono sound for all videos on YouTube';
  chrome.storage.sync.get('monoEnabled', (data) => {updateUI(Boolean(data.monoEnabled))});
}




// -------------  -------------
const toggleBtn = document.getElementById('switch-container__toggle');
const toggleLabel = document.getElementById('switch-container__label');
const switchContainer = document.getElementById('switch-container');

function updateUI(enabled) {
  if (!toggleBtn || !toggleLabel) return;
  toggleBtn.classList.toggle('active', enabled);
  toggleLabel.textContent = enabled ? textContentObj.disableMono || 'Disable Mono' : textContentObj.enableMono || 'Enable Mono';
}


chrome.storage.sync.get('monoEnabled', (data) => {
  updateUI(Boolean(data.monoEnabled));
});


if (switchContainer) {
  switchContainer.addEventListener('click', () => {
    chrome.storage.sync.get('monoEnabled', (data) => {
      const newValue = !Boolean(data.monoEnabled);
      chrome.storage.sync.set({ monoEnabled: newValue }, () => {
        updateUI(newValue);
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tab = tabs && tabs[0];
          if (tab && tab.id && tab.url && tab.url.startsWith('https://www.youtube.com')) {
            chrome.tabs.sendMessage(tab.id, { action: 'SET_MONO', value: newValue }, (resp) => {
              if (chrome.runtime.lastError) {
                chrome.tabs.query({ url: '*://www.youtube.com/*' }, (ytTabs) => {
                  ytTabs.forEach(t => {
                    if (t.id) chrome.tabs.sendMessage(t.id, { action: 'SET_MONO', value: newValue }, () => {});
                  });
                });
              }
            });
          } else {
            chrome.tabs.query({ url: '*://www.youtube.com/*' }, (ytTabs) => {
              ytTabs.forEach(t => {
                if (t.id) chrome.tabs.sendMessage(t.id, { action: 'SET_MONO', value: newValue }, () => {});
              });
            });
          }
        });
      });
    });
  });
} else {
  console.warn('popup: switch container not found');
}
