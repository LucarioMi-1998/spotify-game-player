// Simulierter QR-Scanner
document.getElementById("qrOverlay").addEventListener("click", () => {
  if (window.onQrDetected) {
    window.onQrDetected("https://open.spotify.com/track/test");
  }
});
