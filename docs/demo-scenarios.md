# Veilex: Demo Scenarios 🎬

These scenarios are designed to showcase the full capabilities of Veilex to the hackathon judges. They highlight the agent's reasoning capabilities, its ability to navigate complex DOMs, and, most importantly, its robust client-side privacy layer.

---

## Scenario 1: The Multi-Step Registration (The Standard Flow)
**Objective:** Prove that Veilex can navigate a multi-step form autonomously.
**Setup:** A synthetic registration page (`test-pages/demo1.html`) containing first name, last name, and password fields.
**Prompt:** *"Create a new account for me"*
**What happens:**
1. Veilex captures the page and detects no PII.
2. The VLM decides to type a generic name and password into the fields.
3. Veilex clicks "Next Step".
4. The VLM recognizes the page has changed and clicks "Submit".
**Key Takeaway for Judges:** The extension handles multi-step workflows automatically via a feedback loop.

---

## Scenario 2: The E-Commerce Checkout (Privacy Showcase)
**Objective:** Prove that Veilex redacts highly sensitive PII locally before sending it to the VLM.
**Setup:** A synthetic checkout page (`test-pages/demo2.html`) where the user's `Credit Card`, `Phone Number`, and `Email` are pre-filled as text on the screen.
**Prompt:** *"Complete my purchase using the saved details"*
**What happens:**
1. Veilex captures the page.
2. **Tier 1 (Regex)** detects the Credit Card, Phone, and Email.
3. The Visual Redactor applies a 12x12 mosaic pixelation over these elements in the screenshot in < 5ms.
4. The VLM receives the pixelated screenshot, recognizes the "Checkout" button, and returns a `click` action.
**Key Takeaway for Judges:** The VLM successfully completes the task *without* ever seeing the user's credit card or phone number.

---

## Scenario 3: The ID Verification Portal (Computer Vision Showcase)
**Objective:** Prove that Veilex can handle unstructured PII in images using ONNX Web Runtime.
**Setup:** An ID verification portal (`test-pages/demo3.html`) displaying a photo of a user's face and an uploaded driver's license image.
**Prompt:** *"Approve the uploaded documents"*
**What happens:**
1. Veilex captures the page.
2. **Tier 2 (Computer Vision)** kicks in. BlazeFace detects the human face in the photo. MobileNet-v2 classifies the driver's license image as a sensitive document.
3. The Visual Redactor pixelates both images.
4. The VLM receives the sanitized context, sees the "Approve" button, and clicks it.
**Key Takeaway for Judges:** Veilex protects users from leaking unstructured photographic PII using fully local, client-side ML models.
