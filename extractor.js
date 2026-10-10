// Executed in the page's MAIN world. Keep this function entirely self-contained.
export function extractCurrentNote() {
  const id = location.pathname.match(/\/(?:explore|discovery\/item)\/([a-f0-9]{24})(?:\/|$)/i)?.[1]
    || new URL(location.href).searchParams.get('note_id');
  if (!id || !/^[a-f0-9]{24}$/i.test(id)) throw new Error('请先打开一个具体的小红书帖子，再点击下载。');
  const unwrap = v => v && typeof v === 'object' ? (v._rawValue ?? v._value ?? v) : v;
  const state = unwrap(window.__INITIAL_STATE__);
  const map = unwrap(unwrap(state?.note)?.noteDetailMap);
  let note = unwrap(unwrap(map?.[id])?.note);
  if (!note) {
    const candidates = [unwrap(unwrap(map?.['-1'])?.note), unwrap(state?.noteData?.data?.noteData)];
    note = candidates.find(n => (n?.noteId || n?.note_id || n?.id) === id);
  }
  if (!note || (note.noteId && note.noteId !== id)) throw new Error('当前帖子数据尚未就绪。请刷新帖子、等待图片显示后重试；如仍失败，可能是网站数据结构已变更。');
  // Only return URLs from the two media domains, never arbitrary page-provided addresses.
  const safe = value => {
    if (typeof value !== 'string') return '';
    try {
      const u = new URL(value.startsWith('//') ? 'https:' + value : value);
      if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.port) return '';
      if (!['xhscdn.com', 'xiaohongshu.com'].some(d => u.hostname === d || u.hostname.endsWith('.' + d))) return '';
      u.protocol = 'https:'; return u.href;
    } catch { return ''; }
  };
  const unique = a => [...new Set(a.filter(Boolean))];
  const videoURLs = v => {
    if (!v) return [];
    const stream = v.media?.stream || v.stream || {};
    const list = Object.values(stream).flat().filter(x => x && typeof x === 'object');
    list.sort((a,b) => (Number(b.width || 0) * Number(b.height || 0) - Number(a.width || 0) * Number(a.height || 0)) || (Number(b.videoBitrate || 0) - Number(a.videoBitrate || 0)));
    const key = v.consumer?.originVideoKey;
    return unique([key && /^[a-zA-Z0-9_/.\-]+$/.test(key) ? safe('https://sns-video-bd.xhscdn.com/' + key) : '',
      ...list.flatMap(s => [safe(s.masterUrl), ...(s.backupUrls || []).map(safe)]), safe(v.url), safe(v.masterUrl)]);
  };
  const imageURLs = item => {
    const supplied = unique([safe(item.urlDefault), safe(item.url), ...(item.infoList || []).map(x => safe(x.url)), safe(item.urlPre)]);
    const originals = [];
    for (const raw of supplied) {
      const u = new URL(raw);
      // Signed webpic paths contain a signature and expiration prefix before the image token.
      if (/^sns-webpic[\w-]*\.xhscdn\.com$/.test(u.hostname)) {
        const token = u.pathname.split('/').slice(3).join('/').split('!')[0];
        if (token && /^[a-zA-Z0-9_/.\-]+$/.test(token)) {
          originals.push('https://ci.xiaohongshu.com/' + token + '?imageView2/format/png');
          originals.push('https://sns-img-bd.xhscdn.com/' + token);
        }
      }
      if (/^(sns-img[\w-]*\.xhscdn\.com|ci\.xiaohongshu\.com)$/.test(u.hostname)) {
        originals.push(u.origin + u.pathname.split('!')[0]);
      }
    }
    return {originals: unique(originals), fallback: supplied};
  };
  const assets = [], warnings = [];
  const images = Array.isArray(note.imageList) ? note.imageList : [];
  images.forEach((item, index) => {
    const number = String(index + 1).padStart(3, '0');
    const live = unique([...videoURLs(item.video), ...videoURLs(item.livePhoto), ...videoURLs(item)]);
    const isLive = live.length > 0 || item.livePhoto || item.isLivePhoto || item.livePhotoFlag;
    const group = isLive ? 'Live' : note.type === 'video' ? '封面' : '图片';
    const name = (isLive ? 'live_' : 'image_') + number;
    const urls = imageURLs(item);
    assets.push({kind:'image', group, name, ...urls, width: Number(item.width) || 0, height: Number(item.height) || 0});
    if (live.length) assets.push({kind:'video', group:'Live', name, originals: live, fallback: []});
    else if (isLive) warnings.push('第 ' + (index + 1) + ' 张为 Live，但页面未提供动态视频地址。');
  });
  const videos = videoURLs(note.video);
  if (videos.length) assets.push({kind:'video', group:'视频', name:'video_001', originals: videos, fallback: []});
  else if (note.type === 'video') warnings.push('此帖为视频帖，但页面未提供可下载的视频地址。');
  if (!assets.length) throw new Error('帖子中没有可识别的素材。请等待页面完整加载后重试。');
  const user = note.user || {};
  const author = String(user.redId || user.red_id || user.userId || user.user_id || '未知博主');
  if (author === '未知博主') warnings.push('页面未提供博主 ID。');
  if (!note.time) warnings.push('页面未提供发布时间，文件夹将标记为时间未知。');
  return {noteId:id, source:location.href, author, nickname:String(user.nickname || ''), time:note.time || null,
    title:String(note.title || ''), text:String(note.desc || ''), assets, warnings, extractedAt: new Date().toISOString()};
}
