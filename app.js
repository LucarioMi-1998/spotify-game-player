// ===== CONFIG =====
const SPOTIFY_CLIENT_ID = "fc0b3b30a9324288a9723c9475a1c2a8";
const SCOPES = "streaming user-read-playback-state user-modify-playback-state";

// ===== HELPERS =====
const status = (t) => {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = t;

  // purely visual state (no functional impact)
  const s = String(t || "").toLowerCase();
  let state = "";
  if (s.includes("spielt")) state = "playing";
  else if (s.includes("ready")) state = "ready";
  else if (s.includes("scan")) state = "scanning";
  else if (s.includes("fehler") || s.includes("error") || s.includes("nicht")) state = "";
  if (state) el.dataset.state = state;
  else el.removeAttribute("data-state");
};

function basePath(){
  return location.pathname.endsWith("/") ? location.pathname : location.pathname.replace(/[^/]+$/,"");
}
function redirectUri(){
  return location.origin + basePath() + "callback.html";
}

function extractTrackId(input){
  if(!input) return null;
  const s = String(input).trim();
  if(s.startsWith("spotify:track:")) return s.split(":").pop();
  const m = s.match(/track\/([A-Za-z0-9]+)/);
  if(m) return m[1];
  // If it's a Spotify short link (common on printed QR codes),
  // we can't extract the ID directly.
  if (/^https?:\/\/(spotify\.link|spotify\.app\.link)\//i.test(s)) return null;
  // assume it is already an ID
  return s;
}

// Try to resolve Spotify short links to a final open.spotify.com URL.
// Note: This may fail due to CORS in some environments.
async function resolveSpotifyShortLink(url){
  const u = String(url||"").trim();
  if(!/^https?:\/\/(spotify\.link|spotify\.app\.link)\//i.test(u)) return u;
  try{
    const r = await fetch(u, { redirect: "follow" });
    // Many browsers expose the final URL here if CORS allows it.
    if (r?.url) return r.url;
    return u;
  }catch{
    return u;
  }
}

function setCamToast(text){
  const camBox = document.getElementById("camBox");
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


function showApp(){
  startScreen?.classList.add("isLeaving");
  setTimeout(() => startScreen?.classList.add("isHidden"), 220);
  appShell?.classList.remove("isHidden");
}

async function openScannerAndPlay(){
  try {
    status("QR scannen…");
    setCamToast("QR-Code scannen…");
    btnScan && (btnScan.disabled = true);
    btnStop && (btnStop.disabled = false);
    const onScan = (data)=>{
      (async ()=>{
        try{
          setCamToast("QR erkannt – starte…");
          status("QR erkannt – starte…");

          // Resolve short links if present
          const maybeResolved = await resolveSpotifyShortLink(data);
          const id = extractTrackId(maybeResolved);
          if(!id){
            // Give a visible error inside the overlay (user won't see the status below)
            setCamToast("Ungültiger QR-Code. Bitte eine Spotify TRACK-URL oder Track-ID.");
            status("Kein gültiger Track im QR-Code.");
            // Continue scanning without restarting the camera
            setTimeout(()=>window.resumeQRScanner?.(onScan), 700);
            return;
          }

          // QR ist gültig → Scanner schließen und Player zeigen
          stopQRScanner();
          setCamToast("");
          document.getElementById("playerCard")?.scrollIntoView({ behavior:"smooth", block:"start" });

          status("Lade Track…");
          await play(id);

          // iOS/Safari may require a tap to start audio; we try resume but also show hint if needed.
          try{ await player?.resume(); }catch{}
          status("Spielt");
        }catch(e){
          const msg = e?.message || "Unbekannter Fehler";
          status(msg);

          // Wenn der Scanner noch offen ist (z.B. ungültiger QR), zeig Toast + scanne weiter.
          const camHidden = document.getElementById("camBox")?.classList.contains("hidden");
          if(!camHidden){
            setCamToast(msg);
            setTimeout(()=>window.resumeQRScanner?.(onScan), 900);
          }
        }finally{
          btnScan && (btnScan.disabled = false);
          btnStop && (btnStop.disabled = true);
        }
      })();
    };

    await startQRScanner(onScan);
  } catch(e) {
    status(e.message);
    setCamToast(e.message);
    btnScan && (btnScan.disabled = false);
    btnStop && (btnStop.disabled = true);
  }
}

// ===== PKCE =====
function rand(l=64){const c="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";return Array.from(crypto.getRandomValues(new Uint8Array(l))).map(x=>c[x%c.length]).join("");}
async function sha256(v){const b=new TextEncoder().encode(v);const h=await crypto.subtle.digest("SHA-256",b);return btoa(String.fromCharCode(...new Uint8Array(h))).replace(/=+/g,"").replace(/\+/g,"-").replace(/\//g,"_");}

// ===== AUTH =====
function login(reason=""){
  if (reason) sessionStorage.setItem("postLogin", reason);
  else sessionStorage.removeItem("postLogin");
  const v=rand();sessionStorage.setItem("v",v);
  sha256(v).then(ch=>{
    const u=new URL("https://accounts.spotify.com/authorize");
    u.searchParams.set("client_id",SPOTIFY_CLIENT_ID);
    u.searchParams.set("response_type","code");
    u.searchParams.set("redirect_uri",redirectUri());
    u.searchParams.set("scope",SCOPES);
    u.searchParams.set("code_challenge_method","S256");
    u.searchParams.set("code_challenge",ch);
    location.href=u;
  });
}

async function handleCallback(){
  const p=new URLSearchParams(location.search);
  const code=p.get("code");
  const v=sessionStorage.getItem("v");
  const body=new URLSearchParams({
    client_id:SPOTIFY_CLIENT_ID,
    grant_type:"authorization_code",
    code,
    redirect_uri:redirectUri(),
    code_verifier:v
  });
  const r=await fetch("https://accounts.spotify.com/api/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});
  const j=await r.json();
  if(!r.ok) throw new Error(j?.error_description || "Token Fehler");
  localStorage.setItem("token",j.access_token);
  location.href = location.origin + basePath();
}
window.handleCallback=handleCallback;

// ===== PLAYER =====
let player,deviceId;
let _playerReadyResolve;
const playerReady = new Promise(r=>{_playerReadyResolve=r;});

function loadSDK(){
  return new Promise((r,rej)=>{
    if(window.Spotify) return r();
    window.onSpotifyWebPlaybackSDKReady=r;
    const s=document.createElement("script");
    s.src="https://sdk.scdn.co/spotify-player.js";
    s.onerror=()=>rej(new Error("Spotify SDK konnte nicht geladen werden."));
    document.head.appendChild(s);
  });
}

async function init(){
  const token=localStorage.getItem("token");
  if(!token) return status("Nicht eingeloggt");
  await loadSDK();
  player=new Spotify.Player({
    name:"QR Web Player",
    getOAuthToken:cb=>cb(token),
    volume:0.8
  });
  player.addListener("ready",e=>{
    deviceId=e.device_id;
    status("Ready");
    try{ _playerReadyResolve?.(); }catch{}
  });
  player.addListener("player_state_changed",s=>{
    if(!s) return;
    const t=s.track_window.current_track;
    const cover=document.getElementById("cover");
    const tn=document.getElementById("trackName");
    const an=document.getElementById("artistName");
    const link=document.getElementById("spotifyLink");
    if(cover) cover.src=t.album.images[1]?.url||t.album.images[0]?.url||"";
    if(tn) tn.textContent=t.name||"—";
    if(an) an.textContent=t.artists.map(a=>a.name).join(", ")||"—";
    if(link) link.href="https://open.spotify.com/track/"+t.id;
  });
  await player.connect();
}

async function play(trackInput){
  const id = extractTrackId(trackInput);
  if(!id) throw new Error("Kein gültiger Track im QR-Code.");
  const token=localStorage.getItem("token");
  if(!token) throw new Error("Nicht eingeloggt");
  if(!deviceId) await playerReady;

  // Spotify Web API often returns helpful JSON errors but fetch() won't throw.
  // We must check r.ok, otherwise the scanner closes and "nothing happens".
  const api = async (url, opts) => {
    const r = await fetch(url, opts);
    if (r.ok) return;
    let msg = `Spotify Fehler (${r.status})`;
    try{
      const j = await r.json();
      msg = j?.error?.message || j?.error_description || msg;
    }catch{}

    // Give a clearer hint for the most common causes.
    if (r.status === 403) msg += " – brauchst du evtl. Spotify Premium (Web Playback) oder fehlende Rechte.";
    if (r.status === 404) msg += " – kein aktives Gerät gefunden. Warte kurz, oder tippe Play einmal.";
    throw new Error(msg);
  };

  // Transfer playback to this Web Playback SDK device.
  await api("https://api.spotify.com/v1/me/player", {
    method:"PUT",
    headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},
    body:JSON.stringify({device_ids:[deviceId], play:false})
  });

  // Start playing the scanned track.
  await api(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
    method:"PUT",
    headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},
    body:JSON.stringify({uris:[`spotify:track:${id}`]})
  });
}

// ===== UI =====
document.getElementById("btnLogin")?.addEventListener("click", login);
document.getElementById("btnLogout")?.addEventListener("click", ()=>{ localStorage.clear(); location.reload(); });
document.getElementById("btnPlay")?.addEventListener("click", ()=>player?.resume());
document.getElementById("btnPause")?.addEventListener("click", ()=>player?.pause());
document.getElementById("btnNextCard")?.addEventListener("click", openScannerAndPlay);


// Scanner buttons
const btnScan = document.getElementById("btnScan");
const btnStop = document.getElementById("btnStopScan");

btnScan?.addEventListener("click", openScannerAndPlay);

btnStop?.addEventListener("click", ()=>{
  stopQRScanner();
  status("Scan gestoppt");
  if(btnScan) btnScan.disabled = false;
  if(btnStop) btnStop.disabled = true;
});

// Inject close button + hint into the scanner overlay (no HTML changes needed)
(function setupScannerOverlayUI(){
  const camBox = document.getElementById("camBox");
  if(!camBox) return;

  // Close (X)
  if(!document.getElementById("btnCloseScan")){
    const close = document.createElement("button");
    close.id = "btnCloseScan";
    close.className = "camClose";
    close.type = "button";
    close.setAttribute("aria-label","Schließen");
    close.textContent = "×";
    close.addEventListener("click", ()=>{
      stopQRScanner();
      status("Scan gestoppt");
      if(btnScan) btnScan.disabled = false;
      if(btnStop) btnStop.disabled = true;
    });
    camBox.prepend(close);
  }

  // Hint line
  if(!camBox.querySelector(".scanHintOverlay")){
    const hint = document.createElement("div");
    hint.className = "scanHintOverlay";
    hint.textContent = "Halte den QR‑Code in den Rahmen";
    camBox.appendChild(hint);
  }
})();
init().then(()=>{
  const token = localStorage.getItem("token");
  const post = sessionStorage.getItem("postLogin");
  if(token && post === "startGame"){
    // If we came from "Spiel starten", open app and start scanner automatically.
    showApp();
    sessionStorage.removeItem("postLogin");
    setTimeout(()=>openScannerAndPlay(), 350);
  }
}).catch(e=>status(e.message));


/* ===== Startscreen Steuerung (nur UI) ===== */
const startScreen = document.getElementById("startScreen");
const appShell = document.getElementById("appShell");

document.getElementById("btnStart")?.addEventListener("click", () => {
  // Flow: Start -> Spotify Login -> Auto QR Scan -> Player
  const token = localStorage.getItem("token");
  if(!token){
    login("startGame");
    return;
  }
  showApp();
  // auto-scan when already logged in
  sessionStorage.setItem("postLogin","startGame");
  setTimeout(()=>openScannerAndPlay(), 200);
});

document.getElementById("btnToSettings")?.addEventListener("click", () => {
  showApp();
  window.scrollTo({ top: 0, behavior: "smooth" });
});
