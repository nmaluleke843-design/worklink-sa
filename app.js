/* WorkLink SA — Supabase-backed. Settings live in config.js (publishable key only!). */
const CFG = window.WL_CONFIG || {};
const CATEGORIES = ["Construction","Carpentry","Welding","Plumbing","Electrical","Painting","Cleaning","Gardening","Moving","Car Wash","Delivery","Security","General Labour","Digital/Online Work","Other"];
const CITIES = ["Midrand","Johannesburg","Soweto","Tembisa","Pretoria","Germiston","Sandton","Centurion","Randburg","Benoni"];

const configured = !!(CFG.supabaseUrl && CFG.supabaseKey && !CFG.supabaseKey.startsWith("PASTE") && window.supabase);
const sb = configured ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey) : null;
const state = { user: null };

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rand = n => "R" + Number(n).toLocaleString("en-ZA");
const toast = m => { const t = document.getElementById("toast"); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 3200); };
const opts = (list, sel, any) => (any ? `<option value="">${any}</option>` : "") + list.map(x => `<option ${x === sel ? "selected" : ""}>${esc(x)}</option>`).join("");
const errMsg = e => (e && e.message) || "Something went wrong";

async function loadUser() {
  state.user = null;
  if (!sb) return;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;
  const { data } = await sb.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
  state.user = data || null;
}

/* ---------- router ---------- */
function parse() {
  const raw = location.hash.slice(1) || "/";
  const [path, qs] = raw.split("?");
  return { parts: path.split("/").filter(Boolean).map(decodeURIComponent), q: Object.fromEntries(new URLSearchParams(qs || "")) };
}
let renderToken = 0;
async function render() {
  const token = ++renderToken;
  const { parts, q } = parse();
  const r = parts[0] || "home";
  const routes = { home, "find-jobs": findJobs, job, workers, premium, faq, contact, terms, privacy, login, register, "post-job": postJob, browse, welcome, admin };
  if (state.user && state.user.onboarded === false && r !== "welcome") { location.hash = "#/welcome"; return; }
  chrome(r);
  const app = document.getElementById("app");
  if (!sb) { app.innerHTML = setupNotice(); return; }
  app.innerHTML = `<div class="wrap page"><p class="meta">Loading…</p></div>`;
  let html;
  try { html = await (routes[r] || home)(parts, q); }
  catch (e) { html = `<div class="wrap page"><div class="empty"><h3>Could not load this page</h3><p>${esc(errMsg(e))}</p></div></div>`; }
  if (token !== renderToken) return;
  app.innerHTML = html;
  window.scrollTo(0, 0);
  bind(r, parts, q);
}
const setupNotice = () => `<div class="wrap page"><div class="note"><b>Almost there.</b> Open <code>config.js</code> and paste your Supabase <b>publishable</b> key (never the secret key), then reload.</div></div>`;

function chrome(r) {
  const links = [["", "Home"], ["find-jobs", "Find Jobs"], ["workers", "Find Workers"], ["premium", "Premium"]];
  if (state.user && state.user.is_admin) links.push(["admin", "Admin"]);
  document.getElementById("nav").innerHTML = links.map(([h, t]) => `<a class="${(r === "home" && !h) || r === h ? "on" : ""}" href="#/${h}">${t}</a>`).join("");
  const u = state.user;
  document.getElementById("auth").innerHTML = u
    ? `<span class="meta">Hi, ${esc(u.name.split(" ")[0])}</span><button class="btn ghost sm" id="logout">Log out</button>`
    : `<a class="btn ghost sm" href="#/login">Log in</a><a class="btn sm" href="#/register">Sign up</a>`;
  const lo = document.getElementById("logout");
  if (lo) lo.onclick = async () => { await sb.auth.signOut(); state.user = null; toast("Logged out"); location.hash = "#/"; render(); };
  document.getElementById("wa").href = `https://wa.me/${CFG.whatsapp}?text=${encodeURIComponent("Hi WorkLink SA, I need some help with the platform.")}`;
  document.getElementById("footer").innerHTML = `<div class="wrap"><div class="brand" style="color:#fff"><span class="logo">W</span> WorkLink SA</div><p>Find Work. Find Workers. Build Your Future.</p>
  <a href="#/find-jobs">Find Jobs</a><a href="#/workers">Find Workers</a><a href="#/premium">Premium</a><a href="#/faq">FAQ</a><a href="#/contact">Contact</a><a href="#/terms">Terms of Use</a><a href="#/privacy">Privacy Policy</a><br>
  <a href="#/browse/Plumbing/Midrand">Plumbers in Midrand</a><a href="#/browse/Painting/Tembisa">Painters in Tembisa</a><a href="#/browse/Gardening/Soweto">Gardeners in Soweto</a></div>`;
}

/* ---------- data helpers ---------- */
async function fetchJobs(f = {}, limit) {
  let qb = sb.from("jobs").select("*").order("featured", { ascending: false }).order("created_at", { ascending: false });
  if (f.category) qb = qb.eq("category", f.category);
  if (f.city) qb = qb.eq("city", f.city);
  if (f.q) { const t = f.q.replace(/[%,()]/g, " "); qb = qb.or(`title.ilike.%${t}%,description.ilike.%${t}%`); }
  if (limit) qb = qb.limit(limit);
  const { data, error } = await qb;
  if (error) throw error;
  return data || [];
}
async function fetchWorkers(f = {}) {
  let qb = sb.from("profiles").select("*").eq("role", "worker").order("premium", { ascending: true });
  if (f.category) qb = qb.contains("skills", [f.category]);
  if (f.city) qb = qb.eq("city", f.city);
  if (f.q) { const t = f.q.replace(/[%,()]/g, " "); qb = qb.ilike("name", `%${t}%`); }
  const { data, error } = await qb;
  if (error) throw error;
  return data || [];
}

/* ---------- shared pieces ---------- */
const jobCard = j => `<div class="card"><div class="job"><div><h3><a href="#/job/${esc(j.id)}">${esc(j.title)}</a></h3>
  <p>${esc(j.description).slice(0, 140)}${j.description.length > 140 ? "…" : ""}</p>
  <div class="meta">${esc(j.category)} · ${esc(j.city)} · Budget ${rand(j.budget)}</div></div>
  <div>${j.featured ? '<span class="badge gold">Featured</span>' : `<span class="badge">${esc(j.status)}</span>`}</div></div></div>`;
const jobsHtml = list => list.length
  ? `<div class="grid" style="grid-template-columns:1fr">${list.map(jobCard).join("")}</div>`
  : `<div class="empty"><h3>No jobs match yet</h3><p>Try another category or city, or post one yourself.</p><a class="btn" href="#/post-job">Post a Job</a></div>`;
const workersHtml = list => list.length
  ? `<div class="grid">${list.map(w => `<div class="card"><h3>${esc(w.name)} ${w.premium === "active" ? '<span class="badge gold">Premium</span>' : ""}</h3><p>${esc((w.skills || []).join(", ") || "No skills listed")}</p><div class="meta">${esc(w.city || "")} · ${w.rate ? rand(w.rate) + "/hr" : "Rate on request"} · <span class="badge grey">${w.verified ? "Verified" : "Not yet verified"}</span></div></div>`).join("")}</div>`
  : `<div class="empty"><h3>No workers listed yet</h3><p>Workers who sign up appear here.</p><a class="btn" href="#/register?role=worker">Join as a worker</a></div>`;

/* ---------- pages ---------- */
async function home() {
  const latest = await fetchJobs({}, 6);
  return `
  <section class="hero"><div class="wrap">
    <span class="pill">Now launching in ${esc(CFG.province)}</span>
    <h1>Find Work. Find Workers. Build Your Future.</h1>
    <p>WorkLink SA connects skilled workers with customers and businesses looking for reliable help.</p>
    <div class="cta"><a class="btn alt" href="#/find-jobs">Find Work</a><a class="btn ghost" href="#/post-job">Post a Job</a></div>
    <form class="searchbar" id="hsearch"><input name="q" placeholder="${esc(CFG.province)} Search — e.g. plumber, painter"><button class="btn">Search</button></form>
    <div class="chips"><span>✔ Admin-approved verification</span><span>✔ 15 work categories</span><span>✔ Launching in ${esc(CFG.province)} – more provinces coming soon</span><span>✔ Free to browse, post and apply. Premium is optional.</span></div>
  </div></section>

  <section class="s"><div class="wrap"><div class="eyebrow">Popular categories</div><h2>Work that keeps South Africa moving</h2>
    <p class="lead">From construction sites in Midrand to digital work you can do from home in Soweto — find the people you need.</p>
    <div style="margin-top:18px">${CATEGORIES.map(c => `<a class="cat" href="#/find-jobs?category=${encodeURIComponent(c)}">${esc(c)}</a>`).join("")}</div></div></section>

  <section class="s w"><div class="wrap"><div class="eyebrow">Latest jobs</div><h2>Fresh work posted by real customers</h2>
    <p class="lead">Every job below was posted by a customer on WorkLink SA. Apply with your price and get notified when you are selected.</p>
    <p><a href="#/find-jobs">Browse all jobs →</a></p>
    ${latest.length ? `<div class="grid">${latest.map(jobCard).join("")}</div>` : `<div class="empty"><h3>No jobs posted yet</h3><p>Be the first to post a job — workers in your area are waiting for work.</p><a class="btn" href="#/post-job">Post a Job</a></div>`}
  </div></section>

  <section class="s"><div class="wrap"><div class="eyebrow">How WorkLink works</div><h2>Six simple steps, whether you work or hire</h2>
    <div class="tabs"><button class="on" data-t="w">For workers</button><button data-t="c">For customers</button></div>
    <div class="grid" id="steps"></div></div></section>

  <section class="s w"><div class="wrap"><div class="eyebrow">Why use WorkLink</div><h2>A marketplace made for how South Africans actually work</h2>
    <p class="lead">No fake profiles, no invented job numbers — you see exactly what is on the platform.</p>
    <p><span class="badge">Workers quote their own price</span> <span class="badge">Free to join</span> <span class="badge">Covers trades, general labour, security and online work</span> <span class="badge">Admin-verified profiles</span></p>
    <p class="lead">Workers set their own price and keep what they quote. WorkLink SA never takes a cut from your job payment.</p>
    <div class="grid">${[
      ["Built for South Africa", "Provinces, cities and suburbs from Midrand to Mthatha — with the Rand as the only currency."],
      ["Verification you can trust", "Verified Worker means a WorkLink SA administrator has checked the worker’s South African ID and matched it to a selfie."],
      ["Talk in one place", "Messaging stays linked to the job, so you always know who you are speaking to and why."],
      ["Real reviews", "Both sides rate each other after a completed job, and averages update automatically."],
      ["You agree the price", "Workers quote their own price in Rands. No card is needed to browse, post or apply."],
      ["Report anything", "Report a user, a job or a message. Administrators review every report."],
    ].map(([t, d]) => `<div class="card"><h3>${t}</h3><p>${d}</p></div>`).join("")}</div></div></section>

  <section class="s"><div class="wrap"><div class="eyebrow">Safety first</div><h2>Stay safe while you work and hire</h2>
    <p class="lead">WorkLink SA connects people — it does not employ workers or guarantee a job. Follow these tips and use the report button whenever something feels wrong.</p>
    <p><a class="btn" href="#/find-jobs">Start looking for work</a></p>
    <div class="grid">${[
      ["Share the job address", "Share the job address with someone you trust before you go."],
      ["Meet or talk first", "For bigger jobs, meet or talk first before the work starts."],
      ["Agree the price in the app", "Agree the price in the app and pay the worker directly after the job is done."],
      ["Ask for certificates", "Ask for certificates for electrical and plumbing work."],
      ["Report anything", "Use the Report button if anything feels wrong."],
    ].map(([t, d]) => `<div class="card"><h3>${t}</h3><p>${d}</p></div>`).join("")}</div></div></section>

  <section class="s w"><div class="wrap two">
    <div><div class="eyebrow">For workers</div><h2>Your skills deserve steady work</h2>
      <p class="lead">Whether you are a welder in Germiston, a painter in Tembisa or a virtual assistant in Pretoria — show what you can do and get found.</p>
      <ul class="tick"><li>Workers set their own price and keep what they quote — WorkLink SA never takes a cut</li><li>Build a profile that shows your skills, area and rate</li><li>Apply to jobs with your own price in Rands</li><li>Message the customer before the job starts</li><li>Grow a rating that wins you the next job</li></ul>
      <a class="btn" href="#/register?role=worker">Find Work</a></div>
    <div><div class="eyebrow">For customers</div><h2>Reliable help, without the guesswork</h2>
      <p class="lead">Homeowners, landlords, body corporates and businesses — post the work once and let skilled people come to you.</p>
      <ul class="tick"><li>Post a job free and describe exactly what you need</li><li>Compare applicants, prices and ratings side by side</li><li>See admin-approved verification before you hire</li><li>Track every job from open to completed</li></ul>
      <a class="btn alt" href="#/post-job">Post a Job</a></div>
  </div></section>

  <section class="s"><div class="wrap two"><div><div class="eyebrow">Premium</div><h2>Stand out when it matters most</h2>
    <p class="lead">Worker Premium puts your profile in front of customers first. Business Premium keeps multiple jobs visible. Feature a single job for R29. Subscriptions are recorded on the platform and only activate once WorkLink SA confirms payment — we never mark a payment as successful on your behalf.</p>
    <a class="btn" href="#/premium">See Premium plans</a> <a class="btn ghost" href="#/register">Create a free profile</a></div>
    <div class="card"><span class="badge gold">Featured Job</span><p>One job, top of the list</p><div class="price">R29</div>
    <p>Worker Premium — R59/month, free for your first 3 months</p><p>Business Premium — R199/month</p><p><b>Free forever:</b> browse, post, apply and message</p></div></div></section>`;
}

const STEPS = {
  w: [["Create your profile", "Add your skills, area and rate. A strong profile gets chosen first."], ["Find jobs", "Search work near you by category, city and budget."], ["Apply", "Send your price and a short cover message."], ["Get selected", "The customer compares applicants and picks you."], ["Complete the job", "Do great work and mark it complete."], ["Get rated", "Build a rating that wins you the next job."]],
  c: [["Create your account", "Sign up free as a customer."], ["Post a job", "Describe the work, location and budget."], ["Compare applicants", "See prices, profiles and ratings side by side."], ["Select a worker", "Pick the person who fits best and agree the price."], ["Job gets done", "Talk in the app, then pay the worker directly after the job."], ["Leave a review", "Rate the worker to help the next customer."]],
};
const stepsHtml = k => STEPS[k].map(([t, d], i) => `<div class="card"><div class="step">Step ${i + 1}</div><h3>${t}</h3><p>${d}</p></div>`).join("");

async function findJobs(_, q) {
  const list = await fetchJobs(q);
  return `<div class="wrap page"><h2>Find Jobs</h2>
  <form class="filters" id="jf"><input name="q" placeholder="Search jobs" value="${esc(q.q || "")}"><select name="category">${opts(CATEGORIES, q.category, "All categories")}</select><select name="city">${opts(CITIES, q.city, "All cities")}</select><button class="btn">Filter</button></form>
  ${jobsHtml(list)}</div>`;
}
async function browse([, cat, city]) {
  const [js, ws] = await Promise.all([fetchJobs({ category: cat, city }), fetchWorkers({ category: cat, city })]);
  return `<div class="wrap page"><h2>${esc(cat)} in ${esc(city)}</h2>${jobsHtml(js)}<h3 style="margin-top:32px">Workers</h3>${workersHtml(ws)}</div>`;
}

async function job([, id]) {
  const { data: j } = await sb.from("jobs").select("*").eq("id", id).maybeSingle();
  if (!j) return `<div class="wrap page"><div class="empty"><h3>Job not found</h3><a href="#/find-jobs">Back to jobs</a></div></div>`;
  const u = state.user, mine = u && j.owner_id === u.id;
  let apps = [], applied = false;
  if (mine) {
    const { data } = await sb.from("applications").select("*, profiles(name)").eq("job_id", id).order("created_at");
    apps = data || [];
  } else if (u && u.role === "worker") {
    const { data } = await sb.from("applications").select("id").eq("job_id", id).eq("worker_id", u.id);
    applied = !!(data && data.length);
  }
  const body = mine
    ? `<h3>Applicants (${apps.length})</h3>${apps.map(a => `<div class="card" style="margin:8px 0"><b>${esc(a.profiles?.name || "Worker")}</b> — ${rand(a.price)}<p>${esc(a.message)}</p>${j.status === "Open" ? `<button class="btn sm" data-pick="${esc(a.id)}">Select</button>` : a.picked ? '<span class="badge">Selected</span>' : ""}</div>`).join("") || '<p class="meta">No applicants yet.</p>'}${j.status === "Assigned" ? `<button class="btn" id="done">Mark completed</button>` : ""}`
    : !u ? `<p><a class="btn" href="#/login">Log in as a worker to apply</a></p>`
    : u.role !== "worker" ? `<p class="meta">Only workers can apply for jobs.</p>`
    : applied ? `<p><span class="badge">You have applied</span></p>`
    : j.status !== "Open" ? `<p class="meta">This job is no longer open.</p>`
    : `<h3>Apply for this job</h3><form class="f" id="apply"><label>Your price (R)<input name="price" type="number" min="1" required></label><label>Cover message<textarea name="message" required></textarea></label><button class="btn">Send application</button></form>`;
  return `<div class="wrap page"><a href="#/find-jobs">← All jobs</a><h2>${esc(j.title)}</h2>
  <p class="meta">${esc(j.category)} · ${esc(j.city)} · Budget ${rand(j.budget)} · <span class="badge">${esc(j.status)}</span></p>
  <div class="card"><p style="color:var(--ink)">${esc(j.description)}</p></div>${body}
  ${u ? `<p style="margin-top:20px"><button class="btn ghost sm" id="report">Report this job</button></p>` : ""}</div>`;
}

async function workers(_, q) {
  const list = await fetchWorkers(q);
  return `<div class="wrap page"><h2>Find Workers</h2><form class="filters" id="wf"><input name="q" placeholder="Search by name" value="${esc(q.q || "")}"><select name="category">${opts(CATEGORIES, q.category, "All skills")}</select><select name="city">${opts(CITIES, q.city, "All cities")}</select><button class="btn">Filter</button></form>${workersHtml(list)}</div>`;
}

async function premium() {
  const u = state.user;
  let subs = [];
  if (u) { const { data } = await sb.from("subscriptions").select("*").eq("user_id", u.id).order("created_at", { ascending: false }); subs = data || []; }
  const plan = (id, name, price, desc, items) => `<div class="card"><h3>${name}</h3><div class="price">${price}</div><p>${desc}</p><ul class="tick">${items.map(i => `<li>${i}</li>`).join("")}</ul><button class="btn" data-plan="${id}">${id === "free" ? "Current plan" : "Request " + name}</button></div>`;
  return `<div class="wrap page"><div class="eyebrow">Premium</div><h2>Stand out when it matters most</h2>
  <div class="note">Subscriptions are recorded as <b>pending</b> and only activate once WorkLink SA confirms payment. Nothing is ever marked paid automatically.</div>
  <div class="grid">${plan("free", "Free", "R0", "Free forever", ["Browse jobs", "Post jobs", "Apply and message"])}
  ${plan("worker", "Worker Premium", "R59/mo", "Free for your first 3 months", ["Profile shown to customers first", "Premium badge"])}
  ${plan("business", "Business Premium", "R199/mo", "For businesses posting often", ["Keep multiple jobs visible", "Priority support"])}
  ${plan("featured", "Featured Job", "R29", "One job, top of the list", ["Pinned above other jobs"])}</div>
  ${u ? `<p class="meta">Your requests: ${subs.map(s => `${esc(s.plan)} (${esc(s.status)})`).join(", ") || "none"}</p>` : ""}</div>`;
}

const FAQ = [
  ["Is WorkLink SA free?", "Yes. Browsing, posting jobs, applying and messaging are free. Premium is optional."],
  ["Does WorkLink SA take a cut of my pay?", "No. Workers set their own price and keep what they quote."],
  ["What does Verified Worker mean?", "A WorkLink SA administrator has checked the worker’s South African ID and matched it to a selfie."],
  ["How do I pay a worker?", "Agree the price in the app and pay the worker directly after the job is done."],
  ["Which areas are covered?", "We are launching in Gauteng, with more provinces coming soon."],
  ["Something feels wrong. What do I do?", "Use the Report button on a user, job or message. Administrators review every report."],
];
const faq = () => `<div class="wrap page"><h2>Frequently asked questions</h2>${FAQ.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join("")}</div>`;
const contact = () => `<div class="wrap page"><h2>Contact us</h2><p class="lead">Prefer WhatsApp? Use the green button in the corner.</p><form class="f" id="cf"><label>Name<input name="name" required></label><label>Email<input name="email" type="email" required></label><label>Message<textarea name="message" required></textarea></label><button class="btn">Send message</button></form></div>`;
const terms = () => `<div class="wrap page" style="max-width:820px"><h2>Terms of Use</h2><p class="meta">Last updated: 22 October 2026</p>
<h3>1. About WorkLink SA</h3><p>WorkLink SA is an online platform that lets customers and workers in South Africa find each other. By creating an account or using the platform you agree to these Terms. If you do not agree, please do not use it.</p>
<h3>2. Who may use it</h3><p>You must be 18 or older. You must give true information and keep your login details safe. You are responsible for everything done through your account.</p>
<h3>3. Our role</h3><p>WorkLink SA is only a meeting place. We do not employ workers, are not a party to any agreement between users, do not supervise or guarantee any work, and do not guarantee that any job will be offered, filled or completed, or that any person is honest, qualified, licensed or insured.</p>
<h3>4. Jobs, prices and payment</h3><p>Customers describe the work they need. Workers quote their own price in Rands. Users agree the price and the work between themselves. WorkLink SA does not handle or hold payments for jobs and takes no commission. Any payment for a job is made directly between the customer and the worker, and any dispute over it is between them.</p>
<h3>5. Verification</h3><p>“Verified Worker” means a WorkLink SA administrator has checked a South African ID and matched it to a selfie at the time of checking. It does not mean we have checked the worker’s skills, certificates, criminal record, references, tools or insurance, and it is not a guarantee of quality, safety or honesty. Always do your own checks, such as asking for certificates for electrical and plumbing work.</p>
<h3>6. Premium</h3><p>Premium plans and featured jobs are optional. A request is only recorded on the platform and becomes active once WorkLink SA confirms payment. Premium may improve how visible a profile or job is but does not guarantee work or results. Prices may change with notice.</p>
<h3>7. What you must not do</h3><p>You must not post false, misleading, illegal, offensive or discriminatory content; pretend to be someone else; harass or threaten others; ask for payment outside an agreed job in a misleading way; post jobs or offer services that are illegal; collect other users’ information for other purposes; or try to break, overload or misuse the platform.</p>
<h3>8. Reports and removal</h3><p>You can report a job, user or message. We may review reports and may remove content, withhold verification or Premium, or suspend or close an account at our discretion, with or without notice, where we believe these Terms have been broken or other users may be at risk.</p>
<h3>9. Your content</h3><p>You keep ownership of what you post, but you give WorkLink SA permission to display it on the platform so the service can work. You promise you have the right to post it.</p>
<h3>10. No responsibility for damage</h3><p>You use WorkLink SA and deal with other users entirely at your own risk. To the fullest extent allowed by South African law, WorkLink SA, its owner, operators and anyone working for it are not responsible or liable for any loss or damage of any kind, whether direct, indirect or consequential, including but not limited to: injury or death; damage to or theft of property; poor, incomplete or unsafe work; non-payment or payment disputes; the acts, omissions or statements of any user; false or inaccurate profiles, jobs or reviews; loss of income, work or data; or the platform being unavailable, interrupted or containing errors. Nothing in these Terms limits any right you have under law that cannot lawfully be limited or excluded.</p>
<h3>11. Protection from claims</h3><p>To the extent the law allows, you agree to protect WorkLink SA and its owner from claims, losses and costs that arise from your content, your dealings with other users, or your breach of these Terms.</p>
<h3>12. Changes and ending</h3><p>We may change these Terms or the platform at any time, and the updated Terms apply once posted here. Continuing to use the platform means you accept the changes. You may stop using WorkLink SA and ask us to close your account at any time.</p>
<h3>13. Governing law</h3><p>These Terms are governed by the laws of the Republic of South Africa.</p>
<h3>14. Contact</h3><p>Questions? Use the <a href="#/contact">Contact page</a> or the WhatsApp chat button. Our handling of personal information is explained in the <a href="#/privacy">Privacy Policy</a>.</p></div>`;
const privacy = () => `<div class="wrap page" style="max-width:820px"><h2>Privacy Policy</h2><p class="meta">Last updated: 22 October 2026</p>
<p>This policy explains how WorkLink SA collects and uses personal information, in line with the Protection of Personal Information Act (POPIA).</p>
<h3>1. What we collect</h3><p><b>Account details:</b> your name, email address and, if you sign in with Google, the basic profile details Google shares with us. <b>Profile details:</b> your role (worker or customer), city, and for workers their skills and hourly rate. <b>Activity:</b> jobs you post, applications you send, reports, contact messages and Premium requests. <b>Verification:</b> if you ask to be verified, we may ask you to show a South African ID and a selfie so an administrator can check them.</p>
<h3>2. Why we use it</h3><p>To create and run your account, show jobs and workers, let customers and workers connect, handle verification and Premium requests, respond to reports and messages, keep the platform safe, and meet legal duties. We do not sell your personal information.</p>
<h3>3. What other people can see</h3><p>Worker profiles are visible to anyone using the platform and show your name, city, skills, rate, and whether you are verified or Premium. Jobs you post are visible to everyone. Applications are visible only to you and the customer who posted the job. Your email address and ID documents are not shown to other users.</p>
<h3>4. Who handles your information</h3><p>We use Supabase to store data and run sign-in, and Google if you choose “Continue with Google”. These providers may store or process information on servers outside South Africa. We only use providers that apply reasonable security safeguards, and we share only what is needed to run the service. We may also disclose information when the law requires it.</p>
<h3>5. How long we keep it</h3><p>We keep your information while your account is active and for as long afterwards as needed for safety, legal or dispute reasons. Verification documents, if collected, are kept only as long as needed to complete and record the check.</p>
<h3>6. Security</h3><p>We take reasonable technical and organisational steps to protect your information, including access controls on the database. No online service is completely secure, so please use a strong, unique password and keep it private.</p>
<h3>7. Your rights</h3><p>You may ask to see the personal information we hold about you, correct it, or have it deleted, and you may object to how we use it or withdraw your consent. To do so, use the <a href="#/contact">Contact page</a>. If you are unhappy with how we handle your information you may complain to the Information Regulator of South Africa (inforegulator.org.za).</p>
<h3>8. Children</h3><p>WorkLink SA is for people aged 18 and over. We do not knowingly collect information from children. If you believe a child has signed up, please contact us and we will remove the account.</p>
<h3>9. Browser storage</h3><p>Your browser stores a sign-in session so you stay logged in. We do not use advertising trackers.</p>
<h3>10. Changes</h3><p>We may update this policy and will post the new version here with its date.</p>
<h3>11. Contact</h3><p>For privacy questions or requests, use the <a href="#/contact">Contact page</a> or the WhatsApp chat button.</p></div>`;

const admBtn = (label, fn, args, cls = "") => `<button class="btn sm ${cls}" data-adm="${esc(JSON.stringify({ fn, args }))}">${label}</button>`;
async function admin(_, q) {
  const u = state.user;
  if (!u || !u.is_admin) return `<div class="wrap page"><div class="empty"><h3>Admins only</h3><a href="#/">Back home</a></div></div>`;
  const tab = q.tab || "subs";
  const tabs = [["subs", "Subscriptions"], ["workers", "Workers"], ["jobs", "Jobs"], ["reports", "Reports"], ["messages", "Messages"]];
  const date = d => new Date(d).toLocaleString("en-ZA");
  let body = "";
  if (tab === "subs") {
    const { data, error } = await sb.from("subscriptions").select("*, profiles(name)").order("created_at", { ascending: false });
    if (error) throw error;
    body = (data || []).map(s => `<div class="card" style="margin:8px 0"><div class="job"><div><b>${esc(s.profiles?.name || "User")}</b> — ${esc(s.plan)}<div class="meta">${date(s.created_at)} · <span class="badge ${s.status === "active" ? "" : "grey"}">${esc(s.status)}</span></div></div><div>${admBtn("Confirm payment", "admin_set_subscription", { p_sub: s.id, p_status: "active" })} ${admBtn("Reject", "admin_set_subscription", { p_sub: s.id, p_status: "rejected" }, "ghost")} ${s.status === "active" ? admBtn("Expire", "admin_set_subscription", { p_sub: s.id, p_status: "expired" }, "ghost") : ""}</div></div></div>`).join("") || `<div class="empty"><p>No subscription requests yet.</p></div>`;
  } else if (tab === "workers") {
    const { data, error } = await sb.from("profiles").select("*").eq("role", "worker").order("created_at", { ascending: false });
    if (error) throw error;
    body = (data || []).map(w => `<div class="card" style="margin:8px 0"><div class="job"><div><b>${esc(w.name)}</b> <span class="badge ${w.verified ? "" : "grey"}">${w.verified ? "Verified" : "Not verified"}</span> ${w.premium === "active" ? '<span class="badge gold">Premium</span>' : ""}<div class="meta">${esc(w.city || "")} · ${esc((w.skills || []).join(", "))}</div></div><div>${admBtn(w.verified ? "Remove verification" : "Verify (ID checked)", "admin_set_verified", { p_user: w.id, p_value: !w.verified }, w.verified ? "ghost" : "")} ${admBtn(w.premium === "active" ? "Remove Premium" : "Give Premium", "admin_set_premium", { p_user: w.id, p_value: w.premium === "active" ? "none" : "active" }, "ghost")}</div></div></div>`).join("") || `<div class="empty"><p>No workers yet.</p></div>`;
  } else if (tab === "jobs") {
    const list = await fetchJobs();
    body = list.map(j => `<div class="card" style="margin:8px 0"><div class="job"><div><b><a href="#/job/${esc(j.id)}">${esc(j.title)}</a></b> ${j.featured ? '<span class="badge gold">Featured</span>' : ""}<div class="meta">${esc(j.category)} · ${esc(j.city)} · ${esc(j.status)}</div></div><div>${admBtn(j.featured ? "Unfeature" : "Feature", "admin_feature_job", { p_job: j.id, p_value: !j.featured }, "ghost")} ${admBtn("Delete", "admin_delete_job", { p_job: j.id }, "ghost")}</div></div></div>`).join("") || `<div class="empty"><p>No jobs yet.</p></div>`;
  } else if (tab === "reports") {
    const { data, error } = await sb.from("reports").select("*, jobs(id,title), profiles(name)").order("created_at", { ascending: false });
    if (error) throw error;
    body = (data || []).map(r => `<div class="card" style="margin:8px 0"><b>${r.jobs ? `<a href="#/job/${esc(r.jobs.id)}">${esc(r.jobs.title)}</a>` : "Deleted job"}</b><div class="meta">Reported by ${esc(r.profiles?.name || "unknown")} · ${date(r.created_at)}</div></div>`).join("") || `<div class="empty"><p>No reports.</p></div>`;
  } else {
    const { data, error } = await sb.from("contact_messages").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    body = (data || []).map(m => `<div class="card" style="margin:8px 0"><b>${esc(m.name)}</b> · <a href="mailto:${esc(m.email)}">${esc(m.email)}</a><div class="meta">${date(m.created_at)}</div><p style="color:var(--ink);margin-top:6px">${esc(m.message)}</p></div>`).join("") || `<div class="empty"><p>No messages.</p></div>`;
  }
  return `<div class="wrap page"><h2>Admin</h2><div class="tabs">${tabs.map(([k, t]) => `<a href="#/admin?tab=${k}" style="text-decoration:none"><button class="${k === tab ? "on" : ""}" type="button">${t}</button></a>`).join("")}</div>${body}</div>`;
}
const googleBtn = () => `<div style="max-width:560px;margin:18px 0"><div class="meta" style="text-align:center;margin-bottom:8px">or</div><button type="button" class="btn ghost" style="width:100%" data-google>Continue with Google</button><p class="meta" style="text-align:center">By continuing with Google you confirm you are 18 or older and agree to the <a href="#/terms">Terms</a> and <a href="#/privacy">Privacy Policy</a>.</p></div>`;
const agreeBox = () => `<label style="display:flex;gap:10px;align-items:flex-start;font-weight:400"><input type="checkbox" name="agree" required style="width:auto;margin-top:4px"><span>I am 18 or older and agree to the <a href="#/terms" target="_blank">Terms of Use</a> and <a href="#/privacy" target="_blank">Privacy Policy</a>.</span></label>`;
const welcome = () => {
  const u = state.user;
  if (!u) return `<div class="wrap page"><div class="empty"><a class="btn" href="#/login">Log in</a></div></div>`;
  return `<div class="wrap page"><h2>Welcome, ${esc(u.name.split(" ")[0])}!</h2><p class="lead">One last step: tell us how you will use WorkLink SA.</p><form class="f" id="wl">
  <label>I want to<select name="role"><option value="worker">Find work (worker)</option><option value="customer">Hire people (customer)</option></select></label>
  <label>City<select name="city">${opts(CITIES)}</select></label>
  <div id="wlfields"><label>Skills (hold Ctrl/Cmd to pick several)<select name="skills" multiple size="6">${opts(CATEGORIES)}</select></label><label>Hourly rate (R)<input name="rate" type="number" min="0"></label></div>
  ${agreeBox()}<button class="btn">Finish</button></form></div>`;
};
const login = () => `<div class="wrap page"><h2>Log in</h2><form class="f" id="lf"><label>Email<input name="email" type="email" required></label><label>Password<input name="password" type="password" required></label><button class="btn">Log in</button></form>${googleBtn()}<p>New here? <a href="#/register">Sign up</a></p></div>`;
const register = (_, q) => `<div class="wrap page"><h2>Create your account</h2><form class="f" id="rf">
  <label>I want to<select name="role"><option value="worker" ${q.role === "worker" ? "selected" : ""}>Find work (worker)</option><option value="customer" ${q.role === "customer" ? "selected" : ""}>Hire people (customer)</option></select></label>
  <label>Full name<input name="name" required></label><label>Email<input name="email" type="email" required></label><label>Password (min 6)<input name="password" type="password" minlength="6" required></label>
  <label>City<select name="city">${opts(CITIES)}</select></label>
  <div id="wfields"><label>Skills (hold Ctrl/Cmd to pick several)<select name="skills" multiple size="6">${opts(CATEGORIES)}</select></label><label>Hourly rate (R)<input name="rate" type="number" min="0"></label></div>
  ${agreeBox()}<button class="btn">Sign up</button></form>${googleBtn()}</div>`;
const postJob = () => {
  const u = state.user;
  if (!u) return `<div class="wrap page"><div class="empty"><h3>Log in to post a job</h3><a class="btn" href="#/login">Log in</a> <a class="btn ghost" href="#/register?role=customer">Sign up</a></div></div>`;
  if (u.role !== "customer") return `<div class="wrap page"><div class="empty"><h3>Only customer accounts can post jobs</h3><p>Sign up with a customer account to hire people.</p></div></div>`;
  return `<div class="wrap page"><h2>Post a job</h2><form class="f" id="pj"><label>Title<input name="title" required></label><label>Category<select name="category">${opts(CATEGORIES)}</select></label><label>City<select name="city">${opts(CITIES, u.city)}</select></label><label>Budget (R)<input name="budget" type="number" min="1" required></label><label>Description<textarea name="description" required></textarea></label><button class="btn">Post job (free)</button></form></div>`;
};

/* ---------- behaviour ---------- */
const on = (id, fn) => {
  const f = document.getElementById(id); if (!f) return;
  f.onsubmit = async e => {
    e.preventDefault();
    const btn = f.querySelector("button:not([type=button])"); if (btn) btn.disabled = true;
    try { await fn(f, Object.fromEntries(new FormData(f))); }
    catch (err) { toast(errMsg(err)); }
    finally { if (btn) btn.disabled = false; }
  };
};
const must = ({ error }) => { if (error) throw error; };
const qs = d => new URLSearchParams(Object.entries(d).filter(([, v]) => v)).toString();

function bind(r, parts, q) {
  document.querySelectorAll("[data-adm]").forEach(b => b.onclick = async () => {
    try {
      const a = JSON.parse(b.dataset.adm);
      if (a.fn === "admin_delete_job" && !confirm("Delete this job permanently?")) return;
      must(await sb.rpc(a.fn, a.args)); toast("Saved"); render();
    } catch (e) { toast(errMsg(e)); }
  });
  document.querySelectorAll("[data-google]").forEach(b => b.onclick = async () => {
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
    if (error) toast(errMsg(error));
  });
  on("wl", async (f, d) => {
    const skills = d.role === "worker" ? [...f.skills.selectedOptions].map(o => o.value) : [];
    must(await sb.rpc("complete_onboarding", { p_role: d.role, p_city: d.city, p_skills: skills, p_rate: Number(d.rate) || 0 }));
    await loadUser(); toast("All set!");
    location.hash = d.role === "worker" ? "#/find-jobs" : "#/post-job";
  });
  const wl = document.getElementById("wl");
  if (wl) { const t = () => document.getElementById("wlfields").style.display = wl.role.value === "worker" ? "" : "none"; wl.role.onchange = t; t(); }
  on("hsearch", (_, d) => { location.hash = "#/find-jobs?q=" + encodeURIComponent(d.q); });
  const tabs = document.querySelectorAll(".tabs button"), steps = document.getElementById("steps");
  if (steps) { steps.innerHTML = stepsHtml("w"); tabs.forEach(b => b.onclick = () => { tabs.forEach(x => x.classList.toggle("on", x === b)); steps.innerHTML = stepsHtml(b.dataset.t); }); }
  on("jf", (_, d) => { location.hash = "#/find-jobs?" + qs(d); });
  on("wf", (_, d) => { location.hash = "#/workers?" + qs(d); });

  on("cf", async (f, d) => { must(await sb.from("contact_messages").insert({ name: d.name, email: d.email, message: d.message })); f.reset(); toast("Message sent — we will get back to you"); });

  on("rf", async (f, d) => {
    const skills = d.role === "worker" ? [...f.skills.selectedOptions].map(o => o.value) : [];
    const { data, error } = await sb.auth.signUp({ email: d.email, password: d.password, options: { data: { role: d.role, name: d.name, city: d.city, skills, rate: Number(d.rate) || 0, accepted_terms_at: new Date().toISOString() } } });
    if (error) throw error;
    if (!data.session) { toast("Check your email to confirm your account, then log in"); location.hash = "#/login"; return; }
    await loadUser(); toast("Welcome to WorkLink SA!");
    location.hash = d.role === "worker" ? "#/find-jobs" : "#/post-job";
  });
  const rf = document.getElementById("rf");
  if (rf) { const t = () => document.getElementById("wfields").style.display = rf.role.value === "worker" ? "" : "none"; rf.role.onchange = t; t(); }

  on("lf", async (_, d) => {
    const { error } = await sb.auth.signInWithPassword({ email: d.email, password: d.password });
    if (error) throw error;
    await loadUser(); toast("Logged in"); location.hash = "#/"; render();
  });

  on("pj", async (_, d) => {
    must(await sb.from("jobs").insert({ owner_id: state.user.id, title: d.title, category: d.category, city: d.city, budget: Number(d.budget), description: d.description }));
    toast("Job posted"); location.hash = "#/find-jobs";
  });

  if (r === "job") {
    const id = parts[1], u = state.user;
    on("apply", async (_, d) => {
      must(await sb.from("applications").insert({ job_id: id, worker_id: u.id, price: Number(d.price), message: d.message }));
      toast("Application sent"); render();
    });
    document.querySelectorAll("[data-pick]").forEach(b => b.onclick = async () => {
      try {
        must(await sb.from("applications").update({ picked: true }).eq("id", b.dataset.pick));
        must(await sb.from("jobs").update({ status: "Assigned" }).eq("id", id));
        toast("Worker selected"); render();
      } catch (e) { toast(errMsg(e)); }
    });
    const done = document.getElementById("done");
    if (done) done.onclick = async () => { try { must(await sb.from("jobs").update({ status: "Completed" }).eq("id", id)); toast("Marked completed"); render(); } catch (e) { toast(errMsg(e)); } };
    const rep = document.getElementById("report");
    if (rep) rep.onclick = async () => { try { must(await sb.from("reports").insert({ job_id: id, reporter_id: u.id })); toast("Report sent to administrators"); } catch (e) { toast(errMsg(e)); } };
  }

  document.querySelectorAll("[data-plan]").forEach(b => b.onclick = async () => {
    if (b.dataset.plan === "free") return;
    if (!state.user) { toast("Log in first"); location.hash = "#/login"; return; }
    try { must(await sb.from("subscriptions").insert({ user_id: state.user.id, plan: b.dataset.plan })); toast("Request recorded — activates once payment is confirmed"); render(); }
    catch (e) { toast(errMsg(e)); }
  });
}

window.addEventListener("hashchange", render);
loadUser().then(render);
