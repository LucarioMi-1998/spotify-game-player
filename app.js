// ===== CONFIG =====
const SPOTIFY_CLIENT_ID = "fc0b3b30a9324288a9723c9475a1c2a8";
const REDIRECT_URI = "https://lucariomi-1998.github.io/spotify-game-player/callback.html";
const SCOPES = [
  "streaming",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing"
].join(" ");

// ===== HELPERS =====
const $ = (id) => document.getElementById(id);

function setStartStatus(t){ const el = $("startStatus"); if (el) el.textContent = t || ""; }
function setStatus(t){ const el = $("status"); if (el) el.textContent = t || ""; }

function showStart(){
  $("startScreen")?.classList.remove("isHidden");
  $("appShell")?.classList.add("isHidden");
}
function showApp(){
  $("startScreen")?.classList.add("isHidden");
  $("appShell")?.classList.remove("isHidden");
}

function token(){
  return localStorage.getItem("token");
}
function tokenExpired(){
  const exp = Number(localStorage.getItem("token_expires_at") || "0");
  return !exp || Date.now() > exp - 10_000;
}
function clearToken(){
  localStorage.removeItem("token");
  localStorage.removeItem("token_expires_at");
}

function updateAuthUI(){
  const t = token();
  $("btnLoginTop")?.classList.toggle("hidden", !!t);
  $("btnLogoutTop")?.classList.toggle("hidden", !t);
}

// ===== PKCE =====
function randomString(length){
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => possible[b % possible.length]).join("");
}
async function sha256(plain){
  const enc = new TextEncoder().encode(plain);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  return new Uint8Array(hash);
}
function base64url(bytes){
  let str = "";
  bytes.forEach((b) => { str += String.fromCharCode(b); });
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function pkceChallenge(verifier){
  return base64url(await sha256(verifier));
}

function appBaseUrl(){
  // derive base from the fixed redirect URI
  const u = new URL(REDIRECT_URI);
  return u.origin + u.pathname.replace(/callback\.html$/, "");
}

// ===== AUTH =====
async function login(){
  // Must be triggered by a user click.
  const verifier = randomString(64);
  sessionStorage.setItem("pkce_verifier", verifier);
  const challenge = await pkceChallenge(verifier);

  const u = new URL("https://accounts.spotify.com/authorize");
  u.searchParams.set("client_id", SPOTIFY_CLIENT_ID);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", REDIRECT_URI);
  u.searchParams.set("scope", SCOPES);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("code_challenge", challenge);
  // optional: keep them on the same device (recommended)
  // u.searchParams.set("show_dialog", "true");

  window.location.assign(u.toString());
}

function logout(){
  clearToken();
  updateAuthUI();
  setStartStatus("Ausgeloggt.");
  showStart();
}

// ===== SPOTIFY API =====
async function api(path, opts={}){
  const t = token();
  const res = await fetch("https://api.spotify.com" + path, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      Authorization: "Bearer " + t
    }
  });

  let json = null;
  try { json = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, json };
}

function parseTrackId(input){
  if (!input) return null;
  const s = input.trim();

  // spotify:track:ID
  let m = s.match(/^spotify:track:([A-Za-z0-9]{22})/);
  if (m) return m[1];

  // open.spotify.com/.../track/ID?...
  try{
    const u = new URL(s);
    const parts = u.pathname.split("/").filter(Boolean);
    const idx = parts.indexOf("track");
    if (idx >= 0 && parts[idx+1]) return parts[idx+1];
  }catch{}

  // fallback: scan raw ID
  m = s.match(/([A-Za-z0-9]{22})/);
  return m ? m[1] : null;
}

async function loadTrackMeta(trackId){
  const r = await api(`/v1/tracks/${encodeURIComponent(trackId)}`);
  if (!r.ok) return null;
  return r.json;
}

function setTrackUI(meta, trackId){
  const name = meta?.name || "Unbekannter Track";
  const artists = meta?.artists?.map(a=>a.name).join(", ") || "";
  const cover = meta?.album?.images?.[0]?.url || "";

  if ($("trackName")) $("trackName").textContent = name;
  if ($("artistName")) $("artistName").textContent = artists;
  if ($("cover")) $("cover").src = cover;
  const link = `https://open.spotify.com/track/${trackId}`;
  if ($("spotifyLink")) {
    $("spotifyLink").href = link;
    $("spotifyLink").textContent = "In Spotify öffnen";
  }
}

// “Best effort” playback: UI must not block
async function tryPlay(trackId){
  setStatus("Starte Wiedergabe…");
  const r = await api("/v1/me/player/play", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uris: ["spotify:track:" + trackId] })
  });

  if (r.ok || r.status === 204){
    setStatus("Läuft.");
    return true;
  }

  // common cases: 404 no active device, 403 premium required
  const msg = r.json?.error?.message || `Spotify Fehler (${r.status}). Öffne Spotify und starte ein Gerät.`;
  setStatus(msg);
  return false;
}

async function pause(){
  await api("/v1/me/player/pause", { method: "PUT" }).catch(()=>{});
}
async function resume(){
  await api("/v1/me/player/play", { method: "PUT" }).catch(()=>{});
}

// ===== QR FLOW =====
let lastTrackId = null;

async function openScanner(){
  setStatus("");
  setStartStatus("");
  $("camBox")?.classList.remove("hidden");

  await startQRScanner(async (data) => {
    const trackId = parseTrackId(data);
    if (!trackId){
      // keep overlay open and restart scanning
      setStatus("Kein gültiger Spotify-Track im QR. Bitte erneut scannen.");
      setTimeout(() => startQRScanner(arguments.callee), 250);
      return;
    }

    // close scanner and show player
    stopQRScanner();
    $("camBox")?.classList.add("hidden");
    showApp();

    lastTrackId = trackId;
    setStatus("Lade Track…");

    const meta = await loadTrackMeta(trackId);
    setTrackUI(meta, trackId);

    // try to play, but don't block UI if it fails
    await tryPlay(trackId);
  });
}

function closeScanner(){
  stopQRScanner();
  $("camBox")?.classList.add("hidden");
}

// ===== CALLBACK (runs on callback.html) =====
async function handleCallback(){
  const p = new URLSearchParams(location.search);
  const code = p.get("code");
  const err = p.get("error");
  if (err) throw new Error("Spotify Login abgebrochen: " + err);
  if (!code) throw new Error("Kein Code im Callback.");

  const verifier = sessionStorage.getItem("pkce_verifier");
  if (!verifier) throw new Error("PKCE verifier fehlt (SessionStorage).");

  const body = new URLSearchParams();
  body.set("client_id", SPOTIFY_CLIENT_ID);
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", REDIRECT_URI);
  body.set("code_verifier", verifier);

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  const json = await res.json().catch(()=> ({}));
  if (!res.ok) {
    const msg = json?.error_description || json?.error || `Token Fehler (${res.status})`;
    throw new Error(msg);
  }

  localStorage.setItem("token", json.access_token);
  const expiresAt = Date.now() + (Number(json.expires_in || 3600) * 1000);
  localStorage.setItem("token_expires_at", String(expiresAt));
  sessionStorage.removeItem("pkce_verifier");

  // back to app root
  window.location.replace(appBaseUrl());
}

// expose for callback.html
window.handleCallback = handleCallback;

// ===== INIT =====
function init(){
  // bind UI
  $("btnLoginTop")?.addEventListener("click", () => login().catch(e => setStartStatus(e.message)));
  $("btnLogoutTop")?.addEventListener("click", logout);

  $("btnStart")?.addEventListener("click", async () => {
    if (!token() || tokenExpired()){
      clearToken();
      updateAuthUI();
      setStartStatus("Bitte zuerst mit Spotify verbinden.");
      return;
    }
    setStartStatus("");
    await openScanner().catch(e => setStatus(e.message));
  });

  $("btnNextCard")?.addEventListener("click", async () => {
    if (!token() || tokenExpired()){
      clearToken();
      updateAuthUI();
      showStart();
      setStartStatus("Bitte zuerst mit Spotify verbinden.");
      return;
    }
    await openScanner().catch(e => setStatus(e.message));
  });

  $("btnCloseScanner")?.addEventListener("click", closeScanner);

  $("btnPlay")?.addEventListener("click", () => {
    if (lastTrackId) tryPlay(lastTrackId);
    else resume();
  });
  $("btnPause")?.addEventListener("click", pause);

  // initial auth state
  if (token() && tokenExpired()){
    clearToken();
  }
  updateAuthUI();
  showStart();
}

document.addEventListener("DOMContentLoaded", init);
