(async()=>{
 const params=Zotero.ZoteroTTSRun.params;
 const s=Zotero.ZoteroTTSRun.state,p=Services.prefs,P='extensions.zotero.zotero-tts.',win=Zotero.getMainWindow();
 if(p.getBoolPref(P+'webdav.enabled')||p.getBoolPref('extensions.zotero.sync.autoSync'))throw new Error('Both sync gates must be off');
 for(const r of Zotero.Reader._readers)if(r._internalReader?._readAloudManager?._active)throw new Error('User reading active');
 p.setIntPref(P+'readAloud.volume',0);p.setCharPref(P+'readAloud.replacements','[]');
 const voice={id:'system::sapi5/TTS_MS_ZH-CN_HUIHUI_11.0',lang:'zh-CN'};
 Zotero.Prefs.set('zotero-tts.readAloud.defaultVoice',JSON.stringify(voice));
 Zotero.Prefs.set('zotero-tts.readAloud.memory',JSON.stringify({voice}));
 if(s.fixture?.reader && Zotero.Items.get(s.fixture.itemID)) {
  const reader=s.fixture.reader,ir=Components.utils.waiveXrays(reader._internalReader),m=ir._readAloudManager;
  win.restore();win.focus();win.Zotero_Tabs.select(s.fixture.tabId);reader._iframeWindow.document.notifyUserGestureActivation();ir.toggleReadAloudPopup(true);
  const until=Date.now()+7000;while(Date.now()<until&&!m._voice)await new Promise(a=>setTimeout(a,300));
  if(m._active&&!m.paused)ir.toggleReadAloudPaused();
  if(m.selectedVoiceID!==s.fixture.voiceId)throw new Error('Fixture System voice not ready');
  return JSON.stringify({resumedFixture:true,key:s.fixture.key,voice:m.selectedVoiceID,paused:m.paused});
 }
 const item=await Zotero.Attachments.importFromFile({file:PathUtils.join(params.root.replaceAll('/','\\'), 'test','fixtures','text-cleaning','text-cleaning.epub'),libraryID:Zotero.Libraries.userLibraryID,title:'Text cleaning main verification'});
 s.fixture={itemID:item.id,key:item.key,lib:item.libraryID,title:item.getField('title'),voiceId:voice.id,docVoiceKey:'documentVoices.user/'+item.key};
 Zotero.Prefs.set('zotero-tts.'+s.fixture.docVoiceKey,JSON.stringify({voice,manual:true,ts:Date.now()}));
 Zotero.Prefs.set('zotero-tts.documentVoiceChanged',String(Date.now()));
 await Zotero.Reader.open(item.id);
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 let reader;const until=Date.now()+18000;
 while(Date.now()<until){for(const r of Zotero.Reader._readers)if(r.itemID===item.id&&r._internalReader?._readAloudManager&&r._iframeWindow)reader=r;if(reader)break;await sleep(500);}
 if(!reader)throw new Error('Fixture reader did not become ready');
 s.fixture.reader=reader;s.fixture.tabId=reader.tabID;
 win.Zotero_Tabs.select(reader.tabID);win.restore();win.focus();await sleep(500);
 const ir=Components.utils.waiveXrays(reader._internalReader),m=ir._readAloudManager;
 reader._iframeWindow.document.notifyUserGestureActivation();
 ir.toggleReadAloudPopup(true);
 await sleep(1200);
 if(m._active&&!m.paused)ir.toggleReadAloudPaused();
 const segments=[];const a=ir._readAloudSegments?.segments;for(let i=0;i<(a?.length??0);i++)segments.push({text:a[i].text,position:a[i].sourcePosition});
 s.fixture.originalSegments=JSON.stringify(segments);
 const engine=JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
 return JSON.stringify({fixture:{key:item.key,itemID:item.id,tabId:reader.tabID},segments,voice:m.selectedVoiceID,paused:m.paused,engine:engine.readers.find(r=>r.itemID===item.id),tappedProcesses:s.tappedProcesses,frames:s.systemFrames.slice(-7),autoSync:false,folder:false});
})()
