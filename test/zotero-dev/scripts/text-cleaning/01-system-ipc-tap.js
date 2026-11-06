(async()=>{
 const s=Zotero.ZoteroTTSRun.state;
 if(!s?.baseline||Services.prefs.getBoolPref('extensions.zotero.zotero-tts.webdav.enabled')||Zotero.Sync.APIClient.prototype.getReadAloudAudio===s.originalAudio||Zotero.HTTP.request===s.originalHTTP)throw new Error('No protected state');
 const Subprocess=ChromeUtils.importESModule('resource://gre/modules/Subprocess.sys.mjs').getSubprocessImplForTest();
 if(s.originalSubprocessCall && Subprocess.call!==s.originalSubprocessCall && s.pipeRestores?.length) return JSON.stringify({resumedExistingTap:true,subprocessTapInstalled:true});
 s.originalSubprocessCall=Subprocess.call;
 s.pipeRestores=[];
 s.allowedTexts=new Set(['这是中文。','中文。','甲 乙 [轻 声]','BNN 结构，第 3 章。','中文','The quick brown fox jumps over the lazy dog.','这是一句话。','中文，测试。','BNN 结构与第 3 章保持不变。','测试缓存。','甲 乙。']);
 const original=Subprocess.call;
 Subprocess.call=async function(options){
  const proc=await Reflect.apply(original,this,[options]);
  const o=Components.utils.waiveXrays(options);
  const command=String(o.command??'').toLowerCase();
  let encoded=false;for(let i=0;i<(o.arguments?.length??0);i++)if(String(o.arguments[i]).toLowerCase()==='-encodedcommand')encoded=true;
  if(command.endsWith('powershell.exe')&&encoded){
   const pipe=proc.stdin,write=pipe.write;
   const tapped=function(input){
    const b=Components.utils.waiveXrays(input);
    const view=new Uint8Array(b.buffer,b.byteOffset,b.byteLength);
    if(view.length>=4){
     const n=new DataView(view.buffer,view.byteOffset,4).getUint32(0,true);
     if(n===view.length-4){
      const request=JSON.parse(new TextDecoder().decode(view.subarray(4)));
      if(request.op==='speak'){
       if(!s.allowedTexts.has(request.text))throw new Error('Unexpected non-fixture speech blocked before IPC');
       s.systemFrames.push({id:request.id,text:request.text,voice:request.voice,at:Date.now()});
      }
     }
    }
    return Reflect.apply(write,pipe,[input]);
   };
   pipe.write=tapped;
   if(pipe.write!==tapped){proc.kill();throw new Error('System IPC tap was not installed');}
   s.pipeRestores.push(()=>{pipe.write=write;});
   s.tappedProcesses=(s.tappedProcesses??0)+1;
  }
  return proc;
 };
 s.restoreSystemTap=()=>{Subprocess.call=original;for(const restore of s.pipeRestores)try{restore();}catch{}};
 if(Subprocess.call===original)throw new Error('Mutable subprocess implementation tap unavailable');
 return JSON.stringify({subprocessTapInstalled:true,paidGuardInstalled:Zotero.Sync.APIClient.prototype.getReadAloudAudio!==s.originalAudio});
})()
