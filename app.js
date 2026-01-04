// ---------- CONFIG ----------
// IMPORTANT: set your Spotify Client ID
const CLIENT_ID = "fc0b3b30a9324288a9723c9475a1c2a8";

// Keep EXACTLY as in Spotify Developer Dashboard:
const REDIRECT_URI = "https://lucariomi-1998.github.io/spotify-game-player/callback.html";

// Scopes: adjust if you need more later
const SCOPES = [
  "user-read-playback-state",
  "user-modify-playback-state",
].join(" ");

// Implicit Grant (simple for GitHub Pages static hosting)
function buildAuthUrl() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "token",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    show_dialog: "true",
  });
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

// ---------- STATE ----------
const els = {
  startScreen: document.getElementById("startScreen"),
  playerScreen: document.getElementById("playerScreen"),
  loginBtn: document.getElementById("spotifyLoginBtn"),
  startBtn: document.getElementById("startGameBtn"),
  nextBtn: document.getElementById("nextCardBtn"),
  playBtn: document.getElementById("playBtn"),
  status: document.getElementById("status"),
  startHint: document.getElementById("startHint"),
  openInSpotify: document.getElementById("openInSpotify"),
  qrOverlay: document.getElementById("qrOverlay"),
  closeQrBtn: document.getElementById("closeQrBtn"),
  scanError: document.getElementById("scanError"),
};

function getToken() {
  return localStorage.getItem("spotify_access_token");
}

function setStatus(text) {
  els.status.textContent = text;
}

function showStartHint(text) {
  els.startHint.textContent = text || "";
}

function showStart() {
  els.startScreen.classList.remove("hidden");
  els.playerScreen.classList.add("hidden");
}

function showPlayer() {
  els.startScreen.classList.add("hidden");
  els.playerScreen.classList.remove("hidden");
}

function openOverlay() {
  els.scanError.textContent = "";
  els.qrOverlay.classList.add("active");
  els.qrOverlay.setAttribute("aria-hidden", "false");
  // start scanner (provided by qr.js)
  if (window.qr && typeof window.qr.start === "function") window.qr.start();
}

function closeOverlay() {
  els.qrOverlay.classList.remove("active");
  els.qrOverlay.setAttribute("aria-hidden", "true");
  if (window.qr && typeof window.qr.stop === "function") window.qr.stop();
}

// ---------- EVENTS ----------
els.loginBtn.addEventListener("click", () => {
  if (!CLIENT_ID || CLIENT_ID === "DEINE_CLIENT_ID_HIER") {
    alert("Bitte CLIENT_ID in app.js setzen (Spotify Developer Dashboard).");
    return;
  }
  window.location.href = buildAuthUrl();
});

els.startBtn.addEventListener("click", () => {
  if (!getToken()) {
    showStartHint("Bitte zuerst oben rechts mit Spotify verbinden.");
    return;
  }
  showStartHint("");
  openOverlay();
});

els.nextBtn.addEventListener("click", () => {
  openOverlay();
});

els.closeQrBtn.addEventListener("click", () => {
  closeOverlay();
});

// Play button: best-effort (UI should never block)
els.playBtn.addEventListener("click", async () => {
  const trackUri = sessionStorage.getItem("last_track_uri");
  if (!trackUri) {
    setStatus("Kein Track gewählt. Scanne zuerst eine Karte.");
    return;
  }
  await tryStartPlayback(trackUri);
});

// ---------- QR RESULT HANDLER ----------
// qr.js will call this with the decoded text
window.onQrDetected = async (decodedText) => {
  const trackUri = parseSpotifyTrackToUri(decodedText);
  if (!trackUri) {
    els.scanError.textContent = "Ungültiger Code. Bitte einen Spotify Track-Link scannen.";
    return; // keep overlay open
  }

  // Close scanner immediately and show player (your requested UX)
  closeOverlay();
  showPlayer();

  sessionStorage.setItem("last_track_uri", trackUri);
  els.openInSpotify.classList.remove("hidden");
  els.openInSpotify.href = uriToOpenUrl(trackUri);

  setStatus("Track erkannt. Versuche abzuspielen …");
  await tryStartPlayback(trackUri);
};

function parseSpotifyTrackToUri(text) {
  if (!text) return null;
  // Accept open.spotify.com/.../track/<id>...
  const m = String(text).match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/([A-Za-z0-9]{22})/i);
  if (m?.[1]) return `spotify:track:${m[1]}`;
  // Accept spotify:track:<id>
  const m2 = String(text).match(/spotify:track:([A-Za-z0-9]{22})/i);
  if (m2?.[1]) return `spotify:track:${m2[1]}`;
  return null;
}

function uriToOpenUrl(uri) {
  const id = uri.split(":").pop();
  return `https://open.spotify.com/track/${id}`;
}

// ---------- SPOTIFY PLAYBACK (best effort) ----------
async function tryStartPlayback(trackUri) {
  const token = getToken();
  if (!token) {
    setStatus("Nicht eingeloggt. Bitte mit Spotify verbinden.");
    return;
  }

  try {
    // 1) Find active device (if any)
    const devicesRes = await fetch("https://api.spotify.com/v1/me/player/devices", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!devicesRes.ok) {
      setStatus("Kann Spotify Geräte nicht abfragen (Token/Scopes?).");
      return;
    }

    const devicesJson = await devicesRes.json();
    const active = devicesJson.devices?.find(d => d.is_active) || devicesJson.devices?.[0];

    if (!active) {
      setStatus("Kein aktives Spotify-Gerät gefunden. Öffne Spotify auf deinem Handy/PC und starte irgendeinen Song, dann nochmal Play.");
      return;
    }

    // 2) Start playback on that device
    const playRes = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(active.id)}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uris: [trackUri] }),
    });

    if (playRes.status === 204 || playRes.ok) {
      setStatus("Spielt 🎵");
      return;
    }

    // Common cases: 403 (Premium required), 404 (device not found), 401 (token)
    const txt = await safeReadText(playRes);
    if (playRes.status === 403) {
      setStatus("Playback nicht erlaubt (oft Spotify Premium nötig). Nutze „In Spotify öffnen“.");
    } else if (playRes.status === 404) {
      setStatus("Kein aktives Gerät erreichbar. Öffne Spotify und starte kurz Musik, dann erneut.");
    } else if (playRes.status === 401) {
      setStatus("Token abgelaufen. Bitte neu verbinden.");
      localStorage.removeItem("spotify_access_token");
      showStart();
    } else {
      setStatus(`Konnte nicht abspielen (${playRes.status}). Nutze „In Spotify öffnen“.`);
      // console for debugging
      console.warn("Playback error:", playRes.status, txt);
    }
  } catch (e) {
    console.error(e);
    setStatus("Fehler beim Abspielen. Nutze „In Spotify öffnen“.");
  }
}

async function safeReadText(res) {
  try { return await res.text(); } catch { return ""; }
}

// ---------- INIT ----------
(function init() {
  if (getToken()) {
    showStartHint("Verbunden ✅ Du kannst jetzt starten.");
  } else {
    showStartHint("Bitte oben rechts verbinden.");
  }
  showStart();
})();
