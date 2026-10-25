const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.goto('https://carlab-cloud-v2.onrender.com/local-qr-test');
  for(const file of ['public/vendor/hc-jspdf.umd.min.js','public/vendor/ac-qrcode.js','public/reports-qr.js'])await page.addScriptTag({path:path.resolve(__dirname,'..',file)});
  for(const [size,pages] of [['small',2],['medium',3],['individual',11]]){
   const result=await page.evaluate(async size=>{const units=Array.from({length:11},(_,i)=>({id:String(i),empresa:'Transportes del Pacífico',numeroEconomico:String(321+i),nombreFlota:'Regional',token:String(i).padStart(48,'a')}));const doc=await ReportsQR.documentFor(units,size);return {pages:doc.getNumberOfPages(),width:doc.internal.pageSize.getWidth(),height:doc.internal.pageSize.getHeight(),pdf:doc.output('datauristring').split(',')[1]};},size);
   assert.equal(result.pages,pages);assert.ok(Math.abs(result.width-(size==='individual'?106:210))<.1);assert.ok(Math.abs(result.height-(size==='individual'?146:297))<.1);
   if(process.env.QA_OUTPUT){fs.mkdirSync(process.env.QA_OUTPUT,{recursive:true});fs.writeFileSync(path.join(process.env.QA_OUTPUT,'production-url-'+size+'.pdf'),Buffer.from(result.pdf,'base64'));}
  }
  console.log('PASS: compact, medium and individual PDFs, complete page counts, production-length URLs.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
