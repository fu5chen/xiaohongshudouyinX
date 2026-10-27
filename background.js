import {extractHuabanNote} from './huaban-extractor.js';
import {collectHuabanPage} from './huaban-collector.js';
import {allowedURL} from './shared.js';
import {extractXNote} from './x-extractor.js';
import {extractDouyinNote} from './douyin-extractor.js';
import {extractCurrentNote} from './extractor.js';
const starting=new Map();let creating;
let huabanHeaders;
async function ensureHuabanHeaders(){
  if(!huabanHeaders)huabanHeaders=chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:[1701],addRules:[{
    id:1701,priority:1,action:{type:'modifyHeaders',requestHeaders:[{header:'Referer',operation:'set',value:'https://huaban.com/'}]},
    condition:{initiatorDomains:[chrome.runtime.id],regexFilter:'^https://([a-z0-9-]*hbimg\\.huaban\\.com|([a-z0-9-]+\\.)*huabanimg\\.com|([a-z0-9-]+\\.)*hb\\.aicdn\\.com)/',resourceTypes:['xmlhttprequest']}
  }]}).catch(e=>{huabanHeaders=null;throw Error('花瓣下载请求配置失败，请重新加载扩展：'+e.message);});
  await huabanHeaders;
}
const isX=value=>{try{return ['x.com','www.x.com','twitter.com','www.twitter.com'].includes(new URL(value).hostname);}catch{return false;}};
const isHuaban=value=>{try{return ['huaban.com','www.huaban.com'].includes(new URL(value).hostname);}catch{return false;}};
const validId=(url,id)=>isHuaban(url)?/^(?:loaded|batch_[0-9a-f-]{36}|\d{1,22})$/.test(id||''):(isX(url)?/^\d{5,22}$/:/^(?:[a-f0-9]{24}|[0-9]{15,22})$/i).test(id||'');
const taskId=(url,id)=>isHuaban(url)?'huaban_'+id+(id==='loaded'?'_'+new URL(url).pathname+new URL(url).search:''):isX(url)?'x_'+id:id;
const supported=value=>{try{return ['huaban.com','www.huaban.com','www.xiaohongshu.com','www.douyin.com','x.com','www.x.com','twitter.com','www.twitter.com'].includes(new URL(value).hostname)&&new URL(value).protocol==='https:';}catch{return false;}};
const pageId=value=>{try{const u=new URL(value);if(isHuaban(value))return u.pathname.match(/^\/pins\/(\d{1,22})(?:\/|$)/)?.[1]||'loaded';if(isX(value))return u.pathname.match(/\/(?:status|statuses)\/(\d{5,22})(?:\/|$)/)?.[1]||'';return u.hostname==='www.douyin.com'?(u.searchParams.get('modal_id')||u.pathname.match(/\/(?:video|note)\/(\d{15,22})(?:\/|$)/)?.[1]||u.searchParams.get('vid')||''):(u.pathname.match(/\/(?:explore|discovery\/item)\/([a-f0-9]{24})(?:\/|$)/i)?.[1]||u.searchParams.get('note_id')||'');}catch{return '';}};
const contexts=()=>chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']});
async function bounded(promise,ms,text){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(text)),ms);})]);}finally{clearTimeout(timer);}}
async function workerMessage(message){
  const r=await bounded(chrome.runtime.sendMessage({target:'worker',...message}),8000,'后台处理通信超时，请重新加载插件并刷新帖子。');
  if(!r?.ok)throw Error(r?.error||'后台处理模块未能加载，请完整解压插件后重新加载。');return r;
}
async function ensureWorker(){
  if(creating)return creating;
  creating=(async()=>{
    const existing=await contexts();
    if(!existing.length)await chrome.offscreen.createDocument({url:'runner.html',reasons:['BLOBS'],justification:'在后台并行处理多个帖子、保存原始图片和视频，不打开新页面。'});
    await workerMessage({type:'PING'});
  })();
  try{await creating;}finally{creating=undefined;}
}
async function launch(tab,requestedId,preparedNote){
  if(!chrome.offscreen?.createDocument||!chrome.runtime.getContexts)throw Error('请使用新版桌面 Edge，以支持后台下载。');
  const [result]=preparedNote?[{result:preparedNote}]:await bounded(chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',injectImmediately:true,args:[true,requestedId],func:isHuaban(tab.url)?extractHuabanNote:isX(tab.url)?extractXNote:new URL(tab.url).hostname==='www.douyin.com'?extractDouyinNote:extractCurrentNote}),12000,'读取帖子超时（12秒），请刷新帖子后重试。');
  if(result?.result?.collectorError)throw Error(result.result.collectorError);
  if(!result?.result)throw Error(result?.error?.message||'无法读取帖子，请等待内容显示后刷新重试。');
  const note=result.result;
  if(note.platform==='huaban')await ensureHuabanHeaders();
  if(requestedId&&note.noteId!==requestedId)throw Error('页面切换了作品，请重新点击当前帖子。');
  const identity=taskId(tab.url,note.noteId),pageKey=`page_${tab.id}_${identity}`,noteKey=`noteJob_${identity}`;
  await ensureWorker();
  const stored=await chrome.storage.session.get(noteKey);let job=stored[noteKey];
  let p=job?(await chrome.storage.session.get('progress_'+job))['progress_'+job]:null;
  if(job){
    const state=await workerMessage({type:'TASK_STATUS',job});
    if(state.busy){await chrome.storage.session.set({[pageKey]:{job}});return;}
  }
  if(!job||!p||p.done>=p.total)job=crypto.randomUUID();
  // A refreshed extraction may insert a missing Live clip or cover before saved assets.
  // Reassociate completed results by asset identity, never by the previous array index.
  const previous=await chrome.storage.session.get([job,'result_'+job]);
  const oldAssets=previous[job]?.assets||[],oldResults=previous['result_'+job]||[];
  const assetKey=a=>JSON.stringify([a.kind,a.group,a.name]);
  const saved=new Map(oldAssets.map((a,i)=>[assetKey(a),oldResults[i]]));
  const results=note.assets.map(a=>saved.get(assetKey(a))||null);
  await chrome.storage.session.set({[job]:note,[pageKey]:{job},[noteKey]:job,
    ['result_'+job]:results,
    ['progress_'+job]:{running:true,done:0,total:note.assets.length,text:'正在准备本帖下载…'}});
  try{await workerMessage({type:'START_JOB',job});}
  catch(e){await chrome.storage.session.set({['progress_'+job]:{running:false,done:0,total:note.assets.length,text:e.message}});throw e;}
}
function start(tab,requestedId,preparedNote){
  if(!tab?.id||!supported(tab.url))return Promise.reject(Error('请先打开小红书、抖音、X 帖子或花瓣页面。'));
  // Only duplicate starts for the same post share a promise. Different posts run independently.
  const id=(isX(tab.url)||isHuaban(tab.url))?(requestedId||pageId(tab.url)):pageId(tab.url);if(!validId(tab.url,id))return Promise.reject(Error('请点击想保存的帖子中的下载按钮，或打开具体作品后再下载。'));
  const identity=taskId(tab.url,id);
  if(starting.has(identity))return starting.get(identity).then(async()=>{
    const key=`noteJob_${identity}`,stored=await chrome.storage.session.get(key);
    if(stored[key])await chrome.storage.session.set({[`page_${tab.id}_${identity}`]:{job:stored[key]}});
  });
  const work=launch(tab,id,preparedNote).finally(()=>starting.delete(identity));starting.set(identity,work);return work;
}
function huabanBatch(m,url){
  if(!/^batch_[0-9a-f-]{36}$/.test(m.noteId||'')||!Array.isArray(m.items)||!m.items.length||m.items.length>2000)throw Error('批量任务必须包含 1–2000 张图片。');
  const seen=new Set(),assets=[];
  for(const item of m.items){
    if(!/^(?:\d{1,22}|img_[a-f0-9]{16})$/.test(item?.id||'')||typeof item.url!=='string'||item.url.length>4096||!allowedURL(item.url))throw Error('批量任务包含无效图片。');
    const u=new URL(item.url);
    if(!(u.hostname==='hbimg.huaban.com'||u.hostname.endsWith('-hbimg.huaban.com')||['huabanimg.com','hb.aicdn.com'].some(d=>u.hostname===d||u.hostname.endsWith('.'+d))))throw Error('批量任务包含非花瓣图片地址。');
    const raw=u.href;u.pathname=u.pathname.replace(/_(?:fw|sq|fh|hb|canvas)\d.*$/i,'');
    const large=u.href,key=u.origin+u.pathname;
    if(seen.has(key))continue;seen.add(key);
    assets.push({kind:'image',group:'图片',name:'huaban_'+item.id+'_'+assets.length,originals:[...new Set([raw,large])],fallback:[],width:0,height:0});
  }
  const board=new URL(url).pathname.match(/^\/boards\/(\d+)/)?.[1];
  const title=String(m.title||'花瓣批量下载').slice(0,120);
  return {noteId:m.noteId,platform:'huaban',source:url,author:board?'花瓣画板_'+board:'花瓣',nickname:'花瓣',time:null,title,text:title,assets,warnings:['本批次仅含已收集图片，不保证画板全部内容均已加载。','保存页面有效图片地址的原始文件，不压缩；保留原格式与动图。'],extractedAt:new Date().toISOString()};
}
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  if(m?.target==='worker')return;
  let task;
  if(m?.type==='API'&&sender.id===chrome.runtime.id&&sender.url===chrome.runtime.getURL('runner.html')){
    const calls={get:a=>chrome.storage.session.get(a),set:a=>chrome.storage.session.set(a),download:a=>chrome.downloads.download(a),search:a=>chrome.downloads.search(a),cancel:a=>chrome.downloads.cancel(a),show:a=>chrome.downloads.show(a)};
    if(!calls[m.method])return;task=Promise.resolve().then(()=>calls[m.method](m.arg)).then(value=>({ok:true,value}));
  }else if(sender.tab&&supported(sender.url)&&isHuaban(sender.url)&&m?.type==='HUABAN_COLLECT'){
    task=bounded(chrome.scripting.executeScript({target:{tabId:sender.tab.id},world:'MAIN',func:collectHuabanPage}),8000,'读取花瓣页面数据超时').then(([r])=>({ok:true,...(r?.result||{items:[]})}));
  }else if(sender.tab&&supported(sender.url)&&isHuaban(sender.url)&&m?.type==='HUABAN_BATCH'){
    task=Promise.resolve().then(()=>start(sender.tab,m.noteId,huabanBatch(m,sender.url))).then(()=>({ok:true}));
  }else if(sender.tab&&supported(sender.url)&&m?.type==='START'){
    task=start(sender.tab,m.noteId).then(()=>({ok:true}));
  }else if(sender.tab&&supported(sender.url)&&['STATUS','STOP','SHOW'].includes(m?.type)&&validId(sender.url,m.noteId)){
    task=(async()=>{
      const key=`page_${sender.tab.id}_${taskId(sender.url,m.noteId)}`,job=(await chrome.storage.session.get(key))[key]?.job;
      if(!job)return {ok:true,progress:null};
      const p=(await chrome.storage.session.get('progress_'+job))['progress_'+job];
      if(m.type==='SHOW'){
        const results=(await chrome.storage.session.get('result_'+job))['result_'+job]||[];
        const first=results.find(r=>r?.ok);if(first)await chrome.downloads.show(first.downloadId);
      }
      if((await contexts()).length){
        if(m.type==='STOP')await workerMessage({type:'STOP',job});
        if(p?.running){const state=await workerMessage({type:'TASK_STATUS',job});if(!state.busy)return {ok:true,progress:{...p,running:false,text:'本帖后台任务已中断，可点击重试'}};}
      }else if(p?.running)return {ok:true,progress:{...p,running:false,text:'后台已中断，请重试'}};
      return {ok:true,progress:p};
    })();
  }else return;
  task.then(reply).catch(e=>reply({ok:false,error:e.message}));return true;
});
chrome.action.onClicked.addListener(tab=>start(tab).catch(async e=>{
  if(tab.id)await chrome.tabs.sendMessage(tab.id,{type:'ERROR',error:e.message}).catch(()=>{});
}));
