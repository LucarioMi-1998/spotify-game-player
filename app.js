const SPOTIFY_CLIENT_ID = "PASTE_YOUR_CLIENT_ID_HERE";
const SCOPES = "streaming user-read-playback-state user-modify-playback-state";
const qs=n=>new URLSearchParams(location.search).get(n);
const statusEl=document.getElementById("status");
const setStatus=t=>statusEl.textContent=t;

function rand(l=64){const c="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";return Array.from(crypto.getRandomValues(new Uint8Array(l))).map(x=>c[x%c.length]).join("");}
async function sha256(v){const b=new TextEncoder().encode(v);const h=await crypto.subtle.digest("SHA-256",b);return btoa(String.fromCharCode(...new Uint8Array(h))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");}

function login(){
  const v=rand();sessionStorage.setItem("v",v);
  sha256(v).then(ch=>{
    const u=new URL("https://accounts.spotify.com/authorize");
    u.searchParams.set("client_id",SPOTIFY_CLIENT_ID);
    u.searchParams.set("response_type","code");
    u.searchParams.set("redirect_uri",location.origin+location.pathname.replace("index.html","")+"callback.html");
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
  const body=new URLSearchParams({client_id:SPOTIFY_CLIENT_ID,grant_type:"authorization_code",code,redirect_uri:location.origin+location.pathname,code_verifier:v});
  const r=await fetch("https://accounts.spotify.com/api/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});
  const j=await r.json();
  localStorage.setItem("token",j.access_token);
  location.href=location.origin+location.pathname.replace("callback.html","");
}
window.handleCallback=handleCallback;

let player,deviceId;
function loadSDK(){return new Promise(r=>{if(window.Spotify)return r();window.onSpotifyWebPlaybackSDKReady=r;const s=document.createElement("script");s.src="https://sdk.scdn.co/spotify-player.js";document.head.appendChild(s);});}

async function init(){
  const token=localStorage.getItem("token");
  if(!token)return setStatus("Nicht eingeloggt");
  await loadSDK();
  player=new Spotify.Player({name:"QR Game Player",getOAuthToken:cb=>cb(token)});
  player.addListener("ready",e=>{deviceId=e.device_id;setStatus("Ready");});
  player.addListener("player_state_changed",s=>{
    const t=s?.track_window?.current_track;
    if(!t)return;
    metaLine.textContent=`${t.name} — ${t.artists.map(a=>a.name).join(", ")}`;
    cover.src=t.album.images.pop().url;
    spotifyLink.href=`https://open.spotify.com/track/${t.id}`;
  });
  player.connect();
}

async function play(id){
  const token=localStorage.getItem("token");
  await fetch("https://api.spotify.com/v1/me/player",{method:"PUT",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({device_ids:[deviceId],play:false})});
  await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,{method:"PUT",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({uris:[`spotify:track:${id}`]})});
}

btnLogin.onclick=login;
btnLogout.onclick=()=>{localStorage.clear();location.reload();};
btnPause.onclick=()=>player.pause();
btnScan.onclick=()=>{
  setStatus("QR scannen…");
  startQRScanner(data=>{
    setStatus("Track geladen");
    play(data);
  });
};

init();
