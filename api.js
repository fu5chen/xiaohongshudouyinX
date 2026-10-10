async function call(method,arg) {
  let timer;
  try {
    const r = await Promise.race([chrome.runtime.sendMessage({type:'API',method,arg}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('后台通信超时，请刷新插件后重试。')),20000);})]);
    if (!r?.ok) throw new Error(r?.error || '后台通信失败');return r.value;
  } finally {clearTimeout(timer);}
}
export const api = {
  storage:{session:{get:a=>call('get',a),set:a=>call('set',a)}},
  downloads:{download:a=>call('download',a),search:a=>call('search',a),cancel:a=>call('cancel',a),show:a=>call('show',a),
    onChanged:{addListener(){},removeListener(){}}}
};
