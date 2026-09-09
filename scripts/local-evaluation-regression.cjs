const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');const {chromium}=require('playwright');
(async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(fs.readFileSync('index.html','utf8').replace('<script src="coi-serviceworker.js"></script>',''));});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.OPIC_BROWSER_CHANNEL?{channel:process.env.OPIC_BROWSER_CHANNEL}:{})});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
  const results=await page.evaluate(async()=>{
   setEvalMode('local');let warmGood=false,truncate=false;const calls=[];
   Object.defineProperty(navigator,'gpu',{configurable:true,value:{requestAdapter:async()=>({features:new Set(['shader-f16'])})}});
   prepareWhisperLocal=async()=>{whisperModelReady=true;return true;};
   const engine={unload:async()=>{},chat:{completions:{create:async args=>{
    calls.push(args);const health=JSON.parse(args.response_format.schema).properties.ready;
    return {choices:[{finish_reason:truncate?'length':'stop',message:{content:health?JSON.stringify({ready:warmGood}):JSON.stringify({content:8,fluency:7,grammar:8,pronunciation:5,tip:'Add a specific example.'})}}]};
   }}}};
   const install=()=>{localLlmModulePromise=Promise.resolve({prebuiltAppConfig:{model_list:[{model_id:LOCAL_LLM_MODEL}]},CreateMLCEngine:async()=>engine});};
   install();await prepareLocalLlm();const failed={ready:localLlmReady,whisper:whisperModelReady,status:document.getElementById('localAiStatus').textContent};
   warmGood=true;install();await prepareLocalLlm();const ready=localLlmReady;
   state.questions=[{no:1,id:1,type:'묘사',prompt:'Describe your home and your favorite room.'},{no:2,id:2,type:'묘사',prompt:'Describe your home and your favorite room.'}];
   state.answers={1:'My home is a small apartment with a sunny kitchen. My favorite room is the living room because I read there.',2:'My home is a small apartment with a sunny kitchen. My favorite room is the living room because I read there.'};
   const good=await evaluateQuestionByNo(1,state.answers[1],{});
   const invalid=normalizeEvaluationScore(good,state.questions[0].prompt,'Mic test 123 mic test 123','묘사',{});
   truncate=true;const fallback=await evaluateQuestionByNo(2,state.answers[2],{});
   const failureHtml=buildEvaluationHtml(fallback,state.questions[1],state.answers[2]);
   state.questionResults={1:good,2:fallback};state.questionScores={1:good.score,2:fallback.score};state.questionCriteria={1:good.criteria,2:fallback.criteria};document.getElementById('answerInput').value=state.answers[1];state.sessionMode='exam';finishExamNow();
   return {failed,ready,grammar:good.criteria.grammar,model:good.model,provisional:good.provisional,invalidScore:invalid.score,fallbackModel:fallback.model,failureHtml,readyAfterFailure:localLlmReady,summary:document.getElementById('resultPanel').textContent,schemas:calls.every(c=>c.response_format?.schema)};
  });
  assert.equal(results.failed.ready,false);assert.equal(results.failed.whisper,true);assert.match(results.failed.status,/Whisper.*전사는 준비됨/);assert.equal(results.ready,true);
  assert.equal(results.grammar,8);assert.match(results.model,/Llama/);assert.equal(results.provisional,true);assert.equal(results.invalidScore,77);
  assert.equal(results.fallbackModel,'offline-rules');assert.match(results.failureHtml,/로컬 AI 평가 실패/);assert.doesNotMatch(results.failureHtml,/온라인 평가 실패/);assert.equal(results.readyAfterFailure,false);
  assert.match(results.summary,/로컬 AI 참고 평가 1문항 · 규칙 평가 1문항/);assert.equal(results.schemas,true);assert.deepEqual(errors,[]);
  console.log('PASS: inference health gate, partial Whisper readiness, retry preparation, structured local scoring, no rule-weight distortion, AI score preservation, truncation fallback attribution, actual model counts');
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
