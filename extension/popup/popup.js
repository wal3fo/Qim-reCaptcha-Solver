document.addEventListener('DOMContentLoaded', () => {
  const tokenInput = document.getElementById('witToken');
  const saveBtn = document.getElementById('saveBtn');
  const status = document.getElementById('status');

  // Load saved token
  chrome.storage.sync.get(['witAiToken'], (result) => {
    if (result.witAiToken) {
      tokenInput.value = result.witAiToken;
    }
  });

  // Save token
  saveBtn.addEventListener('click', () => {
    const token = tokenInput.value.trim();
    if (token) {
      chrome.storage.sync.set({ witAiToken: token }, () => {
        status.style.display = 'block';
        setTimeout(() => {
          status.style.display = 'none';
        }, 2000);
      });
    }
  });
});
