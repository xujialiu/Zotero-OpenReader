(async()=>{
 const s=Zotero.ZoteroTTSRun.state,p=Services.prefs,P='extensions.zotero.zotero-tts.',r=s.fixture.reader,ir=Components.utils.waiveXrays(r._internalReader),m=ir._readAloudManager,win=Zotero.getMainWindow();
 if(p.getBoolPref(P+'webdav.enabled')||p.getBoolPref('extensions.zotero.sync.autoSync'))throw new Error('Sync gates changed');
 const sleep=ms=>new Promise(a=>setTimeout(a,ms));
 const hkeys=['highlight.word','highlight.sentence'];
 for(const n of hkeys){const key=P+n;if(!s.baseline.prefs[key])s.baseline.prefs[key]={type:p.getPrefType(key),user:p.prefHasUserValue(key),value:p.getBoolPref(key)};}
 await s.seal('main-baseline',JSON.stringify(s.baseline));
 const out={samples:[]};
 try{
  for(const n of hkeys)p.setBoolPref(P+n,true);
  win.restore();win.focus();win.Zotero_Tabs.select(s.fixture.tabId);
  if(!m.paused)ir.toggleReadAloudPaused();
  r._iframeWindow.document.notifyUserGestureActivation();
  m.repositionTo(0);
  if(m.paused)ir.toggleReadAloudPaused();
  const end=Date.now()+3600;let last='';
  while(Date.now()<end){
   const diag=JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
   const e=diag.readers.find(v=>v.itemID===s.fixture.itemID);
   const at=m.activeTimestamp;
   if(at&&e?.session?.playing){
    let view;
    for(const raw of [ir._primaryView,ir._lastView,ir._primarySDTView]){if(!raw)continue;const v=Components.utils.waiveXrays(raw);if(v._spotlights&&typeof v.toDisplayedRange==='function'){view=v;break;}}
    const selector=view?._spotlights?.get('ReadAloudActiveSegment');
    const range=selector?view.toDisplayedRange(selector):null;
    const index=e.session.position,source=ir._readAloudSegments.segments[index].text;
    const signature=index+':'+at.charStart+':'+at.charEnd;
    if(signature!==last){
     const rendered=range?String(range):null;
     const expected=source.slice(at.charStart,at.charEnd);
     out.samples.push({index,playbackTime:e.session.playbackTime,audioState:e.audio.state,range:[at.charStart,at.charEnd],timestamp:[at.start,at.end],rendered,expected,rects:range?.getClientRects().length??0,textMatches:rendered===expected});
     last=signature;
    }
   }
   await sleep(40);
  }
  const a=ir._readAloudSegments.segments,now=[];for(let i=0;i<a.length;i++)now.push({text:a[i].text,position:a[i].sourcePosition});
  out.originalSegmentsUnchanged=JSON.stringify(now)===s.fixture.originalSegments;
  out.distinctWords=out.samples.length;
  out.playbackAdvanced=out.samples.length>=3&&out.samples.some(v=>v.playbackTime>0.5);
  out.renderedRangesCorrect=out.samples.length>=3&&out.samples.every(v=>v.textMatches&&v.rects>0&&v.audioState==='running');
  out.paidAttempts=s.blockedPaid;
  s.highlightResults=out;
  await IOUtils.writeUTF8(PathUtils.join(s.dir,'moving-highlight-results.json'),JSON.stringify(out,null,2));
  return JSON.stringify(out);
 }finally{
  if(m._active&&!m.paused)ir.toggleReadAloudPaused();
  for(const n of hkeys)s.restorePref(P+n);
  win.minimize();
 }
})()
