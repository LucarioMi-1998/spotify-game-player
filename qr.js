let stream=null, scanning=false, rafId=null;

function waitForVideoReady(video){
  return new Promise((resolve)=>{
    const tick=()=>{
      if(video.readyState>=2 && video.videoWidth>0 && video.videoHeight>0) return resolve();
      requestAnimationFrame(tick);
    };
    tick();
  });
}

async function startQRScanner(onResult){
  if(scanning) return;
  const video=document.getElementById("camVideo");
  if(!navigator.mediaDevices?.getUserMedia) throw new Error("Kamera wird nicht unterstützt.");

  stream = await navigator.mediaDevices.getUserMedia({
    video:{facingMode:{ideal:"environment"}},
    audio:false
  });

  video.srcObject = stream;
  await video.play();
  await waitForVideoReady(video);

  scanning=true;
  loop(video,onResult);
}

function stopQRScanner(){
  scanning=false;
  if(rafId) cancelAnimationFrame(rafId);
  rafId=null;

  const video=document.getElementById("camVideo");
  try{video.pause()}catch{}
  if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}
  video.srcObject=null;
}

function loop(video,onResult){
  if(!scanning) return;

  const w=video.videoWidth, h=video.videoHeight;
  if(!w || !h){rafId=requestAnimationFrame(()=>loop(video,onResult));return;}

  const canvas=document.createElement("canvas");
  canvas.width=w; canvas.height=h;
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  ctx.drawImage(video,0,0,w,h);
  const img=ctx.getImageData(0,0,w,h);

  const code=jsQR(img.data,w,h);
  if(code?.data){
    stopQRScanner();
    onResult(code.data.trim());
    return;
  }
  rafId=requestAnimationFrame(()=>loop(video,onResult));
}

window.startQRScanner=startQRScanner;
window.stopQRScanner=stopQRScanner;
