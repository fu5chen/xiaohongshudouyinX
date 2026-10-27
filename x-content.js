(() => {
  if(window.__redCollectorXUI)return;window.__redCollectorXUI=true;
  const entries=new Map();let detailEntry=null;
  const idOf=url=>{try{return new URL(url,location.href).pathname.match(/\/(?:status|statuses)\/(\d{5,22})(?:\/|$)/)?.[1]||'';}catch{return '';}};
  const articleId=article=>{for(const time of article.querySelectorAll('time')){const link=time.closest('a[href]');const id=link&&idOf(link.href);if(id)return id;}return '';};
  const send=async m=>{let timer;try{const r=await Promise.race([chrome.runtime.sendMessage(m),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('插件响应超时，请重新加载插件后刷新 X。')),25000);})]);if(!r?.ok)throw Error(r?.error||'插件后台没有响应');return r;}finally{clearTimeout(timer);}};
  const css=`:host{all:initial;display:block;font-family:system-ui,"Microsoft YaHei",sans-serif;margin:12px 0;color:#403139}:host([data-floating]){position:fixed!important;bottom:28px!important;right:28px!important;z-index:2147483647!important;margin:0}button{font-family:inherit;cursor:pointer}#download{border:0;border-radius:18px;background:#ff3158;color:white;padding:15px 22px;display:flex;align-items:center;gap:12px;font-size:15px;font-weight:650;box-shadow:0 8px 28px #b7193c40}#download:hover{background:#e82149}#download:disabled{opacity:.75;cursor:default}button:focus-visible{outline:3px solid #648fff;outline-offset:3px}small{display:block;font-size:11px;margin-top:4px;text-align:left}svg{width:23px;height:23px}#panel{box-sizing:border-box;max-width:360px;background:#fff;border-radius:16px;padding:14px;font-size:12px;box-shadow:0 5px 25px #0002;margin-bottom:10px}#panel[hidden],button[hidden],progress[hidden]{display:none}p{margin:0;white-space:pre-line;overflow-wrap:anywhere;line-height:1.7}progress{width:100%;height:6px;accent-color:#ff3158;margin-top:10px}nav{display:flex;gap:14px;margin-top:8px}nav button{border:0;background:none;color:#b52d4b;padding:3px 0}`;
  function create(article,id){
    const host=document.createElement('div');host.dataset.redCollectorX=id;
    const root=host.attachShadow({mode:'closed'});root.innerHTML=`<style>${css}</style><div id="panel" hidden><p role="status" aria-live="polite"></p><progress hidden max="1" value="0"></progress><nav><button id="show" hidden>打开文件夹</button><button id="stop" hidden>停止下载</button></nav></div><button id="download" type="button" title="红薯收纳 v1.8.1 · X 本帖图片、封面和视频"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5"/></svg><span><b>下载本帖全部素材</b><small>原格式图片 · 封面 · MP4</small></span></button>`;
    const $=s=>root.querySelector(s),e={id,article,host,$,running:false,polling:false,submitting:false,lastError:'',checked:false};
    function failure(error){e.lastError=error.message||String(error);e.running=false;$('#panel').hidden=false;$('p').textContent='下载未启动或中断：'+e.lastError;$('progress').hidden=true;$('progress').value=0;$('#stop').hidden=true;$('#show').hidden=true;$('#download').disabled=false;$('b').textContent='重试下载';}
    e.failure=failure;
    $('#download').addEventListener('click',async event=>{event.preventDefault();event.stopPropagation();if(e.submitting)return;e.submitting=true;e.lastError='';$('#download').disabled=true;$('#panel').hidden=false;$('p').textContent='正在读取这条 X 帖子的素材…';$('progress').hidden=true;$('#stop').hidden=true;$('#show').hidden=true;
      try{await send({type:'START',noteId:e.id});e.running=true;e.checked=false;}catch(error){failure(error);}finally{e.submitting=false;await poll(e);}
    });
    for(const [selector,type] of [['#show','SHOW'],['#stop','STOP']])$(selector).addEventListener('click',async event=>{event.preventDefault();event.stopPropagation();try{await send({type,noteId:e.id});e.checked=false;await poll(e);}catch(error){failure(error);}});
    host.addEventListener('click',event=>event.stopPropagation());
    if(article){article.append(host);entries.set(article,e);}else{host.setAttribute('data-floating','');document.documentElement.append(host);}
    return e;
  }
  async function poll(e){if(e.polling||e.submitting||e.lastError||!e.host.isConnected)return;e.polling=true;
    try{const r=await send({type:'STATUS',noteId:e.id});if(e.submitting||e.lastError||!e.host.isConnected)return;e.checked=true;const p=r.progress;if(!p)return;e.running=!!p.running;const $=e.$;$('#panel').hidden=false;$('p').textContent=p.text+'（'+p.done+'/'+p.total+'）'+(p.warnings?.length?'\n'+p.warnings.join('\n'):'');$('progress').hidden=false;$('progress').max=p.total||1;$('progress').value=p.done;$('#download').disabled=e.running;$('b').textContent=e.running?'正在下载 '+p.done+'/'+p.total:p.done<p.total?'重试未完成素材':'再次下载本帖素材';$('#stop').hidden=!e.running;$('#show').hidden=!p.done;
    }catch(error){e.failure(error);}finally{e.polling=false;}
  }
  function scan(){
    const detail=idOf(location.href);
    // A detail page is identified by its URL, even when its timestamp is absent
    // or only a quoted post has a timestamp. Keep the button outside the feed.
    if(detail){
      for(const e of entries.values())e.host.remove();entries.clear();
      if(detailEntry?.id!==detail||!detailEntry?.host.isConnected){detailEntry?.host.remove();detailEntry=create(null,detail);}
      void poll(detailEntry);return;
    }
    if(detailEntry){detailEntry.host.remove();detailEntry=null;}
    for(const [article,e] of entries)if(!article.isConnected||!e.host.isConnected||articleId(article)!==e.id){e.host.remove();entries.delete(article);}
    for(const article of document.querySelectorAll('article[data-testid="tweet"]')){
      const id=articleId(article);if(!id)continue;let e=entries.get(article);if(!e)e=create(article,id);
      if(e.running||!e.checked)void poll(e);
    }
  }
  chrome.runtime.onMessage.addListener(m=>{if(m?.type!=='ERROR')return;const e=detailEntry||entries.values().next().value;if(e)e.failure(Error(m.error));});
  scan();setInterval(scan,1500);
})();
