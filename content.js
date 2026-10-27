(() => {
  if (document.getElementById('xhs-collector-host')) return;
  const host = document.createElement('div'); host.id = 'xhs-collector-host';
  host.style.setProperty('position','fixed','important');
  host.style.setProperty('right','28px','important');
  host.style.setProperty('bottom','28px','important');
  host.style.setProperty('top','auto','important');
  host.style.setProperty('left','auto','important');
  host.style.setProperty('z-index','2147483647','important');
  const root = host.attachShadow({mode:'closed'});
  root.innerHTML = `<style>
    :host{all:initial;position:fixed;bottom:28px;right:28px;z-index:2147483647;font-family:system-ui,"Microsoft YaHei",sans-serif}
    button{cursor:pointer;font-family:inherit}#download{border:0;border-radius:18px;background:#ff3158;color:#fff;box-shadow:0 8px 28px #b7193c40;padding:17px 24px;font-size:15px;font-weight:650;display:flex;align-items:center;gap:14px;margin-left:auto}
    #download:hover{background:#e82149}button:focus-visible{outline:3px solid #202431;outline-offset:4px}button:disabled{opacity:.75;cursor:default}
    svg{width:23px;height:23px}small{font-size:11px;display:block;opacity:.85;text-align:left;margin-top:4px}
    #panel{box-sizing:border-box;background:#fff;color:#403139;width:290px;padding:15px;border-radius:16px;font-size:12px;box-shadow:0 5px 25px #0002;margin-bottom:10px}#panel[hidden]{display:none}
    p{margin:0;line-height:1.7;overflow-wrap:anywhere;white-space:pre-line}progress{accent-color:#ff3158;width:100%;height:6px;margin-top:10px}nav{display:flex;gap:14px;margin-top:10px}nav button{border:0;background:none;color:#b52d4b;padding:3px 0;font-size:12px}nav button[hidden]{display:none}
    @media(max-width:700px){:host{right:12px;bottom:16px}}
  </style><div id="panel" hidden><p role="status" aria-live="polite"></p><progress max="1" value="0"></progress><nav><button id="show" hidden>打开文件夹</button><button id="stop" hidden>停止下载</button></nav></div><button id="download" type="button" title="红薯收纳 v1.8.1 · 下载图片、封面、视频和实况" aria-label="下载本帖全部素材"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5"/></svg><span><b>下载本帖全部素材</b><small>原格式图片 · 视频 · Live</small></span></button>`;
  document.documentElement.append(host);
  const $=s=>root.querySelector(s),button=$('#download'),label=$('b'),panel=$('#panel'),status=$('p'),progress=$('progress');
  let current='',polling=false,submitting=false,lastError='';
  async function send(message){
    let timer;
    try{return await Promise.race([chrome.runtime.sendMessage(message),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('插件响应超时。请在扩展管理页重新加载插件，再刷新帖子。')),25000);})]);}
    finally{clearTimeout(timer);}
  }
  const noteId=()=>location.hostname==='www.douyin.com' ? (new URL(location.href).searchParams.get('modal_id')||location.pathname.match(/\/(?:video|note)\/(\d{15,22})(?:\/|$)/)?.[1]||new URL(location.href).searchParams.get('vid')||'') : location.pathname.match(/\/(?:explore|discovery\/item)\/([a-f0-9]{24})(?:\/|$)/i)?.[1] || new URL(location.href).searchParams.get('note_id') || '';
  function resetStatus(){progress.value=0;progress.max=1;progress.hidden=true;$('#stop').hidden=true;$('#show').hidden=true;}
  function error(text){resetStatus();lastError=text;panel.hidden=false;status.textContent='下载未启动或中断：'+text;button.disabled=false;label.textContent='重试下载';}
  async function update(){
    const id=noteId();host.style.display=/^(?:[a-f0-9]{24}|[0-9]{15,22})$/i.test(id)?'block':'none';
    if(id!==current){resetStatus();current=id;lastError='';panel.hidden=true;button.disabled=false;label.textContent='下载本帖全部素材';}
    if(!current || polling || submitting || lastError)return;polling=true;
    try{
      const r=await send({type:'STATUS',noteId:id});
      if(current!==id || submitting || lastError)return;
      if(!r?.ok)throw new Error(r?.error||'无法取得下载进度，请重新加载插件并刷新帖子。');
      const p=r.progress;if(!p)return;
      panel.hidden=false;status.textContent=p.text+'（'+p.done+'/'+p.total+'）'+(p.warnings?.length?'\n'+p.warnings.join('\n'):'');
      progress.hidden=false;progress.max=p.total||1;progress.value=p.done;button.disabled=!!p.running;
      label.textContent=p.running?'正在下载 '+p.done+'/'+p.total:p.done<p.total?'重试未完成素材':'再次下载本帖素材';
      $('#stop').hidden=!p.running;$('#show').hidden=!p.done;
    }catch(e){error(e.message);}finally{polling=false;}
  }
  button.addEventListener('click',async()=>{
    resetStatus();const startedId=noteId();lastError='';submitting=true;button.disabled=true;panel.hidden=false;label.textContent='正在启动…';status.textContent='正在读取本帖素材…（v1.8.1）';
    try{const r=await send({type:'START'});if(noteId()!==startedId)return;if(!r?.ok)throw new Error(r?.error||'未能启动下载，请重新加载插件并刷新帖子。');}
    catch(e){if(noteId()===startedId)error(e.message);}finally{submitting=false;await update();}
  });
  for(const [selector,type] of [['#stop','STOP'],['#show','SHOW']])$(selector).addEventListener('click',async()=>{
    try{const r=await send({type,noteId:current});if(!r?.ok)throw new Error(r?.error||'操作失败');}catch(e){error(e.message);}
  });
  chrome.runtime.onMessage.addListener(m=>{if(m?.type==='ERROR')error(m.error);});
  update();setInterval(update,1500);
})();
