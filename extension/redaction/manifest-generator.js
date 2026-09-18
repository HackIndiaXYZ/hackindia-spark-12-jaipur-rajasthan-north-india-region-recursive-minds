/**
 * Veilex — Redaction Manifest Generator
 * 
 * Generates structured JSON metadata detailing all redactions applied
 * to the visual and DOM snapshots. This manifest is sent to the VLM
 * to give it context about what was hidden and where.
 */

/**
 * Generates the redaction manifest payload.
 * 
 * @param {Array} detections - The detected PII items
 * @param {number} processingTimeMs - Total time taken for redaction phase
 * @returns {Object} Manifest metadata
 */
export function generateManifest(detections, processingTimeMs) {
  if (!detections || !Array.isArray(detections)) {
    detections = [];
  }

  // 1. Map detections to standardized redaction records
  const redactions = detections.map((det, index) => {
    return {
      id: `r_${String(index + 1).padStart(3, '0')}`,
      type: det.type || 'UNKNOWN',
      bbox: det.bbox || null,
      confidence: det.confidence || 1.0,
      method: det.type === 'FACE' ? 'blur' : 'black',
      detector: det.detector || 'stub',
      token: det.token || `[${det.type}_REDACTED]`
    };
  });

  // 2. Generate summary counts (e.g. { "FACE": 1, "EMAIL": 2 })
  const summary = detections.reduce((acc, det) => {
    const type = det.type || 'UNKNOWN';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  // 3. Assemble full manifest
  const manifest = {
    redactions: redactions,
    tiers_executed: [1, 2, 3], // Assuming all tiers executed in the full pipeline
    processing_time_ms: processingTimeMs,
    total_pii_found: redactions.length,
    summary: summary
  };

  return manifest;
}
