const fs=require('node:fs');const http=require('node:http');const assert=require('node:assert/strict');const {chromium}=require('playwright');
(async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(fs.readFileSync('index.html','utf8').replace('<script src="coi-serviceworker.js"></script>',''));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.OPIC_BROWSER_CHANNEL?{channel:process.env.OPIC_BROWSER_CHANNEL}:{})});
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const bodies=[];await page.route('https://generativelanguage.googleapis.com/**',async route=>{
   bodies.push(route.request().postDataJSON());
   await route.fulfill(bodies.length===1?{status:400,json:{error:{message:'Thinking level MINIMAL is not supported for this model. Please retry with other thinking level.'}}}:{status:200,json:{candidates:[{content:{parts:[{text:'Recovered transcript'}]},finishReason:'STOP'}]}});
  });
  const compatibility=await page.evaluate(async()=>{
   const body={contents:[{parts:[{text:'Test'}]}],generationConfig:buildGeminiGenerationConfig('gemini-3.8-flash',{maxOutputTokens:4096})};
   const result=await fetchGeminiGenerateContent({apiKey:'test-only'},'gemini-3.8-flash',body,'음성 전사');
   return {text:extractGeminiText(result),original:body.generationConfig.thinkingConfig.thinkingLevel};
  });
  assert.equal(compatibility.text,'Recovered transcript');assert.equal(compatibility.original,'low');
  assert.equal(bodies.length,2);assert.equal(bodies[1].generationConfig.thinkingConfig,undefined);assert.equal(bodies[1].generationConfig.maxOutputTokens,4096);
  assert.equal(await page.evaluate(()=>buildGeminiGenerationConfig('gemini-3.8-flash').thinkingConfig),undefined);
  await page.evaluate(()=>{
   setEvalMode('local');startExam('exam');window.sttResolvers={};window.evaluationResolvers={};
   window.originalSTT=transcribeCapturedAudio;
   transcribeCapturedAudio=(blob,no)=>new Promise(resolve=>window.sttResolvers[no]=resolve);
   evaluateQuestionByNo=(no,answer)=>new Promise(resolve=>window.evaluationResolvers[no]=()=>resolve(buildFeedbackFromRules(state.questions[no-1].prompt,answer,state.questions[no-1].type,{})));
   queueCapturedAudioTranscription(state.questions[0],new Blob(['one']));
  });
  assert.equal(await page.locator('#nextBtn').isDisabled(),false);
  await page.locator('#nextBtn').click();assert.equal(await page.evaluate(()=>state.idx),1);
  await page.evaluate(()=>{document.getElementById('answerInput').value='Second question is recording';state.isRecording=true;state.speechMetrics.pauseDurations=[9];});
  await page.evaluate(()=>window.sttResolvers[1]('First answer belongs only to question one.'));
  await page.waitForFunction(()=>!state.transcriptionJobs[1]);
  assert.equal(await page.locator('#answerInput').inputValue(),'Second question is recording');
  assert.equal(await page.evaluate(()=>state.answers[1]),'First answer belongs only to question one.');
  assert.equal(await page.locator('#qMap [data-question-no="1"]').evaluate(e=>e.classList.contains('done')),true);
  assert.equal(await page.evaluate(()=>state.speechSignalsByQuestion[1].pauseCount),0);
  await page.evaluate(()=>{state.isRecording=false;queueCapturedAudioTranscription(state.questions[1],new Blob(['two']));});
  await page.locator('#nextBtn').click();assert.equal(await page.evaluate(()=>state.idx),2);
  await page.evaluate(()=>{window.submission=submitExam();});
  assert.equal(await page.evaluate(()=>state.submitInProgress),true);assert.equal(await page.evaluate(()=>state.examFinished),false);
  await page.evaluate(()=>window.sttResolvers[2]('Second answer is kept on question two.'));
  await page.waitForFunction(()=>Boolean(window.evaluationResolvers[2]));
  await page.evaluate(()=>{window.evaluationResolvers[2]();window.evaluationResolvers[1]();});
  await page.waitForFunction(()=>state.examFinished);
  assert.equal(await page.evaluate(()=>Object.keys(state.questionResults).length),2);
  const localQueue=await page.evaluate(async()=>{
   const original=transcribeCapturedAudioWithWhisper;let active=0,peak=0;const order=[];
   transcribeCapturedAudioWithWhisper=async(blob,no)=>{active++;peak=Math.max(peak,active);order.push(no);await new Promise(r=>setTimeout(r,10));active--;return String(no);};
   try{const values=await Promise.all([window.originalSTT(new Blob(['a']),7),window.originalSTT(new Blob(['b']),8)]);return {peak,order,values};}finally{transcribeCapturedAudioWithWhisper=original;}
  });
  assert.deepEqual(localQueue,{peak:1,order:[7,8],values:['7','8']});
  await page.evaluate(()=>{state.questions=[{no:1,id:199,type:'묘사',prompt:'Old practice'}];state.answers={1:'old'};state.sessionMode='practice';progressStorage.setItem(state.storageKey,JSON.stringify({...state,questions:state.questions,answers:state.answers}));});
  await page.reload();let dialogs=0;page.on('dialog',async dialog=>{dialogs++;await dialog.dismiss();});
  await page.evaluate(()=>{setEvalMode('local');startExam('practice');});
  assert.equal(dialogs,0);assert.equal(await page.evaluate(()=>state.answers[1]||''),'');assert.equal(await page.evaluate(()=>state.questions.length),1);
  assert.deepEqual(errors,[]);console.log('PASS: thinking compatibility retry, background navigation, isolated results, green status, submission waits for jobs, practice always starts fresh');
 }finally{if(browser)await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
