const CLIENT_ID = "DEINE_CLIENT_ID_HIER";
const REDIRECT_URI = "https://lucariomi-1998.github.io/spotify-game-player/callback.html";
const SCOPES = "user-read-playback-state user-modify-playback-state streaming";

const loginBtn = document.getElementById("spotifyLoginBtn");
const startBtn = document.getElementById("startGameBtn");
const nextBtn = document.getElementById("nextCardBtn");
const overlay = document.getElementById("qrOverlay");
const player = document.getElementById("player");
const status = document.getElementById("status");

const token = localStorage.getItem("spotify_access_token");

loginBtn.onclick = () => {
  const url = `https://accounts.spotify.com/authorize?client_id=${CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SCOPES)}`;
  window.location.href = url;
};

startBtn.onclick = () => {
  if (!localStorage.getItem("spotify_access_token")) {
    alert("Bitte zuerst mit Spotify verbinden");
    return;
  }
  openScanner();
};

nextBtn.onclick = () => {
  openScanner();
};

function openScanner() {
  overlay.classList.add("active");
}

function closeScanner() {
  overlay.classList.remove("active");
  player.classList.remove("hidden");
  status.textContent = "Track geladen";
}

window.onQrDetected = (url) => {
  closeScanner();
};
