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
  if(!scanning) return;
  const canvas=document.createElement("canvas");
  const ctx=canvas.getContext("2d");
  canvas.width=video.videoWidth;
  canvas.height=video.videoHeight;
  ctx.drawImage(video,0,0);
  const img=ctx.getImageData(0,0,canvas.width,canvas.height);
  const code=jsQR(img.data,canvas.width,canvas.height);
  if(code?.data){
    stopQRScanner();
    onResult(code.data.trim());
    return;
  }
  requestAnimationFrame(()=>scanLoop(onResult));
}
