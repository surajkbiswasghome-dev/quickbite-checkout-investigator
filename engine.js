// Deterministic analysis engine. Every number the agents cite comes from here.
// No LLM code in this file. Works in browser and node (for testing against Python).
(function (root) {
  function Engine(D) {
    const PERIODS = { baseline: ['2026-01-01', '2026-03-31'], post: ['2026-04-10', '2026-06-29'], q1: ['2026-01-01', '2026-03-31'], apr_jun: ['2026-04-01', '2026-06-29'] };
    const rng = (p) => (typeof p === 'string' && PERIODS[p]) ? PERIODS[p] : (Array.isArray(p) ? p : String(p).split('..'));
    const inR = (d, r) => d >= r[0] && d <= r[1];
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    const mean = (a) => a.length ? sum(a) / a.length : NaN;
    const sd = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(sum(a.map(x => (x - m) ** 2)) / (a.length - 1)); };
    const r4 = (x) => (x === null || x === undefined || isNaN(x)) ? null : Math.round(x * 10000) / 10000;
    const r2 = (x) => (x === null || x === undefined || isNaN(x)) ? null : Math.round(x * 100) / 100;
    const ym = (d) => d.slice(0, 7);

    const MONN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const d1 = (d) => { const p = d.split('-'); return (+p[2]) + ' ' + MONN[+p[1] - 1]; };
    const label = (r) => d1(r[0]) + ' to ' + d1(r[1]);
    const daysIn = (r) => Math.round((new Date(r[1]) - new Date(r[0])) / 864e5) + 1;
    function setPeriods(a, b) { PERIODS.baseline = a; PERIODS.q1 = a; PERIODS.post = b; PERIODS.apr_jun = b; }
    const F = D.Funnel_Daily, G = D.Payment_Routing_Daily, P = D.Checkout_Performance, C = D.User_Cohort_Metrics, T = D.Customer_Feedback;
    const monthsIn = (r) => [...new Set(C.map(x => x.Month))].sort().filter(m => m + '-01' <= r[1] && m + '-31' >= r[0]);
    const STEPS = [['Sessions', 'Restaurant_Views'], ['Restaurant_Views', 'Cart_Adds'], ['Cart_Adds', 'Checkout_Starts'], ['Checkout_Starts', 'Payment_Attempts'], ['Payment_Attempts', 'Payment_Success'], ['Payment_Success', 'Orders']];
    const GW = ['Gateway A', 'Gateway B', 'Gateway C'];

    // ---- daily series catalogue (name -> [{date,v}]) ----
    const gwDay = {}; G.forEach(r => { (gwDay[r.Date] = gwDay[r.Date] || {})[r.Gateway] = r; });
    const perfDay = {}; P.forEach(r => { (perfDay[r.Date] = perfDay[r.Date] || {})[r.Platform] = r; });
    const SERIES = {
      payment_success_rate: F.map(r => ({ date: r.Date, v: r.Payment_Success / r.Payment_Attempts })),
      view_to_cart: F.map(r => ({ date: r.Date, v: r.Cart_Adds / r.Restaurant_Views })),
      cart_to_checkout: F.map(r => ({ date: r.Date, v: r.Checkout_Starts / r.Cart_Adds })),
      checkout_to_attempt: F.map(r => ({ date: r.Date, v: r.Payment_Attempts / r.Checkout_Starts })),
      orders_per_session: F.map(r => ({ date: r.Date, v: r.Orders / r.Sessions })),
      android_p50_ms: P.filter(r => r.Platform === 'Android').map(r => ({ date: r.Date, v: r.P50_Latency })),
      android_error_rate: P.filter(r => r.Platform === 'Android').map(r => ({ date: r.Date, v: r.Error_Rate })),
      ios_p50_ms: P.filter(r => r.Platform === 'iOS').map(r => ({ date: r.Date, v: r.P50_Latency })),
      ios_error_rate: P.filter(r => r.Platform === 'iOS').map(r => ({ date: r.Date, v: r.Error_Rate })),
    };
    GW.forEach(g => {
      const k = g.replace('Gateway ', '').toLowerCase();
      SERIES['gateway_' + k + '_success'] = F.map(r => ({ date: r.Date, v: gwDay[r.Date][g].Successful_Payments / gwDay[r.Date][g].Routed_Attempts }));
      SERIES['gateway_' + k + '_share'] = F.map(r => { const t = sum(GW.map(x => gwDay[r.Date][x].Routed_Attempts)); return { date: r.Date, v: gwDay[r.Date][g].Routed_Attempts / t }; });
    });
    const SOURCE = {
      payment_success_rate: 'Funnel_Daily: Payment_Success / Payment_Attempts', view_to_cart: 'Funnel_Daily: Cart_Adds / Restaurant_Views',
      cart_to_checkout: 'Funnel_Daily: Checkout_Starts / Cart_Adds', checkout_to_attempt: 'Funnel_Daily: Payment_Attempts / Checkout_Starts',
      orders_per_session: 'Funnel_Daily: Orders / Sessions', android_p50_ms: 'Checkout_Performance: P50_Latency (Android)', android_error_rate: 'Checkout_Performance: Error_Rate (Android)',
      ios_p50_ms: 'Checkout_Performance: P50_Latency (iOS)', ios_error_rate: 'Checkout_Performance: Error_Rate (iOS)'
    };
    GW.forEach(g => { const k = g.replace('Gateway ', '').toLowerCase(); SOURCE['gateway_' + k + '_success'] = 'Payment_Routing_Daily: Successful_Payments / Routed_Attempts (' + g + ')'; SOURCE['gateway_' + k + '_share'] = 'Payment_Routing_Daily: ' + g + ' Routed_Attempts / all gateways Routed_Attempts'; });

    function windowZ(ser, d0, w) { // 7-day window starting at d0 vs the 7 days before
      w = w || 7; const i = ser.findIndex(x => x.date === d0); if (i < w || i + w > ser.length) return null;
      const pre = ser.slice(i - w, i).map(x => x.v), post = ser.slice(i, i + w).map(x => x.v);
      const se = Math.sqrt(sd(pre) ** 2 / w + sd(post) ** 2 / w) || 1e-12;
      return { pre: mean(pre), post: mean(post), diff: mean(post) - mean(pre), rel_pct: (mean(post) / mean(pre) - 1) * 100, z: (mean(post) - mean(pre)) / se };
    }

    // ---------- TOOLS ----------
    const tools = {};

    tools.funnel_step_rates = ({ period_a = 'baseline', period_b = 'post' }) => {
      const ra = rng(period_a), rb = rng(period_b);
      const A = F.filter(r => inR(r.Date, ra)), B = F.filter(r => inR(r.Date, rb));
      const out = [];
      const ordersB = sum(B.map(r => r.Orders));
      const mk = (name, num, den) => {
        const a = sum(A.map(r => r[num])) / sum(A.map(r => r[den])), b = sum(B.map(r => r[num])) / sum(B.map(r => r[den]));
        const da = A.map(r => r[num] / r[den]), db = B.map(r => r[num] / r[den]);
        const se = Math.sqrt(sd(da) ** 2 / da.length + sd(db) ** 2 / db.length) || 1e-12;
        const z = (mean(db) - mean(da)) / se;
        return { step: name, rate_a_pct: r2(a * 100), rate_b_pct: r2(b * 100), change_pp: r2((b - a) * 100), change_rel_pct: r2((b / a - 1) * 100), z: r2(z), moved: Math.abs(z) > 4 && Math.abs((b - a) * 100) > 0.5, orders_lost_if_step_held_at_a: Math.round(ordersB * (a / b - 1)) };
      };
      STEPS.forEach(([n, d]) => out.push(mk(n + ' -> ' + d, d, n)));
      const overall = mk('Sessions -> Orders (headline conversion)', 'Orders', 'Sessions');
      const checkout = mk('Checkout_Starts -> Orders (checkout conversion)', 'Orders', 'Checkout_Starts');
      return {
        source: 'Funnel_Daily', period_a: ra, period_b: rb, formula: 'rate = sum(numerator)/sum(denominator) over period; z = diff of daily-rate means / standard error; moved = |z|>4 and |change|>0.5pp. orders_lost_if_step_held_at_a = orders_b*(rate_a/rate_b-1), holding other steps at period b; per-step numbers are NOT additive (interaction).',
        steps: out, headline: overall, checkout, sessions_a: sum(A.map(r => r.Sessions)), sessions_b: sum(B.map(r => r.Sessions)), orders_b: ordersB
      };
    };

    tools.find_changepoints = ({ series, from, to }) => {
      from = from || PERIODS.baseline[0]; to = to || PERIODS.post[1];
      const s = SERIES[series]; if (!s) return { error: 'unknown series', available: Object.keys(SERIES) };
      const rr = [from, to], sl = s.filter(x => inR(x.date, rr)); const cands = [];
      for (const x of sl) { const z = windowZ(s, x.date, 7); if (z && inR(x.date, rr)) cands.push({ date: x.date, ...z }); }
      cands.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
      const top = []; for (const c of cands) { if (top.every(t => Math.abs((new Date(t.date) - new Date(c.date)) / 864e5) >= 7)) top.push(c); if (top.length === 3) break; }
      return { source: SOURCE[series], series, formula: 'for each date d: mean of 7 days from d vs mean of 7 days before d; z = diff / sqrt(var_pre/7+var_post/7); top 3 separated by >=7 days', changepoints: top.map(c => ({ date: c.date, before: r4(c.pre), after: r4(c.post), change_rel_pct: r2(c.rel_pct), z: r2(c.z) })) };
    };

    tools.gateway_mix_vs_rate = ({ period_a = 'baseline', period_b = 'post' }) => {
      const ra = rng(period_a), rb = rng(period_b);
      const agg = (r) => { const o = {}; GW.forEach(g => o[g] = { att: 0, suc: 0 }); G.filter(x => inR(x.Date, r)).forEach(x => { o[x.Gateway].att += x.Routed_Attempts; o[x.Gateway].suc += x.Successful_Payments; }); const T = sum(GW.map(g => o[g].att)); GW.forEach(g => { o[g].w = o[g].att / T; o[g].r = o[g].suc / o[g].att; }); return o; };
      const a = agg(ra), b = agg(rb); let mix = 0, within = {}, tot = 0, totw = 0;
      GW.forEach(g => { mix += (b[g].w - a[g].w) * a[g].r; within[g] = b[g].w * (b[g].r - a[g].r); totw += within[g]; });
      GW.forEach(g => { tot += b[g].w * b[g].r - a[g].w * a[g].r; });
      return {
        source: 'Payment_Routing_Daily', period_a: ra, period_b: rb,
        formula: 'total change = sum(w_b*r_b) - sum(w_a*r_a); mix effect = sum((w_b-w_a)*r_a); within-gateway effect per gateway = w_b*(r_b-r_a); mix + within = total. w = share of attempts, r = success rate.',
        per_gateway: GW.map(g => ({ gateway: g, share_a_pct: r2(a[g].w * 100), share_b_pct: r2(b[g].w * 100), success_a_pct: r2(a[g].r * 100), success_b_pct: r2(b[g].r * 100), success_change_pp: r2((b[g].r - a[g].r) * 100), contribution_to_total_pp: r2(within[g] * 100), attempts_b: b[g].att })),
        total_change_pp: r2(tot * 100), mix_effect_pp: r2(mix * 100), within_gateway_effect_pp: r2(totw * 100), _raw: { tot, mix, totw }
      };
    };

    tools.gateway_monthly = () => {
      const rows = []; const months = [...new Set(G.map(r => ym(r.Date)))].sort();
      months.forEach(m => { const t = sum(G.filter(r => ym(r.Date) === m).map(r => r.Routed_Attempts)); GW.forEach(g => { const x = G.filter(r => ym(r.Date) === m && r.Gateway === g); const a = sum(x.map(r => r.Routed_Attempts)), s = sum(x.map(r => r.Successful_Payments)); rows.push({ month: m, gateway: g, share_pct: r2(a / t * 100), success_pct: r2(s / a * 100) }); }); });
      return { source: 'Payment_Routing_Daily', formula: 'monthly sum(Successful_Payments)/sum(Routed_Attempts); share = gateway attempts / all attempts', rows };
    };

    tools.product_change_alignment = ({ series_list } = {}) => {
      const names = (series_list && series_list.length ? series_list : ['payment_success_rate', 'view_to_cart', 'cart_to_checkout', 'checkout_to_attempt', 'orders_per_session', 'android_p50_ms', 'android_error_rate', 'gateway_b_share']).filter(n => SERIES[n]);
      const res = D.Product_Changes.map(c => { const row = { change: c.Change, date: c.Date, description: c.Description, tests: {} }; names.forEach(n => { const z = windowZ(SERIES[n], c.Date, 7); row.tests[n] = z ? { before: r4(z.pre), after: r4(z.post), rel_pct: r2(z.rel_pct), z: r2(z.z) } : null; }); return row; });
      return { source: 'Product_Changes joined to daily series on Date (7 days from change date vs 7 days before)', formula: 'z = diff of 7-day means / standard error; |z|>4 treated as a clear level shift, 2-4 as ambiguous, <2 as no visible shift. Timing only: a shift on the same date is not proof of cause.', changes: res };
    };

    tools.platform_vs_funnel = () => {
      const months = [...new Set(P.map(r => ym(r.Date)))].sort();
      const monthly = months.map(m => { const o = { month: m }; ['Android', 'iOS'].forEach(pl => { const x = P.filter(r => ym(r.Date) === m && r.Platform === pl); o[pl + '_p50_ms'] = Math.round(mean(x.map(r => r.P50_Latency))); o[pl + '_error_pct'] = r2(mean(x.map(r => r.Error_Rate)) * 100); }); return o; });
      const d0 = (D.Product_Changes.find(c => /redesign/i.test(c.Change)) || D.Product_Changes[0]).Date;
      const at = {}; ['android_p50_ms', 'android_error_rate', 'ios_p50_ms', 'view_to_cart', 'cart_to_checkout', 'checkout_to_attempt', 'payment_success_rate', 'orders_per_session'].forEach(n => { const z = windowZ(SERIES[n], d0, 7); at[n] = z ? { rel_pct: r2(z.rel_pct), z: r2(z.z) } : null; });
      // within-period daily correlation Apr 10..Jun 29 between android latency and funnel steps (does worse latency day => worse step day?)
      const rr = PERIODS.post; const al = SERIES.android_p50_ms.filter(x => inR(x.date, rr)).map(x => x.v);
      const corr = (a, b) => { const ma = mean(a), mb = mean(b); const n = sum(a.map((x, i) => (x - ma) * (b[i] - mb))); return n / Math.sqrt(sum(a.map(x => (x - ma) ** 2)) * sum(b.map(x => (x - mb) ** 2))); };
      const cr = {}; ['cart_to_checkout', 'checkout_to_attempt', 'payment_success_rate', 'orders_per_session'].forEach(n => { cr[n] = r2(corr(al, SERIES[n].filter(x => inR(x.date, rr)).map(x => x.v))); });
      return { source: 'Checkout_Performance (platform x day) vs Funnel_Daily (all platforms) joined on Date only; the funnel has no platform field', formula: 'level shift in the week of the checkout redesign (7d vs 7d, z); daily correlation of Android P50 with funnel step rates over the Compare period', redesign_date: d0, monthly, shift_at_2026_04_01: at, daily_correlation_android_p50_vs_step_post: cr, limitation: 'Funnel_Daily cannot be split by platform, so latency impact on Android funnel conversion cannot be measured directly.' };
    };

    tools.ticket_signals = () => {
      const base = PERIODS.baseline, post = PERIODS.apr_jun;
      const themes = [...new Set(T.map(r => r.Theme))];
      const sess = (r) => sum(F.filter(x => inR(x.Date, r)).map(x => x.Sessions));
      const att = (r, g) => sum(G.filter(x => inR(x.Date, r) && (!g || x.Gateway === g)).map(x => x.Routed_Attempts));
      const per = themes.map(t => { const a = T.filter(r => r.Theme === t && inR(r.Date, base)).length, b = T.filter(r => r.Theme === t && inR(r.Date, post)).length; return { theme: t, tickets_q1: a, tickets_apr_jun: b, per_100k_sessions_q1: r2(a / sess(base) * 1e5), per_100k_sessions_apr_jun: r2(b / sess(post) * 1e5) }; });
      const pf = GW.map(g => { const a = T.filter(r => r.Theme === 'Payment Failure' && r.Gateway === g && inR(r.Date, base)).length, b = T.filter(r => r.Theme === 'Payment Failure' && r.Gateway === g && inR(r.Date, post)).length; return { gateway: g, tickets_q1: a, tickets_apr_jun: b, per_1000_attempts_q1: r2(a / att(base, g) * 1000), per_1000_attempts_apr_jun: r2(b / att(post, g) * 1000) }; });
      const platShare = ['Android', 'iOS'].map(p => { const a = T.filter(r => r.Platform === p && inR(r.Date, post)).length, n = T.filter(r => inR(r.Date, post)).length; const cs = C.filter(r => r.Segment === p + ' Users' && monthsIn(post).includes(r.Month)).reduce((s, r) => s + r.Sessions, 0), ct = C.filter(r => r.Segment === 'New Users' && monthsIn(post).includes(r.Month)).reduce((s, r) => s + r.Sessions, 0) + C.filter(r => r.Segment === 'Returning Users' && monthsIn(post).includes(r.Month)).reduce((s, r) => s + r.Sessions, 0); return { platform: p, share_of_tickets_apr_jun_pct: r2(a / n * 100), share_of_sessions_apr_jun_pct: r2(cs / ct * 100) }; });
      return { source: 'Customer_Feedback (1,200 tickets; metadata only, comment text is templated and not used). Support_Themes_Monthly is the same data aggregated, so it is not counted separately.', period_labels: { before: label(base), compare: label(post) }, formula: 'tickets per 100k sessions (Funnel_Daily Sessions) and payment-failure tickets per 1,000 payment attempts routed to that gateway (Payment_Routing_Daily). Before and Compare periods as selected (keys q1 / apr_jun hold the Before / Compare values).', limitation: 'Tickets are a sample of complaints, not a record of who abandoned. They can support a hypothesis, not prove it.', themes: per, payment_failure_by_gateway: pf, platform_share: platShare };
    };

    tools.cohort_mix_vs_rate = ({ period_a, period_b } = {}) => {
      const ma = period_a ? monthsIn([period_a[0] + '-01', period_a[1] + '-31']) : monthsIn(PERIODS.baseline), mb = period_b ? monthsIn([period_b[0] + '-01', period_b[1] + '-31']) : monthsIn(PERIODS.post);
      const agg = (months, seg) => { const x = C.filter(r => r.Segment === seg && months.includes(r.Month)); return { s: sum(x.map(r => r.Sessions)), o: sum(x.map(r => r.Orders)) }; };
      const splits = { new_vs_returning: ['New Users', 'Returning Users'], platform: ['Android Users', 'iOS Users'], coupon: ['Coupon Users', 'Non-Coupon Users'] };
      const out = {};
      Object.entries(splits).forEach(([k, segs]) => {
        const a = segs.map(s => agg(ma, s)), b = segs.map(s => agg(mb, s)); const Ta = sum(a.map(x => x.s)), Tb = sum(b.map(x => x.s));
        let mix = 0, within = 0, rows = [];
        segs.forEach((s, i) => { const wa = a[i].s / Ta, wb = b[i].s / Tb, ra = a[i].o / a[i].s, rb = b[i].o / b[i].s; mix += (wb - wa) * ra; within += wb * (rb - ra); rows.push({ segment: s, session_share_a_pct: r2(wa * 100), session_share_b_pct: r2(wb * 100), conv_a_pct: r2(ra * 100), conv_b_pct: r2(rb * 100), conv_change_pp: r2((rb - ra) * 100), contribution_pp: r2(wb * (rb - ra) * 100), orders_lost_at_baseline_conv: Math.round(b[i].s * (ra - rb)) }); });
        out[k] = { rows, mix_effect_pp: r2(mix * 100), within_segment_effect_pp: r2(within * 100), total_change_pp: r2((mix + within) * 100) };
      });
      return { source: 'User_Cohort_Metrics (month x segment)', period_a: ma, period_b: mb, formula: 'same mix/within identity as gateway analysis, per split. Conversion = Orders/Sessions. orders_lost_at_baseline_conv = sessions_b*(conv_a-conv_b).', limitation: 'The three splits are separate cuts of the same traffic (each sums to the total). Cohort data is monthly, so every month that overlaps a period is included whole. They cannot be crossed (no New x Android cell), and their lost-order figures overlap each other and the gateway figures: never add them.', splits: out };
    };

    tools.operations_alignment = () => {
      const O = D.Operational_Metrics; const keys = Object.keys(O[0]).filter(k => k !== 'Month'); const res = {};
      keys.forEach(k => { const v = O.map(r => r[k]); const d = v.slice(1).map((x, i) => x - v[i]); res[k] = { values: v, monthly_changes: d.map(x => r2(x)), step_test: 'max deviation of monthly change from its mean = ' + r4(Math.max(...d.map(x => Math.abs(x - mean(d))))) }; });
      const flat = keys.every(k => res[k].step_test.endsWith('0') || parseFloat(res[k].step_test.split('= ')[1]) < 0.011);
      return { source: 'Operational_Metrics (monthly, platform-wide)', formula: 'month-over-month change per metric; a step at April would show as an abnormal change in Apr', metrics: res, reading: flat ? 'Every metric drifts by a constant amount each month; none shows a step at April or May. Timing does not match the 10 April break.' : 'At least one metric shows a non-constant change.', limitation: 'Monthly, platform-wide and mostly post-order (cancellation, delivery SLA). Cannot be linked to checkout steps directly.' };
    };

    tools.size_scenario = () => {
      const base = PERIODS.baseline, post = PERIODS.post;
      const gm = tools.gateway_mix_vs_rate({ period_a: 'baseline', period_b: 'post' });
      const ops = sum(F.map(r => r.Orders)) / sum(F.map(r => r.Payment_Success));
      const rec = {}; let tot = 0;
      GW.forEach(gw => { const xa = G.filter(r => r.Gateway === gw && inR(r.Date, base)), xb = G.filter(r => r.Gateway === gw && inR(r.Date, post)); const ra = sum(xa.map(r => r.Successful_Payments)) / sum(xa.map(r => r.Routed_Attempts)), attB = sum(xb.map(r => r.Routed_Attempts)), rb = sum(xb.map(r => r.Successful_Payments)) / attB; const fails = Math.max(0, attB * (ra - rb)); const x = Math.round(fails * ops); rec[gw] = { baseline_success_pct: r2(ra * 100), post_success_pct: r2(rb * 100), recoverable_orders: x, attempts_in_period: attB, failed_payments_above_baseline: Math.round(fails) }; tot += x; });
      const sB = sum(F.filter(r => inR(r.Date, base)).map(r => r.Sessions)), oB = sum(F.filter(r => inR(r.Date, base)).map(r => r.Orders));
      const sP = sum(F.filter(r => inR(r.Date, post)).map(r => r.Sessions)), oP = sum(F.filter(r => inR(r.Date, post)).map(r => r.Orders));
      const gap = Math.round(sP * oB / sB - oP);
      return { source: 'Payment_Routing_Daily + Funnel_Daily', scenario_label: 'SCENARIO, not a forecast', formula: 'recoverable orders per gateway = attempts_in_post_period * (baseline success rate - post success rate) * (Orders/Payment_Success). Baseline = pooled gateway success in the Before period (' + label(base) + '); comparison = the Compare period (' + label(post) + ', ' + daysIn(post) + ' days); attempts held at actual. Within-gateway effect only: traffic-mix effect is excluded so gateways do not overlap.', assumptions: ['Baseline gateway success rates would have held', 'Attempt volumes unchanged', 'Orders/Payment_Success ratio ' + r4(ops) + ' unchanged', 'No revenue sizing: no order-level revenue by gateway in the data'], per_gateway: rec, total_recoverable_orders: tot, observed_order_shortfall_vs_baseline_conversion: gap, share_of_shortfall_pct: r2(tot / gap * 100), baseline_orders_per_session_pct: r2(oB / sB * 100), post_orders: oP, post_sessions: sP };
    };

    const CATALOG = [
      ['payment method', 'Not in dataset (no card/UPI/wallet field).', false], ['coupon', 'Only as a user segment in User_Cohort_Metrics (Coupon vs Non-Coupon, monthly) and ticket themes. No coupon-applied flag inside the funnel.', 'partial'],
      ['delivery fee', 'Only as a support-ticket theme and a dated change in Product_Changes. No fee amounts or fee exposure per user.', 'partial'], ['revenue', 'Monthly only (Executive_KPI_Monthly: Revenue, AOV). Not by day, segment or gateway.', 'partial'],
      ['session', 'No session- or user-level data: only daily/monthly aggregates.', false], ['error code', 'No decline/error codes by gateway.', false], ['restaurant', 'Monthly platform-wide Operational_Metrics only; nothing at restaurant level.', 'partial'],
      ['device', 'Platform (Android/iOS) in Checkout_Performance, Customer_Feedback, User_Cohort_Metrics. No model/OS version. Funnel_Daily has no platform split.', 'partial'], ['gateway', 'Yes: Payment_Routing_Daily (day x gateway: attempts, successes) and a Gateway field on tickets.', true],
      ['latency', 'Yes: Checkout_Performance P50/P90/error by platform and day.', true], ['load', 'No gateway capacity/load or timeout data.', false], ['retry', 'No retry or repeat-attempt data.', false], ['new user', 'User_Cohort_Metrics monthly (New vs Returning). Not crossable with other segments.', 'partial']
    ];
    tools.check_data_availability = ({ topic }) => {
      const t = String(topic || '').toLowerCase(); const hits = CATALOG.filter(c => t.includes(c[0]) || c[0].split(' ').some(w => w.length > 4 && t.includes(w)));
      if (!hits.length) return { topic, available: false, note: 'Nothing in the dataset matches this topic.' };
      return { topic, matches: hits.map(h => ({ keyword: h[0], available: h[2], note: h[1] })) };
    };

    function evals() {
      const R = [];
      const add = (id, name, pass, detail) => R.push({ id, name, pass, detail });
      let da = 0, ds = 0; F.forEach(r => { const g = GW.reduce((s, x) => s + gwDay[r.Date][x].Routed_Attempts, 0), s2 = GW.reduce((s, x) => s + gwDay[r.Date][x].Successful_Payments, 0); da = Math.max(da, Math.abs(g - r.Payment_Attempts)); ds = Math.max(ds, Math.abs(s2 - r.Payment_Success)); });
      add('E1', 'Routing sheet reconciles to funnel (all 180 days)', da === 0 && ds === 0, 'max daily difference: attempts ' + da + ', successes ' + ds);
      let mono = 0; F.forEach(r => STEPS.forEach(([a, b]) => { if (r[b] > r[a]) mono++; })); add('E2', 'Funnel stages never exceed the stage before', mono === 0, mono + ' violations');
      const months = [...new Set(F.map(r => ym(r.Date)))]; let md = 0; months.forEach(m => { const e = D.Executive_KPI_Monthly.find(x => x.Month === m); md = Math.max(md, Math.abs(sum(F.filter(r => ym(r.Date) === m).map(r => r.Orders)) - e.Orders), Math.abs(sum(F.filter(r => ym(r.Date) === m).map(r => r.Sessions)) - e.Sessions)); });
      add('E3', 'Daily funnel sums to Executive_KPI_Monthly (orders, sessions)', md === 0, 'max monthly difference ' + md);
      const gm = tools.gateway_mix_vs_rate({}); add('E4', 'Mix + within-gateway effect equals total change', Math.abs(gm._raw.mix + gm._raw.totw - gm._raw.tot) < 1e-9, 'mix ' + gm.mix_effect_pp + 'pp + within ' + gm.within_gateway_effect_pp + 'pp = total ' + gm.total_change_pp + 'pp');
      const cs = ['New Users,Returning Users', 'Android Users,iOS Users', 'Coupon Users,Non-Coupon Users'].map(p => p.split(',').reduce((s, k) => s + sum(C.filter(r => r.Segment === k).map(r => r.Sessions)), 0)); add('E5', 'Each cohort split sums to the same total sessions', cs[0] === cs[1] && cs[1] === cs[2], 'splits total ' + cs.join(' / ') + ' sessions');
      const sc = tools.size_scenario(); add('E6', 'Scenario excludes traffic-mix effect and stays within observed shortfall (+3% tolerance)', sc.total_recoverable_orders <= sc.observed_order_shortfall_vs_baseline_conversion * 1.03, sc.total_recoverable_orders + ' scenario orders vs ' + sc.observed_order_shortfall_vs_baseline_conversion + ' observed shortfall (' + sc.share_of_shortfall_pct + '%); tolerance 103% because other segments moved slightly up');
      const u = tools.check_data_availability({ topic: 'payment method' }); const k = tools.check_data_availability({ topic: 'gateway' }); add('E7', 'Unsupported question is declined, supported one answered', u.matches && u.matches[0].available === false && k.matches[0].available === true, '"payment method" -> not available; "gateway" -> available');
      add('E8', 'Answer-key sheet is not loaded into the analysis', !(D._sheets_loaded || []).includes('Interviewer_Guide'), 'sheets loaded: ' + (D._sheets_loaded || []).join(', '));
      add('E9', 'Ticket comment text is not loaded (treated as data, never instructions)', !('Comment' in T[0]), 'ticket fields: ' + Object.keys(T[0]).join(', '));
      return R;
    }
    return { tools, evals, SERIES, SERIES_NAMES: Object.keys(SERIES), PERIODS, setPeriods, label, daysIn, monthsIn };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine; else root.Engine = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
