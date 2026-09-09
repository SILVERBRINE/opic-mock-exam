const fs = require('node:fs');
const http = require('node:http');
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/SurfacePro11/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
async function main() {
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(fs.readFileSync('index.html','utf8').replace('<script src="coi-serviceworker.js"></script>',''));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try {
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
 await page.unroute('https://generativelanguage.googleapis.com/**');
 await page.route('https://generativelanguage.googleapis.com/**',async route=>{
   const body=route.request().postDataJSON();
   const audio=body.contents[0].parts.some(p=>p.inline_data);
   await new Promise(r=>setTimeout(r,150));
   await route.fulfill({status:200,json:{candidates:[{finishReason:'STOP',content:{parts:[{text:audio?'I stayed home because a delivery arrived late. I called the company and they helped me.':'{"content":4,"fluency":4,"grammar":3,"pronunciation":5,"tip":"구체적으로 답하세요."}'}]}}]}});
 });
 await page.locator('#questionFeedback button').click();
 assert.equal(await page.locator('#voiceBtn').isDisabled(),true);
 assert.equal(await page.locator('#submitBtn').isDisabled(),true);
 await page.waitForFunction(()=>!Object.keys(state.transcriptionJobs).length&&!Object.keys(state.evaluationJobs).length);
 assert.equal(await page.evaluate(()=>Boolean(state.failedRecordings[1])),false);
 assert.equal(await page.locator('#submitBtn').isDisabled(),false);
 assert.equal(await page.evaluate(()=>normalizeEvalResult('{}')),null);
 await page.unroute('https://generativelanguage.googleapis.com/**');
 let quotaRequests=0;
 await page.route('https://generativelanguage.googleapis.com/**',async route=>{
   quotaRequests++;
   if (quotaRequests===1) return route.fulfill({status:429,json:{error:{message:'Quota exhausted'}}});
   await route.fulfill({status:200,json:{candidates:[{finishReason:'STOP',content:{parts:[{text:'{"content":4,"fluency":4,"grammar":3,"pronunciation":5,"tip":"내용을 보완하세요."}'}]}}]}});
 });
 const failover=await page.evaluate(async()=>{
   state.modelCatalog.gemini=['gemini-2.5-flash','gemini-3-flash'];
   state.apiHandshake.gemini.model='auto';renderModelSelect('gemini');
   state.geminiRuntime={cursor:0,usage:{},lastModel:''};state.geminiModelByQuestion={};
   return evaluateWithGemini('Describe home','My home is small.','묘사',{},99);
 });
 assert.equal(quotaRequests,2);assert.ok(failover.model);
 await page.locator('#submitBtn').click();
 await page.waitForFunction(()=>!document.getElementById('resultPanel').classList.contains('hide'));
 await page.evaluate(()=>clearEvalConfig());
 await page.reload();
 assert.equal(await page.locator('#apiKeyInput').inputValue(),'');
 assert.deepEqual(errors,[]);
 console.log('PASS: reload/mode key retention, 180s timer/pause, finish guards, empty STT retry, retained audio, HTTP recovery, evaluation completion, JSON validation, no browser runtime errors');
 } finally { await browser.close();server.close(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
