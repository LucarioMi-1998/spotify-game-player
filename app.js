// ===== CONFIG =====
const SPOTIFY_CLIENT_ID = "fc0b3b30a9324288a9723c9475a1c2a8";
const SCOPES = "user-modify-playback-state user-read-playback-state streaming";

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

// ===== Helpers =====
function basePath() {
  return location.pathname.endsWith("/") ? location.pathname : location.pathname.replace(/[^/]+$/,"");
}
function redirectUri() {
  return location.origin + basePath() + "callback.html";
}
function rand(l=64){const c="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";return Array.from(crypto.getRandomValues(new Uint8Array(l))).map(x=>c[x%c.length]).join("");}
async function sha256(v){const b=new TextEncoder().encode(v);const h=await crypto.subtle.digest("SHA-256",b);return btoa(String.fromCharCode(...new Uint8Array(h))).replace(/=+/g,"").replace(/\+/g,"-").replace(/\//g,"_");}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

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
  if (!r.ok) throw new Error(j?.error_description || "Token Fehler");

  localStorage.setItem("token", j.access_token);
  location.href = location.origin + basePath();
}
window.handleCallback = handleCallback;

btnLogin?.addEventListener("click", login);
btnLogout?.addEventListener("click", () => { localStorage.clear(); location.reload(); });
btnRules?.addEventListener("click", () => alert("Regeln/Einstellungen können wir als Overlay bauen 🙂"));

// ===== Playback Modes =====
// Mode A: Desktop Web Playback SDK (best on desktop)
let player = null;
let deviceId = null;

// Mode B: Mobile Spotify Connect control (works on phones; audio plays in Spotify app/device)
let isPlaying = false;
let lastTrackId = null;

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

function extractTrackId(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (s.startsWith("spotify:track:")) return s.split(":").pop();
  const m = s.match(/track\/([A-Za-z0-9]+)/);
  if (m) return m[1];
  return s;
}

async function initDesktopSDK() {
  // Only try SDK on non-iOS (iOS is unreliable). Android Chrome sometimes works, but Connect is still safer.
  if (isIOS()) return;

  await new Promise((resolve, reject) => {
    if (window.Spotify) return resolve();
    window.onSpotifyWebPlaybackSDKReady = resolve;
    const s = document.createElement("script");
    s.src = "https://sdk.scdn.co/spotify-player.js";
    s.onerror = () => reject(new Error("Spotify SDK konnte nicht geladen werden."));
    document.head.appendChild(s);
  });

  const token = localStorage.getItem("token");
  player = new Spotify.Player({
    name: "Music Game",
    getOAuthToken: cb => cb(token),
    volume: 0.8
  });

  player.addListener("ready", (e) => {
    deviceId = e.device_id;
    setStatus("Ready (Desktop)");
  });

  player.addListener("player_state_changed", (s) => {
    if (!s) return;
    isPlaying = !s.paused;
    updateToggle();

    const t = s.track_window.current_track;
    if (t) {
      lastTrackId = t.id;
      if (cover) cover.src = t.album.images[1]?.url || t.album.images[0]?.url || "";
      if (trackName) trackName.textContent = t.name || "—";
      if (artistName) artistName.textContent = t.artists.map(a=>a.name).join(", ") || "—";
      if (spotifyLink) spotifyLink.href = "https://open.spotify.com/track/" + t.id;
    }
  });

  await player.connect();
}

async function ensureActiveDeviceHint(e) {
  // Typical mobile error: no active device (needs Spotify app open)
  if (e?.status === 404 || /No active device/i.test(e.message)) {
    setStatus("Öffne Spotify auf deinem Handy, starte kurz irgendeinen Song, dann nochmal „JETZT SPIELEN“.");
    // Optional deep link (best effort)
    try {
      const a = document.createElement("a");
      a.href = "spotify:";
      a.textContent = "Spotify öffnen";
      a.style.display = "inline-block";
      a.style.marginTop = "10px";
      a.style.color = "#9fd";
      a.style.textDecoration = "underline";
      if (statusEl && !document.getElementById("openSpotifyLink")) {
        a.id = "openSpotifyLink";
        statusEl.insertAdjacentElement("afterend", a);
      }
    } catch {}
    return true;
  }
  return false;
}

// ===== Connect playback (mobile-safe) =====
async function connectPlayTrack(trackId) {
  await apiFetch("https://api.spotify.com/v1/me/player/play", {
    method: "PUT",
    body: JSON.stringify({ uris: [`spotify:track:${trackId}`] })
  });
}
async function connectPause() {
  await apiFetch("https://api.spotify.com/v1/me/player/pause", { method: "PUT" });
}
async function connectResume() {
  await apiFetch("https://api.spotify.com/v1/me/player/play", { method: "PUT" });
}
async function fetchTrackMeta(trackId) {
  // Fetch metadata for info section (works in both modes)
  const j = await apiFetch(`https://api.spotify.com/v1/tracks/${trackId}`, { method: "GET", headers: { "Content-Type": "application/json" } });
  if (!j) return;
  lastTrackId = j.id;
  if (cover) cover.src = j.album?.images?.[1]?.url || j.album?.images?.[0]?.url || "";
  if (trackName) trackName.textContent = j.name || "—";
  if (artistName) artistName.textContent = (j.artists||[]).map(a=>a.name).join(", ") || "—";
  if (spotifyLink) spotifyLink.href = "https://open.spotify.com/track/" + j.id;
}

// ===== UI flow =====
function showScanner() {
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

async function beginScanAndPlay() {
  const token = localStorage.getItem("token");
  if (!token) {
    setStatus("Bitte zuerst Login.");
    showScanner();
    scannerText.textContent = "Bitte zuerst einloggen (oben rechts), dann erneut „JETZT SPIELEN“.";
    return;
  }

  showScanner();

  try {
    await window.startQRScanner(async (data) => {
      const id = extractTrackId(data);
      hideScanner();
      showPlayer();

      try {
        // Prefer Connect on mobile (especially iOS)
        if (isMobile() || isIOS() || !player) {
          await connectPlayTrack(id);
          isPlaying = true;
          updateToggle();
          await fetchTrackMeta(id);
          setStatus("Spielt (Mobil)");
        } else {
          // Desktop SDK playback
          await apiFetch("https://api.spotify.com/v1/me/player", {
            method: "PUT",
            body: JSON.stringify({ device_ids: [deviceId] })
          });
          await apiFetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
            method: "PUT",
            body: JSON.stringify({ uris: [`spotify:track:${id}`] })
          });
          setTimeout(()=>player?.resume(), 250);
          setStatus("Spielt (Desktop)");
        }
      } catch (e) {
        const handled = await ensureActiveDeviceHint(e);
        if (!handled) setStatus(e.message);
      }
    });
  } catch (e) {
    btnEnableCam.classList.remove("hidden");
    scannerText.textContent = "Tippe auf „Kamera aktivieren“.";
  }
}

btnPlayGame?.addEventListener("click", beginScanAndPlay);
btnEnableCam?.addEventListener("click", beginScanAndPlay);
btnCloseScanner?.addEventListener("click", () => hideScanner());

// Next card: pause first, then scan again
btnNext?.addEventListener("click", async () => {
  try {
    if (isMobile() || isIOS() || !player) {
      await connectPause();
    } else {
      await player.pause();
    }
    isPlaying = false;
    updateToggle();
  } catch {}
  beginScanAndPlay();
});

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
  try {
    if (isMobile() || isIOS() || !player) {
      if (isPlaying) await connectPause();
      else await connectResume();
    } else {
      if (isPlaying) await player.pause();
      else await player.resume();
    }
    isPlaying = !isPlaying;
    updateToggle();
  } catch (e) {
    const handled = await ensureActiveDeviceHint(e);
    if (!handled) setStatus(e.message);
  }
});

// ===== Start =====
showHome();
updateToggle();

(async () => {
  const token = localStorage.getItem("token");
  if (!token) { setStatus("Nicht eingeloggt"); return; }
  setStatus(isMobile() || isIOS() ? "Ready (Mobil)" : "Lade Player…");
  try {
    await initDesktopSDK();
    if (!(isMobile() || isIOS())) setStatus("Ready");
  } catch {
    // If SDK fails, fall back to Connect control
    setStatus("Ready (Connect)");
  }
})();
