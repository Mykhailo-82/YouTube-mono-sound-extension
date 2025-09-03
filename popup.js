const toggleBtn = document.getElementById('switch-container__toggle');
const toggleLabel = document.getElementById('switch-container__label');
const switchContainer = document.getElementById('switch-container');

function updateUI(enabled) {
  if (!toggleBtn || !toggleLabel) return;
  toggleBtn.classList.toggle('active', enabled);
  toggleLabel.textContent = enabled ? 'Disable Mono' : 'Enable Mono';
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
