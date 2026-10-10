// SPDX-License-Identifier: Apache-2.0
// Apple MakerNote and timed metadata layout adapted from Video to Live Photo.
// Copyright 2026 杨振. See NOTICE and LICENSE-APACHE-2.0.txt.
// Modified: browser JavaScript, bounded parsing, preserve original media offsets,
// append metadata rather than transcode, explicit unsupported-container rejection.
const enc = new TextEncoder();
const ascii = s => enc.encode(s);
const zeros = n => new Uint8Array(n);
export const join = (...parts) => {
  const out = new Uint8Array(parts.reduce((n,p)=>n+p.length,0));
  let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;
};
const u16=n=>{const b=zeros(2);new DataView(b.buffer).setUint16(0,n);return b;};
const u32=n=>{const b=zeros(4);new DataView(b.buffer).setUint32(0,n);return b;};
const numbers=(...a)=>join(...a.map(u32));
const read32=(b,o)=>new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(o);
const chars=(b,o,n=4)=>String.fromCharCode(...b.subarray(o,o+n));
export const box=(type,...p)=>{const b=join(...p);return join(u32(b.length+8),typeof type==='string'?ascii(type):type,b);};
const full=(type,...p)=>box(type,zeros(4),...p);
const uuid=id=>{
  if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))throw Error('Live 配对标识无效');
  return id.toUpperCase();
};
export function liveJPEG(jpeg,id) {
  if(jpeg[0]!==255||jpeg[1]!==216)throw Error('Live 静态图不是 JPEG');
  const value=ascii(uuid(id)+'\0');
  const note=join(ascii('Apple iOS\0\0\x01MM'),u16(1),u16(17),u16(2),u32(value.length),u32(32),zeros(4),value);
  const entry=(tag,type,count,offset)=>join(u16(tag),u16(type),u32(count),u32(offset));
  // TIFF IFD0 -> ExifIFD -> MakerNote. MakerNote offsets are local to its header.
  const tiff=join(ascii('MM'),u16(42),u32(8),u16(2),entry(0x10f,2,6,38),entry(0x8769,4,1,44),zeros(4),
    ascii('Apple\0'),u16(1),entry(0x927c,7,note.length,62),zeros(4),note);
  const exif=join(ascii('Exif\0\0'),tiff);
  return join(jpeg.subarray(0,2),new Uint8Array([255,225]),u16(exif.length+2),exif,jpeg.subarray(2));
}
export function atoms(b,start=0,end=b.length) {
  const out=[];
  while(start<end){
    if(end-start<8)throw Error('视频容器不完整');
    let size=read32(b,start),header=8;
    if(size===1){
      if(end-start<16)throw Error('视频扩展长度损坏');
      const hi=read32(b,start+8);if(hi>0x1fffff)throw Error('视频容器过大');
      size=hi*4294967296+read32(b,start+12);header=16;
    }else if(size===0)size=end-start;
    if(size<header||size>end-start)throw Error('视频区块越界');
    out.push({type:chars(b,start+4),start,end:start+size,payload:start+header,header});start+=size;
  }return out;
}
const child=(b,a,t)=>a&&atoms(b,a.payload,a.end).find(x=>x.type===t);
const raw=(b,a)=>b.subarray(a.start,a.end);
const key='com.apple.quicktime.content.identifier';
const stillKey='com.apple.quicktime.still-image-time';
const contains=(b,a,text)=>new TextDecoder('latin1').decode(raw(b,a)).includes(text);
function contentMetadata(id) {
  const h=full('hdlr',u32(0),ascii('mdta'),zeros(12),zeros(2));
  const keys=full('keys',u32(1),box('mdta',ascii(key)));
  const item=box(u32(1),box('data',numbers(1,0),ascii(uuid(id))));
  return box('meta',h,keys,box('ilst',item));
}
function timedTrack(id,videoId,scale,cover,offset) {
  const matrix=numbers(65536,0,0,0,65536,0,0,0,1073741824);
  const tkhd=box('tkhd',u32(15),numbers(0,0,id,0,cover+1),zeros(16),matrix,zeros(8));
  const edit=(duration,time)=>join(numbers(duration,time),u16(1),u16(0));
  const edits=cover?[edit(cover,0xffffffff),edit(1,0)]:[edit(1,0)];
  const edts=box('edts',full('elst',u32(edits.length),...edits));
  const tref=box('tref',box('cdsc',u32(videoId)));
  const mdhd=full('mdhd',numbers(0,0,scale,1),u16(0x55c4),u16(0));
  const pascal=s=>join(new Uint8Array([s.length]),ascii(s));
  const hdlr=full('hdlr',ascii('mhlrmetaappl'),numbers(1,0),pascal('Core Media Metadata'));
  const gmhd=box('gmhd',full('gmin',u16(64),u16(32768),u16(32768),u16(32768),zeros(4)));
  const dh=full('hdlr',ascii('dhlralisappl'),zeros(8),pascal('Core Media Data Handler'));
  const dinf=box('dinf',full('dref',u32(1),box('alis',u32(1))));
  const keyRecord=box(u32(1),box('keyd',ascii('mdta'+stillKey)),full('dtyp',u32(0x41)));
  const mebx=box('mebx',zeros(6),u16(1),box('keys',keyRecord));
  const stbl=box('stbl',full('stsd',u32(1),mebx),full('stts',numbers(1,1,1)),
    full('stsc',numbers(1,1,1,1)),full('stsz',numbers(0,1,9)),full('stco',numbers(1,offset)));
  return box('trak',tkhd,edts,tref,box('mdia',mdhd,hdlr,box('minf',gmhd,dh,dinf,stbl)));
}
function trackInfo(b,t){
  const header=child(b,t,'tkhd'),mdia=child(b,t,'mdia'),handler=child(b,mdia,'hdlr');
  if(!header||!handler)throw Error('视频轨道信息缺失');
  const pos=header.payload+(b[header.payload]===1?20:12);
  if(pos+4>header.end||handler.payload+12>handler.end)throw Error('视频轨道头不完整');
  return {id:read32(b,pos),kind:chars(b,handler.payload+8),mdia};
}
export function liveMOV(source,id,coverSeconds=null) {
  uuid(id);
  const top=atoms(source),moovs=top.filter(a=>a.type==='moov'),ftyp=top.find(a=>a.type==='ftyp');
  const mdats=top.filter(a=>a.type==='mdat');
  if(moovs.length!==1||!ftyp||!mdats.length||top.some(a=>['moof','sidx'].includes(a.type)))throw Error('此 Live 视频容器暂不支持配对转换');
  const moov=moovs[0],children=atoms(source,moov.payload,moov.end);
  if(children.some(a=>a.type==='mvex'))throw Error('暂不支持分片 Live 视频');
  const mvhd=children.find(a=>a.type==='mvhd'),tracks=children.filter(a=>a.type==='trak');
  if(!mvhd||source[mvhd.payload]!==0||mvhd.end-mvhd.payload<100)throw Error('不支持此视频时间头');
  const scale=read32(source,mvhd.payload+12),duration=read32(source,mvhd.payload+16);
  if(!scale||!duration||duration===0xffffffff)throw Error('视频时长无效');
  const info=tracks.map(t=>({t,...trackInfo(source,t)})),video=info.find(t=>t.kind==='vide');
  if(!video)throw Error('没有可配对的视频轨');
  const stbl=child(source,child(source,video.mdia,'minf'),'stbl'),stsd=child(source,stbl,'stsd');
  if(!stsd||stsd.payload+8>stsd.end)throw Error('视频编码信息缺失');
  const codecs=atoms(source,stsd.payload+8,stsd.end).map(a=>a.type);
  if(!codecs.length||!codecs.every(c=>['avc1','hvc1'].includes(c)))throw Error('Live 配对目前支持 H.264 或 hvc1 HEVC，当前编码：'+codecs.join(','));
  const nextId=Math.max(...info.map(t=>t.id))+1;
  if(nextId>=0xffffffff)throw Error('轨道编号超出范围');
  const cover=Math.min(duration-1,Math.max(0,Math.round((coverSeconds ?? duration/scale/2)*scale)));
  // Preserve all original byte offsets: replace old moov with equally sized free space.
  const output=Uint8Array.from(source);
  for(const a of top)if(read32(output,a.start)===0)new DataView(output.buffer).setUint32(a.start,a.end-a.start);
  output.set(ascii('free'),moov.start+4);output.fill(0,moov.payload,moov.end);
  if(ftyp.end-ftyp.payload<8)throw Error('视频文件类型头无效');
  output.set(ascii('qt  '),ftyp.payload);
  for(let p=ftyp.payload+8;p+4<=ftyp.end;p+=4)output.set(ascii('qt  '),p);
  const patchedHeader=Uint8Array.from(raw(source,mvhd));
  new DataView(patchedHeader.buffer).setUint32(patchedHeader.length-4,nextId+1);
  const keep=children.filter(a=>a!==mvhd && !(a.type==='meta'&&contains(source,a,key)) && !(a.type==='trak'&&contains(source,a,stillKey)));
  const sample=join(numbers(9,1),new Uint8Array([255]));
  const newMoov=box('moov',patchedHeader,...keep.map(a=>raw(source,a)),contentMetadata(id),timedTrack(nextId,video.id,scale,cover,output.length+8));
  return {bytes:join(output,box('mdat',sample),newMoov),stillTime:cover/scale,duration:duration/scale};
}
