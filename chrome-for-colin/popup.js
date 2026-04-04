const wordInput = document.getElementById('wordInput');
const scanBtn = document.getElementById('scanBtn');
const statusDiv = document.getElementById('status');
const matchCount = document.getElementById('match-count');

scanBtn.addEventListener('click', () => {
  const inputText = wordInput.value.trim();
  
  if (!inputText) {
    statusDiv.textContent = "Please enter words";
    statusDiv.style.color = "red";
    return;
  }

  const words = inputText.split(',').map(w => w.trim().toLowerCase()).filter(Boolean);

  statusDiv.textContent = "Scanning...";
  statusDiv.style.color = "blue";
  matchCount.textContent = "";

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];

    // Skip special Chrome pages
    if (tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) {
      statusDiv.textContent = "Cannot scan Chrome internal pages";
      statusDiv.style.color = "red";
      return;
    }

    chrome.tabs.sendMessage(tab.id, {
      action: "scanWithWords",
      words: words
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        statusDiv.textContent = " Content script not loaded. Please refresh the page.";
        statusDiv.style.color = "orange";
        return;
      }

      if (response && response.success) {
        statusDiv.textContent = "Scan complete!";
        statusDiv.style.color = "green";
        matchCount.textContent = response.count > 0 
          ? `Found ${response.count} matches` 
          : "No matches found";
      }
    });
  });
});
