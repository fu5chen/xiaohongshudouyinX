// Self-contained: injected into MAIN world only after an explicit download click.
export function extractDouyinNote(reportErrors=false){
 try {
  const u=new URL(location.href);
  const id=u.searchParams.get('modal_id')||u.pathname.match(/\/(?:video|note)\/(\d{15,22})(?:\/|$)/)?.[1]||u.searchParams.get('vid');
  if(!/^\d{15,22}$/.test(id||''))throw Error('请打开一个具体的抖音视频或图文作品，再点击下载。');
  const matches=[],matched=new WeakSet();
  const visited=new WeakSet();let inspected=0,limit=60000;
  const find=root=>{
    const stack=[root],seen=visited;
    while(stack.length&&inspected++<limit){const n=stack.pop();if(!n||typeof n!=='object'||seen.has(n))continue;seen.add(n);
      if(n===window||n===document||(typeof Node!=='undefined'&&n instanceof Node))continue;
      let fields;try{fields=Object.getOwnPropertyDescriptors(n);}catch{continue;}
      if(String(fields.aweme_id?.value??fields.awemeId?.value??'')===id&&!matched.has(n)){matches.push(n);matched.add(n);}
      for(const field of Object.values(fields)){const v=field.value;if(v&&typeof v==='object')stack.push(v);}
    }
  };
  const cache=window.__redCollectorDouyinV1;
  for(const root of [cache?.notes?.[id],...(cache?.variants?.[id]||[]),window._ROUTER_DATA,window.__INITIAL_STATE__,window.__NEXT_DATA__])find(root);
  for(const el of document.querySelectorAll('script#RENDER_DATA,script#__NEXT_DATA__,script[type="application/json"]')){
    const raw=el.textContent||'';if(raw.length>8000000)continue;
    for(const encoded of [false,true])try{find(JSON.parse(encoded?decodeURIComponent(raw):raw));break;}catch{}
  }
  // Read React's already-rendered props only on an explicit download click.
  // Never execute getters or functions, traverse to the app root, or infer a post from images alone.
  const hasMedia=n=>{
    const post=n.image_post_info||n.imagePostInfo||{};
    return [post.images,post.image_list,post.imageList,n.images,n.image_list,n.imageList,n.image_infos,n.imageInfos,n.original_images,n.originalImages].some(a=>Array.isArray(a)&&a.length)
      ||!!(n.video&&(n.video.play_addr||n.video.playAddr||n.video.bit_rate?.length||n.video.bitRate?.length));
  };
  if(!matches.some(hasMedia)&&document.querySelectorAll){
    limit=90000;
    const elements=[],uniqueElements=new Set();
    const add=el=>{if(el&&!uniqueElements.has(el)){uniqueElements.add(el);elements.push(el);}};
    for(const media of document.querySelectorAll('video,img')){let el=media;for(let i=0;el&&i<18;i++,el=el.parentElement)add(el);if(elements.length>=3000)break;}
    if(elements.length<3000)for(const el of document.querySelectorAll('body *')){add(el);if(elements.length>=3000)break;}
    for(const el of elements){
      let keys;try{keys=Object.getOwnPropertyNames(el);}catch{continue;}
      for(const key of keys){
        if(key.startsWith('__reactProps$'))find(Object.getOwnPropertyDescriptor(el,key)?.value);
        if(key.startsWith('__reactFiber$')){
          let fiber=Object.getOwnPropertyDescriptor(el,key)?.value;
          const visitedFibers=new Set();
          for(let i=0;fiber&&i<35&&!visitedFibers.has(fiber);i++){
            visitedFibers.add(fiber);
            const props=Object.getOwnPropertyDescriptors(fiber);
            find(props.memoizedProps?.value);find(props.pendingProps?.value);
            fiber=props.return?.value;
          }
        }
      }
      if(matches.some(hasMedia)||inspected>=90000)break;
    }
  }
  if(!matches.length)throw Error('当前作品的素材数据未被识别，下载尚未开始。插件暂未兼容此页面的数据结构；继续点击重试不会保证解决。');
  const note=matches[0];
  const domains=['douyin.com','douyinvod.com','douyinpic.com','byteimg.com','ibytedtos.com','bytedance.com','bytecdn.cn','pstatp.com','snssdk.com','iesdouyin.com'];
  const safe=value=>{if(typeof value!=='string')return '';try{const u=new URL(value.startsWith('//')?'https:'+value:value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port||!domains.some(d=>u.hostname===d||u.hostname.endsWith('.'+d)))return '';u.protocol='https:';return u.href;}catch{return '';}};
  const urls=value=>{
    if(typeof value==='string')return [safe(value)].filter(Boolean);
    if(Array.isArray(value))return value.flatMap(urls);
    if(!value||typeof value!=='object')return [];
    return ['url_list','urlList','src','url'].flatMap(key=>urls(value[key]));
  };
  const unique=a=>[...new Set(a.filter(Boolean))];
  const videoURLs=v=>{
    if(!v)return [];
    const rates=[...[v.bit_rate,v.bitRate].filter(Array.isArray).flat()].sort((a,b)=>(Number(b.bit_rate||b.bitRate)||0)-(Number(a.bit_rate||a.bitRate)||0));
    return unique([...rates.flatMap(r=>urls(r.play_addr??r.playAddr)),...urls(v.play_addr??v.playAddr),...urls(v.play_addr_h264),...urls(v.playAddrH264),...urls(v.play_addr_bytevc1),...urls(v.playAddrBytevc1)]);
  };
  const assets=[],warnings=[];
  const lists=matches.flatMap(n=>{const p=n.image_post_info||n.imagePostInfo||{};return [p.images,p.image_list,p.imageList,n.images,n.image_list,n.imageList,n.image_infos,n.imageInfos,n.original_images,n.originalImages];}).filter(a=>Array.isArray(a)&&a.length);
  const score=a=>a.length*1000+a.filter(i=>i&&[i.video,i.live_photo?.video,i.livePhoto?.video,i.live_photo,i.livePhoto].some(v=>videoURLs(v).length)).length;
  lists.sort((a,b)=>score(b)-score(a));const images=lists[0]||[];
  if(Array.isArray(images))images.forEach((item,i)=>{
    if(!item||typeof item!=="object"){warnings.push("第 "+(i+1)+" 张图片的数据格式无法识别。");return;}
    const live=unique([item.video,item.live_photo?.video,item.livePhoto?.video,item.live_photo,item.livePhoto].flatMap(videoURLs));
    const isLive=live.length>0||!!item.live_photo_type||!!item.isLivePhoto||item.clip_type===5||item.clipType===5;
    const name=(isLive?'live_':'image_')+String(i+1).padStart(3,'0');
    const image=unique([...urls(item),...urls(item.origin_image),...urls(item.originImage),...urls(item.display_image),...urls(item.displayImage),...urls(item.image)]);
    if(image.length)assets.push({kind:'image',group:isLive?'Live':'图片',name,originals:image,fallback:[],width:0,height:0});
    else warnings.push('第 '+(i+1)+' 张图片未提供可保存地址。');
    if(live.length)assets.push({kind:'video',group:'Live',name,originals:live,fallback:[]});
    else if(isLive)warnings.push('第 '+(i+1)+' 张实况图未提供动态视频地址。');
  });
  const videos=matches.map(n=>n.video||{});
  if(!images.length){
    const play=unique(videos.flatMap(videoURLs));
    if(play.length)assets.push({kind:'video',group:'视频',name:'video_001',originals:play,fallback:[]});
    else warnings.push('作品未提供可保存的视频流（不支持直播或加密视频）。');
  }
  // Covers are independent of content type: albums and Live posts can have their own cover.
  const cover=unique([...videos,...matches,...matches.map(n=>n.image_post_info||n.imagePostInfo||{})].flatMap(v=>[v.origin_cover,v.originCover,v.cover,v.cover_url,v.coverUrl,v.poster,v.image_post_cover].flatMap(urls)));
  if(cover.length)assets.push({kind:'image',group:'封面',name:'cover_001',originals:cover,fallback:[],width:0,height:0});
  else warnings.push('页面未提供独立封面地址；'+(images.length?'已按图文顺序保存图片。':'封面未保存。'));
  if(!assets.length)throw Error('当前抖音作品没有可保存的图片或视频地址，请等待作品完整加载后重试。');
  const author=matches.map(n=>n.author).find(a=>a&&(a.unique_id||a.uniqueId||a.uid||a.sec_uid||a.secUid))||note.author||{},authorId=String(author.unique_id||author.uniqueId||author.short_id||author.shortId||author.uid||author.sec_uid||author.secUid||'未知博主');
  const time=matches.map(n=>n.create_time??n.createTime).find(Boolean)||null;
  if(!time)warnings.push('页面未提供发布时间。');
  if(authorId==='未知博主')warnings.push('页面未提供博主 ID。');
  return {noteId:id,platform:'douyin',source:location.href,author:authorId,nickname:String(author.nickname||''),time,title:String(note.preview_title||''),text:String(matches.find(n=>n.desc)?.desc||''),assets,warnings,extractedAt:new Date().toISOString()};
 } catch(error) {
   if(!reportErrors)throw error;
   return {collectorError:'抖音作品读取失败：'+String(error?.message||error)};
 }
}
