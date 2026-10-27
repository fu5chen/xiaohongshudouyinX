// Self-contained: chrome.scripting serializes this function into the page.
export function extractHuabanNote(reportErrors=false,requestedId=''){
 try{
  const pinId=value=>{try{const u=new URL(value,location.href);return ['huaban.com','www.huaban.com'].includes(u.hostname)?u.pathname.match(/^\/pins\/(\d{1,22})(?:\/|$)/)?.[1]||'':'';}catch{return '';}};
  const detail=pinId(location.href),id=requestedId||detail||'loaded';
  if(!/^(?:loaded|\d{1,22})$/.test(id))throw Error('无效的花瓣采集编号');
  const media=value=>{try{if(typeof value!=='string'||!value)return '';const u=new URL(value,location.href);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(u.hostname==='hbimg.huaban.com'||u.hostname.endsWith('-hbimg.huaban.com')||['huabanimg.com','hb.aicdn.com'].some(d=>u.hostname===d||u.hostname.endsWith('.'+d)))&&u.pathname.length>1?u.href:'';}catch{return '';}};
  const original=value=>{const u=new URL(value);u.pathname=u.pathname.replace(/_(?:fw|sq|fh|hb|canvas)\d.*$/i,'');return u.href;};
  const pins=new Map();
  function add(pid,img){
   if(!pid||(id!=='loaded'&&pid!==id))return;
   const raw=media(img.currentSrc||img.getAttribute('src')||img.getAttribute('data-src')||'');if(!raw)return;
   const url=original(raw),prev=pins.get(pid);
   if(prev&&prev.area>=(img.naturalWidth||0)*(img.naturalHeight||0))return;
   pins.set(pid,{url,raw,area:(img.naturalWidth||0)*(img.naturalHeight||0),text:img.alt||''});
  }
  for(const a of document.querySelectorAll('a[href*="/pins/"]')){const pid=pinId(a.href);for(const img of a.querySelectorAll('img'))add(pid,img);}
  let detailFallback=false;
  if(detail&&id===detail){
   // Match by pin_id before looking at a file: related pins can share the same
   // React tree. Do not execute getters or traverse DOM/fiber graphs wholesale.
   let match;const visited=new WeakSet();let budget=20000;
   function find(root){const stack=[root];while(stack.length&&budget-->0&&!match){
    const n=stack.pop();if(!n||typeof n!=='object'||visited.has(n)||(typeof Node!=='undefined'&&n instanceof Node))continue;
    visited.add(n);let d;try{d=Object.getOwnPropertyDescriptors(n);}catch{continue;}
    if(String(d.pin_id?.value||'')===id){const file=d.file?.value;if(file&&typeof file==='object'){
     const f=Object.getOwnPropertyDescriptors(file),key=f.key?.value;
     const raw=media(f.url?.value)||media(f.orig?.value)||(typeof key==='string'&&/^[a-z0-9_-]{20,}$/i.test(key)?'https://gd-hbimg.huaban.com/'+key:'');
     if(raw){match={url:original(raw),raw,area:Infinity,text:String(d.raw_text?.value||'')};break;}
    }}
    for(const [key,v] of Object.entries(d))if(!['return','child','sibling','stateNode','_owner'].includes(key)&&v.value&&typeof v.value==='object')stack.push(v.value);
   }}
   if(typeof window!=='undefined'){find(window.__INITIAL_STATE__);find(window.__NEXT_DATA__);find(window.app?.page);}
   for(const script of document.querySelectorAll('script[type="application/json"]')){if(match)break;if(script.textContent.length<4000000)try{find(JSON.parse(script.textContent));}catch{}}
   const imgs=[...document.querySelectorAll('img')];
   const inspected=new WeakSet();
   for(const img of imgs){if(match)break;let el=img;for(let depth=0;el&&depth<10&&!match;depth++,el=el.parentElement){
    if(inspected.has(el))break;inspected.add(el);
    for(const key of Object.getOwnPropertyNames(el)){
     if(key.startsWith('__reactProps$'))find(Object.getOwnPropertyDescriptor(el,key)?.value);
     if(key.startsWith('__reactFiber$')){let f=Object.getOwnPropertyDescriptor(el,key)?.value;for(let i=0;f&&i<20&&!match;i++){
      const p=Object.getOwnPropertyDescriptors(f);find(p.memoizedProps?.value);find(p.pendingProps?.value);f=p.return?.value;
     }}
    }
   }}
   if(match){
    const displayed=imgs.map(img=>media(img.currentSrc||img.getAttribute('src'))).find(url=>url&&new URL(original(url)).pathname===new URL(match.url).pathname);
    if(displayed)match.raw=displayed;
    pins.set(id,match);
   }
   // Metadata may be stale after client-side navigation. Require its URL to
   // identify this pin, and never overwrite a matched live page record.
   const og=document.querySelector('meta[property="og:image"]')?.content;
   const ogId=pinId(document.querySelector('meta[property="og:url"]')?.content||'');
   if(!pins.has(id)&&ogId===id&&media(og))pins.set(id,{url:original(media(og)),raw:media(og),area:Infinity,text:document.querySelector('meta[property="og:description"]')?.content||''});
   if(!pins.has(id)){
    // Detail layouts can render the hero as an unlinked img. Only accept a
    // clearly dominant visible image, excluding links/cards owned by other pins.
    const candidates=[];
    for(const img of imgs){
     if(!media(img.currentSrc||img.getAttribute('src')))continue;
     let owner=img,excluded=false;while(owner&&owner!==document.body){
      const pid=pinId(owner.getAttribute?.('href')||'')||owner.getAttribute?.('data-pin-id');
      if(pid&&String(pid)!==id){excluded=true;break;}owner=owner.parentElement;
     }
     if(excluded)continue;
     const r=img.getBoundingClientRect();const style=getComputedStyle(img);
     if(r.width<240||r.height<240||r.bottom<=0||r.top>=innerHeight||r.right<=0||r.left>=innerWidth||style.visibility==='hidden'||style.display==='none'||Number(style.opacity)===0)continue;
     candidates.push({img,area:r.width*r.height});
    }
    candidates.sort((a,b)=>b.area-a.area);
    if(candidates.length&&(!candidates[1]||candidates[0].area>candidates[1].area*1.8)){add(id,candidates[0].img);detailFallback=true;}
   }
   if(!pins.has(id))throw Error('未找到当前采集的主图。请等待详情加载完成，或返回搜索页点击该图片下的下载按钮。');
  }
  if(!pins.size)throw Error('尚未读取到花瓣图片。请正常登录并等待图片加载，向下滚动后重试。');
  const assets=[],seen=new Set();for(const [pid,p] of pins){const u=new URL(p.url),key=u.origin+u.pathname;if(seen.has(key))continue;seen.add(key);assets.push({kind:'image',group:'图片',name:'huaban_'+pid,originals:[p.raw,...(p.raw!==p.url?[p.url]:[])],fallback:[],width:0,height:0});}
  const text=id==='loaded'?(new URL(location.href).searchParams.get('q')||document.title):pins.get(id)?.text||'花瓣采集';
  return {noteId:id,platform:'huaban',source:location.href,author:'花瓣',nickname:'花瓣',time:null,title:text,text,assets,warnings:[id==='loaded'?'仅下载当前页面已加载并可识别的采集图片；请继续滚动加载后再次下载。':detailFallback?'依据详情页可见大图识别主图，请核对保存结果。':'仅保存当前采集图片。','优先保存页面有效图片地址，失败时尝试大图；不保证源文件原始分辨率。','图片保存原始文件，不压缩，不转换格式；保留动图。'],extractedAt:new Date().toISOString()};
 }catch(e){if(!reportErrors)throw e;return {collectorError:'花瓣图片读取失败：'+String(e?.message||e)};}
}
