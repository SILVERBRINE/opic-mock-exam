const fs=require('node:fs');const http=require('node:http');const {chromium}=require('playwright');
(async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(fs.readFileSync('index.html','utf8').replace('<script src="coi-serviceworker.js"></script>',''));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser,progress;
 try {
   browser=await chromium.launch({headless:true,args:['--enable-unsafe-webgpu'],...(process.env.OPIC_BROWSER_CHANNEL?{channel:process.env.OPIC_BROWSER_CHANNEL}:{})});
   const page=await browser.newPage();page.on('pageerror',e=>console.log('PAGE ERROR',e.message));
   page.on('console',message=>{if(message.text().startsWith('LLM test response'))console.log(message.text());});
   await page.goto(`http://127.0.0.1:${server.address().port}`);
   progress=setInterval(async()=>{try{console.log(await page.evaluate(()=>({ready:localLlmReady,preparing:localLlmPreparing,fault:localLlmFault?.message})));}catch{}},20000);
   const result=await page.evaluate(async()=>{
     // Whisper has its own real-model test; isolate only LLM preparation here.
     const prepareWhisper=prepareWhisperLocal;prepareWhisperLocal=async()=>true;
     try {await prepareLocalLlm();}finally{prepareWhisperLocal=prepareWhisper;}
     if(!localLlmReady)throw Error('LLM engine did not become ready');
     const originalCreate=localLlmEngine.chat.completions.create.bind(localLlmEngine.chat.completions);
     localLlmEngine.chat.completions.create=async(args)=>{const response=await originalCreate(args);console.log('LLM test response',JSON.stringify(response.choices));return response;};
     const evaluation=await evaluateWithLocalLLM('Describe your home.','I live in a small apartment. It has two rooms and a sunny kitchen. My favorite room is the living room because I can read there.','묘사',{});
     if(!evaluation.feedback?.trim())throw Error('LLM returned scores without an explanation');
     return {model:LOCAL_LLM_MODEL,score:evaluation.score,criteria:evaluation.criteria,feedback:evaluation.feedback};
   });
   console.log(JSON.stringify(result));
   fs.writeFileSync('docs/local-llm-validation.json',JSON.stringify({...result,completedAt:new Date().toISOString()},null,2));
 }finally{clearInterval(progress);if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
