let video=document.createElement("video");
video.setAttribute("playsinline",true);
let scanning=false;

async function startQRScanner(onResult){
  const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}});
  video.srcObject=stream;
  await video.play();
  scanning=true;
  scanLoop(onResult);
}

function stopQRScanner(){
  scanning=false;
  video.srcObject?.getTracks().forEach(t=>t.stop());
}

function scanLoop(onResult){
  if(!scanning)return;
  const c=document.createElement("canvas");
  const ctx=c.getContext("2d");
  c.width=video.videoWidth;
  c.height=video.videoHeight;
  ctx.drawImage(video,0,0);
  const img=ctx.getImageData(0,0,c.width,c.height);
  const code=jsQR(img.data,c.width,c.height);
  if(code?.data){
    stopQRScanner();
    onResult(code.data.trim());
    return;
  }
  requestAnimationFrame(()=>scanLoop(onResult));
}
