/* All domain-specific content lives here: roles, languages, news, facts, copilot taxonomy, ticket setup.
   Derived from the QuickBite checkout case and its dataset. */
const CONFIG={
 app:{name:'QuickBite Checkout Investigator'},
 roles:[
  {id:'pm',name:'Product Manager',sub:'Growth & checkout',initial:'PM'},
  {id:'pay',name:'Payments Lead',sub:'Gateways & routing',initial:'PL'},
  {id:'eng',name:'Engineering Manager',sub:'Platform & app speed',initial:'EM'},
  {id:'cx',name:'Support Lead',sub:'Customer complaints',initial:'SL'}],
 languages:[{code:'en',label:'English',bcp:'en-IN'},{code:'hi',label:'हिन्दी (Hindi)',bcp:'hi-IN'}],
 newsLabel:'Static examples written for this demo. These are not live headlines.',
 news:[
  'Example: a payment step that fails is often the quietest leak in a delivery checkout.',
  'Example: sending more traffic to one gateway can change its success rate, for better or worse.',
  'Example: slow pages on one phone platform need a platform-level split to be judged fairly.',
  'Example: coupon rule changes can shift who converts without changing total traffic.',
  'Example: same-day timing of a change and a drop is a lead to test, not proof of cause.'],
 stageSteps:['Sessions','Restaurant views','Cart','Checkout','Payment attempt','Payment success','Order'],
 progress:['Signing you in','Loading your workspace','Preparing your briefing'],
 facts:(D)=>{const F=D.Funnel_Daily;const orders=F.reduce((a,r)=>a+r.Orders,0),sess=F.reduce((a,r)=>a+r.Sessions,0);
  return [`${F.length} days of funnel data, ${F[0].Date} to ${F[F.length-1].Date}`,`${sess.toLocaleString('en-IN')} sessions and ${orders.toLocaleString('en-IN')} orders in the dataset`,`${new Set(D.Payment_Routing_Daily.map(r=>r.Gateway)).size} payment gateways and ${D.Product_Changes.length} dated product changes`,`${D.Customer_Feedback.length.toLocaleString('en-IN')} support tickets across ${Object.keys(D.Support_Themes_Monthly[0]).length-1} themes`,`${D.User_Cohort_Metrics.length} monthly customer-segment readings (new, returning, Android, iOS, coupon)`];},
 greet:{en:{m:'Good morning',a:'Good afternoon',e:'Good evening'},hi:{m:'सुप्रभात',a:'नमस्कार',e:'शुभ संध्या'}},
 /* Copilot: category > subcategory > scenario. ids map to answer builders in index.html */
 taxonomy:[
  {cat:'Funnel',subs:[{sub:'Overall conversion',sc:[['f1','How much did conversion change, and where?'],['f2','Which funnel steps are stable?']]}]},
  {cat:'Payments',subs:[{sub:'Gateway performance',sc:[['p1','Which gateway hurts payment success most?'],['p2','Did traffic shift or did gateways get worse?']]},{sub:'Routing change',sc:[['p3','What happened on the day it broke?']]}]},
  {cat:'Platform & speed',subs:[{sub:'Android latency',sc:[['s1','Did slow Android pages hurt conversion?']]}]},
  {cat:'Customers',subs:[{sub:'Segments',sc:[['c1','Which customer groups convert less now?']]}]},
  {cat:'Operations',subs:[{sub:'Delivery & restaurants',sc:[['o1','Are operations metrics a likely cause?']]}]},
  {cat:'Support',subs:[{sub:'Complaints',sc:[['t1','What are customers complaining about?']]}]},
  {cat:'Priorities',subs:[{sub:'What to fix first',sc:[['x1','What should we fix first, and what is at stake?']]}]}],
 /* metrics the user can click for Before vs Now */
 metrics:[
  {id:'m_conv',label:'Checkout conversion',group:'Funnel',unit:'%'},
  {id:'m_pay',label:'Payment success',group:'Payments',unit:'%'},
  {id:'m_gb',label:'Gateway B success',group:'Payments',unit:'%'},
  {id:'m_gbs',label:'Gateway B share of payments',group:'Payments',unit:'%'},
  {id:'m_gc',label:'Gateway C success',group:'Payments',unit:'%'},
  {id:'m_ga',label:'Gateway A success',group:'Payments',unit:'%'},
  {id:'m_c2c',label:'Add to cart → checkout',group:'Funnel',unit:'%'},
  {id:'m_c2a',label:'Checkout → payment attempt',group:'Funnel',unit:'%'},
  {id:'m_and',label:'Android checkout latency',group:'Platform',unit:' ms'},
  {id:'m_ord',label:'Orders per day',group:'Funnel',unit:''}],
 suggested:{en:['Why did conversion fall?','Which gateway is best?','What should we fix first?'],hi:['कन्वर्ज़न क्यों गिरा?','कौन सा गेटवे सबसे अच्छा है?','सबसे पहले क्या ठीक करें?']},
 /* ticket setup (used in the next step) */
 tickets:{categories:['Payment gateway reliability','Traffic routing','App performance','Coupon & pricing rules','Customer support follow-up','Data & instrumentation'],
  teams:{'Payments & Gateways':['Aarav Mehta','Isha Kulkarni'],'Platform Engineering':['Rohan Nair','Meera Iyer'],'Growth & Promotions':['Kabir Shah','Anaya Reddy'],'Customer Support':['Zoya Khan','Dev Malhotra'],'Data & Analytics':['Tara Joshi','Vikram Rao']}}
};
/* v5 additions: email approvals and ticket defaults */
CONFIG.email={domain:'quickbite.example',allow:{domains:['quickbite.example'],addresses:[]},note:'Demo mode: tickets can only be addressed to approved QuickBite team addresses, and the email is prepared for you to open in your own mail app.'};
CONFIG.ticketMap={ins1:['Payment gateway reliability','Payments & Gateways','High'],ins2:['Traffic routing','Payments & Gateways','High'],ins3:['Payment gateway reliability','Payments & Gateways','Critical'],ins4:['Payment gateway reliability','Payments & Gateways','Medium'],ins5:['App performance','Platform Engineering','Medium'],ins6:['Coupon & pricing rules','Growth & Promotions','Medium'],
 gateway_B:['Payment gateway reliability','Payments & Gateways'],gateway_C:['Payment gateway reliability','Payments & Gateways'],cohort_coupon:['Coupon & pricing rules','Growth & Promotions'],cohort_android:['App performance','Platform Engineering'],cohort_new:['Coupon & pricing rules','Growth & Promotions'],data_gap:['Data & instrumentation','Data & Analytics'],
 sc:{f1:['Payment gateway reliability','Payments & Gateways'],p1:['Payment gateway reliability','Payments & Gateways'],p2:['Traffic routing','Payments & Gateways'],p3:['Traffic routing','Payments & Gateways'],s1:['App performance','Platform Engineering'],c1:['Coupon & pricing rules','Growth & Promotions'],t1:['Customer support follow-up','Customer Support'],x1:['Payment gateway reliability','Payments & Gateways'],o1:['Data & instrumentation','Data & Analytics']}};
/* v6: sign-in stage content (flow, facts, news). All domain words stay here. */
CONFIG.FLOW={nodes:['Customer visit','Browse & cart','Checkout','Payment gateway','Order placed','Order delivered','Refund / chargeback','Reorder'],
 /* [boxWhereTokenIs, tokenType coin|ok|msg, boxProcessing|null, caption] */
 beats:[[0,'msg',null,'A customer opens the app'],[1,'msg',1,'They browse and fill a cart'],[2,'msg',2,'Checkout collects the order'],[3,'coin',3,'A payment gateway authorises the payment'],[3,'ok',null,'Success travels back to the app'],[4,'coin',null,'The order is placed'],[5,'msg',5,'The order is delivered'],[6,'msg',6,'If something goes wrong, a refund or chargeback is handled'],[7,'ok',null,'Happy customers reorder, and the loop starts again']]};
CONFIG.stageSteps2=['Signing you in','Loading your workspace','Preparing your briefing','Preparing your welcome'];
CONFIG.factCards=(D)=>{const F=D.Funnel_Daily,n=(x)=>x.toLocaleString('en-IN');const orders=F.reduce((a,r)=>a+r.Orders,0),sess=F.reduce((a,r)=>a+r.Sessions,0);
 return [{big:n(sess),text:'customer sessions recorded over '+F.length+' days ('+F[0].Date+' to '+F[F.length-1].Date+').',src:'Funnel_Daily sheet, provided dataset'},
  {big:n(orders),text:'orders placed in the same period.',src:'Funnel_Daily sheet, provided dataset'},
  {big:String(new Set(D.Payment_Routing_Daily.map(r=>r.Gateway)).size),text:'payment gateways share the traffic; routing is recorded every day.',src:'Payment_Routing_Daily sheet'},
  {big:String(D.Product_Changes.length),text:'dated product changes to line up against the drop.',src:'Product_Changes sheet'},
  {big:n(D.Customer_Feedback.length),text:'support tickets across '+(Object.keys(D.Support_Themes_Monthly[0]).length-1)+' themes.',src:'Customer_Feedback and Support_Themes_Monthly sheets'}];};
CONFIG.newsApi='/api/news';
CONFIG.officialLinks=[{tag:'World',title:'BBC News: World',source:'bbc.com',url:'https://www.bbc.com/news/world'},{tag:'World',title:'Reuters: World',source:'reuters.com',url:'https://www.reuters.com/world/'},
 {tag:'Official',title:'Reserve Bank of India: press releases',source:'rbi.org.in',url:'https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx'},{tag:'Official',title:'NPCI: UPI product statistics',source:'npci.org.in',url:'https://www.npci.org.in/what-we-do/upi/product-statistics'},{tag:'Official',title:'FSSAI: food safety updates',source:'fssai.gov.in',url:'https://www.fssai.gov.in/'}];
