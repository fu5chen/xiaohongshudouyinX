export function safePart(value, max = 64) {
  let s = String(value ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').trim();
  s = [...s].slice(0, max).join('').replace(/[. ]+$/g, '').replace(/^\.+/, '');
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s)) s = '_' + s;
  return s || '未命名';
}
export function stamp(value) {
  if (!value) return '时间未知';
  let n = Number(value);
  const d = Number.isFinite(n) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(value);
  if (Number.isNaN(d.getTime())) return '时间未知';
  const parts = new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(d);
  return parts.replace(' ', '_').replace(/:/g, '-');
}
export function folderName(note) {
  return safePart(note.author,32) + '_' + stamp(note.time) + '_' + safePart(note.text || note.title || note.noteId,54) + '_' + note.noteId.slice(-6);
}
export function allowedURL(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && (['pbs.twimg.com','video.twimg.com'].includes(u.hostname) || ["huaban.com","huabanimg.com","hb.aicdn.com","xiaohongshu.com","xhscdn.com","douyin.com","douyinvod.com","douyinpic.com","byteimg.com","ibytedtos.com","bytedance.com","bytecdn.cn","pstatp.com","snssdk.com","iesdouyin.com"].some(d => u.hostname === d || u.hostname.endsWith('.'+d))); 
  } catch { return false; }
}
