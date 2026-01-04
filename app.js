// ===== CONFIG =====
const SPOTIFY_CLIENT_ID = "fc0b3b30a9324288a9723c9475a1c2a8";
// Needed for Web Playback SDK + Web API control
const SCOPES = [
  "streaming",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing"
].join(" ");

let player = null;
let deviceId = null;
let lastTrackId = null;

// ===== UI HELPERS =====
const $ = (id) => document.getElementById(id);

function status(text){
  const el = $("status");
  if (!el) return;
  el.textContent = text || "";
}

function basePath(){
  // e.g. /hitster/ or / (when served at root)
  return location.pathname.endsWith("/")
    ? location.pathname
    : location.pathname.replace(/[^/]+$/, "");
}

function redirectUri(){
  return "https://lucariomi-1998.github.io/spotify-game-player/callback.html";
}
function showApp(){
  const startScreen = $("startScreen");
  const appShell = $("appShell");
  startScreen?.classList.add("isLeaving");
  setTimeout(() => startScreen?.classList.add("isHidden"), 220);
  appShell?.classList.remove("isHidden");
}

function showStart(){
  $("startScreen")?.classList.remove("isHidden");
  $("appShell")?.classList.add("isHidden");
}

function setCamToast(text){
  const camBox = $("camBox");
  if(!camBox) return;
  let t = camBox.querySelector(".camToast");
  if(!t){
    t = document.createElement("div");
    t.className = "camToast";
    camBox.appendChild(t);
  }
  t.textContent = text || "";
  t.classList.toggle("show", !!text);
}

function hideScanner(){
  $("camBox")?.classList.add("hidden");
  setCamToast("");
}
function showScanner(){
  $("camBox")?.classList.remove("hidden");
}

// ===== TRACK PARSING =====
function extractTrackId(input){
  if(!input) return null;
  const s = String(input).trim();

  // spotify:track:ID
  if (s.startsWith("spotify:track:")) return s.split(":").pop();

  // open.spotify.com/track/ID   or  /intl-de/track/ID
  const m = s.match(/\/track\/([A-Za-z0-9]+)/);
  if (m) return m[1];

  // raw id
  if (/^[A-Za-z0-9]{22}$/.test(s)) return s;

  return null;
}

// ===== PKCE HELPERS =====
function randomString(length = 64){
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, v => possible[v % possible.length]).join("");
}

async function sha256(plain){
  const enc = new TextEncoder().encode(plain);
  const hashBuffer = await crypto.subtle.digest("SHA-256", enc);
  return new Uint8Array(hashBuffer);
}

function base64url(bytes){
  let str = "";
  bytes.forEach(b => str += String.fromCharCode(b));
  return btoa(str).replace(/=+$/,"").replace(/\+/g,"-").replace(/\//g,"_");
}

async function pkceChallenge(verifier){
  const hashed = await sha256(verifier);
  return base64url(hashed);
}

// ===== AUTH =====
function login(reason = ""){
  // IMPORTANT: login MUST be triggered by a user gesture (button click),
  // otherwise Safari may block navigation/popups.
  if (reason) sessionStorage.setItem("postLogin", reason);
  else sessionStorage.removeItem("postLogin");

  const verifier = randomString(64);
  sessionStorage.setItem("pkce_verifier", verifier);

  pkceChallenge(verifier).then((challenge) => {
    const u = new URL("https://accounts.spotify.com/authorize");
    u.searchParams.set("client_id", SPOTIFY_CLIENT_ID);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("redirect_uri", redirectUri());
    u.searchParams.set("scope", SCOPES);
    u.searchParams.set("code_challenge_method", "S256");
    u.searchParams.set("code_challenge", challenge);
    // Use redirect navigation (most reliable on iOS Safari)
    location.href = u.toString();
  });
}

function logout(){
  localStorage.removeItem("token");
  localStorage.removeItem("token_expires_at");
  deviceId = null;
  player = null;
  status("Ausgeloggt");
  updateAuthUI();
  showStart();
}

async function handleCallback(){
  const p = new URLSearchParams(location.search);
  const code = p.get("code");
  const err = p.get("error");
  if (err) throw new Error("Spotify Login abgebrochen: " + err);
  if (!code) throw new Error("Kein Code im Callback.");

  const verifier = sessionStorage.getItem("pkce_verifier");
  if (!verifier) throw new Error("PKCE verifier fehlt (Session Storage).");

  const body = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier
  });

  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  const j = await r.json();
  if (!r.ok) {
    throw new Error(j.error_description || j.error || "Token-Abruf fehlgeschlagen");
  }

  localStorage.setItem("token", j.access_token);
  if (j.expires_in) {
    localStorage.setItem("token_expires_at", String(Date.now() + j.expires_in * 1000));
  }

  // back to index
  location.href = basePath() + "index.html";
}

// expose for callback.html
window.handleCallback = handleCallback;

// ===== SPOTIFY SDK =====
function loadSDK(){
  return new Promise((resolve, reject) => {
    if (window.Spotify?.Player) return resolve();
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const s = document.createElement("script");
    s.src = "https://sdk.scdn.co/spotify-player.js";
    s.async = true;
    s.onerror = () => reject(new Error("Spotify SDK konnte nicht geladen werden."));
    document.head.appendChild(s);
  });
}

async function ensurePlayer(){
  const token = localStorage.getItem("token");
  updateAuthUI();
  if (!token) return;

  await loadSDK();

  if (player) return;

  player = new Spotify.Player({
    name: "Hitster QR Web Player",
    getOAuthToken: cb => cb(localStorage.getItem("token")),
    volume: 0.8
  });

  player.addListener("ready", ({ device_id }) => {
    deviceId = device_id;
    status("Ready");
  });

  player.addListener("not_ready", () => {
    status("Player nicht bereit");
  });

  player.addListener("initialization_error", ({ message }) => status("Init Fehler: " + message));
  player.addListener("authentication_error", ({ message }) => status("Auth Fehler: " + message));
  player.addListener("account_error", ({ message }) => status("Account: " + message));
  player.addListener("playback_error", ({ message }) => status("Playback: " + message));

  // Update progress UI (optional)
  player.addListener("player_state_changed", (state) => {
    if (!state) return;
    const pos = $("pos"), dur = $("dur"), seek = $("seek");
    if (pos) pos.textContent = ms(state.position);
    if (dur) dur.textContent = ms(state.duration);
    if (seek) seek.value = state.duration ? String(Math.floor((state.position / state.duration) * 1000)) : "0";

    const current = state.track_window?.current_track;
    if (current) renderTrackFromState(current);
  });

  await player.connect();
}

function ms(v){
  const s = Math.floor((v||0)/1000);
  const m = Math.floor(s/60);
  const r = s%60;
  return `${m}:${String(r).padStart(2,"0")}`;
}

function renderTrackFromState(t){
  if ($("cover")) $("cover").src = t.album.images?.[1]?.url || t.album.images?.[0]?.url || "";
  if ($("trackName")) $("trackName").textContent = t.name || "—";
  if ($("artistName")) $("artistName").textContent = (t.artists||[]).map(a=>a.name).join(", ") || "—";
  if ($("spotifyLink")) $("spotifyLink").href = "https://open.spotify.com/track/" + (t.id || "");
}

async function api(path, opts={}){
  const token = localStorage.getItem("token");
  updateAuthUI();
  if (!token) throw new Error("Nicht eingeloggt");
  const r = await fetch("https://api.spotify.com" + path, {
    ...opts,
    headers: {
      "Authorization": "Bearer " + token,
      ...(opts.headers || {})
    }
  });
  // 204 has no body
  const text = await r.text();
  let json = null;
  try{ json = text ? JSON.parse(text) : null; }catch{}
  return { ok: r.ok, status: r.status, json };
}

async function ensureActiveDevice(){
  // Transfer playback to our web playback device (best-effort)
  if (!deviceId) return;
  const { ok, json } = await api("/v1/me/player", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_ids: [deviceId], play: false })
  });
  if (!ok) {
    // do not throw hard; we still show UI
    console.warn("transfer failed", json);
  }
}

async function playTrackById(trackId){
  if (!trackId) throw new Error("Kein Track");
  lastTrackId = trackId;

  // Update UI link immediately
  if ($("spotifyLink")) $("spotifyLink").href = "https://open.spotify.com/track/" + trackId;

  // Fetch meta for UI (non-blocking)
  api("/v1/tracks/" + trackId).then(({ok, json}) => {
    if (!ok || !json) return;
    if ($("cover")) $("cover").src = json.album?.images?.[1]?.url || json.album?.images?.[0]?.url || "";
    if ($("trackName")) $("trackName").textContent = json.name || "—";
    if ($("artistName")) $("artistName").textContent = (json.artists||[]).map(a=>a.name).join(", ") || "—";
  }).catch(()=>{});

  await ensurePlayer();
  await ensureActiveDevice();

  // Try to start playback on our device
  if (!deviceId) {
    // Player not ready yet — still show UI
    status("Player lädt…");
    return;
  }

  const { ok, status: st, json } = await api(`/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uris: ["spotify:track:" + trackId] })
  });

  if (!ok) {
    // Common cases:
    // - 403: Premium required
    // - 404: No active device
    const msg = json?.error?.message || `Spotify Fehler (${st})`;
    status(msg);
    return;
  }

  status("Spielt");
}

// ===== SCANNER FLOW =====
async function openScanner(){
  status("QR scannen…");
  setCamToast("QR-Code scannen…");
  
    // Close button on scanner overlay
  $("btnCloseScanner")?.addEventListener("click", closeScanner);

  // Next card: ONLY here the scanner opens again
  $("btnNextCard")?.addEventListener("click", () => {
    openScanner();
  });

  // Player controls
  $("btnPlay")?.addEventListener("click", async () => {
    try{
      await ensurePlayer();
      await player?.resume();
      status("Spielt");
    }catch(e){ status(e?.message || "Play Fehler"); }
  });

  $("btnPause")?.addEventListener("click", async () => {
    try{
      await ensurePlayer();
      await player?.pause();
      status("Pausiert");
    }catch(e){ status(e?.message || "Pause Fehler"); }
  });

  $("vol")?.addEventListener("input", async (ev) => {
    const v = Number(ev.target.value || 0.8);
    try{ await ensurePlayer(); await player?.setVolume(v); }catch{}
  });

  $("seek")?.addEventListener("change", async (ev) => {
    const val = Number(ev.target.value || 0);
    try{
      const state = await player?.getCurrentState();
      if (!state) return;
      const pos = Math.floor((val/1000) * state.duration);
      await player.seek(pos);
    }catch{}
  });

  // Initial UI state
  if (!token){
    status("Nicht eingeloggt");
    updateAuthUI();
    return;
  }

  await ensurePlayer();
  status("Ready");
  updateAuthUI();
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch(e => status(e?.message || "Init Fehler"));
});
function updateAuthUI(){
  const token = localStorage.getItem("token");
  updateAuthUI();
  const loginBtn = $("btnLoginTop");
  const logoutBtn = $("btnLogoutTop");
  if (loginBtn) loginBtn.classList.toggle("hidden", !!token);
  if (logoutBtn) logoutBtn.classList.toggle("hidden", !token);
}

