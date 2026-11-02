/** Captures a single explicit frame from a previously user-approved screen MediaStream. */
export const CAPTURE_MAX_WIDTH=1440;
export const CAPTURE_MAX_HEIGHT=900;
export function captureDimensions(width:number,height:number) {
  const scale=Math.min(1,CAPTURE_MAX_WIDTH/Math.max(1,width),CAPTURE_MAX_HEIGHT/Math.max(1,height));
  return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
export async function captureFrame(video:HTMLVideoElement): Promise<File> {
  if (!video.srcObject || video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) {
    throw new Error('Screen preview is not ready. Start sharing and try again.');
  }
  const size=captureDimensions(video.videoWidth,video.videoHeight);
  const canvas=document.createElement('canvas');
  canvas.width=size.width;canvas.height=size.height;
  const ctx=canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas capture unavailable.');
  ctx.drawImage(video,0,0,size.width,size.height);
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',0.78));
  if (!blob || !blob.size || blob.size>4*1024*1024) throw new Error('Screen snapshot too large or empty.');
  return new File([blob],`screen-${new Date().toISOString().replace(/[:.]/g,'-')}.jpg`,{type:'image/jpeg'});
}
