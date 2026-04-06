let currentTargetWords = ["a", "and", "yes", "no"]; // test words

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

  // Combined regex with case-insensitive flag
  const escapedWords = cleanWords.map(word => escapeRegExp(word)).join('|');
  const regex = new RegExp(`\\b(${escapedWords})\\b`, 'gi');   // 'gi' = global + case-insensitive

  let highlightCount = 0;

  // Collect nodes first
  const nodes = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  let node;
  while (node = walker.nextNode()) {
    const tag = node.parentElement?.tagName;
    if (['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'NOSCRIPT'].includes(tag)) continue;
    nodes.push(node);
  }

  // Process nodes
  nodes.forEach(textNode => {
    const text = textNode.textContent;
    if (!regex.test(text)) return; // Quick skip for better performance

    const newHTML = text.replace(regex, match => {
      highlightCount++;
      return `<mark class="word-scanner-highlight" style="background-color: yellow; color: black; padding: 2px 4px; border-radius: 3px; font-weight: bold;">${match}</mark>`;
    });

    if (newHTML !== text) {
      const span = document.createElement('span');
      span.innerHTML = newHTML;
      textNode.parentNode.replaceChild(span, textNode);
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

// Initial scan
scanPage(currentTargetWords);
