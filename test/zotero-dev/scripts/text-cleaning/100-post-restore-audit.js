// Read-only after normal networking is restored. Do not confuse normal in-flight
// synchronization with incomplete teardown; wait for its bounded settle window.
(async()=>{
 const s=Zotero.ZoteroTTSRun.state,ps=Services.prefs,P='extensions.zotero.zotero-tts.';
 if(!s.finalReceipt?.folderRestored||!s.teardownVerified)throw new Error('Restoration receipt missing');
 let last;const until=Date.now()+12000;
 do{
  const a=JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync()),b=JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsSync()),c=JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsUpload()),d=JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
  last={folder:a.folder,positions:!!a.transport.running,shared:!!a.shared.transport.running,settings:!!b.transport.running,settingsPending:!!b.transport.pendingChange,backupPending:!!c.autoUpload.pending,rows:d.database.rows,documents:a.shared.documents};
  if(!last.positions&&!last.shared&&!last.settings&&!last.settingsPending&&!last.backupPending)break;
  await new Promise(r=>setTimeout(r,200));
 }while(Date.now()<until);
 if(last.positions||last.shared||last.settings||last.settingsPending||last.backupPending)throw new Error('Normal transports have not settled');
 for(const key of [s.fixture.key,s.oldFixtureKey].filter(Boolean))for(const branch of ['documentVoices.','documentReplacements.'])if(ps.prefHasUserValue(P+branch+'user/'+key))throw new Error('Fixture preference reappeared');
 if(Zotero.Items.get(s.fixture.itemID))throw new Error('Fixture item reappeared');
 if(last.folder!==s.originalFolder.value)throw new Error('Folder switch changed');
 s.finalReceipt.normalTransportsQuiet=true;s.finalReceipt.postRestoreAudit=last;
 await IOUtils.writeUTF8(PathUtils.join(s.dir,'final-restoration.json'),JSON.stringify(s.finalReceipt,null,2));
 return JSON.stringify(s.finalReceipt);
})()
