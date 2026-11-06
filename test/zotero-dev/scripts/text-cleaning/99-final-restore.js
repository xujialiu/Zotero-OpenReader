// Execute only after 90 and the in-place reinstall. A failed gate leaves sync off.
(async()=>{
 const s=Zotero.ZoteroTTSRun.state,ps=Services.prefs,P='extensions.zotero.zotero-tts.';
 if(!s.teardownVerified||ps.getBoolPref(P+'webdav.enabled')||ps.getBoolPref('extensions.zotero.sync.autoSync'))throw new Error('Teardown/reinstall gate missing');
 const startup=JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
 if(startup.failed.length)throw new Error('Installed build startup failed');
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const quiet=async()=>{const pos=JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()),a=JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync()),b=JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsSync()),c=JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsUpload());return{ok:pos.store?.queued===0&&pos.store?.writing===false&&a.transport?.running===false&&a.shared?.transport?.running===false&&b.transport?.running===false&&!b.transport?.pendingChange&&!c.autoUpload?.pending,rows:pos.database.rows,documents:a.shared.documents};};
 let q;const until=Date.now()+6000;do{q=await quiet();if(q.ok)break;await sleep(200);}while(Date.now()<until);
 if(!q?.ok)throw new Error('All four transports are not quiet');
 const expectedDocs=s.afterOldCleanupTables.documents.length,expectedItems=s.afterOldCleanupTables.document_positions.length;
 if(q.documents.documents!==expectedDocs||q.documents.items!==expectedItems)throw new Error('Reinstalled memory still contains fixture data');
 if(Zotero.Items.get(s.fixture.itemID))throw new Error('Fixture item remains');
 const win=Zotero.getMainWindow();
 const tabs=win.Zotero_Tabs._tabs.map(t=>t.id);
 if(JSON.stringify(tabs)!==JSON.stringify(s.baseline.tabs))throw new Error('Reader tab mismatch');
 if(win.Zotero_Tabs._tabs[win.Zotero_Tabs.selectedIndex]?.id!==s.baseline.selected)throw new Error('Selected tab mismatch');
 const errorChanges=Zotero.getErrors().map(String).filter(e=>!s.baseline.errors.includes(e));
 const pluginErrors=errorChanges.filter(e=>/zotero-tts\.js|\[zotero-tts\]|can't access dead object/i.test(e));
 if(pluginErrors.length)throw new Error('New plugin errors require review');
 if(s.blockedPaid!==0)throw new Error('Unexpected metered synthesis was blocked; review before acceptance');
 Zotero.Sync.APIClient.prototype.getReadAloudAudio=s.originalAudio;Zotero.HTTP.request=s.originalHTTP;s.restoreSystemTap?.();
 Zotero.Debug.setStore(s.baseline.debug);
 s.restorePref('extensions.zotero.sync.autoSync');
 if(s.originalFolder.user)ps.setBoolPref(P+'webdav.enabled',s.originalFolder.value);else if(ps.prefHasUserValue(P+'webdav.enabled'))ps.clearUserPref(P+'webdav.enabled');
 await sleep(1200);
 if(ps.getBoolPref(P+'webdav.enabled')!==s.originalFolder.value||ps.prefHasUserValue(P+'webdav.enabled')!==s.originalFolder.user)throw new Error('Original folder switch restoration failed');
 const restored=await quiet();
 const result={version:startup.version,startupFailures:startup.failed,fixtureGone:true,positionRows:q.rows,loadedDocuments:q.documents,allFourQuietBeforeRestore:true,tabsRestored:true,selectionRestored:true,newPluginErrors:0,knownNonPluginErrors:errorChanges.length,paidHTTPRequests:0,guardsRestored:Zotero.Sync.APIClient.prototype.getReadAloudAudio===s.originalAudio&&Zotero.HTTP.request===s.originalHTTP,debugRestored:Zotero.Debug.storing===s.baseline.debug,autoSyncRestored:ps.getBoolPref('extensions.zotero.sync.autoSync')===s.baseline.prefs['extensions.zotero.sync.autoSync'].value&&ps.prefHasUserValue('extensions.zotero.sync.autoSync')===s.baseline.prefs['extensions.zotero.sync.autoSync'].user,folderRestored:true,folderValue:ps.getBoolPref(P+'webdav.enabled'),normalTransportsQuiet:restored.ok,minimized:win.windowState===2};
 s.finalReceipt=result;
 await IOUtils.writeUTF8(PathUtils.join(s.dir,'final-restoration.json'),JSON.stringify(result,null,2));
 return JSON.stringify(result);
})()
