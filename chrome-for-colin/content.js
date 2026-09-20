// ==================== STATE ====================
let currentTargetWords = [];
let definitionsDB = null;
let definitionsDBPromise = null;
const definitionCache = new Map(); // per-session lookup cache
let tooltipTimer = null;           // debounce handle for tooltip

// ==================== LOCAL DATABASE ====================
function loadDefinitionsDB() {
  if (definitionsDBPromise) return definitionsDBPromise;
  definitionsDBPromise = fetch(chrome.runtime.getURL('definitions.json'))
    .then(res => res.json())
    .then(json => { definitionsDB = json; return json; })
    .catch(err => {
      console.error('Word Scanner: failed to load definitions database', err);
      definitionsDB = {};
      return {};
    });
  return definitionsDBPromise;
}

// Kick off DB load immediately so it's ready before the scan finishes
loadDefinitionsDB();

// ==================== DEFINITION LOOKUP (cached) ====================
async function fetchDefinition(word) {
  const key = word.toLowerCase().trim();
  if (definitionCache.has(key)) return definitionCache.get(key);

  const db = definitionsDB || (await loadDefinitionsDB());
  const entry = db[key];
  const result = entry && (entry.definition || entry.ai)
    ? { word: entry.word || word, definition: entry.definition || entry.ai, category: entry.category || "" }
    : { error: true, message: "No definition found." };

  definitionCache.set(key, result);
  return result;
}

// ==================== HIGHLIGHT HELPERS ====================
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clearHighlights() {
  // Replace each highlight span with a plain text node in one pass
  document.querySelectorAll('.word-scanner-highlight').forEach(el => {
    el.parentNode?.replaceChild(document.createTextNode(el.textContent), el);
  });
}

// ==================== TOOLTIP ====================
function removeTooltip() {
  clearTimeout(tooltipTimer);
  document.getElementById('word-scanner-tooltip')?.remove();
}

async function showTooltip(word, targetEl) {
  removeTooltip();

  const tooltip = document.createElement('div');
  tooltip.id = 'word-scanner-tooltip';
  Object.assign(tooltip.style, {
    position: 'absolute',
    background: '#1a1a1a',
    color: '#f0f0f0',
    padding: '8px 12px',
    borderRadius: '6px',
    fontSize: '13px',
    zIndex: '2147483647',
    pointerEvents: 'none',
    maxWidth: '260px',
    boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
    lineHeight: '1.4',
  });
  tooltip.textContent = 'Loading…';
  document.body.appendChild(tooltip);

  const rect = targetEl.getBoundingClientRect();
  tooltip.style.top  = `${rect.bottom + window.scrollY + 6}px`;
  tooltip.style.left = `${rect.left  + window.scrollX}px`;

  const result = await fetchDefinition(word);
  const live = document.getElementById('word-scanner-tooltip');
  if (!live) return; // mouse already left
  live.textContent = result.error ? result.message : result.definition;
}

// ==================== POPUP ====================
async function showPopup(word) {
  document.getElementById('word-scanner-popup')?.remove();

  const popup = document.createElement('div');
  popup.id = 'word-scanner-popup';
  Object.assign(popup.style, {
    position: 'fixed',
    top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    background: '#fff',
    border: '2px solid #222',
    borderRadius: '12px',
    boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
    padding: '28px 30px',
    zIndex: '2147483647',
    minWidth: '320px',
    maxWidth: '440px',
    fontFamily: 'Arial, sans-serif',
    textAlign: 'center',
  });

  popup.innerHTML = `
    <h2 style="margin:0 0 8px;color:#111;text-transform:capitalize;font-size:20px;">${word}</h2>
    <div id="ws-popup-body" style="margin:16px 0;font-size:15px;color:#444;line-height:1.6;">
      Loading…
    </div>
    <button id="ws-close-btn" style="
      padding:9px 22px;background:#007bff;color:#fff;border:none;
      border-radius:6px;font-size:15px;cursor:pointer;margin-top:4px;">
      Close
    </button>`;

  document.body.appendChild(popup);

  // Close handlers
  popup.querySelector('#ws-close-btn').addEventListener('click', () => popup.remove());
  setTimeout(() => {
    const handler = e => { if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', handler); } };
    document.addEventListener('click', handler);
  }, 100);

  // Fill in definition
  const result = await fetchDefinition(word);
  const body = document.getElementById('ws-popup-body');
  if (!body) return;

  if (result.error) {
    body.textContent = result.message;
  } else {
    const cat = result.category
      ? `<div style="font-style:italic;color:#888;margin-bottom:8px;text-transform:capitalize;font-size:13px;">${result.category}</div>`
      : '';
    body.innerHTML = `${cat}<div>${result.definition}</div>`;
  }
}

// ==================== EVENT DELEGATION ====================
// One listener on body instead of one per highlighted word
function attachDelegatedListeners() {
  document.body.addEventListener('mouseenter', e => {
    if (!e.target.classList.contains('word-scanner-highlight')) return;
    // Debounce: only show tooltip if mouse lingers 120ms
    tooltipTimer = setTimeout(() => showTooltip(e.target.textContent, e.target), 120);
  }, true);

  document.body.addEventListener('mouseleave', e => {
    if (!e.target.classList.contains('word-scanner-highlight')) return;
    removeTooltip();
  }, true);

  document.body.addEventListener('click', e => {
    if (!e.target.classList.contains('word-scanner-highlight')) return;
    e.stopImmediatePropagation();
    removeTooltip();
    showPopup(e.target.textContent);
  }, true);
}

// Attach once at startup
attachDelegatedListeners();

// ==================== SCAN (chunked, non-blocking) ====================
function scanPage(words) {
  clearHighlights();

  const cleanWords = words.filter(w => typeof w === 'string' && w.length > 3);
  if (!cleanWords.length) return { success: true, count: 0 };

  // Build a Set for O(1) per-word lookups
  const wordSet = new Set(cleanWords.map(w => w.toLowerCase()));

  // Pre-build a regex only for multi-word phrases (single words handled via Set)
  const multiWordPhrases = cleanWords.filter(w => w.includes(' '));
  const multiRegex = multiWordPhrases.length
    ? new RegExp(`\\b(${multiWordPhrases.map(escapeRegExp).join('|')})\\b`, 'gi')
    : null;

  let highlightCount = 0;

  // Collect all eligible text nodes up front
  const nodes = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const skipTags = new Set(['SCRIPT','STYLE','TEXTAREA','INPUT','CODE','NOSCRIPT','SVG']);
  let node;
  while ((node = walker.nextNode())) {
    if (!skipTags.has(node.parentElement?.tagName)) nodes.push(node);
  }

  // Process in chunks of 200 nodes per idle callback to keep the page responsive
  const CHUNK = 200;
  let idx = 0;

  function processChunk(deadline) {
    while (idx < nodes.length && (deadline.timeRemaining() > 1 || deadline.didTimeout)) {
      const batch = nodes.slice(idx, idx + CHUNK);
      idx += CHUNK;

      batch.forEach(textNode => {
        if (!textNode.parentNode) return; // node may have been replaced already
        const text = textNode.textContent;

        // Fast pre-check: does this node contain any candidate character sequences?
        const lower = text.toLowerCase();

        // Highlight multi-word phrases first (regex), then single words (Set + split)
        let html = text;

        if (multiRegex) {
          multiRegex.lastIndex = 0;
          html = html.replace(multiRegex, m => { highlightCount++; return wrap(m); });
        }

        // Tokenise and check single words
        html = html.replace(/\b([a-zA-Z][a-zA-Z\-']{2,})\b/g, (match) => {
          // Skip if already wrapped by multi-word pass
          if (match.startsWith('<mark')) return match;
          if (wordSet.has(match.toLowerCase())) {
            highlightCount++;
            return wrap(match);
          }
          return match;
        });

        if (html !== text) {
          const span = document.createElement('span');
          span.innerHTML = html;
          textNode.parentNode.replaceChild(span, textNode);
        }
      });
    }

    if (idx < nodes.length) {
      requestIdleCallback(processChunk, { timeout: 500 });
    }
  }

  requestIdleCallback(processChunk, { timeout: 500 });
  return { success: true, count: highlightCount };
}

function wrap(match) {
  return `<mark class="word-scanner-highlight" style="background:yellow;color:#000;padding:1px 3px;border-radius:3px;font-weight:bold;cursor:pointer;">${match}</mark>`;
}

// ==================== MESSAGE LISTENER ====================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scanWithWords') {
    currentTargetWords = request.words;
    const result = scanPage(currentTargetWords);
    sendResponse(result);
  }
});

// ==================== INITIAL SCAN ====================
loadDefinitionsDB().then(db => {
  currentTargetWords = Object.keys(db).filter(w => w.length > 3);
  scanPage(currentTargetWords);
});
