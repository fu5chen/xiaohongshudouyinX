(() => {
  if(window.__redCollectorHuabanUI)return;window.__redCollectorHuabanUI=true;
  const host=document.createElement('div');host.dataset.redCollectorHuaban='panel';
  const root=host.attachShadow({mode:'closed'});document.documentElement.append(host);
  root.innerHTML=`<style>
:host{all:initial;position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483646!important;font-family:system-ui,"Microsoft YaHei",sans-serif;color:#342b30;font-size:13px}
*{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer;border:0;border-radius:9px;padding:9px 12px;background:#ff3158;color:#fff;white-space:nowrap}button:disabled{opacity:.5;cursor:default}button:focus-visible,input:focus-visible{outline:3px solid #608cff;outline-offset:2px}[hidden]{display:none!important}
#panel{pointer-events:auto;position:fixed;right:18px;bottom:18px;width:320px;max-width:calc(100vw - 36px);max-height:75vh;overflow:auto;background:white;border:1px solid #eadde2;border-radius:16px;padding:14px;box-shadow:0 6px 28px #0004}header{display:flex;align-items:center;justify-content:space-between;font-weight:700}header button{background:#f4eef0;color:#533642;padding:4px 9px}p{margin:10px 0;line-height:1.6;overflow-wrap:anywhere}small{color:#78636c;line-height:1.6;display:block;margin-top:8px}.row{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.secondary{background:#f5e8ed;color:#9a2344}#count{font-weight:650}#status{max-height:150px;overflow:auto;white-space:pre-line}progress{width:100%;height:7px;accent-color:#ff3158}
.card{pointer-events:auto;position:fixed;display:flex;align-items:center;gap:5px;background:#fffefb;border-radius:9px;padding:4px;box-shadow:0 2px 8px #0004}.card button{padding:5px 8px;font-size:12px}.card label{display:flex;align-items:center;gap:3px;cursor:pointer;font-size:12px;color:#49343e;padding:0 4px}.card input{width:16px;height:16px;accent-color:#ff3158}
</style><div id="cards"></div><section id="panel"><header><span>花瓣批量下载 · 1.8.1</span><button id="collapse" aria-label="折叠面板">−</button></header><div id="body"><p id="count"></p><div class="row" id="batch"><button id="all">下载已收集</button><button id="selected">下载选中</button></div><div class="row" id="selection"><button class="secondary" id="selectAll">全选已收集</button><button class="secondary" id="clear">取消选择</button></div><div class="row"><button id="detail" hidden>下载当前采集图片</button><button class="secondary" id="auto">滚动收集并下载</button><button class="secondary" id="stopCollect" hidden>停止收集</button></div><p id="status" role="status" aria-live="polite">先滚动加载图片，或点击“滚动收集并下载”。</p><progress id="progress" hidden></progress><div class="row"><button class="secondary" id="retry" hidden>重试未完成</button><button class="secondary" id="stop" hidden>停止下载</button><button class="secondary" id="show" hidden>打开文件夹</button></div><small>原格式保存 · 4 路并发 · 失败自动跳过<br>只下载已收集图片；自动滚动不保证获取整块画板。每批最多 2000 张。</small></div></section>`;
  const $=s=>root.querySelector(s),collected=new Map(),selected=new Set();
  let scope='',job=null,busy=false,polling=false,collecting=false,generation=0,frame=0,collectionToken=0;
  const pinId=value=>{try{const u=new URL(value,location.href);return ['huaban.com','www.huaban.com'].includes(u.hostname)?u.pathname.match(/^\/pins\/(\d{1,22})(?:\/|$)/)?.[1]||'':'';}catch{return '';}};
  const media=value=>{try{if(!value)return '';const u=new URL(value,location.href);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(u.hostname==='hbimg.huaban.com'||u.hostname.endsWith('-hbimg.huaban.com')||['huabanimg.com','hb.aicdn.com'].some(d=>u.hostname===d||u.hostname.endsWith('.'+d)))?u.href:'';}catch{return '';}};
  const keyOf=url=>{const u=new URL(url);u.pathname=u.pathname.replace(/_(?:fw|sq|fh|hb|canvas)\d.*$/i,'');u.search='';return u.href;};
  const send=async m=>{const r=await chrome.runtime.sendMessage(m);if(!r?.ok)throw Error(r?.error||'扩展未响应，请重新加载扩展并刷新页面。');return r;};
  const status=text=>{$('#status').textContent=text;};
  function controls(){
    const detail=pinId(location.href);$('#count').textContent=detail?'当前采集：'+detail:`已收集 ${collected.size} 张 · 已选 ${selected.size} 张`;
    $('#all').textContent=`下载已收集（${collected.size}）`;$('#selected').textContent=`下载选中（${selected.size}）`;
    $('#batch').hidden=!!detail;$('#selection').hidden=!!detail;$('#detail').hidden=!detail;$('#auto').hidden=!!detail||collecting;$('#stopCollect').hidden=!collecting;
    $('#all').disabled=busy||collecting||!collected.size;$('#selected').disabled=busy||collecting||!selected.size;$('#detail').disabled=busy;$('#auto').disabled=busy;
  }
  function reset(){scope=location.href;generation++;collectionToken++;collecting=false;collected.clear();selected.clear();job=null;busy=false;$('#progress').hidden=true;for(const s of ['#retry','#stop','#show'])$(s).hidden=true;status(pinId(scope)?'点击下载当前采集图片。':'滚动加载图片后可批量下载，也可以勾选图片。');}
  // Images in current Huaban cards may have no surrounding link or pin id.
  // Use the CDN image identity for collection; a pin id is optional metadata.
  const imageId=key=>{let a=2166136261,b=5381;for(const c of key){a=Math.imul(a^c.charCodeAt(0),16777619);b=Math.imul(b,33)^c.charCodeAt(0);}return 'img_'+(a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');};
  let scrollImages=[];
  function sourceOf(el){
    const raw=[el.currentSrc,el.getAttribute('src')];
    const lazy=[el.getAttribute('data-original'),el.getAttribute('data-src'),el.getAttribute('data-lazy-src')];
    const sets=[el.getAttribute('data-srcset'),el.getAttribute('srcset'),...Array.from(el.parentElement?.tagName==='PICTURE'?el.parentElement.querySelectorAll('source[srcset]'):[],x=>x.getAttribute('srcset'))];
    const responsive=sets.filter(Boolean).flatMap(x=>x.split(',').map(part=>{const [url,size]=part.trim().split(/\s+/);return {url,size:parseFloat(size)||0};})).sort((a,b)=>b.size-a.size).map(x=>x.url);
    const background=el.tagName==='IMG'?[]:[...getComputedStyle(el).backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(x=>x[1]);
    const urls=el.complete&&el.naturalWidth>8?[...raw,...lazy,...responsive,...background]:[...lazy,...responsive,...raw,...background];
    return urls.map(media).find(url=>url&&!/(?:^|[/_-])(avatar|logo|placeholder|loading|blank|spacer)(?:[._/-]|$)/i.test(new URL(url).pathname))||'';
  }
  function scrollingSurface(){
    const votes=new Map();for(const img of scrollImages){for(let el=img.parentElement;el&&el!==document.body&&el!==document.documentElement;el=el.parentElement){
      if(el.clientHeight>=200&&el.scrollHeight>el.clientHeight+10&&/(auto|scroll)/.test(getComputedStyle(el).overflowY)){votes.set(el,(votes.get(el)||0)+1);break;}
    }}
    return [...votes].sort((a,b)=>b[1]-a[1])[0]?.[0]||document.scrollingElement||document.documentElement;
  }
  const isPage=el=>el===document.documentElement||el===document.body||el===document.scrollingElement;
  const scrollTopOf=el=>isPage(el)?window.scrollY:el.scrollTop;
  const scrollHeightOf=el=>isPage(el)?Math.max(document.documentElement.scrollHeight,document.body?.scrollHeight||0):el.scrollHeight;
  const viewportOf=el=>isPage(el)?innerHeight:el.clientHeight;
  function scan(){
    if(scope!==location.href)reset();
    const cards=$('#cards');cards.replaceChildren();if(pinId(scope)){controls();return;}
    const visible=new Set();scrollImages=[];
    for(const img of document.querySelectorAll('img,canvas,[style*="background-image"],[class*="image"],[class*="Image"],[class*="picture"]')){
      const r=img.getBoundingClientRect();
      // Skip avatars, icons and banners. Lazy images with a large rendered box
      // remain eligible even before their pixel data has loaded.
      if(r.width<90||r.height<80||r.width/r.height>6)continue;
      const style=getComputedStyle(img);if(style.display==='none'||style.visibility==='hidden')continue;
      scrollImages.push(img);
      const url=sourceOf(img);if(!url)continue;
      let owner=img,id='';for(let depth=0;owner&&depth<8;depth++,owner=owner.parentElement){id=pinId(owner.getAttribute?.('href')||'')||owner.getAttribute?.('data-pin-id')||'';if(/^\d{1,22}$/.test(id))break;id='';}
      const key=keyOf(url);id=id||imageId(key);
      if(collected.has(key)||collected.size<2000)collected.set(key,{id,url});
      if(r.bottom<=0||r.top>innerHeight-40||r.right<0||r.left>innerWidth-100||visible.has(key))continue;
      if(!collected.has(key))continue;visible.add(key);
      const card=document.createElement('div');card.className='card';card.style.left=Math.max(4,r.left+6)+'px';card.style.top=Math.max(4,r.top+6)+'px';
      const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=selected.has(key);input.setAttribute('aria-label','选择采集 '+id);label.append(input,document.createTextNode('选择'));
      input.addEventListener('change',()=>{input.checked?selected.add(key):selected.delete(key);controls();});
      const button=document.createElement('button');button.textContent='下载';button.disabled=busy||collecting;button.addEventListener('click',()=>void download([collected.get(key)]));card.append(label,button);cards.append(card);
    }
    controls();
  }
  let harvesting=null,lastHarvest=0;
  async function harvest(force=false){
    if(harvesting)return harvesting;
    if(pinId(location.href)||busy||(!force&&Date.now()-lastHarvest<2500))return;
    lastHarvest=Date.now();const current=generation,page=location.href;
    harvesting=(async()=>{try{const r=await send({type:'HUABAN_COLLECT'});
      if(current!==generation||page!==location.href||r.scope!==page)return;
      for(const item of r.items||[]){if(!/^\d{1,22}$/.test(item.id||''))continue;const url=media(item.url);if(!url)continue;const key=keyOf(url);if(!collected.has(key)&&collected.size<2000)collected.set(key,{id:item.id,url});}
      controls();
    }catch(e){if(current===generation&&collected.size===0)status('页面数据读取失败：'+e.message);}finally{harvesting=null;}})();
    return harvesting;
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;scan();});}
  async function download(items,retry=false){
    if(busy)return;const current=generation;busy=true;controls();
    if(!retry)job=items?{id:'batch_'+crypto.randomUUID(),items:items.map(x=>({...x})),title:document.title}:{id:pinId(location.href)};
    if(!job?.id||job.items?.length===0){busy=false;controls();return;}
    status('正在准备批量下载…');$('#retry').hidden=true;$('#show').hidden=true;
    try{await send(job.items?{type:'HUABAN_BATCH',noteId:job.id,items:job.items,title:job.title}:{type:'START',noteId:job.id});if(current!==generation)return;$('#stop').hidden=false;await poll();}
    catch(e){if(current===generation){busy=false;status(e.message);$('#retry').hidden=false;}}
    finally{if(current===generation)controls();}
  }
  async function poll(){
    if(!job||polling)return;polling=true;const active=job,current=generation;
    try{const r=await send({type:'STATUS',noteId:active.id});if(current!==generation||active!==job)return;const p=r.progress;if(!p)return;
      busy=!!p.running;status(`${p.text}\n成功 ${p.done} · 跳过 ${p.failed||0} · 已处理 ${p.processed??p.done}/${p.total}`+(p.warnings?.length?'\n'+p.warnings.join('\n'):''));$('#progress').hidden=false;$('#progress').max=p.total||1;$('#progress').value=p.processed??p.done;$('#stop').hidden=!busy;$('#show').hidden=!p.done;$('#retry').hidden=busy||p.done>=p.total;controls();
    }catch(e){if(current===generation){busy=false;status(e.message);$('#retry').hidden=false;controls();}}finally{polling=false;}
  }
  $('#all').onclick=()=>void download([...collected.values()]);$('#selected').onclick=()=>void download([...selected].map(k=>collected.get(k)).filter(Boolean));$('#detail').onclick=()=>void download(null);
  $('#selectAll').onclick=()=>{for(const key of collected.keys())selected.add(key);scan();};$('#clear').onclick=()=>{selected.clear();scan();};$('#retry').onclick=()=>void download(null,true);
  for(const [selector,type] of [['#stop','STOP'],['#show','SHOW']])$(selector).onclick=async()=>{if(job)try{await send({type,noteId:job.id});await poll();}catch(e){status(e.message);}};
  $('#collapse').onclick=()=>{const body=$('#body');body.hidden=!body.hidden;$('#collapse').textContent=body.hidden?'+':'−';};
  $('#stopCollect').onclick=()=>{collectionToken++;collecting=false;status('已停止收集，已收集图片仍可手动批量下载。');controls();};
  $('#auto').onclick=async()=>{
    if(busy||collecting)return;collecting=true;const token=++collectionToken,current=generation;let stable=0,previous=-1,reachedLimit=false,stuck=0,unrecognized=0;
    try{
      for(let step=0;step<240&&collecting&&token===collectionToken&&current===generation;step++){
        scan();await harvest(true);if(current!==generation||!collecting||token!==collectionToken)break;status(`正在滚动收集：${collected.size} 张。可随时停止。`);
        if(collected.size>=2000){reachedLimit=true;break;}
        const surface=scrollingSurface(),before=scrollTopOf(surface);
        const distance=Math.max(200,viewportOf(surface)*0.7);
        if(isPage(surface))window.scrollBy(0,distance);else surface.scrollBy(0,distance);
        await new Promise(resolve=>setTimeout(resolve,900));if(!collecting||token!==collectionToken||current!==generation||scope!==location.href)break;scan();
        const top=scrollTopOf(surface),bottom=top+viewportOf(surface)>=scrollHeightOf(surface)-12;
        stuck=!bottom&&top===before&&collected.size===previous?stuck+1:0;
        unrecognized=collected.size===previous&&!bottom?unrecognized+1:0;
        if(stuck>=3||unrecognized>=12){collecting=false;status(stuck>=3?'未能滚动图片列表，已停止。请手动滚动后下载已收集图片。':'连续滚动未识别到新图片，已停止。请核对页面图片是否正常加载。');controls();return;}
        stable=collected.size===previous&&bottom?stable+1:0;previous=collected.size;
        if(stable>=7)break;if(step===239)reachedLimit=true;
      }
      if(!collecting||token!==collectionToken||current!==generation||scope!==location.href)return;
      collecting=false;controls();if(!collected.size){status('未识别到图片，请确认画板正常加载后再试。');return;}
      if(reachedLimit){status(`已收集 ${collected.size} 张，达到本次收集上限。请点击“下载已收集”。`);return;}
      await download([...collected.values()]);
    }catch(e){status('收集中断：'+e.message);}finally{if(current===generation&&token===collectionToken){collecting=false;controls();}}
  };
  chrome.runtime.onMessage.addListener(m=>{if(m?.type==='ERROR')status(m.error);});
  window.addEventListener('scroll',schedule,{passive:true,capture:true});window.addEventListener('resize',schedule);
  const observer=new MutationObserver(records=>{if(records.some(r=>r.target!==host&&!host.contains(r.target)))schedule();});
  observer.observe(document.body||document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src','srcset','data-src','data-original','data-srcset','style']});
  scan();setTimeout(()=>void harvest(),200);setInterval(()=>{scan();if(busy)void poll();else void harvest();},1500);
})();
