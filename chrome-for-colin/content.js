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

  const cleanWords = words.filter(w => typeof w === 'string' && w.trim() !== '');
  if (!cleanWords || cleanWords.length === 0) return { success: true, count: 0 };

  // Collect ALL nodes first before touching the DOM
  const nodes = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  let node;
  while (node = walker.nextNode()) {
    if (['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'NOSCRIPT'].includes(node.parentElement?.tagName)) continue;
    nodes.push(node);
  }

  let highlightCount = 0;

  // Now process nodes separately
  nodes.forEach(node => {
    let text = node.textContent;
    let modified = false;

    cleanWords.forEach(word => {
      const regex = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'g');
      text = text.replace(regex, match => {
        modified = true;
        highlightCount++;
        return `<mark class="word-scanner-highlight" style="background-color: yellow; color: black; padding: 2px 4px; border-radius: 3px; font-weight: bold;">${match}</mark>`;
      });
    });

    if (modified) {
      const span = document.createElement('span');
      span.innerHTML = text;
      node.parentNode.replaceChild(span, node);
    }
  });

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