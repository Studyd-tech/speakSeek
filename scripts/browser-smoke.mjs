import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright-core';
const base=process.env.AGENTPULSE_URL||'http://127.0.0.1:5177';
mkdirSync('artifacts',{recursive:true});
mkdirSync('.local/browser-tmp',{recursive:true});process.env.TMPDIR=process.cwd()+'/.local/browser-tmp';
const report={startedAt:new Date().toISOString(),base,checks:[],status:'blocked'};
let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.waitForSelector('#session option[value="sample-checkout"]',{state:'attached'});await page.selectOption('#session','sample-checkout');await page.waitForFunction(()=>document.querySelector('#sample-badge')?.hidden===false);report.checks.push('sample session selection');
 await page.locator('#use-model').uncheck();await page.fill('#question','How is this task doing?');await page.click('#ask');await page.waitForFunction(()=>document.querySelector('#answer-label')?.textContent==='TOKEN LEDGER · READ ONLY');
 const checkoutAnswer=await page.locator('#answer').innerText();
 if(!checkoutAnswer.includes('last observed state')||!checkoutAnswer.includes('8,835')||!checkoutAnswer.includes('10,000'))throw Error('Checkout answer missing recorded state or seeded token ledger');
 const digits=(locator)=>locator.innerText().then(text=>text.replace(/\D/g,''));
 if(await digits(page.locator('#budget-allowed'))!=='10000')throw Error('Seeded allowance missing');
 if(await digits(page.locator('#budget-used'))!=='8835')throw Error('Seeded measured usage missing');
 report.checks.push('configured sample returns read-only token ledger with recorded state');
 const budgetQuestion=page.waitForResponse(response=>response.url().endsWith('/api/question')&&response.request().method()==='POST');
 await page.click('#ask-budget');const budgetBody=await (await budgetQuestion).json();
 if(budgetBody.source!=='stored-token-ledger'||!String(budgetBody.answer).includes('8,835'))throw Error('Ask-budget did not return the read-only ledger');
 await page.waitForFunction(()=>document.querySelector('#answer-label')?.textContent==='TOKEN LEDGER · READ ONLY');report.checks.push('ask-budget control');
 await page.fill('#budget-extra','1000');await page.click('#budget-extend');await page.getByRole('button',{name:'Approve sample',exact:true}).click();
 await page.waitForFunction(()=>[...document.querySelectorAll('#budget-extensions strong')].some(el=>/SIMULATED · CONSUMED/.test(el.textContent||'')&&(el.textContent||'').replace(/\D/g,'').includes('1000')));
 await page.waitForFunction(()=>(document.querySelector('#budget-allowed')?.textContent||'').replace(/\D/g,'')==='11000');report.checks.push('simulated token extension applied once');
 if(await page.locator('#timeline li').count()<4)throw Error('Sample timeline missing');report.checks.push('sample timeline');
 await page.click('#simulate');await page.getByRole('button',{name:'Approve',exact:true}).first().click();await page.getByText('SIMULATED · APPROVED',{exact:true}).first().waitFor();report.checks.push('simulation approval labeled without execution');
 await page.click('#simulate');await page.getByRole('button',{name:'Deny',exact:true}).first().click();await page.getByText('SIMULATED · DENIED',{exact:true}).first().waitFor();
 await page.click('#simulate');await page.getByRole('button',{name:'Timeout',exact:true}).first().click();await page.getByText('SIMULATED · EXPIRED',{exact:true}).first().waitFor();report.checks.push('simulation denial and timeout');
 // This does not contact Notify. Validate the real-gate browser error with a blocked HTTP response.
 await page.selectOption('#session','local-demo');await page.waitForFunction(()=>!document.querySelector('#real').disabled);await page.route('**/api/decisions',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Notify credentials unavailable (browser smoke fixture)'})}));await page.click('#real');await page.getByRole('alert').filter({hasText:'Notify credentials unavailable'}).waitFor();report.checks.push('approval error display (mocked; no phone request)');
 await page.unroute('**/api/decisions');await page.selectOption('#session','sample-complete');await page.locator('#use-model').uncheck();await page.fill('#question','How is this task doing?');await page.click('#ask');await page.waitForFunction(()=>document.querySelector('#answer-label')?.textContent==='STORED-EVENT FALLBACK');
 if(!(await page.locator('#answer').innerText()).includes('last observed state'))throw Error('Unbudgeted stored-event answer missing');
 if((await page.locator('#budget-allowed').innerText())!=='Unknown')throw Error('Unbudgeted session should not inherit another task allowance');
 report.checks.push('unbudgeted session keeps stored-event fallback');
 await page.selectOption('#session','sample-checkout');await page.click('#refresh');await page.locator('#global-error').waitFor({state:'hidden'});await page.screenshot({path:'artifacts/dashboard-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/dashboard-mobile.png',fullPage:true});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile horizontal overflow');report.checks.push('desktop/mobile screenshots and responsive width');
 if(errors.length)throw Error('Browser runtime errors: '+errors.join('; '));report.status='passed';
}catch(e){report.error=String(e?.message||e).slice(0,1000);process.exitCode=1}
finally{await browser?.close();writeFileSync('artifacts/browser-smoke.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))}
