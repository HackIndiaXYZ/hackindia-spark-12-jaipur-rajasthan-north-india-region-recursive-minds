/**
 * Veilex — Regex Detector (Tier 1)
 * 
 * Scans extracted visible text blocks against a suite of regular expressions
 * to identify structured PII like emails, phone numbers, and SSNs.
 */

import { PII_TYPES } from './pii-types.js';

/**
 * Scans visible text blocks for regex patterns.
 * 
 * @param {Array} textBlocks - Array of { text, bbox } from DOM extraction
 * @param {string} sensitivity - 'minimal', 'balanced', or 'conservative'
 * @returns {Array} List of detections { type, bbox, token, confidence, detector: 'regex' }
 */
export function detectRegex(textBlocks, sensitivity = 'balanced') {
  const detections = [];
  
  // TODO: Phase 2 — Implement regex suite (Email, Phone, CC, SSN, PAN, Aadhaar)
  // Include Luhn validation for credit cards to reduce false positives
  
  return detections;
}
