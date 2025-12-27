// ===== QR Scanner (robust mobile) =====
// Tries native BarcodeDetector first (fast, reliable, no CDN dependency).
// Falls back to jsQR if BarcodeDetector is unavailable.
//
// Exposes:
//   window.startQRScanner(onResult)
//   window.stopQRScanner()

let stream = null;
let scanning = false;
let rafId = null;

const hasBarcodeDetector = typeof window.BarcodeDetector === "function";
let detector = null;

async function ensureDetector() {
  if (!hasBarcodeDetector) return null;
  if (detector) return detector;
  // Some browsers require supportedFormats check
  try {
    const formats = await window.BarcodeDetector.getSupportedFormats?.();
    if (formats && !formats.includes("qr_code")) return null;
  } catch {}
  detector = new window.BarcodeDetector({ formats: ["qr_code"] });
  return detector;
}

function waitForVideoReady(video) {
  return new Promise((resolve) => {
    const tick = () => {
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) return resolve();
      requestAnimationFrame(tick);
    };
    tick();
  });
}

async function startQRScanner(onResult) {
  if (scanning) return;
  const video = document.getElementById("camVideo");
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Kamera wird nicht unterstützt.");

  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" } },
    audio: false
  });

  video.srcObject = stream;
  // playsinline is already set in HTML, but keep it safe:
  video.setAttribute("playsinline", "");
  await video.play();
  await waitForVideoReady(video);

  scanning = true;

  // Prepare reusable canvas for jsQR fallback
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const bd = await ensureDetector();

  const loop = async () => {
    if (!scanning) return;

    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) {
      rafId = requestAnimationFrame(loop);
      return;
    }

    try {
      // 1) Native BarcodeDetector
      if (bd) {
        // createImageBitmap is faster than canvas readbacks
        const bitmap = await createImageBitmap(video);
        const codes = await bd.detect(bitmap);
        bitmap.close?.();
        if (codes && codes.length && codes[0].rawValue) {
          stopQRScanner();
          onResult(String(codes[0].rawValue).trim());
          return;
        }
      } else {
        // 2) jsQR fallback (requires jsQR loaded)
        if (typeof window.jsQR !== "function") {
          // If jsQR isn't available (CDN blocked), keep scanning but we can't decode.
          // You can fix by allowing cdn.jsdelivr.net or using a local jsQR bundle.
          rafId = requestAnimationFrame(loop);
          return;
        }

        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(video, 0, 0, w, h);
        const img = ctx.getImageData(0, 0, w, h);
        const code = window.jsQR(img.data, w, h);
        if (code?.data) {
          stopQRScanner();
          onResult(String(code.data).trim());
          return;
        }
      }
    } catch {
      // ignore frame errors, continue
    }

    rafId = requestAnimationFrame(loop);
  };

  rafId = requestAnimationFrame(loop);
}

function stopQRScanner() {
  scanning = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;

  const video = document.getElementById("camVideo");
  try { video.pause(); } catch {}
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  video.srcObject = null;
}

window.startQRScanner = startQRScanner;
window.stopQRScanner = stopQRScanner;
