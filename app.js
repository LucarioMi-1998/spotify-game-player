// ========= CONFIG =========
const SPOTIFY_CLIENT_ID = "1a2b3c4d5e6f7g8h9i0j";

const SCOPES = "streaming user-read-playback-state user-modify-playback-state";

// ========= HELPERS =========
const qs = (n) => new URLSearchParams(window.location.search).get(n);
const statusEl = () => document.getElementById("status");
const setStatus = (t) => statusEl() && (statusEl().textContent = t);

// ========= PKCE =========
function rand(len=64){
  const c="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(len))).map(x=>c[x%c.length]).join("");
}
async function sha256(v){
  const b=new TextEncoder().encode(v);
  const h=await crypto.subtle.digest("SHA-256",b);
  return btoa(String.fromCharCode(...new Uint8Array(h))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
}

// ========= AUTH =========
function login(){
  const verifier=rand();
  sessionStorage.setItem("verifier",verifier);
  sha256(verifier).then(challenge=>{
    const u=new URL("https://accounts.spotify.com/authorize");
    u.searchParams.set("client_id",SPOTIFY_CLIENT_ID);
    u.searchParams.set("response_type","code");
    u.searchParams.set("redirect_uri",location.origin+location.pathname.replace("index.html","")+"callback.html");
    u.searchParams.set("scope",SCOPES);
    u.searchParams.set("code_challenge_method","S256");
    u.searchParams.set("code_challenge",challenge);
    location.href=u.toString();
  });
}

async function handleCallback(){
  const p=new URLSearchParams(location.search);
  const code=p.get("code");
  const verifier=sessionStorage.getItem("verifier");
  const body=new URLSearchParams({
    client_id:SPOTIFY_CLIENT_ID,
    grant_type:"authorization_code",
    code,
    redirect_uri:location.origin+location.pathname,
    code_verifier:verifier
  });
  const r=await fetch("https://accounts.spotify.com/api/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});
  const j=await r.json();
  localStorage.setItem("token",j.access_token);
  location.href=location.origin+location.pathname.replace("callback.html","");
}
window.handleCallback=handleCallback;

// ========= PLAYER =========
let player,deviceId;

async function loadSDK(){
  return new Promise(res=>{
    if(window.Spotify) return res();
    window.onSpotifyWebPlaybackSDKReady=res;
    const s=document.createElement("script");
    s.src="https://sdk.scdn.co/spotify-player.js";
    document.head.appendChild(s);
  });
}

async function init(){
  const token=localStorage.getItem("token");
  if(!token) return setStatus("Nicht eingeloggt");
  await loadSDK();
  player=new Spotify.Player({
    name:"Game Player",
    getOAuthToken:cb=>cb(token)
  });
  player.addListener("ready",e=>{
    deviceId=e.device_id;
    setStatus("Ready");
    document.getElementById("btnPlay").disabled=false;
    const t=qs("track");
    if(t) play(t);
  });
  player.addListener("player_state_changed",s=>{
    if(!s) return;
    const t=s.track_window.current_track;
    document.getElementById("metaLine").textContent=`${t.name} — ${t.artists.map(a=>a.name).join(", ")}`;
    document.getElementById("cover").src=t.album.images.pop().url;
    document.getElementById("spotifyLink").href=`https://open.spotify.com/track/${t.id}`;
  });
  player.connect();
}

async function play(id){
  const token=localStorage.getItem("token");
  await fetch("https://api.spotify.com/v1/me/player",{method:"PUT",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({device_ids:[deviceId],play:false})});
  await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,{method:"PUT",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({uris:[`spotify:track:${id}`]})});
}

async function pause(){
  const token=localStorage.getItem("token");
  await fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${deviceId}`,{method:"PUT",headers:{Authorization:`Bearer ${token}`}});
}

// ========= UI =========
if(document.getElementById("btnLogin")){
  btnLogin.onclick=login;
  btnPlay.onclick=()=>play(qs("track"));
  btnPause.onclick=pause;
  btnLogout.onclick=()=>{localStorage.clear();location.reload();};
  init();
}
