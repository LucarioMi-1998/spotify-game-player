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
  // assume it is already an ID
  return s;
}

// ===== PKCE =====
function rand(l=64){const c="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";return Array.from(crypto.getRandomValues(new Uint8Array(l))).map(x=>c[x%c.length]).join("");}
async function sha256(v){const b=new TextEncoder().encode(v);const h=await crypto.subtle.digest("SHA-256",b);return btoa(String.fromCharCode(...new Uint8Array(h))).replace(/=+/g,"").replace(/\+/g,"-").replace(/\//g,"_");}

// ===== AUTH =====
function login(){
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
  });
  player.addListener("player_state_changed",s=>{
    if(!s) return;
    // UI: großer Play wenn pausiert, Pfeil wenn spielt
    try{ setPlayUI(!s.paused); }catch{}
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
  if(!deviceId) throw new Error("Player noch nicht bereit");
  await fetch("https://api.spotify.com/v1/me/player",{method:"PUT",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({device_ids:[deviceId],play:false})});
  await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,{method:"PUT",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({uris:[`spotify:track:${id}`]})});
}

// ===== UI =====

// Play/Next UI (großer Play, kleiner Pfeil)
const btnBigPlay = document.getElementById("btnBigPlay");
const btnNext = document.getElementById("btnNext");

function setPlayUI(isPlaying){
  if(btnBigPlay) btnBigPlay.style.display = isPlaying ? "none" : "grid";
  if(btnNext) btnNext.style.display = isPlaying ? "grid" : "none";
}

// default: show big play, hide next
setPlayUI(false);

// Big play resumes playback (if a track is already loaded)
btnBigPlay?.addEventListener("click", async ()=>{
  try{
    await player?.resume();
  }catch(e){}
});

// Next arrow starts a new QR scan (for the next card)
btnNext?.addEventListener("click", ()=>{
  // reuse existing scan button flow
  document.getElementById("btnScan")?.click();
});

document.getElementById("btnLogin")?.addEventListener("click", login);
document.getElementById("btnLogout")?.addEventListener("click", ()=>{ localStorage.clear(); location.reload(); });
const btnScan = document.getElementById("btnScan");
const btnStop = document.getElementById("btnStopScan");

btnScan?.addEventListener("click", async ()=>{
  try {
    status("QR scannen…");
    try{ if(btnNext) btnNext.style.display="none"; }catch{}

    btnScan.disabled = true;
    btnStop.disabled = false;
    await startQRScanner((data)=>{
      status("QR erkannt – starte…");
      play(data).then(()=>{
        // iOS safety: explicit resume
        setTimeout(()=>player?.resume(), 300);
        window.scrollTo({ top: 0, behavior: "smooth" });
        status("Spielt");
        try{ setPlayUI(true); }catch{}

      }).catch(e=>status(e.message));
      btnScan.disabled = false;
      btnStop.disabled = true;
    });
  } catch(e) {
    status(e.message);
    btnScan.disabled = false;
    btnStop.disabled = true;
  }
});

btnStop?.addEventListener("click", ()=>{
  stopQRScanner();
  status("Scan gestoppt");
  try{ setPlayUI(false); }catch{}

  btnScan.disabled = false;
  btnStop.disabled = true;
});

init();


/* ===== Startscreen Steuerung (nur UI) ===== */
const startScreen = document.getElementById("startScreen");
const appShell = document.getElementById("appShell");

document.getElementById("btnStart")?.addEventListener("click", () => {
  startScreen?.classList.add("isLeaving");
  setTimeout(() => startScreen?.classList.add("isHidden"), 220);
  appShell?.classList.remove("isHidden");
});

document.getElementById("btnToSettings")?.addEventListener("click", () => {
  startScreen?.classList.add("isLeaving");
  setTimeout(() => startScreen?.classList.add("isHidden"), 220);
  appShell?.classList.remove("isHidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
});
