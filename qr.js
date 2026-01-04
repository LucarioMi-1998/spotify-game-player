// qr.js
// Minimal, reliable overlay behavior. Real QR decoding is project-specific.
// This file provides a tiny scanner shell + a debug fallback.

(function() {
  const video = document.getElementById("qrVideo");
  const canvas = document.getElementById("qrCanvas");

  let stream = null;
  let running = false;

  async function startCamera() {
    // Try to get camera; if not possible, keep overlay open and allow debug click
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      video.srcObject = stream;
      await video.play();
      running = true;
      // NOTE: real decoding not included here. You can plug in a decoder library.
    } catch (e) {
      console.warn("Camera not available:", e);
      running = false;
    }
  }

  function stopCamera() {
    running = false;
    try { video.pause(); } catch {}
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    video.srcObject = null;
  }

  // Debug fallback: click on overlay video to simulate scan (helps testing UI)
  video.addEventListener("click", () => {
    if (typeof window.onQrDetected === "function") {
      window.onQrDetected("https://open.spotify.com/track/5S0QxfYABBoLI4sMk2aCa2?si=6d8fc724c79944e0");
    }
  });

  window.qr = {
    start: startCamera,
    stop: stopCamera,
  };
})();
