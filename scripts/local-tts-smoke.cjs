// Optional network test: downloads the real Kokoro model and synthesizes one question.
const fs = require('node:fs');
const http = require('node:http');
const crypto = require('node:crypto');
const {chromium} = require('playwright');
async function main() {
  const count=Math.max(1,Math.min(200,Number(process.env.OPIC_TTS_COUNT)||1));
  const workers=Math.max(1,Math.min(8,Number(process.env.OPIC_TTS_WORKERS)||1));
  const html=fs.readFileSync('index.html','utf8');
  const sourceSha256=crypto.createHash('sha256').update(html).digest('hex');
  const server=http.createServer((req,res)=>{
    res.setHeader('Content-Type','text/html');
    res.end(html.replace('<script src="coi-serviceworker.js"></script>',''));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser,progress,deadline;
  try {
    browser=await chromium.launch({headless:true,...(process.env.OPIC_BROWSER_CHANNEL?{channel:process.env.OPIC_BROWSER_CHANNEL}:{})});
    const page=await browser.newPage();
    await page.addInitScript(()=>Object.defineProperty(navigator,'gpu',{value:undefined,configurable:true}));
    page.on('requestfailed',request=>console.log('REQUEST FAILED',request.url().split('?')[0],request.failure()?.errorText));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    progress=setInterval(async()=>{
      try{console.log(await page.evaluate(()=>document.getElementById('ttsStatus')?.textContent));}catch{}
    },20000);
    deadline=setTimeout(()=>browser.close(),Math.max(480000,count*60000));
    const result=await page.evaluate(async({count,workers})=>{
      await prepareKokoroWorkerPool(workers);
      localTtsReady=true;localTtsDevice='wasm';
      const started=performance.now();const records=[];
      for(let i=0;i<count;i+=workers) {
        const batch=activeQuestionBank.slice(i,Math.min(count,i+workers));
        const results=await Promise.all(batch.map(async question=>{
          try {
            const blob=await generateQuestionAudio(question);
            const validation=await validateQuestionAudioBlob(blob);
            const key=makeTtsCacheKey(question);
            const persisted=await cacheQuestionAudio(key,blob,validation);
            state.questionAudioCache.delete(key);state.questionAudioValidation.delete(key);
            const reread=await readCachedQuestionAudio(key);
            return {id:question.id,bytes:blob.size,validation,persisted,rereadBytes:reread?.size};
          }catch(error){return {id:question.id,error:error.message};}
        }));
        records.push(...results);
        setTtsStatus('실제 생성 검증 '+records.length+'/'+count+'문항');
      }
      terminateKokoroWorkerPool();
      return {records,elapsedMs:Math.round(performance.now()-started)};
    },{count,workers});
    result.sourceSha256=sourceSha256;result.workers=workers;
    result.completedAt=new Date().toISOString();
    fs.writeFileSync('docs/local-tts-validation.json',JSON.stringify(result,null,2)+'\n');
    const failed=result.records.filter(r=>!r.validation?.valid||!r.persisted||r.bytes!==r.rereadBytes);
    console.log(JSON.stringify({count,workers,failed:failed.length,elapsedMs:result.elapsedMs,sourceSha256}));
    if(failed.length)throw Error('TTS validation failed: '+JSON.stringify(failed));
  }finally{clearInterval(progress);clearTimeout(deadline);if(browser)await browser.close();server.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

