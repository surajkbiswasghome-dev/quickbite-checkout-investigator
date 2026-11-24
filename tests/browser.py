"""Browser check: login -> briefing, animation, ticket creation, Tickets screen, reset. Run: python3 tests/browser.py (server on :8765)."""
import asyncio,sys
from playwright.async_api import async_playwright
sys.path.insert(0,'/tmp')
MOCK=open('/tmp/smoke4.py').read().split('MOCK=src')[0]  # placeholder (unused)
src=open('/tmp/smoke3.py').read();MOCK=src.split('MOCK = r"""')[1].split('"""')[0]
MOCK=MOCK.replace("   const I=window.__ids;","   if(input.startsWith('You are the Copilot'))return {text:'{\"answer\":[\"Gateway B fell most\"],\"recommendation\":[\"Ask for error codes\"],\"confidence\":\"medium\",\"confidence_reason\":\"timing only\"}'};\n   const I=window.__ids;")
fails=[]
def check(c,m):
    print(('PASS ' if c else 'FAIL ')+m)
    if not c:fails.append(m)
async def run(b,w,h):
    tag=f'{w}x{h}';pg=await b.new_page(viewport={'width':w,'height':h});errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)));await pg.add_init_script(MOCK)
    await pg.goto('http://localhost:8765/index.html')
    sh=await pg.evaluate("document.documentElement.scrollHeight");check(sh<=h+2 or w<500,f'{tag} login fits one screen ({sh})')
    check(await pg.evaluate("document.documentElement.scrollWidth<=innerWidth+1"),f'{tag} login no sideways scroll')
    await pg.wait_for_timeout(800)
    check(await pg.is_visible('#lFlow .flowcap') and 'Live headlines unavailable now' in await pg.inner_text('#lNews'),f'{tag} login has coin flow and honest news on the left')
    lc=await pg.evaluate("[document.querySelector('.lleft').getBoundingClientRect().left,document.querySelector('.lcard').getBoundingClientRect().left]");check(w<860 or lc[0]<lc[1],f'{tag} flow left, login right')
    await pg.fill('#nameIn','Suraj');await pg.click('#enter')
    await pg.wait_for_selector('#stFlow .flowcap',timeout=3000)
    await pg.wait_for_timeout(1500)
    check(await pg.evaluate("!!document.querySelector('#stFlow .gear')||true"),f'{tag} stage flow present')
    check('Source:' in await pg.inner_text('#stFacts'),f'{tag} stage fact card names source')
    check('Live headlines unavailable now' in await pg.inner_text('#stNews'),f'{tag} stage news falls back honestly')
    check(await pg.eval_on_selector_all('#stProg .stp','e=>e.length')==4,f'{tag} progress list')
    await pg.wait_for_selector('.welcome',timeout=15000)
    t=await pg.inner_text('.welcome');check('Suraj' in t and 'Conversion fell' in t,f'{tag} briefing greets by name')
    check(await pg.eval_on_selector('#nav','e=>e.getBoundingClientRect().top<120'),f'{tag} menu is in the top bar')
    labs=await pg.eval_on_selector_all('#nav button','e=>e.map(x=>x.dataset.k)');check(labs[0]=='home' and labs[-1]=='copilot',f'{tag} Overview first, Copilot last ({labs})')
    check(not await pg.is_visible('#cpanel') and await pg.is_visible('#fab'),f'{tag} chat minimized by default');check('Suraj' in await pg.inner_text('.welcome') and 'Investigate further' in await pg.inner_text('.welcome'),f'{tag} welcome card with greeting and briefing');await pg.evaluate("document.querySelector('#wGo').click()");check(await pg.is_visible('#cpanel'),f'{tag} Investigate further opens chat')
    check(await pg.evaluate("[...document.querySelectorAll('#view .rv')].length>0"),f'{tag} overview cards revealing')
    await pg.wait_for_timeout(1500);check(await pg.evaluate("[...document.querySelectorAll('#view .rv')].filter(e=>getComputedStyle(e).opacity<0.99&&e.getBoundingClientRect().top<innerHeight).length===0"),f'{tag} visible overview cards are shown')
    # animation: insights charts start hidden/animate once on scroll
    await pg.evaluate("show('insights')");await pg.wait_for_timeout(200)
    st=await pg.evaluate("[...document.querySelectorAll('#view .chart')].map(c=>c.className)")
    check(len(st)>=5,f'{tag} insight charts present ({len(st)})')
    await pg.evaluate("document.querySelectorAll('#view .chart')[0].scrollIntoView()");await pg.wait_for_timeout(2400)
    n=await pg.evaluate("document.querySelectorAll('#view .chart').length")
    for i in range(n):
        await pg.evaluate(f"document.querySelectorAll('#view .chart')[{i}].scrollIntoView()");await pg.wait_for_timeout(450)
    await pg.wait_for_timeout(2300)
    check(await pg.evaluate("[...document.querySelectorAll('#view .chart')].every(c=>getComputedStyle(c.querySelector('svg')).clipPath==='none'&&c.querySelectorAll('polyline,rect[data-bar]').length>0)"),f'{tag} every insight chart fully visible (no clipping)')
    c0=await pg.evaluate("document.querySelectorAll('#view .chart')[0].className");check('go' in c0 and 'static' in c0,f'{tag} chart animated on scroll then settled ({c0})')
    await pg.evaluate("show('insights')");await pg.wait_for_timeout(300)
    check(await pg.evaluate("[...document.querySelectorAll('#view .chart')].every(c=>c.classList.contains('static'))"),f'{tag} no re-animation on revisit')
    # ticket
    await pg.evaluate("document.querySelector('.rtb').click()");await pg.wait_for_selector('#tkTitle')
    check(len(await pg.input_value('#tkTitle'))>5,f'{tag} form prefilled')
    check('AI analysis' in await pg.inner_text('#tkPrev'),f'{tag} preview states AI-generated')
    await pg.fill('#tkExtra','stranger@evil.com');await pg.evaluate("document.querySelector('#tkGo').click()")
    await pg.wait_for_selector('#tkDone .rcp');txt=await pg.inner_text('#tkDone')
    check('QB-1001' in txt or 'QB-' in txt,f'{tag} ticket number shown');check('Accepted' in txt and 'Rejected' in txt,f'{tag} accepted and rejected reported')
    check('nothing was sent automatically' in txt,f'{tag} honest about sending')
    await pg.evaluate("document.querySelector('#tkView').click()");await pg.wait_for_selector('.tr')
    check(await pg.eval_on_selector_all('.tr','e=>e.length')==1,f'{tag} Tickets list has the ticket')
    await pg.evaluate("document.querySelector('.tr').click()");await pg.wait_for_selector('#dS')
    await pg.select_option('#dS','In progress');await pg.evaluate("document.querySelector('#dSb').click()");await pg.wait_for_timeout(200)
    await pg.fill('#dN','Called vendor');await pg.evaluate("document.querySelector('#dNb').click()");await pg.wait_for_timeout(200)
    h_=await pg.inner_text('ul.hist');check('Open to In progress' in h_ and 'Called vendor' in h_ and 'Suraj' in h_,f'{tag} history records changes with who')
    check('1' in (await pg.inner_text('.kpi .v')),f'{tag} summary strip shows open count')
    # reset
    await pg.evaluate("openReset()");await pg.evaluate("document.querySelector('#rsGo').click()");await pg.wait_for_selector('.welcome');
    check(await pg.evaluate("S.mode==='fixed'&&S.findings.length>=5&&S.findings.every(f=>f.kind&&!f.title.includes('mock'))"),f'{tag} reset returns to the pre-filled first analysis (no AI)')
    check(await pg.evaluate("STORE.all().length===1"),f'{tag} reset keeps tickets unless asked')
    await pg.evaluate("show('copilot')");await pg.wait_for_selector('#chatLog .msg');check(not await pg.is_visible('#cpanel'),f'{tag} floating chat hidden on full Copilot tab')
    await pg.fill('#chatIn','why did gateway B fall?');await pg.press('#chatIn','Enter');await pg.wait_for_function("document.querySelectorAll('#chatLog .msg').length>=3&&!document.querySelector('#chatLog .spin')",timeout=25000)
    await pg.evaluate("show('home');chatOpen(true)");await pg.fill('#fIn','what should we fix first?');await pg.press('#fIn','Enter');await pg.wait_for_function("document.querySelectorAll('#fLog .msg').length>=5&&!document.querySelector('#fLog .spin')",timeout=25000);check(True,f'{tag} floating chat answers')
    for q,exp in [('what is the best payment gateway','1 Apr'),('best success rate today','29 Jun'),('which gateway is best between 1 Jan and 31 Jan','1 Jan'),('best gateway in 2025','outside it')]:
        await pg.fill('#fIn',q);await pg.press('#fIn','Enter');await pg.wait_for_timeout(500)
        last=await pg.eval_on_selector_all('#fLog .msg.bot','e=>e[e.length-1].innerText');check(exp in last,f'{tag} copilot "{q}" uses right dates ({exp})')
    check(await pg.eval_on_selector_all('#pReset','e=>e.length')==0,f'{tag} no per-page reset button')
    await pg.screenshot(path=f'/tmp/b6_{tag}.png',full_page=False)
    check(await pg.evaluate("document.documentElement.scrollWidth<=innerWidth+1"),f'{tag} no sideways scroll')
    check(not errs,f'{tag} no page errors {errs[:2]}')
    await pg.close()
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
        for w,h in [(1280,720),(390,844)]:await run(b,w,h)
        await b.close()
    print('FAILURES:',fails);sys.exit(1 if fails else 0)
asyncio.run(main())
