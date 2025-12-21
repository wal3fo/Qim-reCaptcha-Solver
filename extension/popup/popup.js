document.addEventListener('DOMContentLoaded', () => {
  const tokenInput = document.getElementById('witToken');
  const saveBtn = document.getElementById('saveBtn');
  const status = document.getElementById('status');

  // Load saved tokens
  chrome.storage.sync.get(['witAiToken'], (result) => {
    if (result.witAiToken) {
      tokenInput.value = result.witAiToken;
    }
  });

  // Save tokens
  saveBtn.addEventListener('click', () => {
    const token = tokenInput.value.trim();

    // Save even if empty (to allow clearing)
    chrome.storage.sync.set({
      witAiToken: token
    }, () => {
      status.style.display = 'block';
      setTimeout(() => {
        status.style.display = 'none';
      }, 2000);
    });
  });
});
