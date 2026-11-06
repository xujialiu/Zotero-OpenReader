(async()=>{
 const s=Zotero.ZoteroTTSRun.state, p=Services.prefs,P='extensions.zotero.zotero-tts.';
 if(!s?.baseline||p.getBoolPref(P+'webdav.enabled')||p.getBoolPref('extensions.zotero.sync.autoSync')||Zotero.Sync.APIClient.prototype.getReadAloudAudio===s.originalAudio||Zotero.HTTP.request===s.originalHTTP)throw new Error('Test gates not held');
 for(const r of Zotero.Reader._readers)if(r._internalReader?._readAloudManager?._active)throw new Error('A user reading is active');
 const restore=name=>{const b=s.baseline.prefs[name];if(!b.user){if(p.prefHasUserValue(name))p.clearUserPref(name);}else if(b.type===32)p.setCharPref(name,b.value);else if(b.type===64)p.setIntPref(name,b.value);else p.setBoolPref(name,b.value);};
 s.restorePref=restore;
 const bounded=async(job,label)=>{let timer;try{return await Promise.race([job,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label+' timed out')),7000);})]);}finally{clearTimeout(timer);}};
 const reader=Zotero.Reader._readers[0];
 if(!reader?._iframeWindow)throw new Error('No ready reader for non-playing synthetic requests');
 const remote=Components.utils.waiveXrays(reader._getReadAloudRemoteInterface(reader._iframeWindow));
 s.directRemote=remote;
 p.setIntPref(P+'readAloud.volume',0);
 p.setCharPref(P+'readAloud.replacements','[]');
 p.setBoolPref(P+'cacheAudio',true);
 Zotero.Debug.setStore(true);
 const results={native:[],system:[]};
 try{
  s.mode='stub';
  for(const tier of ['standard','premium']){
   const source=Object.freeze({text:'中 文',or240Marker:'main-'+tier,sourcePosition:{proof:'unchanged'}});
   const voice={id:'or240-stub-'+tier,cacheVersion:'240-main-'+Date.now()};
   const result=await bounded(remote.getAudio(source,voice),'native '+tier);
   const call=s.nativeCalls[s.nativeCalls.length-1];
   const timing=result.timestamps?.[0];
   const ok=call?.text==='中文'&&call.marker==='main-'+tier&&call.source?.proof==='unchanged'&&source.text==='中 文'&&timing?.charStart===0&&timing?.charEnd===3&&result.noStore===true;
   results.native.push({tier,captured:call,mapped:timing,originalUnchanged:source.text==='中 文',ok});
   if(!ok)throw new Error('Native copied-segment assertion failed');
  }
  s.mode='deny';
  const voice={id:'system::sapi5/TTS_MS_ZH-CN_HUIHUI_11.0',locale:'zh-CN'};
  for(const [original,expected] of [['这 是 中 文。','这是中文。'],['中文 ， 测试。','中文，测试。'],['BNN 结构，第 3 章。','BNN 结构，第 3 章。']]){
   await bounded(remote.forget({text:original},voice),'fresh transport setup');
   const before=s.systemFrames.length;
   const reply=await bounded(remote.getAudio({text:original},voice),'System request');
   const frames=s.systemFrames.slice(before);
   const times=[];for(let i=0;i<(reply.timestamps?.length??0);i++)times.push({start:reply.timestamps[i].start,end:reply.timestamps[i].end,charStart:reply.timestamps[i].charStart,charEnd:reply.timestamps[i].charEnd});
   const ok=frames.length===1&&frames[0].text===expected&&reply.speechText===expected&&times.length>0&&times.every(t=>t.charStart>=0&&t.charEnd<=original.length&&t.charEnd>t.charStart);
   results.system.push({original,expected,actualIPC:frames,bytes:reply.audio?.size,timestamps:times,ok});
   if(!ok)throw new Error('System transport assertion failed');
  }
  await bounded(remote.forget({text:'中 文。'},voice),'fresh cache setup');
  const before=s.systemFrames.length;
  const one=await bounded(remote.getAudio({text:'中 文。'},voice),'first cache text');
  const two=await bounded(remote.getAudio({text:'中  文。'},voice),'shared cache text');
  const afterShared=s.systemFrames.length;
  await bounded(remote.forget({text:'中 文。'},voice),'forget');
  const three=await bounded(remote.getAudio({text:'中 文。'},voice),'fresh cleaned key');
  results.cache={firstRequests:afterShared-before,freshRequests:s.systemFrames.length-afterShared,firstRange:one.timestamps?.[0],secondRange:two.timestamps?.[0],freshRange:three.timestamps?.[0]};
  if(results.cache.firstRequests!==1||results.cache.freshRequests!==1)throw new Error('Cleaned cache/forget assertion failed');
  results.noMeteredNetwork={stubCalls:s.nativeCalls.length,blockedAttempts:s.blockedPaid,APIStubActive:Zotero.Sync.APIClient.prototype.getReadAloudAudio!==s.originalAudio,HTTPGuardActive:Zotero.HTTP.request!==s.originalHTTP};
  results.tappedProcesses=s.tappedProcesses;
  s.directResults=results;
  await IOUtils.writeUTF8(PathUtils.join(s.dir,'direct-transport-results.json'),JSON.stringify(results,null,2));
  return JSON.stringify(results);
 }finally{
  s.mode='deny';
  for(const key of ['cacheAudio','readAloud.volume','readAloud.replacements'])restore(P+key);
 }
})()
