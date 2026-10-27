// Cache only tweet media/metadata returned by the site's normal timeline requests.
(() => {
  if(window.__redCollectorXV1)return;
  const cache={tweets:Object.create(null),order:[]};window.__redCollectorXV1=cache;
  function collect(root){
    const stack=[root],seen=new WeakSet();let budget=40000;
    while(stack.length&&budget--){
      const n=stack.pop();if(!n||typeof n!=='object'||seen.has(n))continue;seen.add(n);
      const legacy=n.legacy||n,id=legacy.id_str||n.rest_id;
      const media=legacy.extended_entities?.media||legacy.entities?.media;
      if(typeof id==='string'&&/^\d{5,22}$/.test(id)&&Array.isArray(media)&&media.length){
        const user=n.core?.user_results?.result||n.user||{};
        const record={rest_id:id,legacy:{id_str:id,full_text:n.note_tweet?.note_tweet_results?.result?.text||legacy.full_text||legacy.text||'',created_at:legacy.created_at,user_id_str:legacy.user_id_str,extended_entities:{media}},user:{...(user.legacy||{}),...(user.core||{}),id_str:user.rest_id||user.id_str}};
        const old=cache.tweets[id];
        if(!old)cache.order.push(id);
        // A nested legacy-only record must not erase the author from its GraphQL wrapper.
        if(old&&!record.user.screen_name)record.user=old.user;
        if(old&&old.legacy.full_text.length>record.legacy.full_text.length)record.legacy.full_text=old.legacy.full_text;
        cache.tweets[id]=record;
        while(cache.order.length>100)delete cache.tweets[cache.order.shift()];
      }
      for(const v of Object.values(n))if(v&&typeof v==='object')stack.push(v);
    }
  }
  function relevant(value){try{const u=new URL(value,location.href);return u.origin===location.origin&&/^\/i\/api\/graphql\/[^/]+\/(HomeTimeline|HomeLatestTimeline|TweetDetail|TweetResultByRestId|UserTweets|UserTweetsAndReplies|UserMedia|SearchTimeline|ListLatestTweetsTimeline|Bookmarks|Likes)$/.test(u.pathname);}catch{return false;}}
  const originalFetch=window.fetch;
  window.fetch=function(...args){const result=Reflect.apply(originalFetch,this,args);try{
    const request=args[0],url=typeof request==='string'?request:request instanceof URL?request.href:request?.url;
    if(relevant(url))result.then(r=>{if(r.ok&&Number(r.headers.get('content-length'))<=10000000)r.clone().text().then(t=>{if(t.length<=10000000)try{collect(JSON.parse(t));}catch{}}).catch(()=>{});}).catch(()=>{});
  }catch{}return result;};
  const urls=new WeakMap(),open=XMLHttpRequest.prototype.open,send=XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open=function(method,url,...args){urls.set(this,url);return Reflect.apply(open,this,[method,url,...args]);};
  XMLHttpRequest.prototype.send=function(...args){if(relevant(urls.get(this)))this.addEventListener('load',()=>{try{if(this.responseType==='json')collect(this.response);else if((!this.responseType||this.responseType==='text')&&this.responseText.length<=10000000)collect(JSON.parse(this.responseText));}catch{}},{once:true});return Reflect.apply(send,this,args);};
})();
