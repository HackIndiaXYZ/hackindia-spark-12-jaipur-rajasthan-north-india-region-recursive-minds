/**
 * Veilex — API Client Module
 * 
 * Handles HTTP communication between the browser extension and the FastAPI backend.
 */

const SERVER_URL = 'http://localhost:8000';

/**
 * Sends the redacted screenshot and DOM context to the backend for analysis.
 * 
 * @param {Object} payload 
 * @param {string} payload.screenshot_b64 - Redacted image base64
 * @param {Object} payload.dom_snapshot - Sanitized DOM
 * @param {string} payload.user_prompt - The natural language instruction
 * @param {string} payload.page_url
 * @param {string} payload.page_title
 * @param {Object} payload.viewport
 * @returns {Promise<Array>} List of actions returned by the VLM
 */
export async function analyzeContext(payload) {
  try {
    // Add timestamp per API schema
    payload.timestamp = new Date().toISOString();

    const response = await fetch(`${SERVER_URL}/api/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Server returned ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const actions = data.actions || [];
    
    // Action Validator (Dev 5 Phase 2)
    const validatedActions = actions.filter(action => {
      // 1. Safety check for navigation
      if (action.type === 'navigate') {
        try {
          const targetUrl = new URL(action.value);
          // Block navigation to dangerous schemas or vastly different domains if desired
          if (['javascript:', 'data:', 'file:'].includes(targetUrl.protocol)) {
            console.warn('[API Client] Blocked unsafe navigation schema:', action.value);
            return false;
          }
        } catch (e) {
          console.warn('[API Client] Blocked invalid navigation URL:', action.value);
          return false;
        }
      }
      return true;
    });

    return validatedActions;
  } catch (error) {
    console.error('[API Client] Request failed:', error);
    throw error;
  }
}
