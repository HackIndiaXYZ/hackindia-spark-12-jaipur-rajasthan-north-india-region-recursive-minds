/**
 * Veilex — Hardware Profiler (Phase 4)
 * 
 * Dynamically evaluates the user's hardware to assign a processing tier (1-3).
 * This prevents the extension from crashing low-end machines by avoiding
 * heavy ML workloads if the hardware cannot support it.
 */

export const TIERS = {
  TIER_3: 3, // High-end (8+ cores): Runs everything including MobileNet classification
  TIER_2: 2, // Mid-range (4-7 cores): Runs OCR and BlazeFace
  TIER_1: 1  // Low-end (<4 cores): Only runs Regex and DOM heuristics
};

/**
 * Detects the hardware tier based on navigator properties.
 * @returns {number} The hardware tier (1, 2, or 3)
 */
export function detectHardwareTier() {
  // navigator.hardwareConcurrency gives the number of logical processors
  const cores = navigator.hardwareConcurrency || 2;
  let tier = TIERS.TIER_1;

  if (cores >= 8) {
    tier = TIERS.TIER_3;
  } else if (cores >= 4) {
    tier = TIERS.TIER_2;
  }

  // Could be expanded in the future with WebGL context checks or memory constraints
  // e.g. navigator.deviceMemory >= 8
  
  console.log(`[Hardware Profiler] Detected ${cores} logical cores. Assigned to TIER ${tier}.`);
  return tier;
}
