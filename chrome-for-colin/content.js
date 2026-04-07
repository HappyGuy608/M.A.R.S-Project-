let currentTargetWords = ["a", "and", "yes", "no"]; // test words will replace with a data base

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clearHighlights() {
  document.querySelectorAll('.word-scanner-highlight').forEach(el => {
    const parent = el.parentNode;
    if (parent) parent.replaceChild(document.createTextNode(el.textContent), el);
  });
}

// ==================== POPUP ====================
function createDefinitionPopup(word) {
  // Remove any existing popup
  const existing = document.getElementById('word-scanner-popup');
  if (existing) existing.remove();

  const popup = document.createElement('div');
  popup.id = 'word-scanner-popup';
  popup.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    border: 2px solid #333;
    border-radius: 10px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.4);
    padding: 25px;
    z-index: 2147483647;
    min-width: 320px;
    text-align: center;
    font-family: Arial, sans-serif;
  `;

  popup.innerHTML = `
    <h2 style="margin: 0 0 20px 0; color: #222;">${word}</h2>
    <p style="margin: 20px 0; font-size: 17px; color: #444; line-height: 1.5;">
      test definition
    </p>
    <button id="close-popup-btn" style="
      padding: 10px 20px;
      background: #007bff;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 16px;
      cursor: pointer;
    ">Close</button>
  `;

  document.body.appendChild(popup);

  // Close button
  document.getElementById('close-popup-btn').addEventListener('click', () => {
    popup.remove();
  });

  // Click outside to close
  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!popup.contains(e.target)) {
        popup.remove();
        document.removeEventListener('click', handler);
      }
    });
  }, 100);
}

// ==================== SCAN ====================
function scanPage(words) {
  clearHighlights();

  const cleanWords = words.filter(w => typeof w === 'string' && w.trim() !== '');
  if (!cleanWords || cleanWords.length === 0) return { success: true, count: 0 };

  const escapedWords = cleanWords.map(word => escapeRegExp(word)).join('|');
  const regex = new RegExp(`\\b(${escapedWords})\\b`, 'gi');

  let highlightCount = 0;

  // Collect nodes
  const nodes = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  let node;
  while (node = walker.nextNode()) {
    const tag = node.parentElement?.tagName;
    if (['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'NOSCRIPT'].includes(tag)) continue;
    nodes.push(node);
  }

  // Process and highlight
  nodes.forEach(textNode => {
    const text = textNode.textContent;
    if (!regex.test(text)) return;

    const newHTML = text.replace(regex, match => {
      highlightCount++;
      return `<mark class="word-scanner-highlight" style="background-color: yellow; color: black; padding: 2px 4px; border-radius: 3px; font-weight: bold; cursor: pointer;">${match}</mark>`;
    });

    if (newHTML !== text) {
      const span = document.createElement('span');
      span.innerHTML = newHTML;
      textNode.parentNode.replaceChild(span, textNode);
    }
  });

  // Add click listeners to highlighted words
  document.querySelectorAll('.word-scanner-highlight').forEach(mark => {
    mark.addEventListener('click', (e) => {
      e.stopImmediatePropagation();
      createDefinitionPopup(mark.textContent);
    });
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

// Initial Scan 
scanPage(currentTargetWords);
