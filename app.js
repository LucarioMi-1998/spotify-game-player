// ===== CONFIG =====
const SPOTIFY_CLIENT_ID = "fc0b3b30a9324288a9723c9475a1c2a8";
const SCOPES = "streaming user-modify-playback-state user-read-playback-state";

// ===== DOM =====
const statusEl = document.getElementById("status");
const btnLogin = document.getElementById("btnLogin");
const btnLogout = document.getElementById("btnLogout");

const screenHome = document.getElementById("screenHome");
const screenPlayer = document.getElementById("screenPlayer");

const btnPlayGame = document.getElementById("btnPlayGame");
const btnRules = document.getElementById("btnRules");

const scanner = document.getElementById("scanner");
const btnCloseScanner = document.getElementById("btnCloseScanner");
const btnEnableCam = document.getElementById("btnEnableCam");
const scannerText = document.getElementById("scannerText");

const btnToggle = document.getElementById("btnToggle");
const disc = document.getElementById("disc");
const btnNext = document.getElementById("btnNext");

const cover = document.getElementById("cover");
const trackName = document.getElementById("trackName");
const artistName = document.getElementById("artistName");
const spotifyLink = document.getElementById("spotifyLink");

const setStatus = (t) => statusEl && (statusEl.textContent = t);

// ===== URL helpers =====
function basePath() {
  return location.pathname.endsWith("/") ? location.pathname : location.pathname.replace(/[^/]+$/,"");
}
function redirectUri() {
  return location.origin + basePath() + "callback.html";
}

// ===== PKCE =====
function rand(l=64){const c="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";return Array.from(crypto.getRandomValues(new Uint8Array(l))).map(x=>c[x%c.length]).join("");}
async function sha256(v){const b=new TextEncoder().encode(v);const h=await crypto.subtle.digest("SHA-256",b);return btoa(String.fromCharCode(...new Uint8Array(h))).replace(/=+/g,"").replace(/\+/g,"-").replace(/\//g,"_");}

// ===== AUTH =====
function login() {
  const v = rand();
  sessionStorage.setItem("v", v);
  sha256(v).then(ch => {
    const u = new URL("https://accounts.spotify.com/authorize");
    u.searchParams.set("client_id", SPOTIFY_CLIENT_ID);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("redirect_uri", redirectUri());
    u.searchParams.set("scope", SCOPES);
    u.searchParams.set("code_challenge_method", "S256");
    u.searchParams.set("code_challenge", ch);
    location.href = u;
  });
}

async function handleCallback() {
  const p = new URLSearchParams(location.search);
  const body = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: "authorization_code",
    code: p.get("code"),
    redirect_uri: redirectUri(),
    code_verifier: sessionStorage.getItem("v")
  });
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body
  });
  const j = await r.json();
  if(!r.ok) throw new Error(j?.error_description || "Token Fehler");
  localStorage.setItem("token", j.access_token);
  location.href = location.origin + basePath();
}
window.handleCallback = handleCallback;

btnLogin?.addEventListener("click", login);
btnLogout?.addEventListener("click", () => { localStorage.clear(); location.reload(); });

// ===== Spotify Player =====
let player = null;
let deviceId = null;
let isPlaying = false;

function loadSDK() {
  return new Promise((resolve, reject) => {
    if (window.Spotify) return resolve();
    window.onSpotifyWebPlaybackSDKReady = resolve;
    const s = document.createElement("script");
    s.src = "https://sdk.scdn.co/spotify-player.js";
    s.onerror = () => reject(new Error("Spotify SDK konnte nicht geladen werden."));
    document.head.appendChild(s);
  });
}

function extractTrackId(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (s.startsWith("spotify:track:")) return s.split(":").pop();
  const m = s.match(/track\/([A-Za-z0-9]+)/);
  if (m) return m[1];
  return s;
}

async function initSpotify() {
  const token = localStorage.getItem("token");
  if (!token) { setStatus("Nicht eingeloggt"); return; }

  await loadSDK();

  player = new Spotify.Player({
    name: "Hipster",
    getOAuthToken: cb => cb(token),
    volume: 0.8
  });

  player.addListener("ready", (e) => {
    deviceId = e.device_id;
    setStatus("Ready");
  });

  player.addListener("player_state_changed", (s) => {
    if (!s) return;
    isPlaying = !s.paused;
    updateToggle();

    const t = s.track_window.current_track;
    if (t) {
      if (cover) cover.src = t.album.images[1]?.url || t.album.images[0]?.url || "";
      if (trackName) trackName.textContent = t.name || "—";
      if (artistName) artistName.textContent = t.artists.map(a=>a.name).join(", ") || "—";
      if (spotifyLink) spotifyLink.href = "https://open.spotify.com/track/" + t.id;
    }
  });

  await player.connect();
}

async function transferPlayback() {
  const token = localStorage.getItem("token");
  await fetch("https://api.spotify.com/v1/me/player", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ device_ids: [deviceId] })
  });
}

async function playTrack(trackInput) {
  const token = localStorage.getItem("token");
  const id = extractTrackId(trackInput);
  if (!id) throw new Error("Ungültiger QR-Code.");

  await transferPlayback();

  await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ uris: [`spotify:track:${id}`] })
  });

  setTimeout(() => player?.resume(), 300);
}

// ===== UI flow =====
function showScanner() {
  connectDeviceId = null;

  scanner.classList.remove("hidden");
  btnEnableCam.classList.add("hidden");
  scannerText.textContent = "Scanne den QR‑Code auf der Rückseite der Karte";
}
function hideScanner() {
  scanner.classList.add("hidden");
  window.stopQRScanner?.();
}
function showPlayer() {
  screenHome.classList.add("hidden");
  screenPlayer.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function showHome() {
  screenPlayer.classList.add("hidden");
  screenHome.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

btnRules?.addEventListener("click", () => {
  alert("Optional: Regeln/Einstellungen können wir als eigenes Overlay bauen 🙂");
});

async function beginScanAndPlay() {
  const token = localStorage.getItem("token");
  if (!token) {
    setStatus("Bitte zuerst Login.");
    pendingTrackId = null;
  showScanner();
    scannerText.textContent = "Bitte zuerst einloggen (oben rechts), dann erneut „JETZT SPIELEN“.";
    return;
  }

  showScanner();

  try {
    await window.startQRScanner(async (data) => {
      hideScanner();
      showPlayer();

      try {
        await playTrack(data);
        setStatus("Spielt");
      } catch (e) {
        setStatus(e.message);
      }
    });
  } catch (e) {
    btnEnableCam.classList.remove("hidden");
    scannerText.textContent = "Tippe auf „Kamera aktivieren“.";
  }
}

btnPlayGame?.addEventListener("click", beginScanAndPlay);
btnEnableCam?.addEventListener("click", beginScanAndPlay);
btnCloseScanner?.addEventListener("click", () => { hideScanner(); });
btnNext?.addEventListener("click", () => { beginScanAndPlay(); });

// ===== Play/Pause toggle =====
function updateToggle() {
  if (!btnToggle || !disc) return;
  if (isPlaying) {
    btnToggle.textContent = "❚❚";
    disc.classList.remove("paused");
  } else {
    btnToggle.textContent = "▶";
    disc.classList.add("paused");
  }
}
btnToggle?.addEventListener("click", async () => {
  if (!player) return;
  try {
    if (isPlaying) await player.pause();
    else await player.resume();
  } catch {}
});

// ===== Start =====
showHome();
initSpotify();
updateToggle();
