// Observe only Douyin's own work-data responses; do not request additional posts.
(() => {
  if(window.__redCollectorDouyinV1)return;
  const cache={notes:Object.create(null),order:[],variants:Object.create(null)};window.__redCollectorDouyinV1=cache;
  function collect(root){
    const stack=[root],seen=new WeakSet();let count=0;
    while(stack.length&&count++<20000){
      const n=stack.pop();if(!n||typeof n!=='object'||seen.has(n))continue;seen.add(n);
      const id=n.aweme_id??n.awemeId;
      if(typeof id==='string'&&/^\d{15,22}$/.test(id)&&(n.video||n.images||n.image_post_info||n.imagePostInfo||n.image_list||n.imageList||n.image_infos||n.original_images)){
        if(!cache.notes[id])cache.order.push(id);cache.notes[id]=n;
        cache.variants[id]=[n,...(cache.variants[id]||[])].slice(0,3);
        while(cache.order.length>60){const old=cache.order.shift();delete cache.notes[old];delete cache.variants[old];}
        continue;
      }
      for(const v of Object.values(n))if(v&&typeof v==='object')stack.push(v);
    }
  }
  function relevant(value){try{const u=new URL(value,location.href);return u.origin===location.origin&&/^\/aweme\/v\d+\/web\//.test(u.pathname)&&!/comment|search\/suggest|user\/profile/.test(u.pathname);}catch{return false;}}
  const originalFetch=window.fetch;
  window.fetch=function(...args){
    const result=Reflect.apply(originalFetch,this,args);
    try{if(relevant(typeof args[0]==='string'?args[0]:args[0] instanceof URL?args[0].href:args[0]?.url))result.then(response=>{
      if(!response.ok||Number(response.headers.get('content-length'))>8000000)return;
      response.clone().text().then(text=>{if(text.length<=8000000)try{collect(JSON.parse(text));}catch{}}).catch(()=>{});
    }).catch(()=>{});}catch{}
    return result;
  };
  const urls=new WeakMap(),open=XMLHttpRequest.prototype.open,send=XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open=function(method,url,...args){urls.set(this,url);return Reflect.apply(open,this,[method,url,...args]);};
  XMLHttpRequest.prototype.send=function(...args){
    if(relevant(urls.get(this)))this.addEventListener('load',()=>{try{
      if(this.responseType==='json')collect(this.response);
      else if(!this.responseType||this.responseType==='text'){const text=this.responseText;if(text.length<=8000000)collect(JSON.parse(text));}
    }catch{}},{once:true});
    return Reflect.apply(send,this,args);
  };
})();
