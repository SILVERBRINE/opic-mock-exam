const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(fs.readFileSync('index.html','utf8').replace('<script src="coi-serviceworker.js"></script>',''));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.OPIC_BROWSER_CHANNEL?{channel:process.env.OPIC_BROWSER_CHANNEL}:{})});
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const actual=await page.evaluate(()=>{
   const validAnswers=[
    'Usually, every morning I check my phone. First I check the time. Then I check messages and reply to emails. I use Instagram to read news, so that maybe I just check this some social issue. This is my normal routine to use my phone.',
    'I like it. I like it a lot.',
    'I did a microphone test before the online meeting and then called my colleagues.',
    'Please check this message before you reply.',
    'I buy books to prepare for my English test.'
   ];
   const checks=['Mic test 123 mic test 123','Buy Test 123. Mike Test. Mike test 123.','Sound check one two three','test test test'];
   const classifications={valid:validAnswers.map(a=>normalizeEvaluationScore({criteria:{content:8,fluency:7,grammar:6}}, "", a).score),checks:checks.map(a=>normalizeEvaluationScore({criteria:{content:8,fluency:7,grammar:6}}, "", a).score)};
   const answer='The route was blocked. I checked an alternative and arrived on time.';
   const raw={content:9,fluency:9,grammar:8,pronunciation:5,tip:'Keep the clear sequence.',contentReason:'“arrived on time” supplies the outcome.',fluencyReason:'“checked an alternative” links action to outcome.',grammarReason:'“was blocked” uses the past passive.'};
   const result=normalizeEvaluationScore(normalizeEvalResult(JSON.stringify(raw)),'Explain how an unexpected neighborhood disruption affected your routine.',answer,'experience',{recognitionConfidence:0});
   const highConfidence=normalizeEvaluationScore(result,'Describe transport.',answer,'experience',{recognitionConfidence:1});
   const html=buildEvaluationHtml(result);
   const invalid=normalizeEvaluationScore(result,'Describe transport.','Mic test 123 mic test 123','experience',{});
   const prompt=buildEvalPrompt('Question','Answer','type');
   const phoneResult=normalizeEvaluationScore(normalizeEvalResult(JSON.stringify(raw)),'What tasks do you regularly complete on your phone?',validAnswers[0],'routine',{});
   return {classifications,phoneScore:phoneResult.score,phoneFeedback:phoneResult.feedback,score:result.score,confidenceScore:highConfidence.score,pronunciation:result.criteria.pronunciation,evidence:result.evidence,html,invalid:invalid.score,prompt,words:buildEvalPrompt('','','').split(/\s+/).length,version:document.title,criteriaCount:(html.match(/class="metric-card"/g)||[]).length};
  });
  assert.deepEqual(actual.classifications.valid,[70,70,70,70,70]);assert.deepEqual(actual.classifications.checks,[70,70,70,70]);assert.equal(actual.phoneScore,87);assert.equal(actual.phoneFeedback,'Keep the clear sequence.');
  assert.equal(actual.score,87);assert.equal(actual.confidenceScore,87);assert.equal(actual.pronunciation,null);assert.equal(actual.criteriaCount,3);
  assert.ok(actual.evidence.some(x=>x.includes('past passive')));assert.match(actual.html,/arrived on time/);assert.doesNotMatch(actual.html,/더 구체적인 사례와 연결어/);assert.equal(actual.invalid,87);
  assert.match(actual.prompt,/App AL reference/);assert.match(actual.prompt,/do not deduct twice/);assert.match(actual.prompt,/accepting paraphrases/);assert.ok(actual.words<450);assert.match(actual.version,/v1.4.5/);
  console.log('PASS: semantic paraphrase survives lexical guard, AL anchor 87 arithmetic, confidence-independent score, three metric cards, specific evidence, no invented advice, no content override, compact shared prompt');
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
