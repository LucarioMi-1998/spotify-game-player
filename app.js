// ===== START FLOW (CLEAN) =====
document.addEventListener("DOMContentLoaded", () => {
  const btnStart = document.getElementById("btnStart");
  const btnSettings = document.getElementById("btnToSettings");
  const startScreen = document.getElementById("startScreen");
  const appShell = document.getElementById("appShell");

  function openApp() {
    startScreen.classList.add("isLeaving");
    setTimeout(() => startScreen.classList.add("isHidden"), 220);
    appShell.classList.remove("isHidden");

    const token = localStorage.getItem("token");
    if (!token) {
      login();
    }
  }

  btnStart?.addEventListener("click", openApp);
  btnSettings?.addEventListener("click", openApp);
});

// ===== SPOTIFY LOGIN (UNCHANGED CORE) =====
const SPOTIFY_CLIENT_ID = "fc0b3b30a9324288a9723c9475a1c2a8";
const SCOPES = "streaming user-read-playback-state user-modify-playback-state";

function basePath(){
  return location.pathname.endsWith("/") ? location.pathname : location.pathname.replace(/[^/]+$/,"");
}
function redirectUri(){
  return location.origin + basePath() + "callback.html";
}

function login(){
  const v = Math.random().toString(36).slice(2);
  sessionStorage.setItem("v", v);
  crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)).then(buf=>{
    const ch = btoa(String.fromCharCode(...new Uint8Array(buf)))
      .replace(/=+/g,"").replace(/\+/g,"-").replace(/\//g,"_");

    const u = new URL("https://accounts.spotify.com/authorize");
    u.searchParams.set("client_id", SPOTIFY_CLIENT_ID);
    u.searchParams.set("response_type","code");
    u.searchParams.set("redirect_uri", redirectUri());
    u.searchParams.set("scope", SCOPES);
    u.searchParams.set("code_challenge_method","S256");
    u.searchParams.set("code_challenge", ch);
    location.href = u;
  });
}
