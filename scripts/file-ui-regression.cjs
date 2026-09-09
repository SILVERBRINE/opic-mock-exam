const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.OPIC_BROWSER_CHANNEL?{channel:process.env.OPIC_BROWSER_CHANNEL}:{})});
  try {
    const page=await browser.newPage();const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(pathToFileURL(path.resolve(process.argv[2] || 'index.html')).href);
    async function checkWidths() {
      for(const width of [360,768,1920]) {
        await page.setViewportSize({width,height:1000});
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`horizontal overflow at ${width}px`);
      }
    }
    await checkWidths();
    await page.evaluate(()=>{setEvalMode('local');startExam('practice');});
    assert.equal(await page.locator('#answerInput').getAttribute('readonly'),'');
    await checkWidths();
    await page.evaluate(async()=>{
      const q=state.questions[0];
      document.getElementById('answerInput').value='I went home because I was tired. Then I called a friend and explained the problem. We solved it together.';
      saveCurrent();await queueQuestionEvaluation(q);
    });
    await page.waitForFunction(()=>Object.keys(state.evaluationJobs).length===0);
    await checkWidths();
    await page.locator('#submitBtn').click();
    await page.waitForFunction(()=>state.examFinished);
    await checkWidths();assert.deepEqual(errors,[]);
    console.log('PASS: file URL startup, readonly transcript, offline practice evaluation/finish, 360/768/1920px setup/exam/feedback/result layouts');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
