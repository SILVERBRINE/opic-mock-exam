const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');const {chromium}=require('playwright');
(async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(fs.readFileSync('index.html','utf8').replace('<script src="coi-serviceworker.js"></script>',''));});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.OPIC_BROWSER_CHANNEL?{channel:process.env.OPIC_BROWSER_CHANNEL}:{})});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(()=>!recordingScan);
  assert.deepEqual(await page.locator('.mode-btn').evaluateAll(xs=>xs.map(x=>x.dataset.mode)),['gemini','openai']);
  assert.equal(await page.evaluate(()=>getEvalMode()),'gemini');assert.equal(await page.locator('[data-tts-mode="browser"], [data-tts-mode="local"], [data-mode="local"]').count(),0);
  assert.equal(await page.locator('#startBtn').getAttribute('aria-disabled'),'true');
  const startBox=await page.locator('#startBtn').boundingBox();await page.mouse.click(startBox.x+startBox.width/2,startBox.y+startBox.height/2);await page.waitForFunction(()=>document.getElementById('startDialog').open);assert.match(await page.locator('#startDialog').innerText(),/녹음본 준비/);
  await page.evaluate(()=>{window.preparations=0;prepareAllQuestionRecordings=async()=>{window.preparations++;readCachedQuestionAudio=async()=>new Blob(['cached']);await refreshRecordingReadiness();};});
  await page.locator('#startDialogActions button').getByText('확인',{exact:true}).click();await page.waitForFunction(()=>recordingsReady);assert.equal(await page.evaluate(()=>window.preparations),1);
  await page.locator('#practiceStartBtn').click();await page.waitForFunction(()=>document.getElementById('startDialog').open);
  assert.deepEqual(await page.locator('#startDialogActions button').allTextContents(),['오프라인으로 시작','API 설정','닫기']);
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/onboarding-mobile.png'});
  await page.setViewportSize({width:1280,height:900});
  await page.locator('#startDialogActions button').getByText('API 설정',{exact:true}).click();await page.waitForFunction(()=>document.activeElement.id==='evaluationSection');
  await page.locator('#practiceStartBtn').click();await page.locator('#startDialogActions button').getByText('닫기',{exact:true}).click();await page.waitForFunction(()=>!document.getElementById('startDialog').open);
  assert.equal(await page.evaluate(()=>state.questions.length),0);
  await page.locator('#practiceStartBtn').click();await page.locator('#startDialogActions button').getByText('오프라인으로 시작',{exact:true}).click();await page.waitForFunction(()=>state.questions.length===1);assert.equal(await page.evaluate(()=>getEvalMode()),'local');
  await page.reload();await page.waitForFunction(()=>!recordingScan);assert.equal(await page.evaluate(()=>getEvalMode()),'gemini');
  const cacheOnly=await page.evaluate(async()=>{readCachedQuestionAudio=async()=>null;let generated=false;generateQuestionAudioVerified=async()=>{generated=true;};let message='';try{await getQuestionAudio(activeQuestionBank[0]);}catch(e){message=e.message;}return {generated,message};});assert.equal(cacheOnly.generated,false);assert.match(cacheOnly.message,/녹음본이 없습니다/);
  await page.reload();await page.waitForFunction(()=>!recordingScan);
  const bulk=await page.evaluate(async()=>{
   prepareLocalTts=async()=>{};activeQuestionBank=activeQuestionBank.slice(0,2);
   prepareOneQuestionRecording=async()=>({valid:true,cached:false,generated:true,attempts:1,persisted:false,elapsed:1});
   const failed=await prepareAllQuestionRecordings();const disabled=document.getElementById('startBtn').getAttribute('aria-disabled');
   readCachedQuestionAudio=async()=>new Blob(['memory-only']);const rescan=await refreshRecordingReadiness();
   prepareOneQuestionRecording=async()=>({valid:true,cached:false,generated:true,attempts:1,persisted:true,elapsed:1});
   const succeeded=await prepareAllQuestionRecordings();return {failed,disabled,rescan,succeeded,ready:recordingsReady};
  });assert.deepEqual(bulk,{failed:false,disabled:'true',rescan:false,succeeded:true,ready:true});
  await page.evaluate(()=>{setEvalMode('gemini');document.getElementById('apiKeyInput').value='test-only';state.modelCatalog.gemini=['gemini-3.1-flash-lite'];state.apiHandshake.gemini={ready:true,fingerprint:makeKeyFingerprint('test-only'),model:'gemini-3.1-flash-lite'};renderModelSelect('gemini');window.startedMode='';startExam=mode=>{window.startedMode=mode;};});
  await page.locator('#startBtn').click();await page.waitForFunction(()=>window.startedMode==='exam');assert.equal(await page.locator('#startDialog').evaluate(x=>x.open),false);
  await page.locator('#practiceStartBtn').click();await page.waitForFunction(()=>window.startedMode==='practice');
  await page.evaluate(()=>clearQuestionAudioCache());assert.equal(await page.locator('#startBtn').getAttribute('aria-disabled'),'true');
  assert.deepEqual(errors,[]);console.log('PASS: recording-only UI, Gemini first/default, preparation click, missing API dialog order, settings focus, close, offline practice, legacy offline reset, no on-demand TTS, real bulk completion/failure gate, connected API exam/practice, cache deletion');
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
