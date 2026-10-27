// Self-contained function serialized into the page MAIN world on an explicit click.
export function extractXNote(reportErrors=false,requestedId=''){
 try{
  const statusId=value=>{try{return new URL(value,location.href).pathname.match(/\/(?:status|statuses)\/(\d{5,22})(?:\/|$)/)?.[1]||'';}catch{return '';}};
  const id=requestedId||statusId(location.href);
  if(!/^\d{5,22}$/.test(id))throw Error('请点击想保存的那条 X 帖子中的下载按钮，或打开具体帖子。');
  function articleId(article){for(const time of article.querySelectorAll('time')){const a=time.closest('a[href]');const found=a&&statusId(a.href);if(found)return found;}return '';}
  const articles=[...document.querySelectorAll('article[data-testid="tweet"]')],onDetail=statusId(location.href)===id;
  const article=articles.find(a=>articleId(a)===id);
  if(!article&&!onDetail)throw Error('选中的帖子已离开页面，请回到该帖子再下载。');
  const matches=[],seen=new WeakSet();let budget=50000;
  function find(root){const stack=[root];while(stack.length&&budget--){const n=stack.pop();if(!n||typeof n!=='object'||seen.has(n)||n===window||n===document||(typeof Node!=='undefined'&&n instanceof Node))continue;seen.add(n);let d;try{d=Object.getOwnPropertyDescriptors(n);}catch{continue;}
    const legacy=d.legacy?.value||n;const nid=Object.getOwnPropertyDescriptor(legacy,'id_str')?.value||d.rest_id?.value;
    if(String(nid||'')===id)matches.push(n);
    for(const x of Object.values(d))if(x.value&&typeof x.value==='object')stack.push(x.value);
  }}
  find(window.__redCollectorXV1?.tweets?.[id]);find(window.__INITIAL_STATE__);
  // Detail pages may omit the main timestamp. Inspect rendered cards, but
  // accept data only when the actual tweet ID matches the requested URL.
  const roots=article?[article]:onDetail?articles.slice(0,12):[];
  for(const root of roots){
    const nodes=[root,...root.querySelectorAll('*')].slice(0,1600);
    for(const el of nodes){for(const key of Object.getOwnPropertyNames(el)){
      if(key.startsWith('__reactProps$'))find(Object.getOwnPropertyDescriptor(el,key)?.value);
      if(key.startsWith('__reactFiber$')){let f=Object.getOwnPropertyDescriptor(el,key)?.value;const fibers=new Set();for(let i=0;f&&i<30&&!fibers.has(f);i++){fibers.add(f);const p=Object.getOwnPropertyDescriptors(f);find(p.memoizedProps?.value);find(p.pendingProps?.value);f=p.return?.value;}}
    }if(matches.some(n=>(n.legacy||n).extended_entities?.media?.length))break;}
    if(matches.some(n=>(n.legacy||n).extended_entities?.media?.length))break;
  }
  const safe=value=>{if(typeof value!=='string')return '';try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(u.hostname==='pbs.twimg.com'||u.hostname==='video.twimg.com')?u.href:'';}catch{return '';}};
  const originals=value=>{const raw=safe(value);if(!raw)return [];const u=new URL(raw);if(u.hostname!=='pbs.twimg.com')return [];u.pathname=u.pathname.replace(/:(?:small|medium|large|orig)$/,'');u.searchParams.set('name','orig');return [...new Set([u.href,raw])];};
  const mediaMap=new Map();
  // source_status_id_str identifies an original upload, not the attachment's
  // current owner. Include attachments on this exact tweet; never merge quotes.
  for(const n of matches){const l=n.legacy||n;const media=l.extended_entities?.media?.length?l.extended_entities.media:l.entities?.media||[];for(const m of media){const key=m.id_str||m.media_key||m.media_url_https||m.media_url;if(!key)continue;const prev=mediaMap.get(key);if(!prev||(m.video_info?.variants?.length||0)>(prev.video_info?.variants?.length||0))mediaMap.set(key,m);}}
  const assets=[],warnings=[];
  let index=0;
  for(const m of mediaMap.values()){
    const number=String(++index).padStart(3,'0'),cover=originals(m.media_url_https||m.media_url);
    if(m.type==='photo'){if(cover.length)assets.push({kind:'image',group:'图片',name:'image_'+number,originals:cover,fallback:[],width:0,height:0});else warnings.push('第 '+index+' 张图片没有可保存地址。');continue;}
    if(m.type==='video'||m.type==='animated_gif'){
      const variants=(m.video_info?.variants||[]).filter(v=>safe(v.url)&&(/video\/mp4/i.test(v.content_type||'')||/\.mp4(?:\?|$)/i.test(v.url))).sort((a,b)=>(Number(b.bitrate)||0)-(Number(a.bitrate)||0));
      const urls=[...new Set(variants.map(v=>safe(v.url)))];
      if(urls.length)assets.push({kind:'video',group:'视频',name:(m.type==='animated_gif'?'gif_':'video_')+number,originals:urls,fallback:[]});else warnings.push('第 '+index+' 个动态素材没有 MP4 地址；暂不支持仅 HLS、直播或加密流。');
      if(cover.length)assets.push({kind:'image',group:'封面',name:'cover_'+number,originals:cover,fallback:[],width:0,height:0});else warnings.push('第 '+index+' 个视频未提供封面。');
    }
  }
  // Static-photo fallback is limited to links owned by this exact status, excluding quoted posts.
  if(!mediaMap.size&&roots.length){
    const photos=new Set();for(const root of roots)for(const a of root.querySelectorAll('a[href]')){
      if(statusId(a.href)!==id||!new URL(a.href,location.href).pathname.includes('/photo/'))continue;
      for(const img of a.querySelectorAll('img')){const raw=safe(img.currentSrc||img.src);if(raw&&new URL(raw).hostname==='pbs.twimg.com'&&new URL(raw).pathname.startsWith('/media/'))photos.add(raw);}
    }
    for(const raw of photos)assets.push({kind:'image',group:'图片',name:'image_'+String(assets.length+1).padStart(3,'0'),originals:originals(raw),fallback:[],width:0,height:0});
    if(assets.length)warnings.push('仅取得当前帖子可见图片；完整媒体数据未读取到，不能确认是否还含其他素材。');
  }
  if(!assets.length)throw Error('未读到这条 X 帖子的可保存素材。更新后请刷新 X，让帖子重新加载；若只有纯文字、外链或受限媒体，则没有可下载文件。');
  const wrappers=matches.filter(n=>n.core?.user_results?.result||n.user),n=wrappers[0]||matches[0]||{},l=n.legacy||n;
  const user=n.core?.user_results?.result||n.user||{},author=String(user.legacy?.screen_name||user.core?.screen_name||user.screen_name||l.user_id_str||'');
  const ownTime=article&&[...article.querySelectorAll('time')].find(t=>statusId(t.closest('a[href]')?.href)===id);
  const authorPath=ownTime?.closest('a[href]')?.href||(onDetail?location.href:'');let handle='';try{handle=authorPath?new URL(authorPath,location.href).pathname.split('/')[1]:'';if(handle==='i')handle='';}catch{}
  const date=l.created_at||ownTime?.dateTime||null;const time=date&&Number.isFinite(Date.parse(date))?Date.parse(date):null;
  if(!time)warnings.push('未识别到发布时间。');
  const body=n.note_tweet?.note_tweet_results?.result?.text||l.full_text||l.text||article?.querySelector('[data-testid="tweetText"]')?.textContent||'';
  return {noteId:id,platform:'x',source:'https://x.com/'+(author||handle||'i/web')+'/status/'+id,author:author||handle||'未知博主',nickname:String(user.legacy?.name||user.core?.name||user.name||''),time,title:'',text:String(body),assets,warnings,extractedAt:new Date().toISOString()};
 }catch(e){if(!reportErrors)throw e;return {collectorError:'X 帖子读取失败：'+String(e?.message||e)};}
}
