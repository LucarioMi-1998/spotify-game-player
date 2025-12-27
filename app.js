// ===== HIPSTER (Mobile QR + Spotify Login & Playback) =====
// GitHub Pages-friendly Authorization Code with PKCE (no client secret).
// Notes:
// - Web API playback requires Spotify Premium AND an active Spotify device.
// - iOS Home-Screen (PWA) may open Spotify via Safari due to scheme restrictions.

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

// Read config from config.js
const SPOTIFY_CLIENT_ID =
  (window.HIPSTER_CONFIG && window.HIPSTER_CONFIG.spotifyClientId) || "";

// Scopes needed to control playback + read track info
const SCOPES = [
  "user-read-private",
  "user-read-email",
  "user-read-playback-state",
  "user-modify-playback-state",
  "streaming"
].join(" ");

const setStatus = (t) => statusEl && (statusEl.textContent = t);

// ===== GitHub Pages-safe paths =====
function getBasePath() {
  // "/repo/index.html" -> "/repo/"
  const p = location.pathname;
  return p.endsWith("/") ? p : p.replace(/\/[^\/]*$/, "/");
}
function getRedirectUri() {
  const cfg = window.HIPSTER_CONFIG || {};
  if (cfg.redirectUri && String(cfg.redirectUri).trim()) {
    return String(cfg.redirectUri).trim();
  }
  return `${location.origin}${getBasePath()}callback.html`;
}

// ===== Helpers =====
function isMobileIOS() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}
function isStandaloneMode() {
  return (
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    navigator.standalone === true
  );
}

function extractTrackId(input) {
  if (!input) return null;
  const s = String(input).trim();

  if (s.startsWith("spotify:track:")) {
    const id = s.split(":")[2];
    return /^[A-Za-z0-9]{22}$/.test(id) ? id : null;
  }

  const m = s.match(/track\/([A-Za-z0-9]{22})/);
  if (m) return m[1];

  if (/^[A-Za-z0-9]{22}$/.test(s)) return s;

  return null;
}

function openSpotifyTrack(trackId) {
  const deep = `spotify:track:${trackId}`;
  const web = `https://open.spotify.com/track/${trackId}`;
  const isAndroid = /Android/i.test(navigator.userAgent);
  const intent = `intent://open.spotify.com/track/${trackId}#Intent;scheme=https;package=com.spotify.music;end`;

  const standalone = isStandaloneMode();
  const ios = isMobileIOS();

  // iOS homescreen: open Safari with HTTPS (universal link)
  if (ios && standalone) {
    try {
      window.open(web, "_blank", "noopener,noreferrer");
      return;
    } catch {}
    try {
      window.location.href = web;
    } catch {}
    return;
  }

  if (isAndroid) {
    try {
      window.location.href = intent;
    } catch {}
    setTimeout(() => {
      try {
        window.location.href = web;
      } catch {}
    }, 500);
    return;
  }

  // Default: try scheme via <a>, then fallback
  try {
    const a = document.createElement("a");
    a.href = deep;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {}

  setTimeout(() => {
    try {
      window.location.href = web;
    } catch {}
  }, 450);
}

// ===== PKCE Auth =====
const LS = {
  token: "hipster_spotify_token",
  verifier: "hipster_pkce_verifier",
  state: "hipster_oauth_state"
};

function b64url(bytes) {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomString(len = 64) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let out = "";
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  return out;
}

async function sha256(str) {
  const enc = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return digest;
}

function getStoredToken() {
  try {
    return JSON.parse(localStorage.getItem(LS.token) || "null");
  } catch {
    return null;
  }
}
function storeToken(tok) {
  localStorage.setItem(LS.token, JSON.stringify(tok));
}
function clearToken() {
  localStorage.removeItem(LS.token);
}

function tokenValid(tok) {
  return tok?.access_token && tok?.expires_at && Date.now() < tok.expires_at - 30_000;
}

async function refreshTokenIfNeeded() {
  const tok = getStoredToken();
  if (tokenValid(tok)) return tok;
  if (!tok?.refresh_token) return null;

  const body = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: tok.refresh_token
  });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!res.ok) return null;
  const data = await res.json();
  const next = {
    ...tok,
    access_token: data.access_token,
    expires_in: data.expires_in,
    expires_at: Date.now() + data.expires_in * 1000
  };
  storeToken(next);
  return next;
}

async function login() {
  if (!SPOTIFY_CLIENT_ID || SPOTIFY_CLIENT_ID.length < 16) {
    alert("Spotify Client ID fehlt. Bitte in config.js setzen.");
    return;
  }

  const verifier = randomString(96);
  const challenge = b64url(await sha256(verifier));
  const state = randomString(24);

  // Use sessionStorage for security, but iOS PWA can be flaky.
  // We'll also mirror to localStorage as a fallback.
  sessionStorage.setItem(LS.verifier, verifier);
  sessionStorage.setItem(LS.state, state);
  localStorage.setItem(LS.verifier, verifier);
  localStorage.setItem(LS.state, state);

  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: getRedirectUri(),
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
    state
  });

  location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function handleCallback() {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");

  if (error) throw new Error(`Spotify Login fehlgeschlagen: ${error}`);
  if (!code) throw new Error("Kein Code in Callback-URL.");

  const verifier =
    sessionStorage.getItem(LS.verifier) || localStorage.getItem(LS.verifier);
  const savedState =
    sessionStorage.getItem(LS.state) || localStorage.getItem(LS.state);

  if (!verifier) throw new Error("PKCE Verifier fehlt (Storage).");
  if (savedState && state && savedState !== state) throw new Error("State mismatch.");

  const body = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: getRedirectUri(),
    code_verifier: verifier
  });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Token-Exchange fehlgeschlagen (${res.status}). ${txt}`);
  }

  const data = await res.json();
  const tok = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_type: data.token_type,
    scope: data.scope,
    expires_in: data.expires_in,
    expires_at: Date.now() + data.expires_in * 1000
  };

  storeToken(tok);

  // Clean URL back to index
  const base = `${location.origin}${getBasePath()}index.html`;
  location.replace(base);
}
window.handleCallback = handleCallback;

// ===== Spotify Web API =====
async function api(path, opts = {}) {
  const tok = await refreshTokenIfNeeded();
  if (!tok?.access_token) throw new Error("Nicht eingeloggt.");
  return fetch(`https://api.spotify.com/v1${path}`, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      Authorization: `Bearer ${tok.access_token}`
    }
  });
}

async function fetchTrackInfo(trackId) {
  const res = await api(`/tracks/${trackId}`);
  if (!res.ok) throw new Error("Track-Infos konnten nicht geladen werden.");
  const t = await res.json();
  return {
    name: t.name,
    artist: (t.artists || []).map((a) => a.name).join(", "),
    cover: t.album?.images?.[0]?.url || ""
  };
}

async function playOnActiveDevice(trackId) {
  const uri = `spotify:track:${trackId}`;
  const res = await api("/me/player/play", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uris: [uri] })
  });
  return res.status; // 204 OK, 404 no active device, 403 not premium
}

// ===== Spotify Web Playback SDK (shows this Web App as a Spotify "device") =====
// Requirements: Spotify Premium + scope "streaming" + SDK script in index.html.
// Note: Web Playback SDK is typically supported on desktop browsers; on iOS/Android it may not appear as a device.
let webPlayer = null;
let webPlayerDeviceId = null;

function initWebPlaybackSDK() {
  if (!window.Spotify) return;

  // Called by the SDK script once it is ready.
  window.onSpotifyWebPlaybackSDKReady = async () => {
    const tok = await refreshTokenIfNeeded();
    if (!tok?.access_token) return;

    webPlayer = new Spotify.Player({
      name: "Hipster",
      getOAuthToken: async (cb) => {
        const t = await refreshTokenIfNeeded();
        cb(t?.access_token || "");
      },
      volume: 0.8
    });

    webPlayer.addListener("ready", ({ device_id }) => {
      webPlayerDeviceId = device_id;
      setStatus("Hipster-Gerät bereit ✅");
    });

    webPlayer.addListener("not_ready", () => {
      webPlayerDeviceId = null;
    });

    webPlayer.addListener("authentication_error", ({ message }) => {
      setStatus("Spotify Auth-Fehler: " + message);
    });
    webPlayer.addListener("account_error", ({ message }) => {
      setStatus("Spotify Konto-Fehler: " + message);
    });
    webPlayer.addListener("playback_error", ({ message }) => {
      setStatus("Spotify Playback-Fehler: " + message);
    });

    try {
      await webPlayer.connect();
    } catch {
      // ignore
    }
  };
}

async function playOnDevice(trackId, deviceId) {
  const uri = `spotify:track:${trackId}`;
  const res = await api(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uris: [uri] })
  });
  return res.status;
}

// ===== UI flow =====
let pendingTrackId = null;
let isPlayingVisual = false;

function showScanner() {
  scanner?.classList.remove("hidden");
  btnEnableCam?.classList.add("hidden");
  if (scannerText) scannerText.textContent = "Scanne den QR-Code auf der Rückseite der Karte";
}
function hideScanner() {
  scanner?.classList.add("hidden");
  window.stopQRScanner?.();
}
function showPlayer() {
  screenHome?.classList.add("hidden");
  screenPlayer?.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function showHome() {
  screenPlayer?.classList.add("hidden");
  screenHome?.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function updateToggle() {
  if (!btnToggle || !disc) return;
  if (isPlayingVisual) {
    btnToggle.textContent = "⏸";
    disc.classList.remove("paused");
  } else {
    btnToggle.textContent = "▶";
    disc.classList.add("paused");
  }
}
function setLoggedInUI(isIn) {
  if (!btnLogin || !btnLogout) return;
  btnLogin.style.display = isIn ? "none" : "inline-flex";
  btnLogout.style.display = isIn ? "inline-flex" : "none";
}

async function beginScan() {
  pendingTrackId = null;
  isPlayingVisual = false;
  updateToggle();
  showScanner();

  try {
    await window.startQRScanner(async (data) => {
      const id = extractTrackId(data);
      if (!id) {
        setStatus("QR-Code ist kein Spotify-Track-Link (oder ungültige ID).");
        // Keep scanner open for retry
        showScanner();
        return;
      }

      pendingTrackId = id;
      hideScanner();
      showPlayer();

      if (spotifyLink) spotifyLink.href = `https://open.spotify.com/track/${id}`;

      // Try to load metadata (requires login)
      try {
        setStatus("Lade Song-Infos…");
        const info = await fetchTrackInfo(id);
        if (cover) cover.src = info.cover || "";
        if (trackName) trackName.textContent = info.name || "—";
        if (artistName) artistName.textContent = info.artist || "—";
        setStatus("Starte Wiedergabe…");
        // Auto-Start nach Scan (falls möglich)
        try {
          const tok = await refreshTokenIfNeeded();
          if (tok?.access_token) {
            const targetDeviceId = webPlayerDeviceId;
            const code = targetDeviceId
              ? await playOnDevice(pendingTrackId, targetDeviceId).catch(() => null)
              : await playOnActiveDevice(pendingTrackId).catch(() => null);

            if (code === 204) {
              isPlayingVisual = true;
              updateToggle();
              setStatus(targetDeviceId ? "Läuft (Hipster Web Player)." : "Läuft (über Spotify).");
              return;
            }
            if (code === 403) {
              openSpotifyTrack(pendingTrackId);
              isPlayingVisual = true;
              updateToggle();
              setStatus("Spotify Premium nötig für In-App-Steuerung. Öffne Spotify…");
              return;
            }
            if (code === 404) {
              openSpotifyTrack(pendingTrackId);
              isPlayingVisual = true;
              updateToggle();
              setStatus("Kein aktives Spotify-Device gefunden. Öffne Spotify…");
              return;
            }
          }
        } catch {
          // ignore (fallback below)
        }
        setStatus("Bereit – tippe Play");
      } catch {
        if (cover) cover.src = "";
        if (trackName) trackName.textContent = "—";
        if (artistName) artistName.textContent = "—";
        setStatus("Bereit – tippe Play (Login nötig für Song-Infos & In-App-Play)");
      }
    });
  } catch (e) {
    btnEnableCam?.classList.remove("hidden");
    if (scannerText) scannerText.textContent = "Tippe auf „Kamera aktivieren".";
  }
}

// ===== Controls =====
btnPlayGame?.addEventListener("click", beginScan);
btnEnableCam?.addEventListener("click", beginScan);
btnCloseScanner?.addEventListener("click", () => hideScanner());
btnRules?.addEventListener("click", () => alert("Regeln/Einstellungen können wir als Overlay bauen 🙂"));

btnLogin?.addEventListener("click", async () => {
  await login();
});
btnLogout?.addEventListener("click", () => {
  clearToken();
  setLoggedInUI(false);
  setStatus("Ausgeloggt.");
});

btnNext?.addEventListener("click", async () => {
  isPlayingVisual = false;
  updateToggle();
  setStatus("Nächste Karte – scanne weiter.");
  beginScan();
});

btnToggle?.addEventListener("click", async () => {
  if (!pendingTrackId) {
    setStatus("Bitte zuerst eine Karte scannen.");
    return;
  }

  const tok = await refreshTokenIfNeeded();
  if (tok?.access_token) {
    setStatus("Starte Wiedergabe…");
    // Prefer the Web Playback SDK device (if available)
    const targetDeviceId = webPlayerDeviceId;
    const code = targetDeviceId
      ? await playOnDevice(pendingTrackId, targetDeviceId).catch(() => null)
      : await playOnActiveDevice(pendingTrackId).catch(() => null);

    if (code === 204) {
      isPlayingVisual = true;
      updateToggle();
      setStatus("Läuft (über Spotify).");
      return;
    }
    if (code === 404) {
      openSpotifyTrack(pendingTrackId);
      isPlayingVisual = true;
      updateToggle();
      setStatus("Öffne Spotify… (danach nochmal Play tippen)");
      return;
    }
    if (code === 403) {
      openSpotifyTrack(pendingTrackId);
      isPlayingVisual = true;
      updateToggle();
      setStatus("Spotify Premium nötig für In-App-Steuerung. Öffne Spotify…");
      return;
    }
  }

  // Not logged in: open Spotify
  openSpotifyTrack(pendingTrackId);
  isPlayingVisual = true;
  updateToggle();
  setStatus(isMobileIOS() ? "Spotify geöffnet – Song startet dort." : "Spotify geöffnet.");
});

// ===== Start =====
(async function init() {
  showHome();
  updateToggle();

  const tok = await refreshTokenIfNeeded();
  const loggedIn = !!tok?.access_token;
  setLoggedInUI(loggedIn);

  // Initialize Spotify Web Playback SDK (if supported)
  initWebPlaybackSDK();

  const baseMsg = loggedIn
    ? "Eingeloggt. Tippe „JETZT SPIELEN" um zu starten."
    : "Bitte einloggen. Danach „JETZT SPIELEN".";

  if (!SPOTIFY_CLIENT_ID) {
    setStatus("Config fehlt: Bitte config.js prüfen (spotifyClientId).");
    return;
  }

  if (isMobileIOS() && isStandaloneMode()) {
    setStatus(loggedIn ? baseMsg : "Bitte einloggen. (iOS Home-Bildschirm: Login am besten in Safari testen)");
  } else {
    setStatus(baseMsg);
  }
})();