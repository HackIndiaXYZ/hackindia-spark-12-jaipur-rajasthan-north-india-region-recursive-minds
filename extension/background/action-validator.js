/**
 * Veilex — Client-Side Action Validator
 * 
 * Provides a secondary security layer on the client side to ensure that
 * actions received from the server (or any other source) are safe to execute.
 * 
 * Validates action types against a strict whitelist, strips dangerous URLs,
 * and blocks obvious XSS vectors in CSS selectors.
 */

const VALID_ACTION_TYPES = new Set([
  'click', 'type', 'select', 'scroll', 'wait', 'navigate', 'read', 'highlight'
]);

const SELECTOR_REQUIRED = new Set(['click', 'type', 'select', 'read', 'highlight']);
const VALUE_REQUIRED = new Set(['type', 'select', 'navigate']);

// Block common XSS or code injection patterns in selectors and values
const UNSAFE_URL_PATTERN = /^(javascript|data|vbscript):/i;
const UNSAFE_SELECTOR_PATTERN = /(<script|onerror|onload|onclick|onmouseover|eval\(|javascript:)/i;

/**
 * Validates an array of actions.
 * @param {Array} actions 
 * @returns {Array} A filtered array of validated and safe actions.
 */
export function validateActions(actions) {
  if (!Array.isArray(actions)) {
    console.error('[Action Validator] Actions payload is not an array.');
    return [];
  }

  const validActions = [];

  for (const action of actions) {
    if (isValidAction(action)) {
      validActions.push({
        type: action.type.toLowerCase().trim(),
        selector: action.selector ? action.selector.trim() : undefined,
        value: typeof action.value === 'string' ? action.value : action.value,
        amount: action.amount,
        direction: action.direction
      });
    }
  }

  return validActions;
}

/**
 * Validates a single action object.
 * @param {Object} action 
 * @returns {boolean} True if safe, false if blocked.
 */
export function isValidAction(action) {
  if (!action || typeof action !== 'object') return false;

  const type = (action.type || '').toLowerCase().trim();
  
  if (!VALID_ACTION_TYPES.has(type)) {
    console.warn(`[Action Validator] Blocked unknown action type: ${type}`);
    return false;
  }

  const selector = action.selector;
  if (SELECTOR_REQUIRED.has(type)) {
    if (!selector || typeof selector !== 'string' || !selector.trim()) {
      console.warn(`[Action Validator] Blocked '${type}' action missing selector.`);
      return false;
    }
    if (UNSAFE_SELECTOR_PATTERN.test(selector)) {
      console.warn(`[Action Validator] Blocked dangerous selector: ${selector}`);
      return false;
    }
  }

  const value = action.value;
  if (VALUE_REQUIRED.has(type)) {
    if (value === undefined || value === null) {
      console.warn(`[Action Validator] Blocked '${type}' action missing value.`);
      return false;
    }
  }

  if (type === 'navigate') {
    const url = (value || '').toString().trim();
    if (UNSAFE_URL_PATTERN.test(url)) {
      console.warn(`[Action Validator] Blocked dangerous URL navigation: ${url}`);
      return false;
    }
  }

  return true;
}
