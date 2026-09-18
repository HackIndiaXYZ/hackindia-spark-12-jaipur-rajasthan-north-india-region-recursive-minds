/**
 * Veilex — Action Executor Module
 * 
 * Receives structured JSON actions from the backend and executes them 
 * safely in the browser context using standard DOM APIs.
 */

/**
 * Executes a sequence of actions on the current page.
 * 
 * @param {Array} actions - List of action objects e.g. { type: 'click', selector: '#btn' }
 */
export async function executeActions(actions) {
  if (!actions || actions.length === 0) {
    console.log('[Action Executor] No actions to execute.');
    return;
  }

  for (const action of actions) {
    try {
      console.log(`[Action Executor] Executing: ${action.type} on ${action.selector || 'window'}`);
      
      let targetEl = null;
      if (action.selector) {
        targetEl = document.querySelector(action.selector);
        if (!targetEl) {
          throw new Error(`Selector not found: ${action.selector}`);
        }
        // Apply visual pulse before action
        await pulseElement(targetEl);
      }

      switch (action.type) {
        case 'click':
          targetEl.click();
          break;
          
        case 'type':
          targetEl.focus();
          targetEl.value = ''; // clear first
          // Human-like typing delay
          for (const char of action.value) {
            targetEl.value += char;
            targetEl.dispatchEvent(new Event('input', { bubbles: true }));
            await sleep(Math.random() * 50 + 30); // 30-80ms per char
          }
          targetEl.dispatchEvent(new Event('change', { bubbles: true }));
          break;
          
        case 'scroll':
          window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
          await sleep(1000); // wait for scroll to finish
          break;
          
        case 'wait':
          await sleep(action.value ? parseInt(action.value, 10) : 2000);
          break;
          
        case 'navigate':
          // Validation should have occurred in the API client layer, but we do a sanity check
          if (action.value && action.value.startsWith('http')) {
            window.location.href = action.value;
            return; // Exit execution loop since page is unloading
          }
          break;
          
        case 'select':
          targetEl.value = action.value;
          targetEl.dispatchEvent(new Event('change', { bubbles: true }));
          break;

        default:
          console.warn(`[Action Executor] Unknown action type: ${action.type}`);
      }

      // Default delay between actions
      await sleep(500);
      
    } catch (err) {
      console.error(`[Action Executor] Failed to execute action ${action.type}:`, err);
      // Abort sequence on failure to prevent unintended behavior
      break;
    }
  }
}

/**
 * Creates a visually appealing pulse effect around the target element.
 */
async function pulseElement(element) {
  const rect = element.getBoundingClientRect();
  const overlay = document.createElement('div');
  
  overlay.style.position = 'fixed';
  overlay.style.top = `${rect.top}px`;
  overlay.style.left = `${rect.left}px`;
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;
  overlay.style.border = '3px solid #6366f1';
  overlay.style.borderRadius = '4px';
  overlay.style.boxShadow = '0 0 15px rgba(99, 102, 241, 0.8)';
  overlay.style.zIndex = '999999';
  overlay.style.pointerEvents = 'none';
  overlay.style.transition = 'all 0.3s ease';
  
  document.body.appendChild(overlay);
  
  // Pulse animation
  await sleep(100);
  overlay.style.transform = 'scale(1.05)';
  await sleep(150);
  overlay.style.transform = 'scale(1)';
  await sleep(150);
  
  overlay.remove();
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
