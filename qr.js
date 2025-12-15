let video = document.createElement("video");
video.setAttribute("playsinline", true);

let scanning = false;
let stream = null;

function waitForVideoReady() {
  return new Promise((resolve) => {
    const tick = () => {
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) return resolve();
      requestAnimationFrame(tick);
    };
    tick();
  });
}

async function startQRScanner(onResult) {
  if (!navigator.mediaDevices?.getUserMedia) {
    alert("Kamera wird nicht unterstützt.");
    return;
  }

  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" } },
    audio: false
  });

  video.srcObject = stream;

  // iOS: play() muss in User-Gesture passieren -> du startest ja per Button, perfekt
  await video.play();
  await waitForVideoReady();

  scanning = true;
  scanLoop(onResult);
}

function stopQRScanner() {
  scanning = false;
  try { video.pause(); } catch {}
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  video.srcObject = null;
}

function scanLoop(onResult) {
  if (!scanning) return;

  // Wenn iOS kurz „0x0“ liefert, warten wir
  if (video.videoWidth === 0 || video.videoHeight === 0) {
    requestAnimationFrame(() => scanLoop(onResult));
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

  requestAnimationFrame(() => scanLoop(onResult));
}
