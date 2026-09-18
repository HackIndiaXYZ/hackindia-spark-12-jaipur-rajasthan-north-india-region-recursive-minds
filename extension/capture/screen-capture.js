/**
 * Veilex — Screen Capture Module
 * 
 * Responsible for securely capturing the visible tab area.
 * Designed to be imported into the service worker.
 */

/**
 * Captures the currently visible tab.
 * Requires "activeTab" permission in manifest.
 * 
 * @returns {Promise<string>} Base64 data URL (PNG) of the captured screenshot
 */
export async function captureTab() {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png',
    });
    return dataUrl;
  } catch (error) {
    console.error('[Capture Module] Failed to capture tab:', error);
    throw new Error('Failed to capture screen. Ensure Veilex has access to this tab.');
  }
}
