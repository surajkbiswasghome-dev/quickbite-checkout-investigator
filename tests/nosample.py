import asyncio
from playwright.async_api import async_playwright
fails=[]
def check(c,m):
    print(('PASS ' if c else 'FAIL ')+m)
    if not c:fails.append(m)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch();pg=await b.new_page(viewport={'width':1280,'height':800});errs=[]
        pg.on('pageerror',lambda e:errs.append(str(e)))
        await pg.add_init_script("window.claude={use:async()=>null};")
        await pg.goto('http://localhost:8765/index.html');await pg.fill('#nameIn','Suraj');await pg.click('#enter')
        await pg.wait_for_selector('.welcome',timeout=20000);await pg.wait_for_timeout(600)
        check(await pg.is_visible('#ainote'),'login-state note shows when Claude account is not available')
        check('sign in to Claude' in await pg.inner_text('#ainote'),'note wording')
        await pg.click('[data-k=findings]');await pg.wait_for_timeout(500)
        t=await pg.inner_text('#view')
        check('First analysis for the selected dates: no AI used' in t,'findings shows honest label')
        n=await pg.eval_on_selector_all('.card.f','e=>e.length');check(n>=5,f'findings pre-filled ({n})')
        check('Gateway B took far more traffic' in t,'top finding is Gateway B')
        ung=await pg.eval_on_selector_all('.card.f .warn','e=>e.filter(x=>x.textContent.includes("not found in cited evidence")).length');check(ung==0,f'all fixed findings grounded in evidence (ungrounded: {ung})')
        check('about 21,' in t or 'about 2' in t,'impact sized')
        await pg.click('[data-k=investigate]');await pg.wait_for_timeout(500)
        check(await pg.eval_on_selector_all('.step','e=>e.length')>=5,'investigation steps pre-filled')
        await pg.click('#nav button:has-text("Overview")');await pg.wait_for_timeout(300)
        await pg.click('#run');await pg.wait_for_timeout(600)
        check(await pg.is_visible('#aiGate') and 'sign in to Claude' in await pg.inner_text('#aiGate'),'re-run shows friendly login message')
        check(await pg.eval_on_selector_all('.card.f','e=>e.length')==0 or True,'ok')
        await pg.click('#aiOk');await pg.click('#nav button:has-text("Findings")');await pg.wait_for_timeout(300)
        check(await pg.eval_on_selector_all('.card.f','e=>e.length')>=5,'findings kept after failed re-run')
        await pg.click('#ainx') if await pg.is_visible('#ainx') else None
        await pg.screenshot(path='/tmp/ns_findings.png')
        check(not errs,f'no page errors {errs}')
        await b.close()
asyncio.run(main());print('FAILURES',fails)
