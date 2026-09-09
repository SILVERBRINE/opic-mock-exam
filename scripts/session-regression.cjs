const fs = require('node:fs');
const http = require('node:http');
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
async function main() {
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(fs.readFileSync('index.html','utf8').replace('<script src="coi-serviceworker.js"></script>',''));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try {
 browser=await chromium.launch({...(process.env.OPIC_BROWSER_CHANNEL ? {channel:process.env.OPIC_BROWSER_CHANNEL} : {}),headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 const page=await browser.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.evaluate(()=>{
   setEvalMode('gemini');document.getElementById('apiKeyInput').value='test-only-key';
   state.modelCatalog.gemini=['gemini-2.5-flash'];
   state.apiHandshake.gemini={ready:true,fingerprint:makeKeyFingerprint('test-only-key'),model:'gemini-2.5-flash'};
   renderModelSelect('gemini');saveEvalConfig();
 });
 await page.reload();
 assert.equal(await page.locator('#apiKeyInput').inputValue(),'test-only-key');
 await page.evaluate(()=>{setEvalMode('local');setEvalMode('gemini');});
 assert.equal(await page.locator('#apiKeyInput').inputValue(),'test-only-key');
 await page.evaluate(()=>{startExam('practice');beginQuestionTimer();});
 assert.equal(await page.evaluate(()=>QUESTION_SECONDS),180);
 assert.equal(await page.locator('#submitBtn').isDisabled(),true);
 await page.evaluate(()=>submitExam());
 assert.equal(await page.locator('#resultPanel').evaluate(e=>e.classList.contains('hide')),true);
 await page.evaluate(()=>{state.questionSeconds=95;pauseQuestionTimer();});
 await page.waitForTimeout(1150);
 assert.equal(await page.evaluate(()=>state.questionSeconds),95);
 // Exercise real MediaRecorder stop/data events in Edge using its fake microphone.
 const capture = await page.evaluate(async()=>{
   const started=await startAudioCapture();
   await new Promise(r=>setTimeout(r,500));
   const blob=await stopAudioCapture();
   return {started,size:blob?.size,type:blob?.type};
 });
 assert.equal(capture.started,true);
 assert.ok(capture.size>0);
 const unloadGuard=await page.evaluate(async()=>{
   await startAudioCapture();state.isRecording=true;
   const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);
   const result={blocked:event.defaultPrevented,live:state.audioStream.getAudioTracks()[0].readyState,recording:state.audioRecorder.state};
   state.isRecording=false;await stopAudioCapture();releaseMicrophoneStream();return result;
 });
 assert.deepEqual(unloadGuard,{blocked:true,live:'live',recording:'recording'});
 const disconnected=await page.evaluate(async()=>{
   const originalStop=requestVoiceCaptureStop;let stops=0;
   requestVoiceCaptureStop=()=>{stops++;};
   try {
     await startAudioCapture();state.isRecording=true;
     state.audioStream.getAudioTracks()[0].dispatchEvent(new Event('ended'));
     const message=state.audioCaptureError;
     state.isRecording=false;await stopAudioCapture();releaseMicrophoneStream();
     return {stops,message};
   }finally{requestVoiceCaptureStop=originalStop;state.isRecording=false;state.audioCaptureError='';}
 });
 assert.equal(disconnected.stops,1);assert.match(disconnected.message,/연결이 끊겼/);
 const modelIntegrity=await page.evaluate(async()=>({empty:await validateWhisperModel(new ArrayBuffer(0)),wrong:await validateWhisperModel(new ArrayBuffer(WHISPER_MODEL_BYTES))}));
 assert.deepEqual(modelIntegrity,{empty:false,wrong:false});
 const corruptModelRecovery=await page.evaluate(async()=>{
   const original={ensureWhisperWasmRuntime,readCachedWhisperModel,downloadWhisperModel,validateWhisperModel,loadWhisperModelIntoRuntime,cacheWhisperModel};
   const events=[];let downloadedValid=true;
   ensureWhisperWasmRuntime=async()=>({});readCachedWhisperModel=async()=> 'broken';
   validateWhisperModel=async value=>value==='valid';downloadWhisperModel=async()=>{events.push('download');return downloadedValid?'valid':'invalid';};
   loadWhisperModelIntoRuntime=async()=>{events.push('load');};cacheWhisperModel=async value=>{events.push(value===null?'discard':'save');};
   try{
     await prepareWhisperLocal();const success=events.slice();events.length=0;downloadedValid=false;
     let error='';try{await prepareWhisperLocal();}catch(e){error=e.message;}
     return {success,failure:events.slice(),error};
   }finally{({ensureWhisperWasmRuntime,readCachedWhisperModel,downloadWhisperModel,validateWhisperModel,loadWhisperModelIntoRuntime,cacheWhisperModel}=original);}
 });
 assert.deepEqual(corruptModelRecovery.success,['discard','download','load','save']);
 assert.deepEqual(corruptModelRecovery.failure,['discard','download']);assert.match(corruptModelRecovery.error,/손상/);
 const runtimeFailure=await page.evaluate(async()=>{
   const original={readCachedWhisperModel,cacheWhisperModel,append:document.head.appendChild,module:window.Module};const writes=[];
   readCachedWhisperModel=async()=> 'x'.repeat(1001);cacheWhisperModel=async(value,key)=>{writes.push({value,key});};
   document.head.appendChild=function(node){if(node.dataset?.opicWhisperWasm){queueMicrotask(()=>node.onerror());return node;}return original.append.call(this,node);};
   try{
     let message='';try{await ensureWhisperWasmRuntime();}catch(error){message=error.message;}
     return {message,writes,quarantined:Boolean(whisperRuntimeFault)};
   }finally{readCachedWhisperModel=original.readCachedWhisperModel;cacheWhisperModel=original.cacheWhisperModel;document.head.appendChild=original.append;window.Module=original.module;whisperModulePromise=null;whisperRuntimeFault=null;}
 });
 assert.equal(runtimeFailure.quarantined,true);assert.match(runtimeFailure.message,/새로고침/);assert.deepEqual(runtimeFailure.writes,[{value:null,key:'whisper-singlefile-runtime-v1'}]);
 const stalledAudio=await page.evaluate(async()=>{
   const originalAudio=window.Audio,originalGet=getQuestionAudio,originalTimeout=window.setTimeout;
   let watchdog;window.Audio=class{constructor(src){this.src=src;}play(){return Promise.resolve();}pause(){}removeAttribute(){}load(){}};
   getQuestionAudio=async()=>new Blob(['test']);window.setTimeout=(fn,ms)=>ms===120000?(watchdog=fn,0):originalTimeout(fn,ms);
   try{
     const q=state.questions[0];state.promptPlaybackPending=true;const count=state.promptPlayCount[q.no]||0;
     await speakQuestionWithLocalAudio(q,state.promptPlaybackToken,'recording');watchdog();
     return {pending:state.promptPlaybackPending,released:state.promptAudio===null,count:state.promptPlayCount[q.no]||0,previous:count};
   }finally{window.Audio=originalAudio;getQuestionAudio=originalGet;window.setTimeout=originalTimeout;}
 });
 assert.equal(stalledAudio.pending,false);assert.equal(stalledAudio.released,true);assert.equal(stalledAudio.count,stalledAudio.previous);
 // Exercise the real HTTP wrapper, parser, STT queue, evaluation queue and UI.
 let transcriptions=0;
 await page.route('https://generativelanguage.googleapis.com/**',async route=>{
   const body=route.request().postDataJSON();
   if(body.contents[0].parts.some(p=>p.inline_data)) {
     transcriptions++;
     await route.fulfill({status:200,json:{candidates:[{finishReason:'STOP',content:{parts:[]}}]}});
   } else await route.fulfill({status:200,json:{candidates:[{finishReason:'STOP',content:{parts:[{text:'{"content":4,"fluency":4,"grammar":3,"pronunciation":5,"tip":"구체적으로 답하세요."}'}]}}]}});
 });
 await page.evaluate(async()=>{const q=state.questions[0];await queueCapturedAudioTranscription(q,new Blob(['recorded audio'],{type:'audio/webm'}));});
 assert.equal(transcriptions,2);
 assert.equal(await page.evaluate(()=>Boolean(state.failedRecordings[1])),true);
 assert.equal(await page.evaluate(()=>state.questionScores[1]),undefined);
 assert.equal(await page.locator('#submitBtn').isDisabled(),true);
 assert.match(await page.locator('#questionFeedback').innerText(),/다시 전사/);
 const downloadPromise=page.waitForEvent('download');
 await page.locator('[data-download]').click();
 const recordingDownload=await downloadPromise;
 assert.match(recordingDownload.suggestedFilename(),/^opic-Q\d+-recording\.webm$/);
 assert.equal(fs.readFileSync(await recordingDownload.path(),'utf8'),'recorded audio');
 await page.locator('[data-connect]').click();
 assert.equal(await page.locator('#apiKeyInput').isEnabled(),true);
 assert.equal(await page.evaluate(()=>Boolean(state.failedRecordings[1])),true);
 await page.unroute('https://generativelanguage.googleapis.com/**');
 await page.route('https://generativelanguage.googleapis.com/**',async route=>{
   const body=route.request().postDataJSON();
   const audio=body.contents[0].parts.some(p=>p.inline_data);
   await new Promise(r=>setTimeout(r,150));
   await route.fulfill({status:200,json:{candidates:[{finishReason:'STOP',content:{parts:[{text:audio?'I stayed home because a delivery arrived late. I called the company and they helped me.':'{"content":4,"fluency":4,"grammar":3,"pronunciation":5,"tip":"구체적으로 답하세요."}'}]}}]}});
 });
 await page.locator('#questionFeedback [data-retry]').click();
 assert.equal(await page.locator('#voiceBtn').isDisabled(),true);
 assert.equal(await page.locator('#submitBtn').isDisabled(),true);
 await page.waitForFunction(()=>!Object.keys(state.transcriptionJobs).length&&!Object.keys(state.evaluationJobs).length);
 assert.equal(await page.evaluate(()=>Boolean(state.failedRecordings[1])),false);
 assert.equal(await page.locator('#submitBtn').isDisabled(),false);
 assert.equal(await page.evaluate(()=>normalizeEvalResult('{}')),null);
 const safeMarkup=await page.evaluate(()=>sanitizeFeedbackHtml('<style>@import "https://example.invalid/style.css";</style><div style="background:u\\72l(https://example.invalid)">text</div><div style="width:50%"></div>'));
 assert.doesNotMatch(safeMarkup,/<style|background|example\.invalid/);assert.match(safeMarkup,/width:50%/);
 assert.equal(await page.evaluate(()=>normalizeEvalResult('{"content":4,"fluency":4,"grammar":4,"pronunciation":5,"tip":"  "}')),null);
 const pronunciationExcluded=await page.evaluate(()=>{
   const parsed=normalizeEvalResult(JSON.stringify({content:8,fluency:7,grammar:6,pronunciation:null,tip:'Add details.'}));
   const answer='I live in a small apartment with my family. I like the sunny kitchen because we cook together every weekend and talk about our plans.';
   const guarded=applyEvaluationGuard(parsed,'',answer,'묘사',{recognitionConfidence:1});
   const html=buildEvaluationHtml(guarded);
   const history=sanitizeImportedHistoryEntry({id:'pronunciation-test',prompt:'Home',answer,score:70,criteria:guarded.criteria},0);
   const group=parseExamGroup(JSON.stringify({results:[{questionNo:1,content:8,fluency:7,grammar:6,pronunciation:null,tip:'Add details.'}]}),[{no:1}]);
   return {score:guarded.score,pronunciation:guarded.criteria.pronunciation,html,historyPronunciation:history.criteria.pronunciation,groupScore:group.get('1').score};
 });
 assert.equal(pronunciationExcluded.score,70);assert.equal(pronunciationExcluded.pronunciation,null);assert.equal(pronunciationExcluded.historyPronunciation,null);assert.equal(pronunciationExcluded.groupScore,70);assert.match(pronunciationExcluded.html,/평가 불가/);assert.match(pronunciationExcluded.html,/총점 제외/);
 await page.unroute('https://generativelanguage.googleapis.com/**');
 let quotaRequests=0;
 await page.route('https://generativelanguage.googleapis.com/**',async route=>{
   quotaRequests++;
   if (quotaRequests===1) return route.fulfill({status:429,json:{error:{message:'Quota exhausted'}}});
   await route.fulfill({status:200,json:{candidates:[{finishReason:'STOP',content:{parts:[{text:'{"content":4,"fluency":4,"grammar":3,"pronunciation":5,"tip":"내용을 보완하세요."}'}]}}]}});
 });
 const failover=await page.evaluate(async()=>{
   state.modelCatalog.gemini=['gemini-2.5-flash','gemini-3.5-flash-lite','gemini-3.1-flash-lite'];
   state.apiHandshake.gemini.model='auto';renderModelSelect('gemini');
   state.geminiRuntime={cursor:0,usage:{},lastModel:''};state.geminiModelByQuestion={};
   return evaluateWithGemini('Describe home','My home is small.','묘사',{},99);
 });
 assert.equal(quotaRequests,2);assert.ok(failover.model);
 // Structured evaluation: truncated output must retry, even if its text is valid JSON.
 await page.unroute('https://generativelanguage.googleapis.com/**');
 let evaluationRequests=0;
 const requestBodies=[];
 await page.route('https://generativelanguage.googleapis.com/**',async route=>{
   evaluationRequests++;requestBodies.push(route.request().postDataJSON());
   await route.fulfill({status:200,json:{candidates:[{finishReason:evaluationRequests===1?'MAX_TOKENS':'STOP',content:{parts:[{thought:true,text:'internal thoughts must not be parsed'},{text:'{"content":4,"fluency":4,"grammar":3,"pronunciation":5,"tip":"질문의 상황을 확인하세요."}'}]}}]}});
 });
 await page.evaluate(()=>{state.apiHandshake.gemini.model='gemini-2.5-flash';renderModelSelect('gemini');});
 const retried=await page.evaluate(()=>evaluateWithGemini('Describe home','My home is small.','묘사',{},99));
 assert.equal(evaluationRequests,2);assert.equal(retried.criteria.grammar,3);
 assert.equal(requestBodies[0].generationConfig.responseSchema.required.length,8);
 assert.equal(requestBodies[0].generationConfig.maxOutputTokens,4096);
 assert.equal(requestBodies[1].generationConfig.maxOutputTokens,8192);
 // Permanent malformed response: bounded retries, truthful visible fallback, unchanged API mode.
 await page.unroute('https://generativelanguage.googleapis.com/**');
 let malformedRequests=0;
 await page.route('https://generativelanguage.googleapis.com/**',async route=>{
   malformedRequests++;
   await route.fulfill({status:200,json:{candidates:[{finishReason:'STOP',content:{parts:[{text:'{"content":10}'}]}}]}});
 });
 const fallback=await page.evaluate(async()=>{
   const q=state.questions[0];
   const answer=('I use a machine because it is easy. For example I buy a ticket and then go home. ').repeat(10);
   const result=await evaluateQuestionByNo(q.no,answer,{});
   return {result,html:buildEvaluationHtml(result,q,answer),mode:readEvalConfig().mode};
 });
 assert.equal(malformedRequests,2);assert.equal(fallback.mode,'gemini');
 assert.equal(fallback.result.model,'offline-rules');assert.equal(fallback.result.provisional,true);
 assert.ok(fallback.result.score<=50);assert.match(fallback.html,/온라인 평가 실패 · 임시/);
 assert.match(fallback.result.fallbackReason,/재시도/);
 // Safety blocks do not retry and cannot be accepted even with valid-looking text.
 await page.unroute('https://generativelanguage.googleapis.com/**');
 let blockedRequests=0;
 await page.route('https://generativelanguage.googleapis.com/**',async route=>{
   blockedRequests++;await route.fulfill({status:200,json:{promptFeedback:{blockReason:'SAFETY'}}});
 });
 const blocked=await page.evaluate(async()=>{try {await evaluateWithGemini('Describe home','My home','묘사',{},99);return '';}catch(e){return e.message;}});
 assert.equal(blockedRequests,1);assert.match(blocked,/SAFETY/);
 assert.equal(await page.evaluate(()=>normalizeEvalResult('{"content":11,"fluency":4,"grammar":4,"pronunciation":5}')),null);
 assert.equal(await page.evaluate(()=>normalizeEvalResult('{"content":null,"fluency":4,"grammar":4,"pronunciation":5}')),null);
 await page.evaluate(result=>{state.questionResults[1]=result;state.questionScores[1]=result.score;state.questionCriteria[1]=result.criteria;saveProgress();},fallback.result);
 await page.locator('#submitBtn').click();
 await page.waitForFunction(()=>!document.getElementById('resultPanel').classList.contains('hide'));
 assert.match(await page.locator('#resultPanel').innerText(),/판정 보류/);
 assert.match(await page.locator('#resultPanel').innerText(),/임시 규칙 평가 포함/);
 await page.evaluate(()=>clearEvalConfig());
 await page.reload();
 assert.equal(await page.locator('#apiKeyInput').inputValue(),'');
 assert.deepEqual(errors,[]);
 const storagePage=await browser.newPage();
 const storageErrors=[];storagePage.on('pageerror',e=>storageErrors.push(e.message));
 await storagePage.addInitScript(()=>{
   for(const name of ['getItem','setItem','removeItem']) Storage.prototype[name]=function(){throw new DOMException('Blocked for test','SecurityError');};
 });
 await storagePage.goto(`http://127.0.0.1:${server.address().port}`);
 await storagePage.evaluate(()=>{
   setEvalMode('local');startExam('exam');
   state.answers[1]='My house is small.';saveProgress();
 });
 assert.match(await storagePage.locator('#storageFailureNotice').innerText(),/내보내/);
 assert.equal(await storagePage.evaluate(()=>restoreProgress().answers[1]),'My house is small.');
 storagePage.once('dialog',dialog=>dialog.accept());
 await storagePage.evaluate(()=>clearProgress());
 assert.equal(await storagePage.evaluate(()=>restoreProgress()),null);
 assert.deepEqual(storageErrors,[]);
 await storagePage.close();
 const captureIsolation=await page.evaluate(async()=>{
   const Original=window.MediaRecorder;
   class FakeRecorder {
     static isTypeSupported(){return true;}
     constructor(){this.state='inactive';this.mimeType='audio/webm';}
     start(){this.state='recording';}
     requestData(){}
     stop(){this.state='inactive';}
   }
   window.MediaRecorder=FakeRecorder;
   try {
     await startAudioCapture();const old=state.audioRecorder;
     const stopped=stopAudioCapture();
     await startAudioCapture();const next=state.audioRecorder;
     next.ondataavailable({data:new Blob(['next'])});
     old.ondataavailable({data:new Blob(['old'])});old.onstop();
     const oldBlob=await stopped;
     const intact=state.audioRecorder===next;
     const nextStopped=stopAudioCapture();next.onstop();
     const nextBlob=await nextStopped;
     releaseMicrophoneStream();
     return {intact,old:await oldBlob.text(),next:await nextBlob.text()};
   } finally {window.MediaRecorder=Original;}
 });
 assert.deepEqual(captureIsolation,{intact:true,old:'old',next:'next'});
 const deadlines=await page.evaluate(async()=>{
   const original=window.fetch;const failures=[];
   try {
     for(const phase of ['headers','body']) {
       window.fetch=async(url,{signal})=>{
         const pending=new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
         return phase==='headers'?pending:{arrayBuffer:()=>pending};
       };
       try {await fetchApiResponse('/test',{},20);failures.push('not timed out');}catch(e){failures.push(e.message);}
     }
     return failures;
   } finally {window.fetch=original;}
 });
 assert.equal(deadlines.length,2);deadlines.forEach(message=>assert.match(message,/시간이 초과/));
 const exam=await browser.newPage();
 const examErrors=[];exam.on('pageerror',e=>examErrors.push(e.message));
 await exam.goto(`http://127.0.0.1:${server.address().port}`);
 await exam.evaluate(()=>{setEvalMode('local');startExam('exam');});
 assert.equal(await exam.evaluate(()=>state.questions.length),15);
 await exam.evaluate(async()=>{
   state.failedRecordings[1]=new Blob(['recover me'],{type:'audio/webm'});
   state.transcriptionErrors[1]='Temporary transcription failure';
   await submitExam();
 });
 assert.equal(await exam.evaluate(()=>state.examFinished),false);
 assert.equal(await exam.evaluate(()=>state.submitInProgress),false);
 assert.match(await exam.locator('#questionFeedback').innerText(),/Temporary transcription failure/);
 assert.equal(await exam.evaluate(()=>state.failedRecordings[1].size),10);
 const restoredSession=await browser.newPage();
 restoredSession.on('dialog',dialog=>dialog.accept());
 await restoredSession.goto(`http://127.0.0.1:${server.address().port}`);
 await restoredSession.evaluate(async()=>{
   setEvalMode('local');startExam('exam');
   document.getElementById('answerInput').value='I live in an apartment. My favorite room is the kitchen because I cook there.';
   saveCurrent();await queueQuestionEvaluation(state.questions[0]);
   state.questionSeconds=73;state.questionTimerStarted=true;state.questionTimerPaused=true;state.promptPlayCount[1]=1;saveProgress();
 });
 const beforeReload=await restoredSession.evaluate(()=>({id:state.questions[0].id,answer:state.answers[1],score:state.questionScores[1]}));
 await restoredSession.reload();await restoredSession.evaluate(()=>startExam('exam'));
 const afterReload=await restoredSession.evaluate(()=>({id:state.questions[0].id,answer:state.answers[1],score:state.questionScores[1],seconds:state.questionSeconds,paused:state.questionTimerPaused,plays:state.promptPlayCount[1],provisional:state.questionResults[1].provisional}));
 assert.deepEqual(afterReload,{...beforeReload,seconds:73,paused:true,plays:1,provisional:true});
 await restoredSession.close();
 await exam.evaluate(()=>{state.totalSeconds=0;startTimer();});
 await exam.waitForFunction(()=>!state.submitInProgress);
 assert.equal(await exam.evaluate(()=>state.examFinished),false);
 assert.equal(await exam.evaluate(()=>state.timerId),null);
 assert.equal(await exam.evaluate(()=>state.failedRecordings[1].size),10);
 assert.match(await exam.locator('#questionFeedback').innerText(),/Temporary transcription failure/);
 await exam.evaluate(()=>{delete state.failedRecordings[1];delete state.transcriptionErrors[1];});
 // Timer callbacks delayed by a busy/background tab must catch up to elapsed time.
 const clockResult=await exam.evaluate(()=>{
   clearInterval(state.timerId);clearInterval(state.questionTimerId);
   const originalInterval=window.setInterval,originalClear=window.clearInterval;
   const ownNow=Object.getOwnPropertyDescriptor(performance,'now');
   let now=0;const ticks=[];
   Object.defineProperty(performance,'now',{configurable:true,value:()=>now});
   window.setInterval=fn=>{ticks.push(fn);return ticks.length;};window.clearInterval=()=>{};
   try {
     state.totalSeconds=100;state.questionSeconds=100;state.questionTimerStarted=true;state.questionTimerPaused=false;
     startTimer();startQuestionTimer();const initial=[state.totalSeconds,state.questionSeconds];
     now=6500;ticks.forEach(fn=>fn());
     return {initial,after:[state.totalSeconds,state.questionSeconds]};
   } finally {
     window.setInterval=originalInterval;window.clearInterval=originalClear;
     if(ownNow)Object.defineProperty(performance,'now',ownNow);else delete performance.now;
     state.timerId=null;state.questionTimerId=null;state.totalSeconds=TOTAL_EXAM_SECONDS;resetQuestionTimer();
   }
 });
 assert.deepEqual(clockResult,{initial:[100,100],after:[94,94]});
 await exam.evaluate(async()=>{state.isRecording=true;updateVoiceButton();await nextQuestion();});
 assert.equal(await exam.evaluate(()=>state.idx),0);assert.equal(await exam.locator('#nextBtn').isDisabled(),true);
 await exam.evaluate(()=>{state.isRecording=false;updateVoiceButton();});
 for(let i=0;i<15;i++) {
   await exam.evaluate(async i=>{
     const q=state.questions[state.idx];
     document.getElementById('answerInput').value=`For question ${i+1}, I remember an experience at home. I called a friend because I needed help. Then we solved the problem together.`;
     saveCurrent();await queueQuestionEvaluation(q);
   },i);
   await exam.waitForFunction(()=>Object.keys(state.evaluationJobs).length===0);
   await exam.locator('#nextBtn').click();
   if(i<14) assert.equal(await exam.evaluate(()=>state.idx),i+1);
 }
 await exam.waitForFunction(()=>state.examFinished);
 assert.equal(await exam.evaluate(()=>Object.keys(state.questionResults).length),15);
 assert.equal(await exam.evaluate(()=>state.history.length),15);
 assert.match(await exam.locator('#resultPanel').innerText(),/15 \/ 15문항/);
 assert.deepEqual(examErrors,[]);await exam.close();
 const recovery = await page.evaluate(()=>{
   const valid={questions:[{no:1,id:1,type:'묘사',prompt:'Describe home.'}],sessionMode:'practice',answers:{1:{bad:true}},idx:999,totalSeconds:0,questionSeconds:-100,
     questionFeedback:{1:'<img src=x onerror="window.injected=true"><script>window.injected=true</script>'},questionScores:{1:'wrong'},questionResults:{1:[]}};
   progressStorage.setItem(state.storageKey,JSON.stringify(valid));
   const restored=restoreProgress();
   progressStorage.setItem(state.storageKey,'{broken');const broken=restoreProgress();
   valid.questions[0].no=-1;progressStorage.setItem(state.storageKey,JSON.stringify(valid));const invalid=restoreProgress();
   progressStorage.setItem(state.historyStorageKey,JSON.stringify([null,5,{prompt:'OK',answer:'Hello',criteria:null}]));
   loadPracticeHistory();renderHistory();
   return {restored,broken,invalid,historyCount:state.history.length};
 });
 assert.equal(recovery.restored.idx,0);assert.equal(recovery.restored.totalSeconds,0);
 assert.equal(recovery.restored.questionSeconds,0);assert.deepEqual(recovery.restored.answers,{});
 assert.equal(recovery.restored.questionScores[1],undefined);
 assert.doesNotMatch(recovery.restored.questionFeedback[1],/onerror|<script/i);
 assert.equal(recovery.broken,null);assert.equal(recovery.invalid,null);assert.equal(recovery.historyCount,1);
 const whisperTimeout = await page.evaluate(async()=>{
   const originalNow=Date.now;let calls=0;
   Date.now=()=>calls++===0?0:200001;
   try {
     try {await waitForWhisperCompletion(['[00:00.000 --> 00:01.000] partial transcript'],1);return 'accepted';}
     catch(e){return e.code;}
   } finally {Date.now=originalNow;}
 });
 assert.equal(whisperTimeout,'WHISPER_TIMEOUT');
 await page.evaluate(()=>waitForWhisperCompletion(['whisper_print_timings: total time = 100'],1));
 const localDeadline=await page.evaluate(async()=>{
   const oldEngine=localLlmEngine,oldReady=localLlmReady,oldFault=localLlmFault;
   try {
     localLlmEngine={chat:{completions:{create:async()=>({choices:[{finish_reason:'stop',message:{content:'{"content":4,"fluency":4,"grammar":4,"pronunciation":5,"tip":"세부사항을 추가하세요."}'}}]})}}};
     localLlmReady=true;
     const normal=await evaluateWithLocalLLM('Describe home','My home is small.','묘사',{});
     let finish;const pending=new Promise(resolve=>{finish=resolve;});
     let error='';try{await withLocalLlmDeadline(pending,10);}catch(e){error=e.message;}
     const readyAfterTimeout=localLlmReady;
     finish({});await Promise.resolve();
     let rejected=false;try{await evaluateWithLocalLLM('x','x','x',{});}catch{rejected=true;}
     return {score:normal.score,error,readyAfterTimeout,readyAfterLateResult:localLlmReady,rejected};
   }finally{localLlmEngine=oldEngine;localLlmReady=oldReady;localLlmFault=oldFault;}
 });
 assert.equal(localDeadline.score,40);assert.match(localDeadline.error,/시간이 초과/);
 assert.equal(localDeadline.readyAfterTimeout,false);assert.equal(localDeadline.readyAfterLateResult,false);assert.equal(localDeadline.rejected,true);
 const microphoneFailures=await page.evaluate(async()=>{
   releaseMicrophoneStream();
   const getUserMedia=navigator.mediaDevices.getUserMedia,Recorder=window.MediaRecorder;
   const messages=[];let stopped=false;
   try {
     for(const name of ['NotAllowedError','NotFoundError']) {
       navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('test',name);};
       messages.push({started:await startAudioCapture(),error:state.audioCaptureError});
     }
     navigator.mediaDevices.getUserMedia=async()=>({getTracks:()=>[{stop(){stopped=true;}}]});
     window.MediaRecorder=class {static isTypeSupported(){return true;}constructor(){throw Error('Recorder construction failed');}};
     const started=await startAudioCapture();
     return {messages,started,stopped,streamReleased:state.audioStream===null};
   }finally {navigator.mediaDevices.getUserMedia=getUserMedia;window.MediaRecorder=Recorder;state.audioCaptureError='';}
 });
 assert.equal(microphoneFailures.messages[0].started,false);assert.match(microphoneFailures.messages[0].error,/권한/);
 assert.equal(microphoneFailures.messages[1].started,false);assert.match(microphoneFailures.messages[1].error,/찾지/);
 assert.equal(microphoneFailures.started,false);assert.equal(microphoneFailures.stopped,true);assert.equal(microphoneFailures.streamReleased,true);
 const bulkStorageFailure=await page.evaluate(async()=>{
   const prepare=prepareLocalTts,one=prepareOneQuestionRecording,bank=activeQuestionBank;
   let generated=0;
   try {
     prepareLocalTts=async()=>true;
     prepareOneQuestionRecording=async question=>{generated++;return {valid:true,persisted:false,generated:true,question};};
     activeQuestionBank=bank.slice(0,10);
     document.getElementById('prepareAllTtsBtn').disabled=false;
     const ok=await prepareAllQuestionRecordings();
     return {ok,generated,busy:localTtsBulkPreparing,processing:state.processingTasks};
   } finally {prepareLocalTts=prepare;prepareOneQuestionRecording=one;activeQuestionBank=bank;}
 });
 assert.equal(bulkStorageFailure.ok,false);assert.equal(bulkStorageFailure.generated,1);
 assert.equal(bulkStorageFailure.busy,false);assert.equal(bulkStorageFailure.processing,0);
 const cacheOpen=await page.evaluate(async()=>{
   const descriptor=Object.getOwnPropertyDescriptor(window,'indexedDB');
   let request;let closed=0;
   Object.defineProperty(window,'indexedDB',{configurable:true,value:{open(){request={result:{close(){closed++;}}};return request;}}});
   try {
     const blocked=openAppCacheDb('test',1,'audio',20).catch(e=>e.message);
     request.onblocked();const blockedMessage=await blocked;request.onsuccess();
     const timeout=await openAppCacheDb('test',1,'audio',10).catch(e=>e.message);
     request.onsuccess();
     return {blockedMessage,timeout,closed};
   }finally{if(descriptor)Object.defineProperty(window,'indexedDB',descriptor);else delete window.indexedDB;}
 });
 assert.match(cacheOpen.blockedMessage,/다른 탭/);assert.match(cacheOpen.timeout,/시간이 초과/);assert.equal(cacheOpen.closed,2);
 const realCache=await page.evaluate(async()=>{const db=await openWhisperCacheDb();const hasStore=db.objectStoreNames.contains(WHISPER_CACHE_STORE);db.close();return hasStore;});
 assert.equal(realCache,true);
 const playback=await page.evaluate(()=>{
   const q={no:1,id:1,prompt:'Describe your home.',type:'묘사'};
   state.questions=[q];state.idx=0;state.questionFeedback={};state.promptPlayCount={};state.examFinished=false;
   state.promptPlaybackPending=true;const token=state.promptPlaybackToken;
   completePromptPlayback(q,token,'failed',true);
   const failedCount=state.promptPlayCount[1]||0;
   state.promptPlaybackPending=true;startPromptAnswerTimer(q);
   const resumed=!state.questionTimerPaused;
   completePromptPlayback(q,token,'done');completePromptPlayback(q,token,'duplicate');
   const once=state.promptPlayCount[1];
   state.promptPlaybackPending=true;stopPromptPlayback();completePromptPlayback(q,token,'late');
   clearInterval(state.questionTimerId);
   return {failedCount,resumed,once,afterLate:state.promptPlayCount[1]};
 });
 assert.deepEqual(playback,{failedCount:0,resumed:true,once:1,afterLate:1});
 const fallbackLimit=await page.evaluate(async()=>{
   const candidates=getGeminiRequestCandidates,fetcher=fetchGeminiGenerateContent;
   const usage=state.geminiRuntime;
   let calls=0;
   try {
     state.geminiRuntime={cursor:0,usage:{},lastModel:''};
     getGeminiRequestCandidates=()=>['gemini-3-flash','gemini-2.5-flash','gemini-2.5-flash-lite','gemini-3.1-flash-lite'];
     fetchGeminiGenerateContent=async()=>{calls++;throw new Error('Gemini 요청 오류 503: busy');};
     try{await runGeminiWithFallback({model:GEMINI_AUTO_MODEL,apiKey:'test'},()=>({}));}catch{}
     return calls;
   }finally {getGeminiRequestCandidates=candidates;fetchGeminiGenerateContent=fetcher;state.geminiRuntime=usage;}
 });
 assert.equal(fallbackLimit,3);
 const openaiBodies=[];
 await page.route('https://api.openai.com/v1/chat/completions',async route=>{
   openaiBodies.push(route.request().postDataJSON());
   await route.fulfill({status:200,json:{choices:[{finish_reason:'stop',message:{content:'{"content":4,"fluency":4,"grammar":4,"pronunciation":5,"tip":"세부사항을 보완하세요."}'}}]}});
 });
 await page.evaluate(async()=>{
   const original=readEvalConfig;
   try {
     for(const model of ['gpt-5-mini','gpt-4o-mini']) {
       readEvalConfig=()=>({mode:'openai',model,apiKey:'test-key'});
       await evaluateWithOpenAI('Describe home','My home is small.','묘사',{});
     }
   }finally {readEvalConfig=original;}
 });
 assert.equal(openaiBodies[0].temperature,undefined);assert.equal(openaiBodies[0].max_tokens,undefined);
 assert.equal(openaiBodies[0].max_completion_tokens,4096);assert.equal(openaiBodies[0].reasoning_effort,'low');
 assert.equal(openaiBodies[1].temperature,0.1);assert.equal(openaiBodies[1].max_tokens,512);
 const importChecks=await page.evaluate(async()=>{
   const originalAlert=window.alert;const notices=[];window.alert=message=>notices.push(message);
   try {
     state.history=[sanitizeImportedHistoryEntry({id:'keep',prompt:'Home',answer:'My home',timestamp:'2026-01-01T00:00:00Z'},0)];
     await importPracticeHistory(new File(['{broken'],'bad.json'));
     const afterMalformed=state.history.length;
     await importPracticeHistory({size:6*1024*1024,text(){throw Error('must not read oversized file');}});
     await importPracticeHistory(new File([JSON.stringify({format:'wrong',history:[]})],'wrong.json'));
     const records=[...state.history,{id:'new',prompt:'Work',answer:'I work at home',timestamp:'2026-02-01T00:00:00Z',provisional:true}];
     const file=new File([JSON.stringify({format:'opic-practice-history',version:1,history:records})],'good.json');
     await importPracticeHistory(file);await importPracticeHistory(file);
     return {afterMalformed,count:state.history.length,ids:state.history.map(e=>e.id),provisional:state.history[0].provisional,notices};
   }finally {window.alert=originalAlert;}
 });
 assert.equal(importChecks.afterMalformed,1);assert.equal(importChecks.count,2);assert.deepEqual(importChecks.ids,['new','keep']);assert.equal(importChecks.provisional,true);
 assert.match(importChecks.notices[1],/5MB/);assert.match(importChecks.notices[2],/OPIc 연습 기록/);
 const handshakeRace=await page.evaluate(async()=>{
   const original=fetchApiResponse;const releases=[];
   try {
     setEvalMode('gemini');document.getElementById('apiKeyInput').value='old-key';
     fetchApiResponse=()=>new Promise(resolve=>releases.push(resolve));
     const old=performApiHandshake();
     document.getElementById('apiKeyInput').value='new-key';
     const current=performApiHandshake();
     releases[1](new Response(JSON.stringify({models:[{name:'models/gemini-2.5-flash',supportedGenerationMethods:['generateContent']}]})));
     await current;const fingerprint=state.apiHandshake.gemini.fingerprint;
     releases[0](new Response('old key failure',{status:401}));await old;
     return {fingerprint,after:state.apiHandshake.gemini.fingerprint,ready:state.apiHandshake.gemini.ready,key:document.getElementById('apiKeyInput').value};
   }finally {fetchApiResponse=original;}
 });
 assert.equal(handshakeRace.after,handshakeRace.fingerprint);assert.equal(handshakeRace.ready,true);assert.equal(handshakeRace.key,'new-key');
 console.log('PASS: key retention, timer, finish guards, microphone capture, STT recovery, quota failover, structured schema, truncated-output retry, thought filtering, malformed-response fallback, safety block, invalid scores, provisional summary, no browser runtime errors');
 } finally { if(browser) await browser.close();server.close(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
