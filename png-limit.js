export const PNG_LIMIT=3_000_000;
let active=0;const waiters=[];
async function slot(){if(active>=2)await new Promise(r=>waiters.push(r));else active++;return ()=>{const next=waiters.shift();if(next)next();else active--;};}
export async function compressPNG(input,{cancelled=()=>false}={}){
  const release=await slot();let bitmap;
  try{
    if(cancelled())throw Error('已停止');
    bitmap=await createImageBitmap(input);
    const sourceWidth=bitmap.width,sourceHeight=bitmap.height;
    if(!sourceWidth||!sourceHeight||sourceWidth*sourceHeight>80000000)throw Error('图片尺寸无效或超过 8000 万像素');
    const signature=new Uint8Array(await input.slice(0,8).arrayBuffer());
    const originalPNG=[137,80,78,71,13,10,26,10].every((n,i)=>signature[i]===n);
    if(originalPNG&&input.size<=PNG_LIMIT)return {blob:input,width:sourceWidth,height:sourceHeight,sourceWidth,sourceHeight,compressed:false};
    const canvas=document.createElement('canvas');let width=sourceWidth,height=sourceHeight,output;
    if(originalPNG&&input.size>PNG_LIMIT){
      const factor=Math.min(.98,Math.sqrt(PNG_LIMIT/input.size)*.98);
      width=Math.max(1,Math.floor(width*factor));height=Math.max(1,Math.floor(height*factor));
    }
    for(let pass=0;pass<20;pass++){
      if(cancelled())throw Error('已停止');
      canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d');if(!ctx)throw Error('无法初始化图片压缩');
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(bitmap,0,0,width,height);
      output=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!output||output.type!=='image/png')throw Error('PNG 编码失败');
      if(output.size<=PNG_LIMIT)return {blob:output,width,height,sourceWidth,sourceHeight,compressed:width<sourceWidth||height<sourceHeight};
      if(width===1&&height===1)break;
      const factor=Math.min(.92,Math.max(.1,Math.sqrt(PNG_LIMIT/output.size)*.96));
      width=Math.max(1,Math.floor(width*factor));height=Math.max(1,Math.floor(height*factor));
    }
    throw Error('无法将图片压缩到 3 MB 以内，已跳过保存');
  }finally{bitmap?.close();release();}
}
