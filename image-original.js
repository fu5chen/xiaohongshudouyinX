// Inspect file bytes, without decoding pixels or re-encoding the image.
export async function originalImage(blob){
  const b=new Uint8Array(await blob.slice(0,65536).arrayBuffer());
  const ascii=(start,len)=>String.fromCharCode(...b.slice(start,start+len));
  let extension='',width=0,height=0;
  const view=new DataView(b.buffer,b.byteOffset,b.byteLength);
  if(b.length>=24&&[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v)){
    extension='png';width=view.getUint32(16);height=view.getUint32(20);
  }else if(b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255){
    extension='jpg';let p=2;
    while(p+4<b.length){if(b[p++]!==255)break;while(b[p]===255)p++;const marker=b[p++];
      if(marker===217||marker===218)break;if(marker===1||(marker>=208&&marker<=215))continue;
      const size=view.getUint16(p);if(size<2||p+size>b.length)break;
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&size>=7){height=view.getUint16(p+3);width=view.getUint16(p+5);break;}p+=size;
    }
  }else if(b.length>=10&&/^GIF8[79]a$/.test(ascii(0,6))){extension='gif';width=view.getUint16(6,true);height=view.getUint16(8,true);}
  else if(b.length>=16&&ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP')extension='webp';
  else if(b.length>=16&&ascii(4,4)==='ftyp'){
    const brands=ascii(8,Math.min(56,b.length-8));
    if(/avif|avis/.test(brands))extension='avif';else if(/heic|heix|hevc|hevx|mif1|msf1/.test(brands))extension='heic';
  }else if(b.length>=26&&ascii(0,2)==='BM')extension='bmp';
  else if(b.length>=8&&(ascii(0,4)==='II*\0'||ascii(0,4)==='MM\0*'))extension='tif';
  if(!extension)throw Error('服务器未返回支持的图片文件，已跳过保存');
  return {blob,extension,width,height,sourceWidth:width,sourceHeight:height,compressed:false};
}
