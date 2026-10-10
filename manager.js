import {api} from './api.js';
import {folderName, stamp, allowedURL} from './shared.js';
import {liveMOV} from './live-photo.js';
import {compressPNG} from './png-limit.js';

export function createJob(job) {
const elements=new Map();
const $=id=>{if(!elements.has(id))elements.set(id,document.createElement('div'));return elements.get(id);};
let note, folder, running = false, stopped = false, firstDownload, results = [], rows = [];
let pairIds = {}, liveFiles = {};
const controllers=new Set(), activeDownloads=new Set();
let saves=Promise.resolve();
const ext = a => a.kind === 'image' ? '.png' : a.group === 'Live' ? '.mov' : '.mp4';
const baseName = a => a.group === 'Live' ? a.name + '_' + pairIds[a.name].slice(0,8) : a.name;
const assetDirectory = a => `${folder}/${a.kind === 'image' ? '图片' : a.group === 'Live' ? 'MOV' : '视频'}`;
const assetPath = a => `${assetDirectory(a)}/${baseName(a)}${ext(a)}`;
function setRow(i, text, kind = '') { rows[i].textContent = text; rows[i].className = 'result ' + kind; }
function message(e) { return e?.message || String(e); }
async function publishProgress(text) {
  if (!note) return;
  await api.storage.session.set({['progress_' + job]:{running,done:results.filter(r=>r?.ok).length,
    total:note.assets.length,text:text || $('status').textContent,warnings:[...note.warnings,...results.filter(r=>r && !r.ok).map(r=>r.error)]}});
}
async function saveLiveFile(blob,path) {
  if (stopped) throw new Error('已停止');
  const previous=liveFiles[path];
  if(previous!==undefined){const [item]=await api.downloads.search({id:previous});if(item?.state==='complete' && item.exists!==false)return previous;}
  const id=await saveBlob(blob,path);liveFiles[path]=id;
  await api.storage.session.set({['liveFiles_'+job]:liveFiles});return id;
}
async function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  let id;
  try {
    id = await api.downloads.download({url, filename, saveAs:false, conflictAction:'uniquify'});
    activeDownloads.add(id);
    if(stopped){await api.downloads.cancel(id).catch(()=>{});throw Error("已停止");}
    await new Promise((resolve,reject) => {
      let finished = false;
      const finish = error => {
        if (finished) return; finished = true;
        api.downloads.onChanged.removeListener(onChanged); clearInterval(poll);
        error ? reject(new Error(error)) : resolve();
      };
      const inspect = item => {
        if (!item) finish('下载记录已移除');
        else if (item.state === 'complete') finish();
        else if (item.state === 'interrupted') finish('下载中断：' + (item.error || '请检查下载设置'));
      };
      const onChanged = delta => {
        if (delta.id !== id) return;
        if (delta.state?.current === 'complete') finish();
        else if (delta.state?.current === 'interrupted') finish('下载中断：' + (delta.error?.current || '请重试'));
      };
      api.downloads.onChanged.addListener(onChanged);
      const poll = setInterval(() => api.downloads.search({id}).then(items => inspect(items[0])).catch(e => finish(message(e))), 300);
      api.downloads.search({id}).then(items => inspect(items[0])).catch(e => finish(message(e)));
    });
    firstDownload ??= id; $('show').disabled = false;
    return id;
  } finally { activeDownloads.delete(id); URL.revokeObjectURL(url); }
}
async function obtain(url, kind) {
  if (!allowedURL(url)) throw new Error('资源地址不在允许的媒体域名中');
  const controller = new AbortController();controllers.add(controller);
  const timer = setTimeout(() => controller.abort(), 180000);
  try {
    const response = await fetch(url, {credentials:'omit', signal:controller.signal, referrerPolicy:'no-referrer'});
    if (!response.ok) throw new Error('资源服务器返回 HTTP ' + response.status);
    if (!allowedURL(response.url)) throw new Error('资源重定向到了未支持的域名');
    const mime = response.headers.get('content-type') || '';
    if (/text\/|json|mpegurl/i.test(mime)) throw new Error('服务器未返回可保存的图片或视频');
    const limit = 512 * 1024 * 1024;
    if (Number(response.headers.get('content-length')) > limit) throw new Error('单文件超过 512 MB，当前版本不支持');
    const reader = response.body.getReader(), chunks = []; let size = 0;
    while (true) {
      const {value,done} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error('单文件超过 512 MB，当前版本不支持'); }
      chunks.push(value);
    }
    const blob = new Blob(chunks, {type:mime});
    if (!blob.size) throw new Error('资源文件为空');
    if (kind === 'image') {
      return await compressPNG(blob,{cancelled:()=>stopped});
    }
    const head = new Uint8Array(await blob.slice(0,64).arrayBuffer());
    const box = String.fromCharCode(...head.slice(4,8));
    if (!['ftyp','moov','mdat','free','wide'].includes(box)) throw new Error('不是支持的 MP4/MOV 视频容器（暂不支持 HLS）');
    return {blob:new Blob([blob], {type:'video/mp4'})};
  } finally { clearTimeout(timer); controllers.delete(controller); }
}
async function downloadAsset(asset, index) {
  const candidates = [...asset.originals.map(url => ({url,fallback:false})), ...($('fallback').checked ? asset.fallback.map(url => ({url,fallback:true})) : [])];
  const seen = new Set(); let last = '没有可用原图地址；可勾选允许页面显示图后重试';
  for (const candidate of candidates) {
    if (stopped) throw new Error('已停止');
    if (seen.has(candidate.url)) continue; seen.add(candidate.url);
    const statusText=`第 ${index+1}/${note.assets.length} 项：正在连接素材服务器（候选 ${seen.size}）…`;
    setRow(index,statusText);await publishProgress(statusText);
    let media;
    try {
      media = await obtain(candidate.url, asset.kind);
      if (!candidate.fallback && asset.kind === 'image' && asset.width && asset.height && (media.sourceWidth < asset.width || media.sourceHeight < asset.height)) throw new Error('候选图分辨率低于页面标注尺寸');
    } catch(e) { last = message(e); continue; }
    if (stopped) throw new Error('已停止');
    setRow(index, '正在保存到本地…');
    await publishProgress(`第 ${index+1}/${note.assets.length} 项：正在保存，请留意 Edge 下载提示`);
    let downloadId, downloadIds;
    if(asset.group === 'Live'){
      const id=pairIds[asset.name];
      if(asset.kind === 'image'){
        downloadId=await saveLiveFile(media.blob,assetPath(asset));
        downloadIds=[downloadId];
      }else{
        let mov;
        try {mov=liveMOV(new Uint8Array(await media.blob.arrayBuffer()),id);}
        catch(e){last=message(e);continue;}
        downloadId=await saveLiveFile(new Blob([mov.bytes],{type:'video/quicktime'}),assetPath(asset));
        downloadIds=[downloadId];
      }
    }else{downloadId=await saveBlob(media.blob,assetPath(asset));downloadIds=[downloadId];}
    return {ok:true,downloadId,downloadIds,path:assetPath(asset),url:candidate.url,fallback:candidate.fallback,width:media.width,height:media.height,compressed:!!media.compressed,
      bytes:media.blob.size, watermark:'未自动验证水印；未进行图像去水印处理'};
  }
  throw new Error(last);
}
async function persist() { saves=saves.catch(()=>{}).then(()=>api.storage.session.set({['result_' + job]:results}));await saves; }
function updateProgress() {
  const done = results.filter(r => r?.ok).length;
  $('progress').max = note.assets.length; $('progress').value = done;
  $('count').textContent = `${done} / ${note.assets.length}`;
  return done;
}
async function run() {
  if (running) return;
  running = true; $('retry').disabled = true; $('fallback').disabled = true; $('stop').disabled = false;
  $('retry').textContent = '正在收纳…'; $('status').textContent = '正在获取素材，请保留此页';
  await publishProgress('正在下载本帖素材…');
  let taskError = '';
  try {
    let next=0;
    async function worker(){
    while(next < note.assets.length) {
      const i=next++;
      if (stopped) break;
      if (results[i]?.ok) continue;
      try {
        results[i] = await downloadAsset(note.assets[i],i);
        setRow(i, results[i].compressed ? '已保存 · 已压缩到 3 MB 内' : results[i].fallback ? '已保存 · 页面显示图' : '已保存 · 水印未验证', 'ok');
      } catch(e) { results[i] = {ok:false,error:message(e)}; setRow(i,message(e),'fail'); }
      await persist(); updateProgress(); await publishProgress('正在并行下载本帖素材…');
    }
    }
    const completed=await Promise.allSettled(Array.from({length:Math.min(3,note.assets.length)},worker));
    const failed=completed.find(r=>r.status==='rejected');if(failed)throw failed.reason;
  } catch(e) { taskError = '；任务异常：' + message(e); }
  finally {
    running = false; $('stop').disabled = true; $('retry').disabled = false; $('fallback').disabled = false;
    const done = updateProgress();
    $('status').textContent = (stopped ? '已停止' : done === note.assets.length ? '已保存所有已识别素材' : '部分素材未保存') + taskError;
    $('summary').textContent = `${done} 个已保存 · ${note.assets.length - done} 个未保存`;
    $('retry').textContent = done === note.assets.length ? '已完成' : '重试未完成素材';
    await publishProgress();
  }
}
async function init() {
  if (!job) { const data = await api.storage.session.get('lastError'); throw new Error(data.lastError || '请从小红书帖子点击插件按钮启动。'); }
  const stored = await api.storage.session.get([job,'result_'+job,'pairs_'+job,'liveFiles_'+job]); note = stored[job];
  if (!note) throw new Error('任务已过期。请返回帖子，重新点击下载按钮。');
  results = stored['result_'+job] || [];
  pairIds=stored['pairs_'+job] || {};liveFiles=stored['liveFiles_'+job] || {};
  for(const a of note.assets)if(a.group==='Live')pairIds[a.name] ||= crypto.randomUUID().toUpperCase();
  await api.storage.session.set({['pairs_'+job]:pairIds});
  // A file removed from disk or history must not remain marked as successfully saved.
  for (let i = 0; i < results.length; i++) {
    if (!results[i]?.ok) continue;
    const ids=results[i].downloadIds || [results[i].downloadId];
    const items=await Promise.all(ids.map(async id=>(await api.downloads.search({id}))[0]));
    if (items.some(item=>!item || item.state !== 'complete' || item.exists === false)) results[i] = undefined;
    else firstDownload ??= items[0].id;
  }
  $('show').disabled = firstDownload === undefined;
  folder = folderName(note); $('folder').textContent = folder;
  $('title').textContent = note.title || note.text.slice(0,70) || '未命名笔记';
  $('author').textContent = `${note.nickname || '博主'} · ID ${note.author} · ${stamp(note.time)}（北京时间）`;
  $('images').textContent = note.assets.filter(a => a.kind === 'image' && a.group !== 'Live').length;
  $('videos').textContent = note.assets.filter(a => a.kind === 'video' && a.group !== 'Live').length;
  $('lives').textContent = note.assets.filter(a => a.group === 'Live' && a.kind === 'image').length;
  $('warnings').textContent = note.warnings.join('\n');
  note.assets.forEach((a,i) => {
    const li = document.createElement('li'), icon = document.createElement('span'), name = document.createElement('span'), detail = document.createElement('small'), state = document.createElement('span');
    icon.className = 'fileicon'; icon.textContent = a.group === 'Live' ? 'LIVE' : a.kind === 'image' ? 'PNG' : 'MP4';
    name.className = 'filename'; name.textContent = a.group + ' / ' + baseName(a) + ext(a);
    detail.textContent = a.group==='Live' ? (a.kind==='image'?'PNG 静态图，最大 3 MB':'MOV 动态视频，统一存入 MOV 文件夹') : a.kind === 'image' ? 'PNG 最大 3 MB，按需缩小尺寸' : '原始视频流，不重新编码';
    name.append(detail); li.append(icon,name,state); $('list').append(li); rows.push(state);
    setRow(i, results[i]?.ok ? '已保存' : '等待下载', results[i]?.ok ? 'ok' : '');
  });
  await run();
}
async function stop(){stopped=true;for(const c of controllers)c.abort();await Promise.all([...activeDownloads].map(id=>api.downloads.cancel(id).catch(()=>{})));}
return {stop,start:async()=>{try{await init();}catch(e){running=false;await api.storage.session.set({['progress_'+job]:{running:false,done:results.filter(r=>r?.ok).length,total:note?.assets.length||0,text:message(e),warnings:[]}});}},get running(){return running;}};

}
