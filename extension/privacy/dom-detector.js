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
  if (!domSnapshot || !domSnapshot.interactiveElements) return detections;

  for (const el of domSnapshot.interactiveElements) {
    if (!el.bbox) continue; // Cannot redact without coordinates

    const typeStr = (el.type || '').toLowerCase();
    const nameStr = (el.name || '').toLowerCase();
    const idStr = (el.id || '').toLowerCase();
    const placeholderStr = (el.placeholder || '').toLowerCase();
    const autocompleteStr = (el.autocomplete || '').toLowerCase();
    const labelStr = (el.label || '').toLowerCase();

    // Combine strings for easier matching
    const contextStr = `${typeStr} ${nameStr} ${idStr} ${placeholderStr} ${autocompleteStr} ${labelStr}`;

    let detectedType = null;
    let confidence = 0;

    // 1. Hard signals (High Confidence)
    if (typeStr === 'password' || autocompleteStr === 'current-password' || autocompleteStr === 'new-password') {
      detectedType = 'PASSWORD';
      confidence = 1.0;
    } else if (autocompleteStr === 'cc-number' || autocompleteStr === 'cc-csc') {
      detectedType = 'CREDIT_CARD';
      confidence = 1.0;
    } else if (autocompleteStr.includes('email') || typeStr === 'email') {
      detectedType = 'EMAIL';
      confidence = 1.0;
    } else if (autocompleteStr.includes('tel') || typeStr === 'tel') {
      detectedType = 'PHONE';
      confidence = 1.0;
    } 
    // 2. Soft signals (Heuristics based on name/id/placeholder)
    else if (/\b(password|passwd|pwd)\b/.test(contextStr)) {
      detectedType = 'PASSWORD';
      confidence = 0.9;
    } else if (/\b(card[-_]?number|ccnum|cvv|cvc)\b/.test(contextStr)) {
      detectedType = 'CREDIT_CARD';
      confidence = 0.9;
    } else if (/\b(ssn|social[-_]?security)\b/.test(contextStr)) {
      detectedType = 'SSN';
      confidence = 0.9;
    } else if (/\b(aadhaar|aadhar)\b/.test(contextStr)) {
      detectedType = 'AADHAAR';
      confidence = 0.9;
    } else if (/\b(pan[-_]?number|pancard)\b/.test(contextStr)) {
      detectedType = 'PAN';
      confidence = 0.9;
    } else if (/\b(dob|birthdate|date[-_]?of[-_]?birth)\b/.test(contextStr)) {
      detectedType = 'DOB';
      confidence = 0.8;
    } else if (/\b(address|zipcode|postalcode)\b/.test(contextStr)) {
      detectedType = 'ADDRESS';
      confidence = 0.8;
    } else if (/\b(first[-_]?name|last[-_]?name|full[-_]?name)\b/.test(contextStr)) {
      detectedType = 'NAME';
      confidence = 0.8;
    }

    // Apply sensitivity threshold
    const threshold = sensitivity === 'conservative' ? 0.6 : (sensitivity === 'minimal' ? 0.95 : 0.75);

    if (detectedType && confidence >= threshold) {
      detections.push({
        type: detectedType,
        bbox: el.bbox,
        token: PII_TYPES[detectedType]?.token || '[PII]',
        confidence,
        detector: 'dom',
        reason: `Matched context: ${contextStr}`
      });
    }
  }
  
  return detections;
}
