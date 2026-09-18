/**
 * Veilex — DOM Extractor Module
 * 
 * Injected into the content script to extract structural DOM information
 * and visible text blocks, while avoiding values from sensitive fields like passwords.
 */

/**
 * Scans the current document and extracts a privacy-safe structural snapshot.
 * 
 * @returns {Object} JSON object containing interactive elements and text blocks.
 */
export function extractDOM() {
  const snapshot = {
    url: window.location.origin, // Only origin, never full path for privacy
    title: document.title,
    interactiveElements: [],
    textBlocks: []
  };

  // 1. Extract interactive elements (inputs, buttons, links)
  const iter = document.createNodeIterator(
    document.body,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: (node) => {
        const tag = node.tagName.toLowerCase();
        if (['input', 'textarea', 'select', 'button', 'a'].includes(tag)) {
          // Ignore hidden elements
          const rect = node.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      }
    }
  );

  let node;
  while ((node = iter.nextNode())) {
    const rect = node.getBoundingClientRect();
    const tag = node.tagName.toLowerCase();
    
    const elData = {
      tag,
      bbox: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
    };

    if (tag === 'input' || tag === 'textarea') {
      elData.type = node.type || 'text';
      elData.name = node.name || '';
      elData.id = node.id || '';
      elData.placeholder = node.placeholder || '';
      elData.autocomplete = node.autocomplete || '';
      
      // Get associated label
      if (node.id) {
        const label = document.querySelector(`label[for="${node.id}"]`);
        if (label) elData.label = label.innerText.trim();
      }
      
      // NEVER extract the actual value of a password field
      if (elData.type !== 'password') {
        elData.value = node.value || '';
      } else {
        elData.value = '[REDACTED]';
      }
    } else {
      elData.text = node.innerText?.trim() || '';
    }

    snapshot.interactiveElements.push(elData);
  }

  // 2. Extract visible text blocks for regex scanning (limited to 50 for performance)
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        // Skip script/style text
        if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(node.parentElement.tagName)) return NodeFilter.FILTER_REJECT;
        // Skip empty or whitespace-only
        if (!node.nodeValue.trim()) return NodeFilter.FILTER_SKIP;
        // Check visibility
        const rect = node.parentElement.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) return NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_SKIP;
      }
    }
  );

  let count = 0;
  let textNode;
  while ((textNode = walker.nextNode()) && count < 50) {
    const text = textNode.nodeValue.trim();
    if (text.length < 3) continue; // Skip very short fragments

    // Create a range to get accurate bounding box of just the text, not the parent container
    const range = document.createRange();
    range.selectNodeContents(textNode);
    const rect = range.getBoundingClientRect();

    snapshot.textBlocks.push({
      text,
      bbox: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
    });
    count++;
  }

  return snapshot;
}
