// Hitster Webapp (GitHub Pages) – Spotify PKCE + QR Scan
// Client ID (kein Secret, ok im Frontend)
const SPOTIFY_CLIENT_ID = "fc0b3b30a9324288a9723c9475a1c2a8";

const SCOPES = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
];

// Resolve redirect reliably on GitHub Pages
const REDIRECT_URI = new URL("callback.html", location.href).toString();

const el = (id) => document.getElementById(id);

const screenStart = el("screenStart");
const screenScan = el("screenScan");
const screenPlayer = el("screenPlayer");

const btnStart = el("btnStart");
const btnRules = el("btnRules");
const btnClose = el("btnClose");

const modal = el("modal");
const btnModalClose = el("btnModalClose");
const hintAuth = el("hintAuth");

const video = el("camera");
const canvas = el("scanCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const scanHint = el("scanHint");

const playerScroll = el("playerScroll");
const revealHeader = el("revealHeader");
const songTitleEl = el("songTitle");
const songArtistEl = el("songArtist");

const btnPause = el("btnPause");
const btnNext = el("btnNext");

let accessToken = null;
let refreshToken = null;
let tokenExpiresAt = 0;

let scanning = false;
let currentTrackId = null;

function show(screen){
  [screenStart, screenScan, screenPlayer].forEach(s => s.classList.add("hidden"));
  screen.classList.remove("hidden");
}

function openModal(){ modal.classList.remove("hidden"); }
function closeModal(){ modal.classList.add("hidden"); }

// -------------------- PKCE helpers --------------------
function base64urlencode(a) {
  return btoa(String.fromCharCode.apply(null, new Uint8Array(a)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(plain) {
  const enc = new TextEncoder().encode(plain);
  return crypto.subtle.digest("SHA-256", enc);
}

function randomString(len=64){
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let s = "";
  const rnd = crypto.getRandomValues(new Uint8Array(len));
  for (let i=0;i<len;i++) s += chars[rnd[i] % chars.length];
  return s;
}

function saveTokens() {
  sessionStorage.setItem("spotify_access_token", accessToken || "");
  sessionStorage.setItem("spotify_refresh_token", refreshToken || "");
  sessionStorage.setItem("spotify_expires_at", String(tokenExpiresAt || 0));
}

function loadTokens(){
  accessToken = sessionStorage.getItem("spotify_access_token") || null;
  refreshToken = sessionStorage.getItem("spotify_refresh_token") || null;
  tokenExpiresAt = Number(sessionStorage.getItem("spotify_expires_at") || "0");
}

function clearTokens(){
  accessToken = null; refreshToken = null; tokenExpiresAt = 0;
  sessionStorage.removeItem("spotify_access_token");
  sessionStorage.removeItem("spotify_refresh_token");
  sessionStorage.removeItem("spotify_expires_at");
}

async function loginSpotify(){  
  const verifier = randomString(64);
  const challenge = base64urlencode(await sha256(verifier));
  sessionStorage.setItem("pkce_verifier", verifier);

  const authUrl = new URL("https://accounts.spotify.com/authorize");
  authUrl.searchParams.set("client_id", SPOTIFY_CLIENT_ID);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("scope", SCOPES.join(" "));
  authUrl.searchParams.set("show_dialog", "false");

  location.href = authUrl.toString();
}

async function exchangeCodeForToken(code){
  const verifier = sessionStorage.getItem("pkce_verifier");
  if (!verifier) throw new Error("PKCE verifier fehlt.");

  const body = new URLSearchParams();
  body.set("client_id", SPOTIFY_CLIENT_ID);
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", REDIRECT_URI);
  body.set("code_verifier", verifier);

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type":"application/x-www-form-urlencoded" },
    body
  });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data?.error_description || "Token exchange fehlgeschlagen.");

  accessToken = data.access_token;
  refreshToken = data.refresh_token || refreshToken;
  tokenExpiresAt = Date.now() + (Number(data.expires_in || 3600) * 1000) - 15_000;

  saveTokens();
}

async function refreshAccessTokenIfNeeded(){
  if (!accessToken) return;
  if (Date.now() < tokenExpiresAt) return;
  if (!refreshToken) return;

  const body = new URLSearchParams();
  body.set("client_id", SPOTIFY_CLIENT_ID);
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type":"application/x-www-form-urlencoded" },
    body
  });

  const data = await res.json().catch(()=>({}));
  if (!res.ok) {
    clearTokens();
    throw new Error(data?.error_description || "Token refresh fehlgeschlagen. Bitte neu einloggen.");
  }

  accessToken = data.access_token;
  tokenExpiresAt = Date.now() + (Number(data.expires_in || 3600) * 1000) - 15_000;
  saveTokens();
}

// -------------------- Spotify Web API --------------------
async function spotifyFetch(path, opts={}){
  await refreshAccessTokenIfNeeded();
  if (!accessToken) throw new Error("Kein Spotify Token – bitte einloggen.");
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    }
  });
  if (res.status === 204) return null;
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Spotify API ${res.status}: ${t}`);
  }
  return res.json();
}

async function ensureDeviceAndPlay(trackId){
  // show player, but keep title hidden until scroll; we still set text now
  // Track meta for title/artist
  const track = await spotifyFetch(`/tracks/${trackId}`);
  songTitleEl.textContent = track.name || "";
  songArtistEl.textContent = (track.artists || []).map(a => a.name).join(", ");

  // Devices
  const dev = await spotifyFetch("/me/player/devices");
  const devices = dev?.devices || [];
  const active = devices.find(d => d.is_active) || devices[0];

  if (!active) {
    throw new Error("Kein Spotify Gerät gefunden. Öffne kurz die Spotify App und starte irgendeinen Song.");
  }

  // Transfer playback to a device (stabiler auf iPhone)
  await spotifyFetch("/me/player", {
    method: "PUT",
    body: JSON.stringify({ device_ids: [active.id], play: false })
  });

  // Play
  await spotifyFetch(`/me/player/play?device_id=${encodeURIComponent(active.id)}`, {
    method: "PUT",
    body: JSON.stringify({ uris: [`spotify:track:${trackId}`] })
  });

  btnPause.textContent = "Ⅱ";
}

async function togglePause(){
  const state = await spotifyFetch("/me/player");
  if (!state || !state.is_playing) {
    await spotifyFetch("/me/player/play", { method:"PUT" });
    btnPause.textContent = "Ⅱ";
  } else {
    await spotifyFetch("/me/player/pause", { method:"PUT" });
    btnPause.textContent = "▶";
  }
}

// -------------------- QR Scan --------------------
function extractTrackId(text){
  const raw = (text || "").trim();
  try {
    if (raw.startsWith("spotify:track:")) return raw.split(":")[2];
    const u = new URL(raw);
    const t = u.searchParams.get("track");
    if (t) return t;
    const m = u.pathname.match(/\/track\/([a-zA-Z0-9]+)/);
    if (m) return m[1];
  } catch(e) {
    if (/^[a-zA-Z0-9]{22}$/.test(raw)) return raw;
  }
  return null;
}

async function startScanner(){
  show(screenScan);
  scanHint.textContent = "QR-Code scannen…";
  scanning = true;

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" },
    audio: false
  });
  video.srcObject = stream;
  await video.play();

  scanLoop();
}

function stopScanner(){
  scanning = false;
  const s = video.srcObject;
  if (s && s.getTracks) s.getTracks().forEach(t => t.stop());
  video.srcObject = null;
}

function scanLoop(){
  if (!scanning) return;

  const w = video.videoWidth;
  const h = video.videoHeight;
  if (w && h) {
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(video, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const code = jsQR(img.data, w, h);
    if (code?.data) {
      const id = extractTrackId(code.data);
      if (id) {
        stopScanner();
        onTrackDetected(id);
        return;
      }
    }
  }
  requestAnimationFrame(scanLoop);
}

// -------------------- Player: title reveal on scroll --------------------
function setupReveal(){
  playerScroll.addEventListener("scroll", () => {
    const y = playerScroll.scrollTop;
    const showAt = 120;
    const t = Math.min(1, Math.max(0, (y - showAt) / 90));
    revealHeader.style.opacity = String(t);
    revealHeader.style.transform = `translateY(${(-6 + 6*t)}px)`;
  }, { passive:true });
}

// -------------------- Flow --------------------
async function onTrackDetected(trackId){
  currentTrackId = trackId;
  show(screenPlayer);

  // hide title initially, reveal on scroll
  revealHeader.style.opacity = "0";
  revealHeader.style.transform = "translateY(-6px)";
  playerScroll.scrollTop = 0;

  // Ensure logged in
  loadTokens();
  const code = sessionStorage.getItem("spotify_auth_code");
  if (code && !accessToken) {
    sessionStorage.removeItem("spotify_auth_code");
    try {
      await exchangeCodeForToken(code);
    } catch(e) {
      hintAuth.textContent = "Login fehlgeschlagen – bitte nochmal.";
      throw e;
    }
  }

  if (!accessToken) {
    hintAuth.textContent = "Spotify Login…";
    await loginSpotify();
    return;
  }

  try {
    await ensureDeviceAndPlay(trackId);
  } catch (e) {
    alert(e.message);
    // back to scanner for retry
    try { await startScanner(); } catch(_) {}
  }
}

function initDeepLink(){
  const params = new URLSearchParams(location.search);
  const track = params.get("track");
  if (track) onTrackDetected(track);
}

// -------------------- Events --------------------
// iOS needs user gesture -> startScanner in click handler is correct
btnStart.addEventListener("click", async () => {
  try {
    await startScanner();
  } catch (e) {
    alert("Kamera nicht verfügbar. Bitte Safari-Berechtigung erlauben.");
  }
});

btnNext.addEventListener("click", async () => {
  try { await startScanner(); } catch(e) { alert("Kamera nicht verfügbar."); }
});

btnPause.addEventListener("click", async () => {
  try { await togglePause(); } catch(e) { alert(e.message); }
});

btnRules.addEventListener("click", () => openModal());
btnModalClose.addEventListener("click", () => closeModal());
modal.addEventListener("click", (ev) => {
  if (ev.target === modal) closeModal();
});

btnClose.addEventListener("click", () => {
  stopScanner();
  closeModal();
  show(screenStart);
});

// -------------------- Init --------------------
setupReveal();
show(screenStart);
loadTokens();

(async () => {
  // If user returned from callback, exchange code immediately
  const code = sessionStorage.getItem("spotify_auth_code");
  if (code && !accessToken) {
    sessionStorage.removeItem("spotify_auth_code");
    try {
      await exchangeCodeForToken(code);
      hintAuth.textContent = "Spotify verbunden ✅";
    } catch(e) {
      hintAuth.textContent = "Spotify Login nötig.";
    }
  } else if (accessToken) {
    hintAuth.textContent = "Spotify verbunden ✅";
  } else {
    hintAuth.textContent = "Tippe auf „JETZT SPIELEN“ und logge dich einmal ein.";
  }

  initDeepLink();
})();
