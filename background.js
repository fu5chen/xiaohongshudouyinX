import {extractCurrentNote} from './extractor.js';
const starting=new Map();let creating;
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
    if(!existing.length)await chrome.offscreen.createDocument({url:'runner.html',reasons:['BLOBS'],justification:'在后台并行处理多个帖子、压缩 PNG 和保存视频，不打开新页面。'});
    await workerMessage({type:'PING'});
  })();
  try{await creating;}finally{creating=undefined;}
}
async function launch(tab){
  if(!chrome.offscreen?.createDocument||!chrome.runtime.getContexts)throw Error('请使用新版桌面 Edge，以支持后台下载。');
  const [result]=await bounded(chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',injectImmediately:true,func:extractCurrentNote}),12000,'读取帖子超时（12秒），请刷新帖子后重试。');
  if(!result?.result)throw Error(result?.error?.message||'无法读取帖子，请等待内容显示后刷新重试。');
  const note=result.result,pageKey=`page_${tab.id}_${note.noteId}`,noteKey=`noteJob_${note.noteId}`;
  await ensureWorker();
  const stored=await chrome.storage.session.get(noteKey);let job=stored[noteKey];
  let p=job?(await chrome.storage.session.get('progress_'+job))['progress_'+job]:null;
  if(job){
    const state=await workerMessage({type:'TASK_STATUS',job});
    if(state.busy){await chrome.storage.session.set({[pageKey]:{job}});return;}
  }
  if(!job||!p||p.done>=p.total)job=crypto.randomUUID();
  await chrome.storage.session.set({[job]:note,[pageKey]:{job},[noteKey]:job,
    ['progress_'+job]:{running:true,done:0,total:note.assets.length,text:'正在准备本帖下载…'}});
  try{await workerMessage({type:'START_JOB',job});}
  catch(e){await chrome.storage.session.set({['progress_'+job]:{running:false,done:0,total:note.assets.length,text:e.message}});throw e;}
}
function start(tab){
  if(!tab?.id||!/^https:\/\/www\.xiaohongshu\.com\//.test(tab.url||''))return Promise.reject(Error('请先打开具体的小红书帖子。'));
  // Only duplicate starts for the same post share a promise. Different posts run independently.
  const id=tab.url.match(/\/(?:explore|discovery\/item)\/([a-f0-9]{24})/i)?.[1]||tab.url;
  if(starting.has(id))return starting.get(id).then(async()=>{
    const key=`noteJob_${id}`,stored=await chrome.storage.session.get(key);
    if(stored[key])await chrome.storage.session.set({[`page_${tab.id}_${id}`]:{job:stored[key]}});
  });
  const work=launch(tab).finally(()=>starting.delete(id));starting.set(id,work);return work;
}
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  if(m?.target==='worker')return;
  let task;
  if(m?.type==='API'&&sender.id===chrome.runtime.id&&sender.url===chrome.runtime.getURL('runner.html')){
    const calls={get:a=>chrome.storage.session.get(a),set:a=>chrome.storage.session.set(a),download:a=>chrome.downloads.download(a),search:a=>chrome.downloads.search(a),cancel:a=>chrome.downloads.cancel(a),show:a=>chrome.downloads.show(a)};
    if(!calls[m.method])return;task=Promise.resolve().then(()=>calls[m.method](m.arg)).then(value=>({ok:true,value}));
  }else if(sender.tab&&/^https:\/\/www\.xiaohongshu\.com\//.test(sender.url||'')&&m?.type==='START'){
    task=start(sender.tab).then(()=>({ok:true}));
  }else if(sender.tab&&['STATUS','STOP','SHOW'].includes(m?.type)&&/^[a-f0-9]{24}$/i.test(m.noteId||'')){
    task=(async()=>{
      const key=`page_${sender.tab.id}_${m.noteId}`,job=(await chrome.storage.session.get(key))[key]?.job;
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
