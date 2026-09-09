const fs=require('node:fs');
const http=require('node:http');
const {chromium}=require('playwright');
(async()=>{
 const server=http.createServer((req,res)=>{
   res.setHeader('Content-Type','text/html');
   res.setHeader('Cross-Origin-Opener-Policy','same-origin');
   res.setHeader('Cross-Origin-Embedder-Policy','credentialless');
   res.end(fs.readFileSync('index.html','utf8').replace('<script src="coi-serviceworker.js"></script>',''));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser,progress;
 try{
   browser=await chromium.launch({headless:true,...(process.env.OPIC_BROWSER_CHANNEL?{channel:process.env.OPIC_BROWSER_CHANNEL}:{})});
   const page=await browser.newPage();
   page.on('pageerror',e=>console.log('PAGE ERROR',e.message));
   page.on('requestfailed',r=>console.log('REQUEST FAILED',r.url().split('?')[0],r.failure()?.errorText));
   await page.goto(`http://127.0.0.1:${server.address().port}`);
   progress=setInterval(async()=>{try{console.log(await page.evaluate(()=>({ready:whisperModelReady,loading:whisperModelLoading})));}catch{}},20000);
   const result=await page.evaluate(async(longTest)=>{
     await prepareWhisperLocal();
     const response=await fetch('https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/samples/jfk.wav');
     if(!response.ok)throw Error('Sample download failed');
     const sample=await response.blob();
     await cacheWhisperModel(sample,'test-jfk-sample');
     const transcript=await transcribeCapturedAudioWithWhisper(sample);
     let longSeconds=0,longMatches=0;
     if(longTest){
       const originalDecode=decodeAudioForWhisper;const pcm=await originalDecode(sample);
       const longPcm=new Float32Array(pcm.length*6);for(let i=0;i<6;i++)longPcm.set(pcm,i*pcm.length);
       longSeconds=longPcm.length/16000;decodeAudioForWhisper=async()=>longPcm;
       try{const text=await transcribeCapturedAudioWithWhisper(sample);longMatches=(text.match(/ask not/gi)||[]).length;if(longMatches<3)throw Error('Long transcription lost repeated speech');}
       finally{decodeAudioForWhisper=originalDecode;}
     }
     return {ready:whisperModelReady,isolated:crossOriginIsolated,transcript,longSeconds,longMatches};
   },process.env.OPIC_WHISPER_LONG==='1');
   console.log(JSON.stringify(result));
   if(!/ask not/i.test(result.transcript))throw Error('Expected sample transcript not found');
   await page.route('https://**',route=>route.abort('internetdisconnected'));
   await page.reload();
   const offline=await page.evaluate(async()=>{
     await prepareWhisperLocal();
     return transcribeCapturedAudioWithWhisper(await readCachedWhisperModel('test-jfk-sample'));
   });
   if(!/ask not/i.test(offline))throw Error('Offline cached transcription failed');
   console.log('PASS: reload with external network blocked, cached runtime/model, real sample transcription');
 }finally{clearInterval(progress);if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
