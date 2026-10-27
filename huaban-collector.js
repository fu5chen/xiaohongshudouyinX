// Serialized by chrome.scripting into MAIN; no network interception or requests.
export function collectHuabanPage(){
  const scope=location.href,board=location.pathname.match(/^\/boards\/(\d+)/)?.[1]||'';
  const items=new Map(),seen=new WeakSet(),visible=new Set();let budget=35000;
  const safe=value=>{try{if(typeof value!=='string')return '';const u=new URL(value,scope);return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&(u.hostname==='hbimg.huaban.com'||u.hostname.endsWith('-hbimg.huaban.com')||['huabanimg.com','hb.aicdn.com'].some(d=>u.hostname===d||u.hostname.endsWith('.'+d)))?u.href:'';}catch{return '';}};
  for(const a of document.querySelectorAll('a[href*="/pins/"]')){try{const u=new URL(a.href,scope);if(u.hostname===location.hostname){const id=u.pathname.match(/^\/pins\/(\d+)/)?.[1];if(id)visible.add(id);}}catch{}}
  function find(root,inBoard=false){const stack=[[root,inBoard]];
    while(stack.length&&budget-->0&&items.size<2000){const [n,parentBoard]=stack.pop();
      if(!n||typeof n!=='object'||seen.has(n)||(typeof Node!=='undefined'&&n instanceof Node))continue;seen.add(n);
      let d;try{d=Object.getOwnPropertyDescriptors(n);}catch{continue;}
      const ownBoard=String(d.board_id?.value||''),isBoard=board&&String(d.id?.value||'')===board&&Array.isArray(d.pins?.value);
      const within=ownBoard?ownBoard===board:parentBoard||isBoard;
      const id=String(d.pin_id?.value||'');
      if(/^\d{1,22}$/.test(id)&&(!board||within||visible.has(id))){
        const file=d.file?.value;if(file&&typeof file==='object'){
          const f=Object.getOwnPropertyDescriptors(file),key=f.key?.value,type=String(f.type?.value||'');
          if(!type||type.startsWith('image/')){
            const url=safe(f.url?.value)||safe(f.orig?.value)||(typeof key==='string'&&/^[a-z0-9_-]{20,}$/i.test(key)?'https://gd-hbimg.huaban.com/'+key:'');
            if(url)items.set(id,{id,url});
          }
        }
      }
      for(const [key,v] of Object.entries(d))if(!['return','child','sibling','stateNode','_owner'].includes(key)&&v.value&&typeof v.value==='object')stack.push([v.value,within]);
    }
  }
  find(window.__INITIAL_STATE__);find(window.__NEXT_DATA__);find(window.app?.page);
  for(const script of document.querySelectorAll('script[type="application/json"]')){if(script.textContent.length<4000000)try{find(JSON.parse(script.textContent));}catch{}}
  const inspected=new WeakSet();
  for(const img of document.querySelectorAll('img,canvas')){
    let el=img;for(let depth=0;el&&depth<8&&budget>0;depth++,el=el.parentElement){
      if(inspected.has(el))break;inspected.add(el);
      for(const key of Object.getOwnPropertyNames(el)){
        if(key.startsWith('__reactProps$'))find(Object.getOwnPropertyDescriptor(el,key)?.value);
        if(key.startsWith('__reactFiber$')){let f=Object.getOwnPropertyDescriptor(el,key)?.value;
          for(let i=0;f&&i<16&&budget>0;i++){const d=Object.getOwnPropertyDescriptors(f);find(d.memoizedProps?.value);f=d.return?.value;}
        }
      }
    }
  }
  return {scope,items:[...items.values()]};
}
