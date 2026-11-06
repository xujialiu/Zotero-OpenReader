// Windows live case baseline. Fail before mutations if another reading is active.
// An interrupted main-session run can explicitly resume its retained baseline.
(async()=>{
 const run=Zotero.ZoteroTTSRun,params=run.params,ps=Services.prefs,P='extensions.zotero.zotero-tts.';
 if(params.resumeMain){
  const retained=Zotero.__OR240Main;
  if(!retained?.baseline||!retained.originalAudio||!retained.originalHTTP)throw new Error('Retained originals unavailable');
  if(Services.prefs.getBoolPref(P+'webdav.enabled')||Services.prefs.getBoolPref('extensions.zotero.sync.autoSync')||Zotero.Sync.APIClient.prototype.getReadAloudAudio===retained.originalAudio||Zotero.HTTP.request===retained.originalHTTP)throw new Error('Completed or unguarded runs cannot resume functional checks');
  run.state=retained;
  return JSON.stringify({resumedOriginalBaseline:true,folder:ps.getBoolPref(P+'webdav.enabled'),autoSync:ps.getBoolPref('extensions.zotero.sync.autoSync'),paidGuardsActive:Zotero.Sync.APIClient.prototype.getReadAloudAudio!==retained.originalAudio});
 }
 const s=run.state;
 s.fixtureDocId='sha256:9dbe0575a2de900ca514689fb2d34bb7bba6a983f0f27cfcea2bc99f47951eb2';
 if(s.baseline)throw new Error('Never replace an existing baseline');
 if(!Zotero.isWin)throw new Error('This IPC-capture kit requires Windows');
 for(const r of Zotero.Reader._readers)if(r._internalReader?._readAloudManager?._active)throw new Error('Close readings before this isolated case');
 if(Zotero.Sync.Runner.syncInProgress)throw new Error('Zotero sync must be idle');
 const snap=name=>{const type=ps.getPrefType(name);return{type,user:ps.prefHasUserValue(name),value:type===128?ps.getBoolPref(name):type===64?ps.getIntPref(name):type===32?ps.getCharPref(name):null};};
 const prefs={};
 for(const n of ['readAloud.volume','readAloud.replacements','readAloud.memory','readAloud.defaultVoice','readAloud.speedPercent','readAloud.playerLayout','readAloud.bracketPairs','readAloud.stripAngleBrackets','readAloud.sameForAllDocuments','highlight.word','highlight.sentence','cacheAudio','system.enabled','documentVoiceChanged','documentReplacementsChanged','webdav.syncState','webdav.enabled'])prefs[P+n]=snap(P+n);
 for(const n of ['extensions.zotero.reader.readAloudVoices','extensions.zotero.sync.autoSync'])prefs[n]=snap(n);
 const branches={};for(const b of ['documentVoices.','documentReplacements.']){branches[b]={};for(const k of ps.getBranch(P+b).getChildList(''))branches[b][k]=snap(P+b+k);}
 const win=Zotero.getMainWindow();
 s.baseline={prefs,branches,debug:Zotero.Debug.storing,tabs:win.Zotero_Tabs._tabs.map(t=>t.id),selected:win.Zotero_Tabs._tabs[win.Zotero_Tabs.selectedIndex]?.id,windowState:win.windowState,errors:Zotero.getErrors().map(String)};
 s.originalFolder={value:prefs[P+'webdav.enabled'].value,user:prefs[P+'webdav.enabled'].user};
 s.dir=Zotero.isWin?params.tmpDir.replaceAll('/','\\'):params.tmpDir;
 await IOUtils.makeDirectory(PathUtils.join(s.dir,'encrypted'),{ignoreExisting:true});
 const sdr=Cc['@mozilla.org/security/sdr;1'].getService(Ci.nsISecretDecoderRing);
 s.seal=async(name,text)=>{const encoded=btoa(unescape(encodeURIComponent(text))),ciphertext=sdr.encryptString(encoded);if(sdr.decryptString(ciphertext)!==encoded)throw new Error('Encrypted baseline verification failed');await IOUtils.writeUTF8(PathUtils.join(s.dir,'encrypted',name+'.sdr'),JSON.stringify({format:'or240-private-backup',encoding:'utf8-base64-sdr',ciphertext}));};
 s.hash=async text=>Array.from(new Uint8Array(await win.crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(v=>v.toString(16).padStart(2,'0')).join('');
 s.restorePref=name=>{const b=s.baseline.prefs[name];if(!b)throw new Error('Missing original '+name);if(!b.user){if(ps.prefHasUserValue(name))ps.clearUserPref(name);}else if(b.type===32)ps.setCharPref(name,b.value);else if(b.type===64)ps.setIntPref(name,b.value);else ps.setBoolPref(name,b.value);};
 await s.seal('main-baseline',JSON.stringify(s.baseline));
 s.originalAudio=Zotero.Sync.APIClient.prototype.getReadAloudAudio;s.originalHTTP=Zotero.HTTP.request;s.mode='deny';s.nativeCalls=[];s.systemFrames=[];s.blockedPaid=0;
 Zotero.Sync.APIClient.prototype.getReadAloudAudio=async function(segment,voiceID){if(s.mode!=='stub'){s.blockedPaid++;throw new Error('Metered synthesis forbidden');}const seg=Components.utils.waiveXrays(segment);s.nativeCalls.push({text:seg.text,voiceID,marker:seg.or240Marker,source:seg.sourcePosition,keys:Object.keys(seg)});return{audio:new win.Blob([new Uint8Array([0,0])],{type:'audio/wav'}),timestamps:[{start:0.1,end:0.2,charStart:0,charEnd:2}],noStore:true};};
 Zotero.HTTP.request=function(method,url,options){if(/\/tts\/speak(?:[/?#]|$)/.test(String(url))){s.blockedPaid++;throw new Error('Metered HTTP forbidden');}return Reflect.apply(s.originalHTTP,this,[method,url,options]);};
 ps.setBoolPref(P+'webdav.enabled',false);ps.setBoolPref('extensions.zotero.sync.autoSync',false);
 let settled=false;const until=Date.now()+6000;
 do{const a=JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync()),b=JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsSync()),c=JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsUpload());settled=a.folder===false&&a.transport.running===false&&a.shared.transport.running===false&&b.transport.running===false&&!b.transport.pendingChange&&!c.autoUpload.pending;if(settled)break;await new Promise(r=>setTimeout(r,200));}while(Date.now()<until);
 if(!settled)throw new Error('Four transports did not settle after isolation');
 const d=JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
 if(d.store?.queued!==0||d.store?.writing!==false)throw new Error('Position store not idle');
 const db=new Zotero.DBConnection(d.database.path);
 const columns={positions:['libraryID','key','pos','ts'],deletions:['libraryID','key','ts'],documents:['libraryID','key','documentId','publicationId','identifiedAt'],document_positions:['documentId','format','publicationId','locator','anchorExact','anchorPrefix','anchorSuffix','stampAt','stampDevice']};
 try{s.afterOldCleanupTables={};for(const [t,cols]of Object.entries(columns)){const rows=await db.queryAsync('SELECT '+cols.join(',')+' FROM '+t+' ORDER BY '+(t==='document_positions'?'documentId':'libraryID,key'));s.afterOldCleanupTables[t]=rows.map(r=>Object.fromEntries(cols.map(c=>[c,r[c]])));}}finally{await db.closeDatabase();}
 await s.seal('local-table-baseline',JSON.stringify(s.afterOldCleanupTables));
 if(s.afterOldCleanupTables.documents.some(r=>r.documentId===s.fixtureDocId)||s.afterOldCleanupTables.document_positions.some(r=>r.documentId===s.fixtureDocId))throw new Error('Preexisting fixture document requires explicit recovery, not a fresh test');
 return JSON.stringify({baselineEncrypted:true,folder:false,autoSync:false,paidGuardsActive:true});
})()
