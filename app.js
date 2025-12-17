// ===== HIPSTER (Mobile, Deep Link Playback) =====
// Robust on iOS: we OPEN Spotify to play the scanned track.
// No Spotify Web Playback SDK. No /me/player/play calls.

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
const spotifyEmbed = document.getElementById("spotifyEmbed");

const setStatus = (t) => statusEl && (statusEl.textContent = t);

// ===== Helpers =====
function isMobileIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandaloneMode(){
  // iOS PWA / Add-to-Home-Screen and other standalone display modes
  return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || (navigator.standalone === true);
}

function extractTrackId(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (s.startsWith("spotify:track:")) return s.split(":").pop();
  const m = s.match(/track\/([A-Za-z0-9]+)/);
  if (m) return m[1];
  return s; // assume raw id
}

async function fetchTrackInfo(trackId){
  // Public oEmbed endpoint (no auth). Returns title + thumbnail + author.
  const url = `https://open.spotify.com/track/${trackId}`;
  const oembed = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
  const res = await fetch(oembed, { method: "GET" });
  if(!res.ok) throw new Error("Konnte Track-Infos nicht laden.");
  const data = await res.json();

  // data.title often looks like: "Track Name - Artist"
  let title = data.title || "";
  let track = title;
  let artist = data.author_name || "";
  const parts = title.split(" - ");
  if(parts.length >= 2){
    track = parts.slice(0, -1).join(" - ").trim();
    artist = parts.slice(-1)[0].trim();
  }
  return {
    track,
    artist,
    cover: data.thumbnail_url || "",
    url: data.provider_url ? url : url
  };
}

function openSpotifyTrack(trackId) {
  // Robust mobile opening:
  // - iOS PWA (homescreen) often blocks spotify: links (tap does nothing).
  //   Best: open the HTTPS universal link in Safari (new tab).
  // - Normal browsers: try spotify: first, then fall back to HTTPS.
  const deep = `spotify:track:${trackId}`;
  const web = `https://open.spotify.com/track/${trackId}`;

  const isAndroid = /Android/i.test(navigator.userAgent);
  const intent = `intent://open.spotify.com/track/${trackId}#Intent;scheme=https;package=com.spotify.music;end`;

  const standalone = isStandaloneMode();
  const ios = isMobileIOS();

  // iOS homescreen / standalone: open Safari with HTTPS (universal link)
  // This avoids the "tap does nothing" issue.
  if (ios && standalone) {
    try {
      window.open(web, "_blank", "noopener,noreferrer");
      return;
    } catch {}
    try { window.location.href = web; } catch {}
    return;
  }

  // Android: try intent first (opens Spotify if installed), then web
  if (isAndroid) {
    try { window.location.href = intent; } catch {}
    setTimeout(() => {
      try { window.location.href = web; } catch {}
    }, 500);
    return;
  }

  // Default: try deep link via <a> click (more reliable in some browsers/webviews)
  try {
    const a = document.createElement("a");
    a.href = deep;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {}

  // Fallback: open in web player
  setTimeout(() => {
    try { window.location.href = web; } catch {}
  }, 450);
}

// ===== Minimal "Login/Logout" behavior =====
// For deep-link playback, login is NOT required. We keep the buttons for UI consistency.
btnLogin?.addEventListener("click", () => {
  setStatus("Login ist nicht nötig – QR scannen & Play tippen.");
});
btnLogout?.addEventListener("click", () => {
  setStatus("Logout ist nicht nötig – QR scannen & Play tippen.");
});
btnRules?.addEventListener("click", () => alert("Regeln/Einstellungen können wir als Overlay bauen 🙂"));

// ===== UI flow =====
let pendingTrackId = null;
let isPlayingVisual = false; // visual only (we can't read Spotify state from web reliably)

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

function updateToggle() {
  if (!btnToggle || !disc) return;
  if (isPlayingVisual) {
    btnToggle.textContent = "❚❚";
    disc.classList.remove("paused");
  } else {
    btnToggle.textContent = "▶";
    disc.classList.add("paused");
  }
}

async function beginScan() {
  pendingTrackId = null;
  isPlayingVisual = false;
  updateToggle();
  showScanner();

  try {
    await window.startQRScanner(async (data) => {
      const id = extractTrackId(data);
      pendingTrackId = id;

      hideScanner();
      showPlayer();


      // Always show playable embed without API/login (works even when CORS blocks metadata)
      if (spotifyEmbed) {
        spotifyEmbed.src = `https://open.spotify.com/embed/track/${id}?utm_source=hipster`;
      }
      // Load and show song info (no login needed)
      try{
        setStatus("Bereit – tippe Play");
        const info = await fetchTrackInfo(id);
        if (cover) cover.src = info.cover || "";
        if (trackName) trackName.textContent = info.track || "—";
        if (artistName) artistName.textContent = info.artist || "—";
        if (spotifyLink) spotifyLink.href = `https://open.spotify.com/track/${id}`;
        setStatus("Bereit – tippe Play");
      }catch(e){
        // Still allow play even if metadata fails
        if (spotifyLink) spotifyLink.href = `https://open.spotify.com/track/${id}`;
        setStatus("Bereit – tippe Play (Song-Infos konnten nicht geladen werden)");
      }
    });
  } catch (e) {
    btnEnableCam.classList.remove("hidden");
    scannerText.textContent = "Tippe auf „Kamera aktivieren“.";
  }
}

btnPlayGame?.addEventListener("click", beginScan);
btnEnableCam?.addEventListener("click", beginScan);
btnCloseScanner?.addEventListener("click", () => hideScanner());

// Next card: we can't force-pause Spotify from the browser reliably on iOS without API/active-device issues.
// So we visually pause and immediately scan the next one.
btnNext?.addEventListener("click", async () => {
  isPlayingVisual = false;
  updateToggle();
  setStatus("Nächste Karte – (falls nötig, pausiere kurz in Spotify) und scanne weiter.");
  beginScan();
});

// Big circle toggle: starts Spotify playback via deep link
btnToggle?.addEventListener("click", () => {
  if (!pendingTrackId) {
    setStatus("Bitte zuerst eine Karte scannen.");
    return;
  }
  // We can't truly pause/resume Spotify from here without API. So we always (re)open the track on tap.
  openSpotifyTrack(pendingTrackId);
  isPlayingVisual = true;
  updateToggle();
  setStatus(isMobileIOS() ? "Spotify geöffnet – Song startet dort." : "Spotify geöffnet.");
});

// ===== Start =====
showHome();
updateToggle();
setStatus((isMobileIOS() && isStandaloneMode()) ? "Home-Bildschirm-App erkannt (iOS PWA). Play öffnet den Song in Safari/Spotify." : "Tippe „JETZT SPIELEN“ um zu starten.");