(async()=>{
 const s=Zotero.ZoteroTTSRun.state,r=s.fixture.reader,ir=Components.utils.waiveXrays(r._internalReader),m=ir._readAloudManager;
 const P='extensions.zotero.zotero-tts.',full=P+'documentReplacements.user/'+s.fixture.key;
 const sleep=ms=>new Promise(a=>setTimeout(a,ms));
 const idx=Zotero.Reader._readers.indexOf(r);
 const report=async()=>JSON.parse(await Zotero.ZoteroTTS.diagnostics.replacements()).readers[idx];
 const setRows=async rows=>{Zotero.Prefs.set('zotero-tts.documentReplacements.user/'+s.fixture.key,JSON.stringify({rows,ts:Date.now()}));Zotero.Prefs.set('zotero-tts.documentReplacementsChanged',String(Date.now()));await sleep(350);};
 const row=readAs=>[{text:'中 文',readAs,mode:'exact',matchCase:true}];
 const run=async(ms=200)=>{r._iframeWindow.document.notifyUserGestureActivation();if(m.paused)ir.toggleReadAloudPaused();await sleep(ms);};
 const pause=()=>{if(m._active&&!m.paused)ir.toggleReadAloudPaused();};
 const out={},host=Zotero.getMainWindow();
 try{
  host.restore();host.focus();host.Zotero_Tabs.select(s.fixture.tabId);
  pause();m.repositionTo(4);await run(220);
  const readyUntil=Date.now()+3000;let started=false;
  while(Date.now()<readyUntil){const e=JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine()).readers.find(x=>x.itemID===s.fixture.itemID);if(e?.session?.playing&&e.session.position===4&&e.session.playbackTime>0.15){started=true;break;}await sleep(40);}
  if(!started)throw new Error('Fixture clip did not start before the paused-edit check');
  pause();await sleep(350);
  const before=s.systemFrames.length;
  await setRows(row('中文'));out.noop=(await report()).lastEdit;
  await setRows([]);out.removal=(await report()).lastEdit;
  out.noopRequests=s.systemFrames.length-before;
  if(out.noop.outcome!=='none'||out.removal.outcome!=='none'||out.noopRequests!==0)throw new Error('No-op edit refetched or changed playback');
  await setRows(row('甲 乙'));out.pausedChange=(await report()).lastEdit;
  if(!out.pausedChange.changed.includes(4))throw new Error('Changed paused speech not invalidated');
  await run(1600);pause();const resumed=await report();out.afterResume=resumed.lastEdit;out.afterResumeHeld=resumed.held;
  if(resumed.held['4']!=='甲 乙。')throw new Error('Resumed reading did not hold the changed speech');
  await setRows([]);pause();m.repositionTo(4);await run(180);
  out.playingAtEdit=!m.paused;
  await setRows(row('甲 乙'));out.playingChange=(await report()).lastEdit;
  await sleep(1400);pause();out.afterPlayingChange=(await report()).lastEdit;
  if(out.playingChange.outcome!=='handoff')throw new Error('Playing edit did not hand over');
  await setRows([{text:'中 文。',readAs:'',mode:'exact',matchCase:true}]);
  pause();m.repositionTo(4);const count=s.systemFrames.length;await run(150);pause();
  const held=(await report()).held;
  out.empty={held:held['4'],hasEmptyIdentity:Object.hasOwn(held,'4')&&held['4']==='',newSystemRequests:s.systemFrames.length-count};
  if(!out.empty.hasEmptyIdentity)throw new Error('Empty speech identity was lost');
  out.voice=m.selectedVoiceID;out.blockedPaid=s.blockedPaid;
  s.editResults=out;
  await IOUtils.writeUTF8(PathUtils.join(s.dir,'edit-results.json'),JSON.stringify(out,null,2));
  return JSON.stringify(out);
 }finally{pause();if(Services.prefs.prefHasUserValue(full))Services.prefs.clearUserPref(full);await sleep(100);host.minimize();}
})()
