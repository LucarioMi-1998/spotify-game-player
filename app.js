// ===== HIPSTER (Mobile-only, Spotify Connect) =====
// No Spotify Web Playback SDK used (iOS-safe). Audio plays in Spotify app/device.

const SPOTIFY_CLIENT_ID = "fc0b3b30a9324288a9723c9475a1c2a8";
const SCOPES = "user-modify-playback-state user-read-playback-state";

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
btnRules?.addEventListener("click", () => alert("Regeln/Einstellungen können wir als Overlay bauen 🙂"));

// ===== Spotify Web API (Connect control) =====
let isPlaying = false;
let pendingTrackId = null;
let connectDeviceId = null;

function extractTrackId(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (s.startsWith("spotify:track:")) return s.split(":").pop();
  const m = s.match(/track\/([A-Za-z0-9]+)/);
  if (m) return m[1];
  // plain ID
  return s;
}

async function apiFetch(url, options={}) {
  const token = localStorage.getItem("token");
  const r = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });
  if (r.status === 204) return null;
  let j = null;
  try { j = await r.json(); } catch {}
  if (!r.ok) {
    const msg = j?.error?.message || j?.error_description || "Spotify API Fehler";
    const err = new Error(msg);
    err.status = r.status;
    err.payload = j;
    throw err;
  }
  return j;
}

async function getBestDeviceId() {
  const j = await apiFetch("https://api.spotify.com/v1/me/player/devices", {
    method: "GET",
    headers: { "Content-Type": "application/json" }
  });
  const devices = j?.devices || [];
  if (!devices.length) return null;
  const active = devices.find(d => d.is_active);
  if (active?.id) return active.id;
  const preferred = ["Smartphone","Tablet","Computer","Speaker","TV"];
  for (const t of preferred) {
    const d = devices.find(x => x.type === t && x.id);
    if (d) return d.id;
  }
  return devices[0].id || null;
}

async function ensureConnectDevice() {
  if (connectDeviceId) return connectDeviceId;
  connectDeviceId = await getBestDeviceId();
  return connectDeviceId;
}

async function connectPlayTrack(trackId) {
  const dev = await ensureConnectDevice();
  const url = dev ? `https://api.spotify.com/v1/me/player/play?device_id=${dev}` : "https://api.spotify.com/v1/me/player/play";
  await apiFetch(url, {
    method: "PUT",
    body: JSON.stringify({ uris: [`spotify:track:${trackId}`] })
  });
}

async function connectPause() {
  const dev = await ensureConnectDevice();
  const url = dev ? `https://api.spotify.com/v1/me/player/pause?device_id=${dev}` : "https://api.spotify.com/v1/me/player/pause";
  await apiFetch(url, { method: "PUT" });
}

async function connectResume() {
  const dev = await ensureConnectDevice();
  const url = dev ? `https://api.spotify.com/v1/me/player/play?device_id=${dev}` : "https://api.spotify.com/v1/me/player/play";
  await apiFetch(url, { method: "PUT" });
}

async function fetchTrackMeta(trackId) {
  const j = await apiFetch(`https://api.spotify.com/v1/tracks/${trackId}`, { method: "GET", headers: { "Content-Type": "application/json" } });
  if (!j) return;
  if (cover) cover.src = j.album?.images?.[1]?.url || j.album?.images?.[0]?.url || "";
  if (trackName) trackName.textContent = j.name || "—";
  if (artistName) artistName.textContent = (j.artists||[]).map(a=>a.name).join(", ") || "—";
  if (spotifyLink) spotifyLink.href = "https://open.spotify.com/track/" + j.id;
}

async function ensureActiveDeviceHint(e) {
  if (e?.status === 404 || /No active device/i.test(e.message)) {
    setStatus("Öffne die Spotify-App, starte kurz einen Song (damit ein Gerät aktiv ist), dann zurück hier → Play.");
    return true;
  }
  return false;
}

// ===== UI flow =====
function showScanner() {
  connectDeviceId = null; // re-detect device each round
  scanner.classList.remove("hidden");
  btnEnableCam.classList.add("hidden");
  scannerText.textContent = "Scanne den QR-Code auf der Rückseite der Karte";
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

async function beginScan() {
  const token = localStorage.getItem("token");
  if (!token) {
    setStatus("Bitte zuerst Login.");
    showScanner();
    scannerText.textContent = "Bitte zuerst einloggen (oben rechts), dann erneut „JETZT SPIELEN“.";
    return;
  }
  pendingTrackId = null;
  isPlaying = false;
  updateToggle();
  showScanner();

  try {
    await window.startQRScanner(async (data) => {
      const id = extractTrackId(data);
      pendingTrackId = id;

      hideScanner();
      showPlayer();

      // Load meta now; play requires user tap on mobile
      try {
        await fetchTrackMeta(id);
      } catch {}

      setStatus("Bereit – tippe Play");
    });
  } catch (e) {
    btnEnableCam.classList.remove("hidden");
    scannerText.textContent = "Tippe auf „Kamera aktivieren“.";
  }
}

btnPlayGame?.addEventListener("click", beginScan);
btnEnableCam?.addEventListener("click", beginScan);
btnCloseScanner?.addEventListener("click", () => hideScanner());

// Next card: pause then scan again
btnNext?.addEventListener("click", async () => {
  try {
    await connectPause();
  } catch (e) {
    const handled = await ensureActiveDeviceHint(e);
    if (!handled) setStatus(e.message);
  }
  pendingTrackId = null;
  isPlaying = false;
  updateToggle();
  beginScan();
});

// Big circle play/pause
btnToggle?.addEventListener("click", async () => {
  try {
    if (!isPlaying && pendingTrackId) {
      // First play after scan (required on mobile)
      await connectPlayTrack(pendingTrackId);
      isPlaying = true;
      updateToggle();
      setStatus("Spielt");
      return;
    }
    if (isPlaying) {
      await connectPause();
      isPlaying = false;
      updateToggle();
      setStatus("Pausiert");
    } else {
      await connectResume();
      isPlaying = true;
      updateToggle();
      setStatus("Spielt");
    }
  } catch (e) {
    const handled = await ensureActiveDeviceHint(e);
    if (!handled) setStatus(e.message);
  }
});

// ===== Start =====
showHome();
updateToggle();
const token = localStorage.getItem("token");
setStatus(token ? "Bereit" : "Nicht eingeloggt");
