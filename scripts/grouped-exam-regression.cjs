const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(fs.readFileSync('index.html','utf8').replace('<script src="coi-serviceworker.js"></script>',''));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.OPIC_BROWSER_CHANNEL?{channel:process.env.OPIC_BROWSER_CHANNEL}:{}),args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.evaluate(()=>{
   setEvalMode('gemini');document.getElementById('apiKeyInput').value='test-only';
   state.modelCatalog.gemini=['gemini-3.5-flash-lite','gemini-3.1-flash-lite','gemini-3.8-flash'];
   state.apiHandshake.gemini={ready:true,fingerprint:makeKeyFingerprint('test-only'),model:'auto'};renderModelSelect('gemini');saveEvalConfig();startExam('exam');
  });
  const requests=[];let rejectSecond=true;
  await page.route('https://generativelanguage.googleapis.com/**',async route=>{
   const body=route.request().postDataJSON(),prompt=body.contents[0].parts[0].text;
   const ids=[...prompt.matchAll(/^questionNo: (\d+)$/gm)].map(m=>Number(m[1]));requests.push({url:route.request().url(),ids});
   const results=ids.map(questionNo=>({questionNo,content:4,fluency:4,grammar:3,pronunciation:5,tip:'질문의 구체적인 조건을 보완하세요.'}));
   if(rejectSecond&&requests.length===2)results[1].questionNo=results[0].questionNo;
   await route.fulfill({json:{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({results})}]}}]}});
  });
  await page.evaluate(async()=>{
   for(const q of state.questions){state.answers[q.no]='I remember shopping with my friend. We went to a store because we needed food. Then we returned home.';await queueQuestionEvaluation(q);}
   document.getElementById('answerInput').value=state.answers[1];
  });
  assert.equal(requests.length,0);assert.equal(await page.evaluate(()=>Object.keys(state.questionResults).length),0);
  await page.evaluate(()=>{
   window.originalTranscribe=transcribeCapturedAudio;
   transcribeCapturedAudio=()=>new Promise(resolve=>window.completeTranscription=resolve);
   queueCapturedAudioTranscription(state.questions[0],new Blob(['test audio']));
   window.submission=submitExam();
  });
  assert.equal(requests.length,0);
  await page.evaluate(async()=>{window.completeTranscription(state.answers[1]);await window.submission;transcribeCapturedAudio=window.originalTranscribe;});
  assert.equal(await page.evaluate(()=>state.examFinished),false);assert.equal(await page.evaluate(()=>Object.keys(state.questionResults).length),5);
  assert.match(await page.locator('#questionFeedback').innerText(),/一部|일부/);
  rejectSecond=false;await page.evaluate(()=>submitExam());
  assert.equal(await page.evaluate(()=>state.examFinished),true);assert.equal(await page.evaluate(()=>Object.keys(state.questionResults).length),15);
  assert.deepEqual(requests.map(r=>r.ids),[[1,2,3,4,5],[6,7,8,9,10],[6,7,8,9,10],[11,12,13,14,15]]);
  assert.deepEqual(requests.map(r=>r.url.match(/models\/([^:]+)/)[1]),['gemini-3.5-flash-lite','gemini-3.1-flash-lite','gemini-3.5-flash-lite','gemini-3.1-flash-lite']);
  const strict=await page.evaluate(()=>{state.modelCatalog.gemini=['gemini-3.8-flash'];state.geminiModelByQuestion[1]='gemini-3.8-flash';return getGeminiRequestCandidates({model:'auto'},1);});assert.deepEqual(strict,[]);
  const mic=await page.evaluate(async()=>{
   state.examFinished=false;let permissionRequests=0;const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
   navigator.mediaDevices.getUserMedia=(...args)=>{permissionRequests++;return original(...args);};
   try{initVoiceInput();const noRecognizer=state.recognition===null;await startAudioCapture();const stream=state.audioStream;
    await new Promise(r=>setTimeout(r,600));const stillRecording=state.audioRecorder.state==='recording';await stopAudioCapture();await startAudioCapture();
    const reused=state.audioStream===stream;await stopAudioCapture();releaseMicrophoneStream();return {permissionRequests,noRecognizer,stillRecording,reused};
   }finally{navigator.mediaDevices.getUserMedia=original;}
  });assert.deepEqual(mic,{permissionRequests:1,noRecognizer:true,stillRecording:true,reused:true});
  const interruption=await page.evaluate(async()=>{
   setEvalMode('local');state.isRecording=true;state.questionExpired=false;state.manualStopRequested=false;
   const Original=window.SpeechRecognition;let starts=0;
   window.SpeechRecognition=class{start(){starts++;}abort(){}stop(){}};
   try{initVoiceInput();const recognition=state.recognition;await startAudioCapture();await recognition.onend();
    const result={recording:state.audioRecorder.state,recognitionDetached:state.recognition===null,starts,error:!!state.audioCaptureError};
    state.isRecording=false;await stopAudioCapture();releaseMicrophoneStream();return result;
   }finally{window.SpeechRecognition=Original;}
  });assert.deepEqual(interruption,{recording:'recording',recognitionDetached:true,starts:0,error:true});
  await page.route('https://api.openai.com/**',route=>route.fulfill({json:{choices:[{finish_reason:'stop',message:{content:JSON.stringify({results:[{questionNo:1,content:3,fluency:4,grammar:3,pronunciation:5,tip:'비교 조건을 보완하세요.'}]})}}]}}));
  assert.equal(await page.evaluate(async()=>{const r=await requestExamGroup([state.questions[0]],{mode:'openai',model:'gpt-4o-mini',apiKey:'test-only'});return r.results.get('1').criteria.content;}),3);
  assert.deepEqual(errors,[]);console.log('PASS: deferred API grading, 5-question groups, strict IDs, preserved successful groups, two-model alternation, no unrelated fallback, microphone reuse and interruption survival, OpenAI group response');
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
