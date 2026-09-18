/**
 * Veilex — PII Type Definitions
 * 
 * Defines all supported Personally Identifiable Information types,
 * their display labels, associated redaction tokens, and severity levels.
 */

export const PII_TYPES = {
  // ── Tier 1: Pattern/DOM based ──
  EMAIL: {
    id: 'EMAIL',
    token: '[EMAIL]',
    label: 'Email Address',
    severity: 'high',
    method: 'blackout', // or token replacement in DOM
  },
  PHONE: {
    id: 'PHONE',
    token: '[PHONE]',
    label: 'Phone Number',
    severity: 'high',
    method: 'blackout',
  },
  PASSWORD: {
    id: 'PASSWORD',
    token: '[PASSWORD]',
    label: 'Password',
    severity: 'critical',
    method: 'blackout',
  },
  CREDIT_CARD: {
    id: 'CREDIT_CARD',
    token: '[CARD]',
    label: 'Credit Card',
    severity: 'critical',
    method: 'blackout',
  },
  SSN: {
    id: 'SSN',
    token: '[SSN]',
    label: 'Social Security Number',
    severity: 'critical',
    method: 'blackout',
  },
  AADHAAR: {
    id: 'AADHAAR',
    token: '[AADHAAR]',
    label: 'Aadhaar ID (India)',
    severity: 'critical',
    method: 'blackout',
  },
  PAN: {
    id: 'PAN',
    token: '[PAN]',
    label: 'PAN Card (India)',
    severity: 'critical',
    method: 'blackout',
  },
  IP_ADDRESS: {
    id: 'IP_ADDRESS',
    token: '[IP]',
    label: 'IP Address',
    severity: 'low',
    method: 'blackout',
  },
  DOB: {
    id: 'DOB',
    token: '[DOB]',
    label: 'Date of Birth',
    severity: 'medium',
    method: 'blackout',
  },

  // ── Tier 2: Vision/ML based ──
  FACE: {
    id: 'FACE',
    token: '[FACE]',
    label: 'Human Face',
    severity: 'high',
    method: 'blur', // Faces look better blurred than blacked out
  },
  NAME: {
    id: 'NAME',
    token: '[NAME]',
    label: 'Person Name',
    severity: 'medium',
    method: 'blackout',
  },
  ADDRESS: {
    id: 'ADDRESS',
    token: '[ADDRESS]',
    label: 'Physical Address',
    severity: 'medium',
    method: 'blackout',
  },

  // ── Tier 3: Contextual/Document based ──
  DOCUMENT: {
    id: 'DOCUMENT',
    token: '[DOCUMENT]',
    label: 'Sensitive Document',
    severity: 'critical',
    method: 'mosaic',
  },

  // Fallback
  GENERIC_PII: {
    id: 'GENERIC_PII',
    token: '[PII]',
    label: 'Generic PII',
    severity: 'low',
    method: 'blackout',
  }
};

/**
 * Returns an array of all PII Type IDs.
 */
export function getAllPiiTypeIds() {
  return Object.keys(PII_TYPES);
}
