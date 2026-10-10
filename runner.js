import {createJob} from './manager.js';
const tasks=new Map();
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  if(m?.target!=='worker'||sender.id!==chrome.runtime.id)return;
  if(m.type==='PING'){reply({ok:true});return;}
  if(!/^[0-9a-f-]{36}$/i.test(m.job||''))return;
  if(m.type==='TASK_STATUS'){reply({ok:true,busy:tasks.get(m.job)?.busy||false});return;}
  if(m.type==='START_JOB'){
    if(tasks.get(m.job)?.busy){reply({ok:true});return;}
    const instance=createJob(m.job),entry={instance,busy:true};tasks.set(m.job,entry);
    instance.start().catch(e=>console.error('下载任务异常',e)).finally(()=>{entry.busy=false;tasks.delete(m.job);});
    reply({ok:true});return;
  }
  if(m.type==='STOP'){
    Promise.resolve(tasks.get(m.job)?.instance.stop()).then(()=>reply({ok:true})).catch(e=>reply({ok:false,error:e.message}));return true;
  }
});
