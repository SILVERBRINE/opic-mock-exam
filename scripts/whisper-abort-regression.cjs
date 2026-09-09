const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');const {chromium}=require('playwright');
(async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(fs.readFileSync('index.html','utf8').replace('<script src="coi-serviceworker.js"></script>',''));});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.OPIC_BROWSER_CHANNEL?{channel:process.env.OPIC_BROWSER_CHANNEL}:{})});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const result=await page.evaluate(async()=>{
   setEvalMode('local');startExam('practice');whisperModelReady=true;whisperInstance=1;
   decodeAudioForWhisper=async()=>new Float32Array(75*16000);const sizes=[];
   whisperModule={full_default:(instance,audio,lang,threads)=>{sizes.push([audio.length,threads]);whisperOutputSink.push('[00:00:00.000 --> 00:00:01.000] chunk '+sizes.length,'whisper_print_timings: total time = 1');return 0;}};
   const text=await transcribeCapturedAudioWithWhisper(new Blob(['audio']),1);
   let calls=0;whisperModule.full_default=()=>{calls++;if(calls===2)throw new Error('Aborted(). Build with -sASSERTIONS for more info.');whisperOutputSink.push('[00:00:00.000 --> 00:00:01.000] partial answer','whisper_print_timings: total time = 1');return 0;};
   const blob=new Blob(['original recording']);await queueCapturedAudioTranscription(state.questions[0],blob);
   const failed={ready:whisperModelReady,retained:state.failedRecordings[1]===blob,answer:state.answers[1]||'',retryDisabled:document.querySelector('[data-retry]').disabled,message:state.transcriptionErrors[1],fault:whisperRuntimeFault.code};
   try{await transcribeCapturedAudioWithWhisper(blob,1);}catch{}const callsAfterRetry=calls;
   document.querySelector('[data-connect]').click();const recovery={mode:readEvalConfig().mode,retryEnabled:!document.querySelector('[data-retry]').disabled,retained:state.failedRecordings[1]===blob};
   whisperRuntimeFault=null;whisperModelReady=true;let logError='';try{await waitForWhisperCompletion(['Aborted(). Build with -sASSERTIONS'],30);}catch(e){logError=e.code;}
   return {sizes,text,failed,callsAfterRetry,recovery,logError};
  });
  assert.deepEqual(result.sizes.map(x=>x[0]),[480000,480000,240000]);assert.ok(result.sizes.every(x=>x[1]<=2));assert.match(result.text,/chunk 1 chunk 2 chunk 3/);
  assert.equal(result.failed.ready,false);assert.equal(result.failed.retained,true);assert.equal(result.failed.answer,'');assert.equal(result.failed.retryDisabled,true);assert.equal(result.failed.fault,'WHISPER_ABORT');assert.match(result.failed.message,/Whisper 실행 엔진이 중단/);assert.equal(result.callsAfterRetry,2);
  assert.deepEqual(result.recovery,{mode:'gemini',retryEnabled:true,retained:true});assert.equal(result.logError,'WHISPER_ABORT');
  console.log('PASS: bounded PCM chunks and threads, abort quarantine, no partial answer grading, original recording retained, failed-runtime retry blocked, explicit API recovery, asynchronous abort log detection');
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
