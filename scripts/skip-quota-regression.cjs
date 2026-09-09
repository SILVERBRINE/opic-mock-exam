const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');const {chromium}=require('playwright');
(async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(fs.readFileSync('index.html','utf8').replace('<script src="coi-serviceworker.js"></script>',''));});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.OPIC_BROWSER_CHANNEL?{channel:process.env.OPIC_BROWSER_CHANNEL}:{})});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.evaluate(()=>{setEvalMode('local');startExam('exam');state.isRecording=true;});await page.evaluate(()=>skipCurrentQuestion());assert.equal(await page.evaluate(()=>Object.keys(state.skippedQuestions).length),0);
  await page.evaluate(()=>{state.isRecording=false;updateVoiceButton();});await page.locator('#skipBtn').click();await page.locator('#skipBtn').click();
  assert.equal(await page.evaluate(()=>state.idx),2);assert.equal(await page.locator('#skipBtn').isDisabled(),true);await page.evaluate(()=>skipCurrentQuestion());assert.equal(await page.evaluate(()=>state.idx),2);
  assert.equal(await page.evaluate(()=>Object.keys(restoreProgress().skippedQuestions).length),2);
  await page.evaluate(()=>{
   for(const q of state.questions.filter(q=>!state.skippedQuestions[q.no])){const answer='I went shopping yesterday because I needed food. Then I returned home.';state.answers[q.no]=answer;state.questionScores[q.no]=80;state.questionResults[q.no]={...buildFeedbackFromRules(q.prompt,answer,q.type),score:80,provisional:false,model:'test-model'};}
   document.getElementById('answerInput').value=state.answers[3];finishExamNow();
  });
  assert.equal(await page.locator('.summary-card h1').first().innerText(),'80/100');assert.match(await page.locator('#resultPanel').innerText(),/13 \/ 13문항/);assert.match(await page.locator('#resultPanel').innerText(),/건너뛰기 2문항 제외/);
  await page.evaluate(()=>{state.examFinished=false;document.getElementById('resultPanel').classList.add('hide');state.questionResults[3].provisional=true;finishExamNow();});assert.equal(await page.locator('.summary-card h1').first().innerText(),'산정 보류');
  const requests=[];await page.route('https://generativelanguage.googleapis.com/**',async route=>{requests.push(route.request().url());await route.fulfill(requests.length===1?{status:503,json:{error:{message:'high demand'}}}:{status:200,json:{candidates:[{content:{parts:[{text:'ok'}]},finishReason:'STOP'}]}});});
  const result=await page.evaluate(async()=>{state.modelCatalog.gemini=['gemini-3.5-flash-lite','gemini-3.1-flash-lite'];state.geminiRuntime={cursor:0,usage:{},lastModel:''};state.geminiModelByQuestion={};return runGeminiWithFallback({mode:'gemini',model:'auto',apiKey:'test-only'},()=>({contents:[{parts:[{text:'test'}]}]}),'평가',1);});
  assert.equal(requests.length,2);assert.notEqual(requests[0],requests[1]);assert.ok(requests[1].includes(result.model));
  console.log('PASS: two explicit skips, exclusion from denominator, capture guard, restored skip limit, provisional total withheld, Auto switches model after 503');
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
