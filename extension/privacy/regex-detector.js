/**
 * Veilex — Regex Detector (Tier 1)
 * 
 * Scans extracted visible text blocks against a suite of regular expressions
 * to identify structured PII like emails, phone numbers, and SSNs.
 */

import { PII_TYPES } from './pii-types.js';

const REGEX_SUITE = {
  EMAIL: {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    confidence: 1.0
  },
  PHONE: {
    // Basic NA/International format, ignores too many spaces
    pattern: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    confidence: 0.70 // Tuned for max recall
  },
  SSN: {
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    confidence: 1.0
  },
  AADHAAR: {
    pattern: /\b\d{4}\s\d{4}\s\d{4}\b/g,
    confidence: 0.95
  },
  PAN: {
    pattern: /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/g,
    confidence: 0.80 // Max recall
  },
  CREDIT_CARD: {
    // Catch 13-19 digit sequences, possibly separated by spaces or dashes
    pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9][0-9])[0-9]{12})\b|\b(?:\d[ -]*?){13,16}\b/g,
    confidence: 0.80, // Max recall
    validate: (match) => luhnCheck(match.replace(/[- ]/g, ''))
  },
  IP_ADDRESS: {
    pattern: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    confidence: 0.9
  },
  DOB: {
    // MM/DD/YYYY or YYYY-MM-DD
    pattern: /\b(?:0[1-9]|1[0-2])\/(?:0[1-9]|[12]\d|3[01])\/(?:19|20)\d{2}\b|\b(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/g,
    confidence: 0.70 // Max recall
  },
  PASSWORD_CONTEXT: {
    // Catches explicit declarations like "password is secret", "pwd: mypass", "passkey=1234"
    // We capture the value after the contextual keyword.
    pattern: /\b(?:password|passwd|pwd|secret|passkey)\s*(?:is|:|=>|=)\s*(\S+)\b/gi,
    confidence: 0.90, // High confidence since it's explicit
    // We only want to redact the secret part (Group 1), not the word "password is"
    captureGroup: 1
  },
  PASSWORD_ENTROPY: {
    // Catches any isolated word (8+ chars) with uppercase, lowercase, numbers, and symbols
    pattern: /\b(?=\S*[A-Z])(?=\S*[a-z])(?=\S*\d)(?=\S*[@$!%*?&_])\S{8,}\b/g,
    confidence: 0.85 // Might catch some random UUIDs or tracking codes, but safe fail-closed
  }
};

/**
 * Luhn algorithm to validate credit card numbers and reduce false positives.
 */
function luhnCheck(num) {
  if (!num || !/^\d+$/.test(num)) return false;
  let sum = 0;
  let shouldDouble = false;
  
  // Loop through values starting from the rightmost side
  for (let i = num.length - 1; i >= 0; i--) {
    let digit = parseInt(num.charAt(i), 10);
    if (shouldDouble) {
      if ((digit *= 2) > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return (sum % 10) == 0;
}

/**
 * Scans visible text blocks for regex patterns.
 * 
 * @param {Array} textBlocks - Array of { text, bbox } from DOM extraction
 * @param {string} sensitivity - 'minimal', 'balanced', or 'conservative'
 * @returns {Array} List of detections { type, bbox, token, confidence, detector: 'regex' }
 */
export function detectRegex(textBlocks, sensitivity = 'balanced') {
  const detections = [];
  if (!textBlocks) return detections;
  
  const threshold = sensitivity === 'conservative' ? 0.6 : (sensitivity === 'minimal' ? 0.95 : 0.75);

  for (const block of textBlocks) {
    if (!block.text || !block.bbox) continue;
    const text = block.text;

    for (const [type, config] of Object.entries(REGEX_SUITE)) {
      if (config.confidence < threshold) continue;

      const regex = new RegExp(config.pattern);
      let match;
      while ((match = regex.exec(text)) !== null) {
        const matchedText = (config.captureGroup && match[config.captureGroup]) ? match[config.captureGroup] : match[0];
        
        // Run extra validation if defined (e.g. Luhn for CC)
        if (config.validate && !config.validate(matchedText)) {
          continue;
        }

        detections.push({
          type,
          bbox: block.bbox, // For phase 1/2 we map the entire block's bbox. (Sub-block calculation is complex)
          token: PII_TYPES[type]?.token || '[PII]',
          confidence: config.confidence,
          detector: 'regex',
          reason: `Matched pattern: ${matchedText}`
        });
      }
    }
  }
  
  return detections;
}
