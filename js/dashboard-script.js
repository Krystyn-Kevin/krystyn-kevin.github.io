// ══ FIREBASE ══════════════════════════════════════════════════════
const firebaseConfig = {
  apiKey:"AIzaSyCPlB-HjpQPfBQbkvH8gApsyBY-ju5l2G4",
  authDomain:"expense-manager-d42e0.firebaseapp.com",
  projectId:"expense-manager-d42e0",
  storageBucket:"expense-manager-d42e0.appspot.com",
  messagingSenderId:"777494191910",
  appId:"1:777494191910:web:4860b0e50889ec703901b0"
};
firebase.initializeApp(firebaseConfig);
const auth=firebase.auth(), db=firebase.firestore();

const S_CATS='spendex_cats_v3', S_SUBCATS='spendex_subcats_v1', S_THEME='spendex_theme';

// ══ DEFAULT CATEGORIES & SUBCATEGORIES ════════════════════════════
const DEFAULTS=[
  {name:'Food',icon:'🍛',color:'#f55a8c'},
  {name:'Stationery',icon:'📚',color:'#5af5c8'},
  {name:'Electronics',icon:'⚡',color:'#5a8cf5'},
  {name:'Entertainment',icon:'🎮',color:'#f5c85a'},
  {name:'Travel',icon:'✈️',color:'#c85af5'},
  {name:'Dress',icon:'👗',color:'#f5825a'},
];
const CUSTOM_PALETTE=['#c8f55a','#5af5f5','#f5a05a','#a05af5','#f55af5','#5af5a0','#f5d05a'];

// Default subcats — stored separately so user additions persist
const DEFAULT_SUBCATS={
  'Food':['Breakfast','Lunch','Dinner','Snacks','Beverages','Groceries'],
  'Entertainment':['Movies','OTT/Streaming','Gaming','Events/Concerts','Sports','Theatre','Music','Amusement Park'],
  'Travel':['Flight','Train','Bus','Auto/Cab','Fuel','Hotel','Toll'],
  'Electronics':['Mobile','Laptop','Accessories','Appliances','Repairs'],
  'Stationery':['Books','Pens/Pencils','Printing','Art Supplies','Office Supplies'],
  'Dress':['Clothing','Footwear','Accessories','Laundry','Tailoring'],
};

// ══ STATE ═════════════════════════════════════════════════════════
let expenses        = [];
let banktxns        = [];
let cats            = JSON.parse(localStorage.getItem(S_CATS)||'null')||DEFAULTS.map(d=>({...d}));
// subcats: object { catName: [sub1, sub2, ...] } — user can add to any category
let subcats         = JSON.parse(localStorage.getItem(S_SUBCATS)||'null') ||
                      Object.fromEntries(Object.entries(DEFAULT_SUBCATS).map(([k,v])=>[k,[...v]]));

let selectedCat     = '';
let selectedSubcat  = '';
let selectedPays    = new Set();
let selCatFilters   = new Set(['__ALL__']);
let selSubcatFilters= new Set(['__ALL__']);
let currentPeriod   = 'daily';
let periodOffset    = 0;
let pieChart        = null;
let currentView     = 'add';
let expSelCats      = new Set(['__ALL__']);
let bankTxnType     = '';
let customRangeStart= '';
let customRangeEnd  = '';

function saveCats()   { localStorage.setItem(S_CATS,JSON.stringify(cats)); }
function saveSubcats(){ localStorage.setItem(S_SUBCATS,JSON.stringify(subcats)); }
function getCatColor(n){ const c=cats.find(c=>c.name===n); return c?c.color:'#c8f55a'; }
function getCatIcon(n) { const c=cats.find(c=>c.name===n); return c?c.icon:'🏷'; }
function formatDate(iso){ const[y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; }
function getSubcats(catName){ return subcats[catName]||[]; }

// ══ AUTH ══════════════════════════════════════════════════════════
auth.onAuthStateChanged(user=>{
  if(!user){ window.location.replace('login.html'); return; }
  const saved=localStorage.getItem(S_THEME)||'light';
  document.documentElement.setAttribute('data-theme',saved);
  document.body.style.display='block';
  const n=new Date();
  ['inp-dd','inp-mm','inp-yyyy'].forEach((id,i)=>document.getElementById(id).value=[n.getDate(),n.getMonth()+1,n.getFullYear()][i]);
  ['inp-bank-dd','inp-bank-mm','inp-bank-yyyy'].forEach((id,i)=>document.getElementById(id).value=[n.getDate(),n.getMonth()+1,n.getFullYear()][i]);
  renderCatGrid();
  listenForExpenses(user.uid);
  listenForBankTxns(user.uid);
});

function listenForExpenses(uid){
  db.collection('users').doc(uid).collection('expenses').orderBy('timestamp','desc').onSnapshot(snap=>{
    expenses=snap.docs.map(doc=>({id:doc.id,...doc.data()}));
    renderRecent();
    if(currentView==='analytics') renderAnalytics();
  });
}
function listenForBankTxns(uid){
  db.collection('users').doc(uid).collection('banktxns').orderBy('timestamp','desc').onSnapshot(snap=>{
    banktxns=snap.docs.map(doc=>({id:doc.id,...doc.data()}));
    if(currentView==='analytics') renderBankSummary();
    if(currentView==='bank') renderBankView();
  });
}

function logout(){ auth.signOut(); }
function toggleTheme(){
  const cur=document.documentElement.getAttribute('data-theme');
  const next=cur==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme',next);
  localStorage.setItem(S_THEME,next);
  if(pieChart) renderAnalytics();
}
function switchView(v,btn){
  currentView=v;
  document.querySelectorAll('.view').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el=>el.classList.remove('active'));
  document.getElementById('view-'+v).classList.add('active');
  btn.classList.add('active');
  if(v==='analytics'){ renderCatFilterRow(); renderAnalytics(); }
  if(v==='bank') renderBankView();
}

// ══ CATEGORY GRID — inline + button ══════════════════════════════
function renderCatGrid(){
  const grid=document.getElementById('cat-grid');
  let html=cats.map(c=>{
    const sel=selectedCat===c.name;
    const safe=c.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    const style=sel?`style="background:${c.color}"`:'';
    return `<button class="cat-pill${sel?' selected':''}" data-cat="${c.name}" ${style} onclick="selectCat(this)">
      ${c.icon} ${c.name}
      <button class="pill-x" title="Delete" onclick="event.stopPropagation();deleteTag('${safe}')">×</button>
    </button>`;
  }).join('');
  // + button at end
  html+=`<button class="add-pill-btn" title="Add category" onclick="showAddCat()">+</button>`;
  grid.innerHTML=html;
  renderSubcatGrid();
}

function selectCat(btn){
  selectedCat=btn.dataset.cat; selectedSubcat='';
  renderCatGrid();
}

// ── Inline add category ──
function showAddCat(){
  document.getElementById('cat-add-wrap').classList.add('visible');
  document.getElementById('inp-newtag').value='';
  document.getElementById('inp-newtag').focus();
}
function cancelAddCat(){ document.getElementById('cat-add-wrap').classList.remove('visible'); }
function confirmAddCat(){
  const inp=document.getElementById('inp-newtag');
  const name=inp.value.trim();
  if(!name) return showToast('Enter a category name');
  if(cats.some(c=>c.name.toLowerCase()===name.toLowerCase())) return showToast('Already exists');
  const color=CUSTOM_PALETTE[cats.length%CUSTOM_PALETTE.length];
  cats.push({name,icon:'🏷',color});
  saveCats();
  cancelAddCat();
  selectedCat=name; selectedSubcat='';
  renderCatGrid();
  renderCatFilterRow();
  showToast(`"${name}" added`);
}
// confirm on Enter
document.getElementById('inp-newtag').addEventListener('keydown',e=>{ if(e.key==='Enter') confirmAddCat(); if(e.key==='Escape') cancelAddCat(); });

function deleteTag(name){
  if(!confirm(`Delete "${name}"?\nExpenses already saved won't be affected.`)) return;
  cats=cats.filter(c=>c.name!==name);
  delete subcats[name];
  saveCats(); saveSubcats();
  if(selectedCat===name){ selectedCat=''; selectedSubcat=''; }
  selCatFilters.delete(name);
  renderCatGrid(); renderCatFilterRow();
  if(currentView==='analytics') renderAnalytics();
  showToast(`"${name}" deleted`);
}

// ══ SUBCATEGORY GRID — inline + button ═══════════════════════════
function renderSubcatGrid(){
  const wrap=document.getElementById('subcat-wrap');
  const grid=document.getElementById('subcat-grid');
  const subs=getSubcats(selectedCat);
  if(!selectedCat){ wrap.classList.remove('open'); return; }
  wrap.classList.add('open');
  const color=getCatColor(selectedCat);
  let html=subs.map(s=>`
    <button class="subcat-pill${selectedSubcat===s?' selected':''}" data-sub="${s}"
      style="${selectedSubcat===s?`background:${color};border-color:${color}`:''}"
      onclick="selectSubcat(this)">${s}</button>`).join('');
  // + at end of subcats
  html+=`<button class="add-pill-btn" title="Add subcategory" onclick="showAddSubcat()" style="width:24px;height:24px;font-size:14px;">+</button>`;
  grid.innerHTML=html;
}

function selectSubcat(btn){
  selectedSubcat=selectedSubcat===btn.dataset.sub?'':btn.dataset.sub;
  renderSubcatGrid();
}

// ── Inline add subcategory ──
function showAddSubcat(){
  document.getElementById('subcat-add-wrap').classList.add('visible');
  document.getElementById('inp-newsubcat').value='';
  document.getElementById('inp-newsubcat').focus();
}
function cancelAddSubcat(){ document.getElementById('subcat-add-wrap').classList.remove('visible'); }
function confirmAddSubcat(){
  const inp=document.getElementById('inp-newsubcat');
  const name=inp.value.trim();
  if(!name||!selectedCat) return showToast('Select a category first');
  if(!subcats[selectedCat]) subcats[selectedCat]=[];
  if(subcats[selectedCat].includes(name)) return showToast('Already exists');
  subcats[selectedCat].push(name);
  saveSubcats();
  cancelAddSubcat();
  selectedSubcat=name;
  renderSubcatGrid();
  showToast(`"${name}" added to ${selectedCat}`);
}
document.getElementById('inp-newsubcat').addEventListener('keydown',e=>{ if(e.key==='Enter') confirmAddSubcat(); if(e.key==='Escape') cancelAddSubcat(); });

// ══ PAYMENT MODES ═════════════════════════════════════════════════
function togglePay(btn){
  const pay=btn.dataset.pay;
  if(selectedPays.has(pay)){ selectedPays.delete(pay); btn.classList.remove('selected'); }
  else{ selectedPays.add(pay); btn.classList.add('selected'); }
}

// ══ ADD EXPENSE ════════════════════════════════════════════════════
function addExpense(){
  const amount=parseFloat(document.getElementById('inp-amount').value);
  const dd=document.getElementById('inp-dd').value, mm=document.getElementById('inp-mm').value, yyyy=document.getElementById('inp-yyyy').value;
  const note=document.getElementById('inp-note').value.trim();
  const user=auth.currentUser;
  if(!amount||amount<=0) return showToast('Enter a valid amount');
  if(!dd||!mm||!yyyy)    return showToast('Enter a valid date');
  if(!selectedCat)        return showToast('Select a category');
  const date=`${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
  db.collection('users').doc(user.uid).collection('expenses').add({
    amount,date,cat:selectedCat,subcat:selectedSubcat||'',payModes:[...selectedPays],note,
    timestamp:firebase.firestore.FieldValue.serverTimestamp()
  }).then(()=>{
    showToast('Saved!');
    document.getElementById('inp-amount').value='';
    document.getElementById('inp-note').value='';
    selectedCat=''; selectedSubcat=''; selectedPays.clear();
    document.querySelectorAll('.pay-pill').forEach(p=>p.classList.remove('selected'));
    renderCatGrid();
  }).catch(()=>showToast('Save failed — check connection'));
}

function delExpense(id){
  if(!confirm('Delete this entry?')) return;
  db.collection('users').doc(auth.currentUser.uid).collection('expenses').doc(id).delete()
    .then(()=>showToast('Deleted')).catch(()=>showToast('Delete failed'));
}

// ══ RECENT LIST ════════════════════════════════════════════════════
function renderRecent(){
  const list=document.getElementById('recent-list');
  if(!expenses.length){ list.innerHTML='<div class="empty-state"><div class="empty-icon">📋</div>No expenses yet.<br>Add your first one!</div>'; return; }
  list.innerHTML=expenses.slice(0,30).map(e=>{
    const pays=(e.payModes&&e.payModes.length)?e.payModes.join(' · '):'';
    return `<div class="expense-item">
      <div class="exp-dot" style="background:${getCatColor(e.cat)}"></div>
      <div class="exp-info">
        <div class="exp-cat">${e.cat}${e.subcat?' › '+e.subcat:''}</div>
        ${e.note?`<div class="exp-note">${e.note}</div>`:''}
        <div class="exp-date">${e.date?formatDate(e.date):''}${pays?' &nbsp;·&nbsp; '+pays:''}</div>
      </div>
      <div class="exp-amount">₹${Number(e.amount).toLocaleString('en-IN')}</div>
      <button class="exp-del" onclick="delExpense('${e.id}')">×</button>
    </div>`;
  }).join('');
}

// ══ BANK VIEW ══════════════════════════════════════════════════════
function selectBankType(type){
  bankTxnType=type;
  document.getElementById('bank-btn-w').className='bank-type-btn'+(type==='withdrawal'?' selected-w':'');
  document.getElementById('bank-btn-d').className='bank-type-btn'+(type==='deposit'?' selected-d':'');
  const btn=document.getElementById('bank-submit-btn');
  btn.style.background=type==='withdrawal'?'#f55a8c':'#5af5c8';
  btn.style.color=type==='withdrawal'?'#fff':'#0c0c0f';
  btn.style.border='none';
}

function addBankTxn(){
  const amount=parseFloat(document.getElementById('inp-bank-amount').value);
  const bank=document.getElementById('inp-bank').value;
  const dd=document.getElementById('inp-bank-dd').value, mm=document.getElementById('inp-bank-mm').value, yyyy=document.getElementById('inp-bank-yyyy').value;
  const note=document.getElementById('inp-bank-note').value.trim();
  const user=auth.currentUser;
  if(!bankTxnType)       return showToast('Select Withdrawal or Deposit');
  if(!amount||amount<=0) return showToast('Enter a valid amount');
  if(!bank)              return showToast('Select a bank');
  if(!dd||!mm||!yyyy)    return showToast('Enter a valid date');
  const date=`${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
  db.collection('users').doc(user.uid).collection('banktxns').add({
    type:bankTxnType,bank,amount,date,note,
    timestamp:firebase.firestore.FieldValue.serverTimestamp()
  }).then(()=>{
    showToast(`${bankTxnType==='withdrawal'?'Withdrawal':'Deposit'} recorded!`);
    document.getElementById('inp-bank-amount').value='';
    document.getElementById('inp-bank-note').value='';
    document.getElementById('inp-bank').value='';
    bankTxnType='';
    document.getElementById('bank-btn-w').className='bank-type-btn';
    document.getElementById('bank-btn-d').className='bank-type-btn';
    const btn=document.getElementById('bank-submit-btn');
    btn.style.background='var(--surface2)'; btn.style.color='var(--text)'; btn.style.border='1px solid var(--border)';
  }).catch(()=>showToast('Save failed'));
}

function delBankTxn(id){
  if(!confirm('Delete this transaction?')) return;
  db.collection('users').doc(auth.currentUser.uid).collection('banktxns').doc(id).delete()
    .then(()=>showToast('Deleted')).catch(()=>showToast('Delete failed'));
}

function renderBankView(){
  const totalDep=banktxns.filter(t=>t.type==='deposit').reduce((s,t)=>s+t.amount,0);
  const totalWdl=banktxns.filter(t=>t.type==='withdrawal').reduce((s,t)=>s+t.amount,0);
  const net=totalDep-totalWdl;
  document.getElementById('bv-total-dep').textContent='₹'+totalDep.toLocaleString('en-IN');
  document.getElementById('bv-total-wdl').textContent='₹'+totalWdl.toLocaleString('en-IN');
  const netEl=document.getElementById('bv-net');
  netEl.textContent=(net>=0?'+':'')+  '₹'+Math.abs(net).toLocaleString('en-IN');
  netEl.style.color=net>=0?'#5af5c8':'#f55a8c';

  const list=document.getElementById('bank-txn-list-full');
  if(!banktxns.length){ list.innerHTML='<div class="empty-state"><div class="empty-icon">🏦</div>No transactions yet.</div>'; return; }
  list.innerHTML=banktxns.map(t=>{
    const isWdl=t.type==='withdrawal', color=isWdl?'#f55a8c':'#5af5c8';
    return `<div class="bank-txn-row">
      <div class="bank-txn-dot" style="background:${color}"></div>
      <div class="bank-txn-info">
        <div class="bank-txn-type">${isWdl?'⬇ Withdrawal':'⬆ Deposit'} · ${t.bank||''}</div>
        ${t.note?`<div class="bank-txn-note">${t.note}</div>`:''}
        <div class="bank-txn-date">${t.date?formatDate(t.date):''}</div>
      </div>
      <div class="bank-txn-amount" style="color:${color}">${isWdl?'-':'+'}₹${Number(t.amount).toLocaleString('en-IN')}</div>
      <button class="bank-txn-del" onclick="delBankTxn('${t.id}')">×</button>
    </div>`;
  }).join('');
}

// ══ ANALYTICS CATEGORY FILTER ════════════════════════════════════
function renderCatFilterRow(){
  const row=document.getElementById('cat-filter-row');
  const allActive=selCatFilters.has('__ALL__');
  let html=`<button class="cat-filter-pill all-pill${allActive?' active':''}" onclick="toggleCatFilter('__ALL__')">All Categories</button>`;
  html+=cats.map(c=>{
    const active=!allActive&&selCatFilters.has(c.name);
    const style=active?`style="background:${c.color}"`:'';
    return `<button class="cat-filter-pill${active?' active':''}" ${style} onclick="toggleCatFilter('${c.name.replace(/'/g,"\\'")}')">
      ${c.icon} ${c.name}
    </button>`;
  }).join('');
  row.innerHTML=html;
  renderSubcatFilterRow();
}

function renderSubcatFilterRow(){
  const row=document.getElementById('subcat-filter-row');
  const activeCatNames=selCatFilters.has('__ALL__')?cats.map(c=>c.name):[...selCatFilters];
  const availSubs=[...new Set(activeCatNames.flatMap(n=>getSubcats(n)))];
  if(!availSubs.length){ row.style.display='none'; return; }
  row.style.display='flex';
  const allActive=selSubcatFilters.has('__ALL__');
  let html=`<button class="cat-filter-pill all-pill${allActive?' active':''}" style="font-size:10px" onclick="toggleSubcatFilter('__ALL__')">All Subcategories</button>`;
  html+=availSubs.map(s=>{
    const active=!allActive&&selSubcatFilters.has(s);
    const parentCat=cats.find(c=>getSubcats(c.name).includes(s));
    const color=parentCat?parentCat.color:'var(--accent)';
    const style=active?`style="background:${color};border-color:${color};color:#fff"`:'';
    return `<button class="cat-filter-pill${active?' active':''}" ${style} style="font-size:10px" onclick="toggleSubcatFilter('${s.replace(/'/g,"\\'")}')">
      ${s}
    </button>`;
  }).join('');
  row.innerHTML=html;
}

function toggleCatFilter(name){
  if(name==='__ALL__'){ selCatFilters=new Set(['__ALL__']); }
  else{ selCatFilters.delete('__ALL__'); if(selCatFilters.has(name)) selCatFilters.delete(name); else selCatFilters.add(name); if(selCatFilters.size===0) selCatFilters=new Set(['__ALL__']); }
  selSubcatFilters=new Set(['__ALL__']); periodOffset=0;
  renderCatFilterRow(); renderAnalytics();
}

function toggleSubcatFilter(name){
  if(name==='__ALL__'){ selSubcatFilters=new Set(['__ALL__']); }
  else{ selSubcatFilters.delete('__ALL__'); if(selSubcatFilters.has(name)) selSubcatFilters.delete(name); else selSubcatFilters.add(name); if(selSubcatFilters.size===0) selSubcatFilters=new Set(['__ALL__']); }
  renderSubcatFilterRow(); renderAnalytics();
}

function getActiveCatNames(){ return selCatFilters.has('__ALL__')?cats.map(c=>c.name):[...selCatFilters]; }

// ══ ANALYTICS PERIOD ══════════════════════════════════════════════
function setPeriod(p,btn){
  currentPeriod=p; periodOffset=0;
  document.querySelectorAll('.period-tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  const pickers=['weekly-picker','monthly-picker','yearly-picker','custom-picker'];
  const dateNav=document.getElementById('date-nav-row');
  pickers.forEach(id=>{document.getElementById(id).style.display='none';});
  if(p==='weekly'){ document.getElementById('weekly-picker').style.display='flex'; dateNav.style.display='flex'; useDefaultWeek(); return; }
  if(p==='monthly'){ document.getElementById('monthly-picker').style.display='flex'; dateNav.style.display='none'; populateMonthPicker(); applyMonthPicker(); return; }
  if(p==='yearly'){ document.getElementById('yearly-picker').style.display='flex'; dateNav.style.display='none'; populateYearPicker(); applyYearPicker(); return; }
  if(p==='custom'){ document.getElementById('custom-picker').style.display='flex'; dateNav.style.display='none'; const v=parseInt(document.getElementById('inp-custom-days').value); if(v>0) applyCustomDays(); else{ document.getElementById('date-label').textContent='Enter number of days'; customRangeStart=''; customRangeEnd=''; } return; }
  dateNav.style.display='flex'; renderAnalytics();
}
function shiftPeriod(dir){ periodOffset+=dir; renderAnalytics(); }

function useDefaultWeek(){
  const now=new Date(); now.setDate(now.getDate()+periodOffset*7);
  const mon=new Date(now); mon.setDate(now.getDate()-((now.getDay()+6)%7));
  const sun=new Date(mon); sun.setDate(mon.getDate()+6);
  document.getElementById('wk-from-dd').value=mon.getDate(); document.getElementById('wk-from-mm').value=mon.getMonth()+1; document.getElementById('wk-from-yyyy').value=mon.getFullYear();
  document.getElementById('wk-to-dd').value=sun.getDate(); document.getElementById('wk-to-mm').value=sun.getMonth()+1; document.getElementById('wk-to-yyyy').value=sun.getFullYear();
  customRangeStart=mon.toISOString().slice(0,10); customRangeEnd=sun.toISOString().slice(0,10); renderAnalytics();
}
function applyWeeklyRange(){
  const fdd=document.getElementById('wk-from-dd').value,fmm=document.getElementById('wk-from-mm').value,fyy=document.getElementById('wk-from-yyyy').value;
  const tdd=document.getElementById('wk-to-dd').value,tmm=document.getElementById('wk-to-mm').value,tyy=document.getElementById('wk-to-yyyy').value;
  if(!fdd||!fmm||!fyy||!tdd||!tmm||!tyy) return showToast('Fill in both dates');
  const s=`${fyy}-${String(fmm).padStart(2,'0')}-${String(fdd).padStart(2,'0')}`;
  const e=`${tyy}-${String(tmm).padStart(2,'0')}-${String(tdd).padStart(2,'0')}`;
  if(s>e) return showToast('From date must be before To date');
  customRangeStart=s; customRangeEnd=e; renderAnalytics();
}
function populateMonthPicker(){
  const now=new Date(),yearSel=document.getElementById('sel-month-year'),monthSel=document.getElementById('sel-month');
  yearSel.innerHTML='';
  for(let y=now.getFullYear();y>=2000;y--){const o=document.createElement('option');o.value=y;o.textContent=y;yearSel.appendChild(o);}
  monthSel.value=now.getMonth(); yearSel.value=now.getFullYear();
}
function applyMonthPicker(){
  const m=parseInt(document.getElementById('sel-month').value),yr=parseInt(document.getElementById('sel-month-year').value);
  customRangeStart=new Date(yr,m,1).toISOString().slice(0,10); customRangeEnd=new Date(yr,m+1,0).toISOString().slice(0,10); renderAnalytics();
}
function populateYearPicker(){
  const now=new Date(),sel=document.getElementById('sel-year'); sel.innerHTML='';
  for(let y=now.getFullYear();y>=2000;y--){const o=document.createElement('option');o.value=y;o.textContent=y;sel.appendChild(o);}
  sel.value=now.getFullYear();
}
function applyYearPicker(){ const yr=parseInt(document.getElementById('sel-year').value); customRangeStart=`${yr}-01-01`; customRangeEnd=`${yr}-12-31`; renderAnalytics(); }
function applyCustomDays(){
  const days=parseInt(document.getElementById('inp-custom-days').value); if(!days||days<1) return;
  const end=new Date(),start=new Date(); start.setDate(end.getDate()-(days-1));
  customRangeStart=start.toISOString().slice(0,10); customRangeEnd=end.toISOString().slice(0,10); renderAnalytics();
}
function getPeriodDates(){
  const now=new Date();
  if(currentPeriod==='weekly'||currentPeriod==='monthly'||currentPeriod==='yearly'||currentPeriod==='custom'){
    const start=customRangeStart,end=customRangeEnd;
    const label=currentPeriod==='custom'?(document.getElementById('inp-custom-days').value?`Last ${document.getElementById('inp-custom-days').value} days`:'—'):((start&&end)?`${formatDate(start)} – ${formatDate(end)}`:'—');
    return{start,end,label};
  }
  const d=new Date(now); d.setDate(d.getDate()+periodOffset); const s=d.toISOString().slice(0,10);
  return{start:s,end:s,label:formatDate(s)};
}

// ══ ANALYTICS RENDER ══════════════════════════════════════════════
function renderAnalytics(){
  const{start,end,label}=getPeriodDates();
  document.getElementById('date-label').textContent=label;
  const activeCats=new Set(getActiveCatNames());
  const activeSubcats=selSubcatFilters.has('__ALL__')?null:new Set(selSubcatFilters);
  const filtered=expenses.filter(e=>e.date>=start&&e.date<=end&&activeCats.has(e.cat)&&(!activeSubcats||!e.subcat||activeSubcats.has(e.subcat)));
  const total=filtered.reduce((s,e)=>s+e.amount,0),count=filtered.length,avg=count?Math.round(total/count):0;
  document.getElementById('stat-total').textContent='₹'+total.toLocaleString('en-IN');
  document.getElementById('stat-count').textContent=count;
  document.getElementById('stat-avg').textContent='₹'+avg.toLocaleString('en-IN');
  const bycat={};
  filtered.forEach(e=>{bycat[e.cat]=(bycat[e.cat]||0)+e.amount;});
  const catList=Object.entries(bycat).sort((a,b)=>b[1]-a[1]);
  if(catList.length){document.getElementById('stat-top').textContent=catList[0][0];document.getElementById('stat-top-amt').textContent='₹'+catList[0][1].toLocaleString('en-IN');}
  else{document.getElementById('stat-top').textContent='—';document.getElementById('stat-top-amt').textContent='';}

  const isDark=document.documentElement.getAttribute('data-theme')==='dark';
  const legendClr=isDark?'#6a6a80':'#888890', brdClr=isDark?'#141418':'#ffffff';
  const labels=catList.map(c=>c[0]),data=catList.map(c=>c[1]),colors=labels.map(l=>getCatColor(l));
  if(pieChart) pieChart.destroy();
  const ctx=document.getElementById('pie-chart').getContext('2d');
  if(!data.length){ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);ctx.fillStyle=legendClr;ctx.font='14px Inter';ctx.textAlign='center';ctx.fillText('No data for this period',ctx.canvas.width/2,ctx.canvas.height/2);}
  else{pieChart=new Chart(ctx,{type:'doughnut',data:{labels,datasets:[{data,backgroundColor:colors,borderColor:brdClr,borderWidth:3,hoverOffset:8}]},options:{responsive:true,cutout:'60%',plugins:{legend:{position:'bottom',labels:{color:legendClr,font:{family:'Inter',size:11},padding:12,boxWidth:9,boxHeight:9}},tooltip:{callbacks:{label:c=>` ${c.label}: ₹${c.parsed.toLocaleString('en-IN')}`}}}}});}

  const bd=document.getElementById('breakdown-list');
  if(!catList.length){bd.innerHTML='<div class="empty-state" style="padding:16px"><div class="empty-icon">📊</div>No data yet</div>';}
  else{bd.innerHTML=catList.map(([cat,amt])=>{const color=getCatColor(cat),pct=total?Math.round((amt/total)*100):0;return`<div class="breakdown-row"><div class="bd-dot" style="background:${color}"></div><div class="bd-cat">${getCatIcon(cat)} ${cat}</div><div class="bd-bar-wrap"><div class="bd-bar" style="width:${pct}%;background:${color}"></div></div><div class="bd-amount">₹${amt.toLocaleString('en-IN')}</div><div class="bd-pct">${pct}%</div></div>`;}).join('');}

  renderTrendTable(activeCats,start);
  renderBankSummary();
}

function renderTrendTable(activeCats,curStart){
  const wrap=document.getElementById('trend-wrap'),titleEl=document.getElementById('trend-title');
  let buckets=[];
  if(currentPeriod==='daily'){for(let i=6;i>=0;i--){const d=new Date(curStart+'T00:00:00');d.setDate(d.getDate()-i);const s=d.toISOString().slice(0,10);buckets.push({label:formatDate(s),start:s,end:s});}titleEl.textContent='Last 7 Days Trend';}
  else if(currentPeriod==='weekly'){const base=new Date(curStart+'T00:00:00');for(let i=3;i>=0;i--){const mon=new Date(base);mon.setDate(base.getDate()-i*7);const sun=new Date(mon);sun.setDate(mon.getDate()+6);buckets.push({label:formatDate(mon.toISOString().slice(0,10)),start:mon.toISOString().slice(0,10),end:sun.toISOString().slice(0,10)});}titleEl.textContent='4-Week Trend';}
  else if(currentPeriod==='monthly'){const base=new Date(curStart+'T00:00:00');for(let i=5;i>=0;i--){const d=new Date(base.getFullYear(),base.getMonth()-i,1);const s=d.toISOString().slice(0,10);const e=new Date(d.getFullYear(),d.getMonth()+1,0).toISOString().slice(0,10);buckets.push({label:d.toLocaleDateString('en-IN',{month:'short',year:'2-digit'}),start:s,end:e});}titleEl.textContent='6-Month Trend';}
  else{const baseYr=parseInt((curStart||new Date().getFullYear().toString()).slice(0,4));for(let i=3;i>=0;i--){const yr=baseYr-i;buckets.push({label:String(yr),start:`${yr}-01-01`,end:`${yr}-12-31`});}titleEl.textContent='4-Year Trend';}
  const catNames=getActiveCatNames().filter(n=>activeCats.has(n)),showAll=selCatFilters.has('__ALL__');
  const rows=buckets.map(b=>{const exps=expenses.filter(e=>e.date>=b.start&&e.date<=b.end&&activeCats.has(e.cat));const total=exps.reduce((s,e)=>s+e.amount,0),cnt=exps.length,perCat={};catNames.forEach(n=>{perCat[n]=exps.filter(e=>e.cat===n).reduce((s,e)=>s+e.amount,0);});return{...b,total,cnt,perCat};});
  const maxTotal=Math.max(...rows.map(r=>r.total),1);
  let catCols=''; if(!showAll&&catNames.length>1) catCols=catNames.map(n=>`<th>${getCatIcon(n)} ${n}</th>`).join('');
  const thead=`<tr><th>Period</th>${catCols}<th style="text-align:right">Total</th><th style="text-align:right">Entries</th><th style="min-width:100px">Bar</th></tr>`;
  const tbody=rows.map(r=>{const pct=maxTotal?Math.round((r.total/maxTotal)*100):0,barColor=r.total===maxTotal?'var(--accent)':'var(--muted)';let catTds='';if(!showAll&&catNames.length>1)catTds=catNames.map(n=>`<td class="amt">${r.perCat[n]?'₹'+r.perCat[n].toLocaleString('en-IN'):'-'}</td>`).join('');return`<tr><td>${r.label}</td>${catTds}<td class="amt">₹${r.total.toLocaleString('en-IN')}</td><td class="cnt">${r.cnt}</td><td><div style="height:6px;border-radius:4px;background:var(--border);overflow:hidden"><div style="height:100%;width:${pct}%;background:${barColor};border-radius:4px;transition:width 0.4s"></div></div></td></tr>`;}).join('');
  wrap.innerHTML=`<table class="trend-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

function renderBankSummary(){
  const{start,end}=getPeriodDates();
  const periodTxns=(start&&end)?banktxns.filter(t=>t.date>=start&&t.date<=end):banktxns;
  const totalDep=periodTxns.filter(t=>t.type==='deposit').reduce((s,t)=>s+t.amount,0);
  const totalWdl=periodTxns.filter(t=>t.type==='withdrawal').reduce((s,t)=>s+t.amount,0);
  const net=totalDep-totalWdl;
  document.getElementById('bank-total-dep').textContent='₹'+totalDep.toLocaleString('en-IN');
  document.getElementById('bank-total-wdl').textContent='₹'+totalWdl.toLocaleString('en-IN');
  const netEl=document.getElementById('bank-net');
  netEl.textContent=(net>=0?'+':'')+  '₹'+Math.abs(net).toLocaleString('en-IN');
  netEl.className='bank-stat-value '+(net>0?'positive':net<0?'negative':'neutral');
  const statNet=document.getElementById('stat-net-bank');
  statNet.textContent=(net>=0?'+':'-')+'₹'+Math.abs(net).toLocaleString('en-IN');
  statNet.style.color=net>=0?'#5af5c8':'#f55a8c';
}

// ══ PDF EXPORT ════════════════════════════════════════════════════
function openExportModal(){
  const now=new Date(),firstDay=new Date(now.getFullYear(),now.getMonth(),1);
  document.getElementById('exp-from-dd').value=firstDay.getDate(); document.getElementById('exp-from-mm').value=firstDay.getMonth()+1; document.getElementById('exp-from-yyyy').value=firstDay.getFullYear();
  document.getElementById('exp-to-dd').value=now.getDate(); document.getElementById('exp-to-mm').value=now.getMonth()+1; document.getElementById('exp-to-yyyy').value=now.getFullYear();
  expSelCats=new Set(['__ALL__']); renderExpCatFilter();
  document.getElementById('export-modal').classList.add('open');
}
function closeExportModal(){ document.getElementById('export-modal').classList.remove('open'); }
document.getElementById('export-modal').addEventListener('click',function(e){if(e.target===this)closeExportModal();});
function renderExpCatFilter(){
  const wrap=document.getElementById('exp-cat-filter'),allActive=expSelCats.has('__ALL__');
  let html=`<button class="cat-filter-pill all-pill${allActive?' active':''}" onclick="toggleExpCat('__ALL__')">All</button>`;
  html+=cats.map(c=>{const active=!allActive&&expSelCats.has(c.name);const style=active?`style="background:${c.color}"`:''
    ;return`<button class="cat-filter-pill${active?' active':''}" ${style} onclick="toggleExpCat('${c.name.replace(/'/g,"\\'")}')"> ${c.icon} ${c.name} </button>`;}).join('');
  wrap.innerHTML=html;
}
function toggleExpCat(name){
  if(name==='__ALL__'){expSelCats=new Set(['__ALL__']);}
  else{expSelCats.delete('__ALL__');if(expSelCats.has(name))expSelCats.delete(name);else expSelCats.add(name);if(expSelCats.size===0)expSelCats=new Set(['__ALL__']);}
  renderExpCatFilter();
}
function parseModalDate(pfx){
  const dd=parseInt(document.getElementById(`exp-${pfx}-dd`).value,10),mm=parseInt(document.getElementById(`exp-${pfx}-mm`).value,10),yyyy=parseInt(document.getElementById(`exp-${pfx}-yyyy`).value,10);
  if(!dd||!mm||!yyyy||mm<1||mm>12||dd<1||dd>31) return null;
  return`${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
}
function fmtRs(n){return'Rs. '+Number(n).toLocaleString('en-IN');}
function safeStr(s){return String(s).replace(/[^\x20-\x7E]/g,'').trim()||'-';}
function safeNote(s,max){if(!s)return'-';const c=s.replace(/[^\x20-\x7E]/g,'').trim()||'-';return c.length>max?c.slice(0,max-3)+'...':c;}
function hexToRgb(hex){return[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];}
function drawTableHeader(doc,ML,y,PW,MR,MUTED){
  doc.setFillColor(235,235,230);doc.rect(ML,y,PW-ML-MR,7,'F');
  doc.setFontSize(7.5);doc.setFont('helvetica','bold');doc.setTextColor(...MUTED);
  doc.text('DATE',ML+2,y+5);doc.text('CATEGORY',ML+28,y+5);doc.text('SUBCAT',ML+58,y+5);doc.text('NOTE',ML+86,y+5);doc.text('AMOUNT',PW-MR-2,y+5,{align:'right'});
}
function runExportPDF(){
  const fromIso=parseModalDate('from'),toIso=parseModalDate('to');
  if(!fromIso)return showToast('Enter a valid From date');
  if(!toIso)return showToast('Enter a valid To date');
  if(fromIso>toIso)return showToast('From date must be before To date');
  const activeCats=expSelCats.has('__ALL__')?new Set(cats.map(c=>c.name)):new Set(expSelCats);
  const filtered=expenses.filter(e=>e.date>=fromIso&&e.date<=toIso&&activeCats.has(e.cat)).sort((a,b)=>a.date.localeCompare(b.date));
  if(!filtered.length){showToast('No expenses in this range');return;}
  const{jsPDF}=window.jspdf,doc=new jsPDF({unit:'mm',format:'a4'});
  const PW=210,PH=297,ML=14,MR=14,MT=18,CW=PW-ML-MR;
  const ACCENT=[80,160,0],DARK=[24,24,28],MUTED=[110,110,120],BORDER=[215,215,210],WHITE=[255,255,255];
  let y=MT;
  doc.setFillColor(...ACCENT);doc.roundedRect(ML,y,CW,18,3,3,'F');doc.setFont('helvetica','bold');doc.setFontSize(13);doc.setTextColor(...WHITE);doc.text('EXPENSE MANAGER - Expense Report',ML+6,y+11);y+=22;
  doc.setFontSize(8);doc.setFont('helvetica','normal');doc.setTextColor(...MUTED);doc.text('Period: '+formatDate(fromIso)+'  to  '+formatDate(toIso),ML,y);doc.text('Generated: '+formatDate(new Date().toISOString().slice(0,10)),PW-MR,y,{align:'right'});y+=5;doc.setDrawColor(...BORDER);doc.setLineWidth(0.3);doc.line(ML,y,PW-MR,y);y+=7;
  const total=filtered.reduce((s,e)=>s+e.amount,0),bycat={};filtered.forEach(e=>{bycat[e.cat]=(bycat[e.cat]||0)+e.amount;});const topCat=Object.entries(bycat).sort((a,b)=>b[1]-a[1])[0],avg=filtered.length?Math.round(total/filtered.length):0;
  const boxes=[{label:'TOTAL SPENT',value:fmtRs(total)},{label:'TRANSACTIONS',value:String(filtered.length)},{label:'AVG / ENTRY',value:fmtRs(avg)},{label:'TOP CATEGORY',value:topCat?safeStr(topCat[0]):'N/A'}];
  const bw=(CW-6)/4;boxes.forEach((b,i)=>{const bx=ML+i*(bw+2);doc.setFillColor(245,245,242);doc.roundedRect(bx,y,bw,17,2,2,'F');doc.setDrawColor(...BORDER);doc.setLineWidth(0.25);doc.roundedRect(bx,y,bw,17,2,2,'S');doc.setFontSize(6.5);doc.setFont('helvetica','normal');doc.setTextColor(...MUTED);doc.text(b.label,bx+bw/2,y+5.5,{align:'center'});doc.setFontSize(b.value.length>12?8:10);doc.setFont('helvetica','bold');doc.setTextColor(...DARK);doc.text(b.value,bx+bw/2,y+13,{align:'center'});});y+=23;
  if(Object.keys(bycat).length>1){doc.setFontSize(8);doc.setFont('helvetica','bold');doc.setTextColor(...DARK);doc.text('CATEGORY BREAKDOWN',ML,y);y+=4;doc.setDrawColor(...BORDER);doc.line(ML,y,PW-MR,y);y+=4;Object.entries(bycat).sort((a,b)=>b[1]-a[1]).forEach(([cat,amt])=>{const pct=total?Math.round((amt/total)*100):0,rgb=hexToRgb(getCatColor(cat));doc.setFillColor(...rgb);doc.circle(ML+2,y+1.8,1.8,'F');doc.setFontSize(8);doc.setFont('helvetica','normal');doc.setTextColor(...DARK);doc.text(safeStr(cat),ML+6,y+3.5);const barX=ML+54,barW=76,barH=3.5;doc.setFillColor(...BORDER);doc.roundedRect(barX,y+0.5,barW,barH,1,1,'F');if(pct>0){doc.setFillColor(...rgb);doc.roundedRect(barX,y+0.5,barW*(pct/100),barH,1,1,'F');}doc.setFontSize(8);doc.setFont('helvetica','bold');doc.setTextColor(...rgb);doc.text(fmtRs(amt),PW-MR-18,y+3.5,{align:'right'});doc.setTextColor(...MUTED);doc.text(pct+'%',PW-MR,y+3.5,{align:'right'});y+=8;if(y>PH-30){doc.addPage();y=MT;}});y+=3;}
  doc.setDrawColor(...BORDER);doc.line(ML,y,PW-MR,y);y+=4;drawTableHeader(doc,ML,y,PW,MR,MUTED);y+=9;
  let rowCount=0;filtered.forEach(e=>{if(y>PH-24){doc.addPage();y=MT;drawTableHeader(doc,ML,y,PW,MR,MUTED);y+=9;}if(rowCount%2===0){doc.setFillColor(250,250,248);doc.rect(ML,y-1,CW,7.5,'F');}const rgb=hexToRgb(getCatColor(e.cat));doc.setFillColor(...rgb);doc.circle(ML+2,y+2.8,1.5,'F');doc.setFontSize(8);doc.setFont('helvetica','normal');doc.setTextColor(...DARK);doc.text(e.date?formatDate(e.date):'-',ML+5,y+4.5);doc.text(safeStr(e.cat),ML+28,y+4.5);doc.text(safeStr(e.subcat||''),ML+58,y+4.5);doc.setTextColor(...MUTED);doc.text(safeNote(e.note,24),ML+86,y+4.5);doc.setFont('helvetica','bold');doc.setTextColor(...rgb);doc.text(fmtRs(e.amount),PW-MR-2,y+4.5,{align:'right'});y+=7.5;rowCount++;});
  y+=2;doc.setDrawColor(...BORDER);doc.line(ML,y,PW-MR,y);y+=6;doc.setFontSize(9.5);doc.setFont('helvetica','bold');doc.setTextColor(...DARK);doc.text('TOTAL',ML+5,y);doc.setTextColor(...ACCENT);doc.text(fmtRs(total),PW-MR-2,y,{align:'right'});
  const pageCount=doc.getNumberOfPages();for(let p=1;p<=pageCount;p++){doc.setPage(p);doc.setFontSize(7);doc.setFont('helvetica','normal');doc.setTextColor(...MUTED);doc.text('Page '+p+' of '+pageCount+' | Expense Manager',PW/2,PH-8,{align:'center'});}
  doc.save('expenses_'+fromIso+'_to_'+toIso+'.pdf');closeExportModal();showToast('PDF saved!');
}

// ══ TOAST ═════════════════════════════════════════════════════════
function showToast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200);}
