(async () => {
  const P = 'extensions.zotero.zotero-tts.';
  const app = Zotero.ZoteroTTSRun.state.vc261;
  const url = app.localRun.stubBase;
  const expectedSystem = app.systemVoice.id;
  const expectedLocal = 'local::af_sample';
  const itemKey = app.fixtureA.key;
  const reader = Zotero.Reader._readers.find(row=>row.itemID===app.fixtureA.itemID);
  const other = Zotero.Reader._readers.find(row=>row.itemID===app.fixtureB.itemID);
  const win = Zotero.getMainWindow();
  const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
  if (!reader || !other || !expectedSystem.startsWith('system::') || url !== 'http://127.0.0.1:8973' ||
      Services.prefs.getStringPref(P+'local.baseURL') !== url || Services.prefs.getStringPref(P+'local.headers') !== '' ||
      JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync()).folder !== false) {
    throw new Error('Item 1 fixture or provider isolation was not confirmed');
  }
  const rw = reader._iframeWindow, ir = reader._internalReader;
  const engine = async (forReader = reader) => JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine()).readers
    .find(row=>row.itemID===forReader.itemID);
  const sources = async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.liveVoiceList())[
    Zotero.Reader._readers.indexOf(reader)]?.sources;
  const saved = async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices()).readers
    .find(row=>row.key==='user/'+itemKey)?.saved?.voice?.id;
  const stub = async (operation, method='POST') => {
    const response = await fetch(url+'/control/'+operation,{method});
    if(!response.ok)throw new Error('Loopback control request failed');
    return response.json();
  };
  const until = async (read,accept,ms=6400) => {
    const end=Date.now()+ms;
    do { const row=await read();if(accept(row))return row;await sleep(150); } while(Date.now()<end);
    return null;
  };
  const select = async tab => {win.Zotero_Tabs.select(tab.tabID);await sleep(500);};
  const start = () => {
    const input=Components.classes['@mozilla.org/text-input-processor;1']
      .createInstance(Components.interfaces.nsITextInputProcessor);
    const event=(key,code,keyCode,shiftKey=true)=>new rw.KeyboardEvent('',
      {key,code,keyCode,shiftKey,bubbles:true,cancelable:true});
    input.beginInputTransactionForTests(rw);
    try {
      input.keydown(event('Shift','ShiftLeft',16));input.keydown(event(' ','Space',32));
      input.keyup(event(' ','Space',32));input.keyup(event('Shift','ShiftLeft',16,false));
    } finally {input.endInputTransaction?.();}
  };
  const count = e => e?.stats?.started ?? 0;
  const speaking = (row,id) => row?.session?.voice===id && row.session.playing && row.controller?.ours;
  const advanced = (from,to) => to?.session?.playbackTime>from?.session?.playbackTime ||
    to?.session?.position>from?.session?.position;
  const held = async () => ({sources:await sources(),stub:await stub('state','GET'),engine:await engine()});
  const nextHeld = async () => {
    await stub('reset');await stub('hold-voices?mode=pass');
    Services.prefs.setBoolPref(P+'local.enabled',false);
    Services.prefs.setBoolPref(P+'local.enabled',true);
  };
  const report={};
  if(win.windowState===2)win.restore();
  try {
    Services.prefs.setBoolPref(P+'readAloud.favoritesOnly',false);
    await select(reader);
    if(await saved()!==expectedSystem)throw new Error('System was not the saved fixture voice');
    await nextHeld();start();
    const ready=await until(held,row=>row.sources?.local==='loading'&&row.sources.system==='ready'&&
      row.stub.held>0&&speaking(row.engine,expectedSystem));
    if(!ready)throw new Error('No confirmed simultaneous ready-System playback and held Kokoro request');
    await sleep(500);
    const beforeRelease=await held();
    const released=await stub('release');
    const localReady=await until(sources,row=>row?.local==='ready');
    const afterRelease=await engine();await sleep(500);
    const continues=await engine();
    report.item1={simultaneous:true,clockAdvancedWhileHeld:beforeRelease.stub.held>0&&advanced(ready.engine,beforeRelease.engine),
      released:released.released,localReady:!!localReady,startBefore:count(beforeRelease.engine),startAfter:count(continues),
      exactVoiceStayed:speaking(continues,expectedSystem),clockAdvancedAfter:advanced(afterRelease,continues)};
    report.item1.pass=report.item1.clockAdvancedWhileHeld&&released.released>0&&!!localReady&&
      report.item1.startBefore===report.item1.startAfter&&report.item1.exactVoiceStayed&&report.item1.clockAdvancedAfter;
    if(!report.item1.pass)return JSON.stringify(report);

    const index=5;
    const segment=ir._readAloudSegments?.segments?.[index];
    const spans=segment&&ir._readAloudSegments.getSegmentTextSpans(segment);
    let span=null;
    for(let i=0;i<(spans?.length??0);i++) if(spans[i]?.node&&spans[i].end>spans[i].start){span=spans[i];break;}
    if(!span)throw new Error('The requested fixture Segment has no selectable span');
    const end=span.start+Math.min(12,span.end-span.start);
    const raw=[{ref:JSON.parse(JSON.stringify(span.ref)),node:JSON.parse(JSON.stringify(span.node)),start:span.start,end}];
    const position=ir._sdt.mapper.textNodeSpansToSourcePosition(Components.utils.cloneInto(raw,rw));
    const range={pageIndex:position.pageIndex,anchorOffset:0,headOffset:end-span.start,collapsed:false,
      anchor:true,head:true,sortIndex:'00000|00000|00000',position:JSON.parse(JSON.stringify(position)),
      text:String(span.node.text||'').slice(span.start,end)};
    ir.toggleReadAloudPopup(false);
    Services.prefs.setStringPref(P+'documentVoices.user/'+itemKey,
      JSON.stringify({voice:{id:expectedLocal,lang:'en'},manual:true,ts:Date.now()}));
    Components.utils.waiveXrays(ir._primaryView)._setSelectionRanges(Components.utils.cloneInto([range],rw));
    const prior=count(await engine());
    await nextHeld();
    if(await saved()!==expectedLocal)throw new Error('Kokoro was not the saved fixture voice');
    start();
    const pending=await until(held,row=>row.sources?.local==='loading'&&row.stub.held>0&&!row.engine?.controller?.ours);
    if(!pending)throw new Error('The requested voice did not enter an authorized wait');
    await select(other);
    const during=await engine();
    const otherIdle=!(await engine(other))?.session?.playing;
    await select(reader);
    const sameHeld=await held();
    await stub('release');
    const began=await until(()=>engine(),row=>speaking(row,expectedLocal));
    report.item2Start={waited:!during?.controller?.ours&&count(during)===prior,otherIdle,
      heldAfterBrowsing:sameHeld.stub.held>0,originalSegment:index,observedSegment:began?.session?.position??null,
      voice:began?.session?.voice??null,startDelta:count(began)-prior};
    report.item2Start.pass=report.item2Start.waited&&otherIdle&&report.item2Start.heldAfterBrowsing&&
      report.item2Start.observedSegment===index&&report.item2Start.voice===expectedLocal&&report.item2Start.startDelta===1;
    if(!report.item2Start.pass)return JSON.stringify(report);

    ir.toggleReadAloudPopup(false);
    await nextHeld();
    if(await saved()!==expectedLocal)throw new Error('Kokoro was not the saved fixture voice before close check');
    const closeBaseline=count(await engine());start();
    const attempt=await until(held,row=>row.sources?.local==='loading'&&row.stub.held>0);
    if(!attempt)throw new Error('The close test did not hold a voice request');
    ir.toggleReadAloudPopup(false);
    const answer=await stub('release');await sleep(1300);
    const closed=await engine();
    const cleanStub=await stub('state','GET');
    report.item3Close={replies:answer.released,before:closeBaseline,after:count(closed),
      noController:!closed?.controller?.ours,noReading:!closed?.session?.playing,credentialFree:!cleanStub.sawCredentialLikeHeader};
    report.item3Close.pass=answer.released>0&&closeBaseline===count(closed)&&report.item3Close.noController&&
      report.item3Close.noReading&&report.item3Close.credentialFree;
    return JSON.stringify(report);
  } catch(error) {
    report.rigFailure=String(error?.message??'Probe failed').slice(0,250);
    return JSON.stringify(report);
  } finally {
    ir.toggleReadAloudPopup(false);await stub('reset');win.minimize();
  }
})()
