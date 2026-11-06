// Never restore networking here: reload the plugin's maps before 99.
(async()=>{
 const s=Zotero.ZoteroTTSRun.state,ps=Services.prefs,P='extensions.zotero.zotero-tts.',f=s.fixture;
 if(!s.baseline||!s.afterOldCleanupTables||!f?.key||!f.lib)throw new Error('Authoritative baseline or fixture identity missing');
 if(ps.getBoolPref(P+'webdav.enabled')||ps.getBoolPref('extensions.zotero.sync.autoSync'))throw new Error('Networking must remain off');
 const sleep=ms=>new Promise(r=>setTimeout(r,ms)),win=Zotero.getMainWindow();
 for(const r of Zotero.Reader._readers)if(r.itemID===f.itemID){const ir=Components.utils.waiveXrays(r._internalReader);if(ir._readAloudManager._active)ir.toggleReadAloudPopup(false);}
 if(win.Zotero_Tabs._tabs.some(t=>t.id===f.tabId))win.Zotero_Tabs.close(f.tabId);
 await sleep(700);
 const item=Zotero.Items.get(f.itemID);
 if(item){if(item.key!==f.key||item.libraryID!==f.lib||item.getField('title')!==f.title)throw new Error('Fixture identity mismatch; refusing erase');await item.eraseTx();}
 await sleep(700);
 if(Zotero.Items.get(f.itemID)||Zotero.Reader._readers.some(r=>r.itemID===f.itemID))throw new Error('Fixture teardown incomplete');
 for(const branch of ['documentVoices.','documentReplacements.']){
  const name=P+branch+'user/'+f.key;
  if(ps.prefHasUserValue(name))ps.clearUserPref(name);
 }
 const d=JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
 if(d.store?.queued!==0||d.store?.writing!==false)throw new Error('Position writes not settled');
 const db=new Zotero.DBConnection(d.database.path);
 const columns={positions:['libraryID','key','pos','ts'],deletions:['libraryID','key','ts'],documents:['libraryID','key','documentId','publicationId','identifiedAt'],document_positions:['documentId','format','publicationId','locator','anchorExact','anchorPrefix','anchorSuffix','stampAt','stampDevice']};
 const read=async()=>{const all={};for(const[t,c]of Object.entries(columns)){const rows=await db.queryAsync('SELECT '+c.join(',')+' FROM '+t+' ORDER BY '+(t==='document_positions'?'documentId':'libraryID,key'));all[t]=rows.map(r=>Object.fromEntries(c.map(k=>[k,r[k]])));}return all;};
 try{
  const before=await read();
  if(before.documents.some(row=>row.documentId===s.fixtureDocId&&(row.libraryID!==f.lib||row.key!==f.key)))throw new Error('Another document holder requires review');
  await s.seal('fixture-tables-before-teardown',JSON.stringify(before));
  await db.executeTransaction(async()=>{for(const table of ['positions','deletions','documents'])await db.queryAsync('DELETE FROM '+table+' WHERE libraryID=? AND key=?',[f.lib,f.key]);await db.queryAsync('DELETE FROM document_positions WHERE documentId=?',[s.fixtureDocId]);});
  const after=await read();
  if(JSON.stringify(after)!==JSON.stringify(s.afterOldCleanupTables))throw new Error('Unrelated table data changed; networking stays off');
  s.cleanTableHash=await s.hash(JSON.stringify(after));
 }finally{await db.closeDatabase();}
 const deferred=new Set([P+'webdav.enabled','extensions.zotero.sync.autoSync',P+'readAloud.memory',P+'webdav.syncState']);
 for(const name of Object.keys(s.baseline.prefs))if(!deferred.has(name))s.restorePref(name);
 s.restorePref(P+'readAloud.memory');await sleep(200);s.restorePref(P+'webdav.syncState');await sleep(100);
 const match=(name,b)=>{const type=ps.getPrefType(name),user=ps.prefHasUserValue(name),value=type===128?ps.getBoolPref(name):type===64?ps.getIntPref(name):type===32?ps.getCharPref(name):null;return type===b.type&&user===b.user&&value===b.value;};
 const mismatches=Object.entries(s.baseline.prefs).filter(([n,b])=>!['extensions.zotero.sync.autoSync',P+'webdav.enabled'].includes(n)&&!match(n,b)).map(([n])=>n);
 for(const[branch,original]of Object.entries(s.baseline.branches)){
  const current={};for(const k of ps.getBranch(P+branch).getChildList('')){const n=P+branch+k;current[k]={type:ps.getPrefType(n),user:ps.prefHasUserValue(n),value:ps.getCharPref(n)};}
  const stable=o=>JSON.stringify(Object.entries(o).sort(([a],[b])=>a.localeCompare(b)));
  if(stable(current)!==stable(original))mismatches.push(branch+'map');
 }
 if(mismatches.length)throw new Error('Preference restoration mismatch: '+mismatches.join(','));
 if(s.baseline.selected)win.Zotero_Tabs.select(s.baseline.selected);
 win.minimize();
 s.restoreSystemTap?.();
 s.teardownVerified=true;
 const result={fixtureGone:true,tableHash:s.cleanTableHash,unrelatedTablesIdentical:true,preferencesAndUserFlagsRestored:true,documentMapsRestored:true,folder:false,autoSync:false,needsInPlaceReinstall:true};
 await IOUtils.writeUTF8(PathUtils.join(s.dir,'teardown-results.json'),JSON.stringify(result,null,2));
 return JSON.stringify(result);
})()
