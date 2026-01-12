// QR scanning with live preview (iOS-safe)
let stream = null;
let scanning = false;

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
  const video = document.getElementById("camVideo");
  const camBox = document.getElementById("camBox");
  if (!video) throw new Error("camVideo fehlt in index.html");

  if (!navigator.mediaDevices?.getUserMedia) {
    alert("Kamera wird nicht unterstützt.");
    return;
  }

  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" } },
    audio: false
  });

  video.srcObject = stream;
  camBox?.classList.remove("hidden");

  await video.play();
  await waitForVideoReady(video);

  scanning = true;
  scanLoop(video, onResult);
}

function stopQRScanner() {
  scanning = false;
  const video = document.getElementById("camVideo");
  const camBox = document.getElementById("camBox");

  try { video?.pause(); } catch {}
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  if (video) video.srcObject = null;
  camBox?.classList.add("hidden");
}

function scanLoop(video, onResult) {
  if (!scanning) return;

  if (video.videoWidth === 0 || video.videoHeight === 0) {
    requestAnimationFrame(() => scanLoop(video, onResult));
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(img.data, canvas.width, canvas.height);

  if (code?.data) {
    stopQRScanner();
    onResult(code.data.trim());
    return;
  }

  requestAnimationFrame(() => scanLoop(video, onResult));
}
