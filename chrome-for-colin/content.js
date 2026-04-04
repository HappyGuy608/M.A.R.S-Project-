let currentTargetWords = ["a", "and", "And", "yes", "no"]; // default words

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clearHighlights() {
  document.querySelectorAll('.word-scanner-highlight').forEach(el => {
    const parent = el.parentNode;
    if (parent) parent.replaceChild(document.createTextNode(el.textContent), el);
  });
}

function scanPage(words) {
  clearHighlights();
  
  if (!words || words.length === 0) return { success: true, count: 0 };

  console.log("Scanning with words:", words);

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  let node;
  let highlightCount = 0;

  while (node = walker.nextNode()) {
    if (['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE'].includes(node.parentElement?.tagName)) {
      continue;
    }

    let text = node.textContent;
    let modified = false;

    words.forEach(word => {
      const regex = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'gi');
      if (regex.test(text)) {
        text = text.replace(regex, match => {
          modified = true;
          highlightCount++;
          return `<mark class="word-scanner-highlight" style="background-color: yellow; color: black; padding: 2px 4px; border-radius: 3px; font-weight: bold;">${match}</mark>`;
        });
      }
    });

    if (modified) {
      const span = document.createElement('span');
      span.innerHTML = text;
      node.parentNode.replaceChild(span, node);
    }
  }

  console.log(`Scan finished. Highlights: ${highlightCount}`);
  return { success: true, count: highlightCount };
}

// Listen for message from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scanWithWords") {
    currentTargetWords = request.words;
    const result = scanPage(currentTargetWords);
    sendResponse(result);
  }
});

// Initial scan with default words when page loads
scanPage(currentTargetWords);