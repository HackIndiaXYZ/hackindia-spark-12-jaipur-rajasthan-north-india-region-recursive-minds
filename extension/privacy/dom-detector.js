/**
 * Veilex — DOM Detector (Tier 1)
 * 
 * Analyzes DOM element metadata (ids, names, placeholders, labels, types)
 * to heuristically determine if an input field contains PII, without 
 * relying on the actual value.
 */

import { PII_TYPES } from './pii-types.js';

/**
 * Scans a DOM snapshot for PII based on element attributes.
 * 
 * @param {Object} domSnapshot - The structural snapshot extracted by content script
 * @param {string} sensitivity - 'minimal', 'balanced', or 'conservative'
 * @returns {Array} List of detections { type, bbox, token, confidence, detector: 'dom' }
 */
export function detectDOM(domSnapshot, sensitivity = 'balanced') {
  const detections = [];
  
  // TODO: Phase 2 — Implement heuristic matching logic
  // e.g., if (el.type === 'password' || el.name.includes('pwd')) -> PII_TYPES.PASSWORD
  
  return detections;
}
