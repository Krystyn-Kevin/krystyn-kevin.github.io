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

const DEFAULTS=[
  {name:'Food',icon:'🍛',color:'#f55a8c'},
  {name:'Stationery',icon:'📚',color:'#5af5c8'},
  {name:'Electronics',icon:'⚡',color:'#5a8cf5'},
  {name:'Entertainment',icon:'🎮',color:'#f5c85a'},
  {name:'Travel',icon:'✈️',color:'#c85af5'},
  {name:'Dress',icon:'👗',color:'#f5825a'},
];
const INCOME_DEFAULTS=[
  {name:'Salary',icon:'💼',color:'#5af5c8'},
  {name:'Freelance',icon:'🖥',color:'#5a8cf5'},
  {name:'Interest',icon:'📈',color:'#f5c85a'},
  {name:'Gifts',icon:'🎁',color:'#c85af5'},
  {name:'Refund',icon:'↩',color:'#f5825a'},
  {name:'Other',icon:'🏷',color:'#c8f55a'},
];
const CUSTOM_PALETTE=['#c8f55a','#5af5f5','#f5a05a','#a05af5','#f55af5','#5af5a0','#f5d05a'];

const DEFAULT_SUBCATS={
  'Food':['Breakfast','Lunch','Dinner','Snacks','Beverages','Groceries'],
  'Entertainment':['Movies','OTT/Streaming','Gaming','Events/Concerts','Sports','Theatre','Music','Amusement Park'],
  'Travel':['Flight','Train','Bus','Auto/Cab','Fuel','Hotel','Toll'],
  'Electronics':['Mobile','Laptop','Accessories','Appliances','Repairs'],
  'Stationery':['Books','Pens/Pencils','Printing','Art Supplies','Office Supplies'],
  'Dress':['Clothing','Footwear','Accessories','Laundry','Tailoring'],
};
const DEFAULT_INCOME_SUBCATS={
  'Salary':['Monthly','Bonus','Allowance'],
  'Freelance':['Project','Consulting'],
  'Interest':['Savings','FD','Other'],
  'Gifts':['Family','Friends'],
  'Refund':['Purchase','Tax'],
  'Other':['Misc'],
};

// ══ STATE ═════════════════════════════════════════════════════════
let expenses=[], income=[];
let cats=DEFAULTS.map(d=>({...d}));
let incomeCats=INCOME_DEFAULTS.map(d=>({...d}));
let subcats=Object.fromEntries(Object.entries(DEFAULT_SUBCATS).map(([k,v])=>[k,[...v]]));
let incomeSubcats=Object.fromEntries(Object.entries(DEFAULT_INCOME_SUBCATS).map(([k,v])=>[k,[...v]]));
let stopConfigListener=null;

let entryMode='expense';
let analyticsMode='expense';
let selectedCat='', selectedSubcat='';
let selectedIncomeCat='', selectedIncomeSubcat='';
let selectedPays=new Set();
let selCatFilters=new Set(['__ALL__']);
let selSubcatFilters=new Set(['__ALL__']);
let selIncomeCatFilters=new Set(['__ALL__']);
let selIncomeSubcatFilters=new Set(['__ALL__']);
let currentPeriod='daily';
let periodOffset=0;
let pieChart=null;
let currentView='add';
let expSelCats=new Set(['__ALL__']);
let exportType='expense';
let customRangeStart='', customRangeEnd='';

function configRef(uid){ return db.collection('users').doc(uid).collection('meta').doc('config'); }

function normalizeCats(raw,fallback){
  if(!Array.isArray(raw)||!raw.length) return fallback.map(d=>({...d}));
  return raw.filter(c=>c&&typeof c.name==='string'&&c.name.trim())
    .map((c,i)=>({name:c.name.trim(),icon:(c.icon||'🏷').trim()||'🏷',color:c.color||CUSTOM_PALETTE[i%CUSTOM_PALETTE.length]}));
}
function normalizeSubcats(raw,catsList,defaults){
  const source=(raw&&typeof raw==='object')?raw:{};
  const out={};
  catsList.forEach(c=>{
    const arr=source[c.name];
    if(Array.isArray(arr)) out[c.name]=[...new Set(arr.map(v=>String(v).trim()).filter(Boolean))];
    else if(Array.isArray(defaults[c.name])) out[c.name]=[...defaults[c.name]];
    else out[c.name]=[];
  });
  return out;
}
function getLegacyConfigSeed(){
  const legacyCats=JSON.parse(localStorage.getItem(S_CATS)||'null');
  const legacySubcats=JSON.parse(localStorage.getItem(S_SUBCATS)||'null');
  const seedCats=normalizeCats(legacyCats,DEFAULTS);
  return {
    categories:seedCats,
    subcategories:normalizeSubcats(legacySubcats,seedCats,DEFAULT_SUBCATS),
    incomeCategories:INCOME_DEFAULTS.map(d=>({...d})),
    incomeSubcategories:Object.fromEntries(Object.entries(DEFAULT_INCOME_SUBCATS).map(([k,v])=>[k,[...v]])),
  };
}
function saveCats(){
  const user=auth.currentUser; if(!user) return;
  configRef(user.uid).set({categories:cats,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
}
function saveSubcats(){
  const user=auth.currentUser; if(!user) return;
  configRef(user.uid).set({subcategories:subcats,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
}
function saveIncomeCats(){
  const user=auth.currentUser; if(!user) return;
  configRef(user.uid).set({incomeCategories:incomeCats,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
}
function saveIncomeSubcats(){
  const user=auth.currentUser; if(!user) return;
  configRef(user.uid).set({incomeSubcategories:incomeSubcats,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
}

function isIncomeMode(){ return entryMode==='income'; }
function isAnalyticsIncome(){ return analyticsMode==='income'; }
function getEntryCats(){ return isIncomeMode()?incomeCats:cats; }
function getEntrySubcats(){ return isIncomeMode()?incomeSubcats:subcats; }
function getSelectedCat(){ return isIncomeMode()?selectedIncomeCat:selectedCat; }
function getSelectedSubcat(){ return isIncomeMode()?selectedIncomeSubcat:selectedSubcat; }
function setSelectedCat(v){ if(isIncomeMode()) selectedIncomeCat=v; else selectedCat=v; }
function setSelectedSubcat(v){ if(isIncomeMode()) selectedIncomeSubcat=v; else selectedSubcat=v; }
function getCatColor(n){ const c=getEntryCats().find(c=>c.name===n); return c?c.color:'#c8f55a'; }
function getCatIcon(n){ const c=getEntryCats().find(c=>c.name===n); return c?c.icon:'🏷'; }
function getAnalyticsCatColor(n){
  const list=isAnalyticsIncome()?incomeCats:cats;
  const c=list.find(c=>c.name===n); return c?c.color:'#c8f55a';
}
function getAnalyticsCatIcon(n){
  const list=isAnalyticsIncome()?incomeCats:cats;
  const c=list.find(c=>c.name===n); return c?c.icon:'🏷';
}
function getSubcatsFor(catName){ return getEntrySubcats()[catName]||[]; }
function getAnalyticsSubcats(catName){
  const map=isAnalyticsIncome()?incomeSubcats:subcats;
  return map[catName]||[];
}
function formatDate(iso){ const[y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; }
function escSingle(s){ return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

// ══ AUTH ══════════════════════════════════════════════════════════
auth.onAuthStateChanged(user=>{
  if(!user){ window.location.replace('login.html'); return; }
  const saved=localStorage.getItem(S_THEME)||'light';
  document.documentElement.setAttribute('data-theme',saved);
  document.body.style.display='block';
  const n=new Date();
  ['inp-dd','inp-mm','inp-yyyy'].forEach((id,i)=>document.getElementById(id).value=[n.getDate(),n.getMonth()+1,n.getFullYear()][i]);
  renderCatGrid();
  if(stopConfigListener) stopConfigListener();
  stopConfigListener=listenForConfig(user.uid);
  listenForExpenses(user.uid);
  listenForIncome(user.uid);
});

function listenForConfig(uid){
  return configRef(uid).onSnapshot(snap=>{
    if(!snap.exists){
      const seed=getLegacyConfigSeed();
      configRef(uid).set({...seed,createdAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
      return;
    }
    const d=snap.data()||{};
    cats=normalizeCats(d.categories,DEFAULTS);
    subcats=normalizeSubcats(d.subcategories,cats,DEFAULT_SUBCATS);
    incomeCats=normalizeCats(d.incomeCategories,INCOME_DEFAULTS);
    incomeSubcats=normalizeSubcats(d.incomeSubcategories,incomeCats,DEFAULT_INCOME_SUBCATS);
    renderCatGrid();
    if(currentView==='analytics'){ renderCatFilterRow(); renderAnalytics(); }
  });
}

function listenForExpenses(uid){
  db.collection('users').doc(uid).collection('expenses').orderBy('timestamp','desc').onSnapshot(snap=>{
    expenses=snap.docs.map(doc=>({id:doc.id,type:'expense',...doc.data()}));
    renderRecent();
    if(currentView==='analytics') renderAnalytics();
  });
}
function listenForIncome(uid){
  db.collection('users').doc(uid).collection('income').orderBy('timestamp','desc').onSnapshot(snap=>{
    income=snap.docs.map(doc=>({id:doc.id,type:'income',...doc.data()}));
    renderRecent();
    if(currentView==='analytics') renderAnalytics();
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
  document.querySelectorAll('.nav-btn').forEach(el=>{ if(!el.closest('.nav-dropdown-wrap')) el.classList.remove('active'); });
  document.getElementById('view-'+v).classList.add('active');
  if(btn) btn.classList.add('active');
  closeAnalyticsMenu();
}

function toggleAnalyticsMenu(e){
  e.stopPropagation();
  document.getElementById('analytics-menu').classList.toggle('open');
}
function closeAnalyticsMenu(){
  const m=document.getElementById('analytics-menu');
  if(m) m.classList.remove('open');
}
document.addEventListener('click',()=>closeAnalyticsMenu());

function openAnalytics(mode,e){
  e.stopPropagation();
  analyticsMode=mode;
  closeAnalyticsMenu();
  currentView='analytics';
  document.querySelectorAll('.view').forEach(el=>el.classList.remove('active'));
  document.getElementById('view-analytics').classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(el=>{ if(!el.closest('.nav-dropdown-wrap')) el.classList.remove('active'); });
  document.getElementById('analytics-nav-btn').classList.add('active');
  selCatFilters=new Set(['__ALL__']);
  selSubcatFilters=new Set(['__ALL__']);
  selIncomeCatFilters=new Set(['__ALL__']);
  selIncomeSubcatFilters=new Set(['__ALL__']);
  document.getElementById('analytics-title').textContent=mode==='income'?'Income Analytics':'Expense Analytics';
  populateMonthPicker();
  populateYearPicker();
  renderCatFilterRow();
  renderAnalytics();
}

// ══ ENTRY MODE ════════════════════════════════════════════════════
function setEntryMode(mode){
  entryMode=mode;
  document.getElementById('btn-entry-expense').classList.toggle('active',mode==='expense');
  document.getElementById('btn-entry-income').classList.toggle('active',mode==='income');
  document.getElementById('entry-form-title').textContent=mode==='income'?'New Income':'New Expense';
  document.getElementById('submit-entry-btn').textContent=mode==='income'?'Add Income':'Add Expense';
  document.getElementById('submit-entry-btn').classList.toggle('income-submit',mode==='income');
  document.getElementById('pay-group').style.display=mode==='expense'?'block':'none';
  cancelAddCat(); cancelAddSubcat();
  renderCatGrid();
}

// ══ CATEGORY GRID ════════════════════════════════════════════════
function renderCatGrid(){
  const grid=document.getElementById('cat-grid');
  const list=getEntryCats();
  const sel=getSelectedCat();
  let html=list.map(c=>{
    const safe=c.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    const style=sel===c.name?`style="background:${c.color}"`:'';
    return `<button class="cat-pill${sel===c.name?' selected':''}" data-cat="${c.name}" ${style} onclick="selectCat(this)">
      ${c.icon} ${c.name}
      <button class="pill-x" title="Delete" onclick="event.stopPropagation();deleteTag('${safe}')">×</button>
    </button>`;
  }).join('');
  html+=`<button class="add-pill-btn" title="Add category" onclick="showAddCat()">+</button>`;
  grid.innerHTML=html;
  renderSubcatGrid();
}

function selectCat(btn){
  setSelectedCat(btn.dataset.cat);
  setSelectedSubcat('');
  renderCatGrid();
}

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
  const list=getEntryCats();
  if(list.some(c=>c.name.toLowerCase()===name.toLowerCase())) return showToast('Already exists');
  const color=CUSTOM_PALETTE[list.length%CUSTOM_PALETTE.length];
  const item={name,icon:'🏷',color};
  if(isIncomeMode()){
    incomeCats.push(item);
    if(!incomeSubcats[name]) incomeSubcats[name]=[];
    saveIncomeCats(); saveIncomeSubcats();
    selectedIncomeCat=name; selectedIncomeSubcat='';
  }else{
    cats.push(item);
    if(!subcats[name]) subcats[name]=[];
    saveCats(); saveSubcats();
    selectedCat=name; selectedSubcat='';
  }
  cancelAddCat();
  renderCatGrid();
  if(currentView==='analytics') renderCatFilterRow();
  showToast(`"${name}" added`);
}
document.getElementById('inp-newtag').addEventListener('keydown',e=>{
  if(e.key==='Enter') confirmAddCat();
  if(e.key==='Escape') cancelAddCat();
});

function deleteTag(name){
  if(!confirm(`Delete "${name}"?\nSaved entries won't be affected.`)) return;
  if(isIncomeMode()){
    incomeCats=incomeCats.filter(c=>c.name!==name);
    delete incomeSubcats[name];
    saveIncomeCats(); saveIncomeSubcats();
    if(selectedIncomeCat===name){ selectedIncomeCat=''; selectedIncomeSubcat=''; }
    selIncomeCatFilters.delete(name);
  }else{
    cats=cats.filter(c=>c.name!==name);
    delete subcats[name];
    saveCats(); saveSubcats();
    if(selectedCat===name){ selectedCat=''; selectedSubcat=''; }
    selCatFilters.delete(name);
  }
  renderCatGrid();
  if(currentView==='analytics'){ renderCatFilterRow(); renderAnalytics(); }
  showToast(`"${name}" deleted`);
}

function renderSubcatGrid(){
  const wrap=document.getElementById('subcat-wrap');
  const grid=document.getElementById('subcat-grid');
  const cat=getSelectedCat();
  const subs=getSubcatsFor(cat);
  if(!cat){ wrap.classList.remove('open'); return; }
  wrap.classList.add('open');
  const color=getCatColor(cat);
  const sel=getSelectedSubcat();
  let html=subs.map(s=>`
    <button class="subcat-pill${sel===s?' selected':''}" data-sub="${s}"
      style="${sel===s?`background:${color};border-color:${color}`:''}"
      onclick="selectSubcat(this)">${s}</button>`).join('');
  html+=`<button class="add-pill-btn" title="Add subcategory" onclick="showAddSubcat()" style="width:24px;height:24px;font-size:14px;">+</button>`;
  grid.innerHTML=html;
}

function selectSubcat(btn){
  const cur=getSelectedSubcat();
  setSelectedSubcat(cur===btn.dataset.sub?'':btn.dataset.sub);
  renderSubcatGrid();
}

function showAddSubcat(){
  document.getElementById('subcat-add-wrap').classList.add('visible');
  document.getElementById('inp-newsubcat').value='';
  document.getElementById('inp-newsubcat').focus();
}
function cancelAddSubcat(){ document.getElementById('subcat-add-wrap').classList.remove('visible'); }

function confirmAddSubcat(){
  const inp=document.getElementById('inp-newsubcat');
  const name=inp.value.trim();
  const cat=getSelectedCat();
  if(!name||!cat) return showToast('Select a category first');
  const map=getEntrySubcats();
  if(!map[cat]) map[cat]=[];
  if(map[cat].includes(name)) return showToast('Already exists');
  map[cat].push(name);
  if(isIncomeMode()) saveIncomeSubcats(); else saveSubcats();
  cancelAddSubcat();
  setSelectedSubcat(name);
  renderSubcatGrid();
  showToast(`"${name}" added to ${cat}`);
}
document.getElementById('inp-newsubcat').addEventListener('keydown',e=>{
  if(e.key==='Enter') confirmAddSubcat();
  if(e.key==='Escape') cancelAddSubcat();
});

function togglePay(btn){
  const pay=btn.dataset.pay;
  if(selectedPays.has(pay)){ selectedPays.delete(pay); btn.classList.remove('selected'); }
  else{ selectedPays.add(pay); btn.classList.add('selected'); }
}

// ══ ADD ENTRY ═════════════════════════════════════════════════════
function addEntry(){
  if(isIncomeMode()) addIncome(); else addExpense();
}

function addExpense(){
  const amount=parseFloat(document.getElementById('inp-amount').value);
  const dd=document.getElementById('inp-dd').value, mm=document.getElementById('inp-mm').value, yyyy=document.getElementById('inp-yyyy').value;
  const note=document.getElementById('inp-note').value.trim();
  const user=auth.currentUser;
  if(!amount||amount<=0) return showToast('Enter a valid amount');
  if(!dd||!mm||!yyyy) return showToast('Enter a valid date');
  if(!selectedCat) return showToast('Select a category');
  const date=`${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
  db.collection('users').doc(user.uid).collection('expenses').add({
    amount,date,cat:selectedCat,subcat:selectedSubcat||'',payModes:[...selectedPays],note,
    timestamp:firebase.firestore.FieldValue.serverTimestamp()
  }).then(()=>{
    showToast('Expense saved!');
    clearEntryForm();
  }).catch(()=>showToast('Save failed — check connection'));
}

function addIncome(){
  const amount=parseFloat(document.getElementById('inp-amount').value);
  const dd=document.getElementById('inp-dd').value, mm=document.getElementById('inp-mm').value, yyyy=document.getElementById('inp-yyyy').value;
  const note=document.getElementById('inp-note').value.trim();
  const user=auth.currentUser;
  if(!amount||amount<=0) return showToast('Enter a valid amount');
  if(!dd||!mm||!yyyy) return showToast('Enter a valid date');
  if(!selectedIncomeCat) return showToast('Select a category');
  const date=`${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
  db.collection('users').doc(user.uid).collection('income').add({
    amount,date,cat:selectedIncomeCat,subcat:selectedIncomeSubcat||'',note,
    timestamp:firebase.firestore.FieldValue.serverTimestamp()
  }).then(()=>{
    showToast('Income saved!');
    clearEntryForm();
  }).catch(()=>showToast('Save failed — check connection'));
}

function clearEntryForm(){
  document.getElementById('inp-amount').value='';
  document.getElementById('inp-note').value='';
  selectedCat=''; selectedSubcat='';
  selectedIncomeCat=''; selectedIncomeSubcat='';
  selectedPays.clear();
  document.querySelectorAll('.pay-pill').forEach(p=>p.classList.remove('selected'));
  renderCatGrid();
}

function delExpense(id){
  if(!confirm('Delete this expense?')) return;
  db.collection('users').doc(auth.currentUser.uid).collection('expenses').doc(id).delete()
    .then(()=>showToast('Deleted')).catch(()=>showToast('Delete failed'));
}
function delIncome(id){
  if(!confirm('Delete this income entry?')) return;
  db.collection('users').doc(auth.currentUser.uid).collection('income').doc(id).delete()
    .then(()=>showToast('Deleted')).catch(()=>showToast('Delete failed'));
}

// ══ RECENT LIST ════════════════════════════════════════════════════
function renderRecent(){
  const list=document.getElementById('recent-list');
  const combined=[...expenses,...income].sort((a,b)=>{
    const ta=a.timestamp?.seconds||0, tb=b.timestamp?.seconds||0;
    return tb-ta;
  });
  if(!combined.length){
    list.innerHTML='<div class="empty-state"><div class="empty-icon">📋</div>No entries yet.<br>Add your first one!</div>';
    return;
  }
  list.innerHTML=combined.slice(0,30).map(e=>{
    const isInc=e.type==='income';
    const color=isInc?getAnalyticsCatColor(e.cat):getCatColor(e.cat);
    const pays=(!isInc&&e.payModes&&e.payModes.length)?e.payModes.join(' · '):'';
    const amtClass=isInc?'exp-amount income-amt':'exp-amount';
    const badge=isInc?'<span class="entry-badge income">Income</span>':'<span class="entry-badge expense">Expense</span>';
    const delFn=isInc?`delIncome('${e.id}')`:`delExpense('${e.id}')`;
    return `<div class="expense-item">
      <div class="exp-dot" style="background:${color}"></div>
      <div class="exp-info">
        <div class="exp-cat">${badge} ${e.cat}${e.subcat?' › '+e.subcat:''}</div>
        ${e.note?`<div class="exp-note">${e.note}</div>`:''}
        <div class="exp-date">${e.date?formatDate(e.date):''}${pays?' · '+pays:''}</div>
      </div>
      <div class="${amtClass}">${isInc?'+':''}₹${Number(e.amount).toLocaleString('en-IN')}</div>
      <button class="exp-del" onclick="${delFn}">×</button>
    </div>`;
  }).join('');
}

// ══ ANALYTICS ═════════════════════════════════════════════════════
function getAnalyticsCats(){ return isAnalyticsIncome()?incomeCats:cats; }
function getAnalyticsSubcatMap(){ return isAnalyticsIncome()?incomeSubcats:subcats; }
function getAnalyticsEntries(){ return isAnalyticsIncome()?income:expenses; }
function getSelCatFilters(){ return isAnalyticsIncome()?selIncomeCatFilters:selCatFilters; }
function getSelSubcatFilters(){ return isAnalyticsIncome()?selIncomeSubcatFilters:selSubcatFilters; }
function setSelCatFilters(s){ if(isAnalyticsIncome()) selIncomeCatFilters=s; else selCatFilters=s; }
function setSelSubcatFilters(s){ if(isAnalyticsIncome()) selIncomeSubcatFilters=s; else selSubcatFilters=s; }

function toIsoDate(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function parseIsoDate(iso){
  const[y,m,d]=iso.split('-').map(Number);
  return new Date(y,m-1,d);
}
function readDateFields(ddId,mmId,yyyyId){
  const dd=document.getElementById(ddId)?.value, mm=document.getElementById(mmId)?.value, yyyy=document.getElementById(yyyyId)?.value;
  if(!dd||!mm||!yyyy) return null;
  return `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
}
function setDateFields(ddId,mmId,yyyyId,iso){
  const[y,m,d]=iso.split('-').map(Number);
  document.getElementById(ddId).value=d;
  document.getElementById(mmId).value=m;
  document.getElementById(yyyyId).value=y;
}

function getActiveCatNames(){
  const filters=getSelCatFilters();
  const all=getAnalyticsCats().map(c=>c.name);
  if(filters.has('__ALL__')||!filters.size) return all;
  return all.filter(n=>filters.has(n));
}

function renderCatFilterRow(){
  const row=document.getElementById('cat-filter-row');
  const list=getAnalyticsCats();
  const filters=getSelCatFilters();
  const allActive=filters.has('__ALL__');
  let html=`<button class="cat-filter-pill all-pill${allActive?' active':''}" onclick="toggleCatFilter('__ALL__')">All</button>`;
  html+=list.map(c=>{
    const on=!allActive&&filters.has(c.name);
    const safe=escSingle(c.name);
    return `<button class="cat-filter-pill${on?' active':''}" style="${on?`background:${c.color}`:''}" onclick="toggleCatFilter('${safe}')">${c.icon} ${c.name}</button>`;
  }).join('');
  row.innerHTML=html;
  renderSubcatFilterRow();
}

function renderSubcatFilterRow(){
  const row=document.getElementById('subcat-filter-row');
  const filters=getSelCatFilters();
  if(filters.has('__ALL__')){
    row.style.display='none';
    row.innerHTML='';
    return;
  }
  const subFilters=getSelSubcatFilters();
  const allSubActive=subFilters.has('__ALL__');
  const activeCats=getActiveCatNames();
  const map=getAnalyticsSubcatMap();
  const subs=[...new Set(activeCats.flatMap(c=>map[c]||[]))];
  if(!subs.length){ row.style.display='none'; row.innerHTML=''; return; }
  row.style.display='flex';
  let html=`<button class="cat-filter-pill all-pill${allSubActive?' active':''}" onclick="toggleSubcatFilter('__ALL__')">All Sub</button>`;
  html+=subs.map(s=>{
    const on=!allSubActive&&subFilters.has(s);
    return `<button class="cat-filter-pill${on?' active':''}" onclick="toggleSubcatFilter('${escSingle(s)}')">${s}</button>`;
  }).join('');
  row.innerHTML=html;
}

function toggleCatFilter(name){
  const filters=new Set(getSelCatFilters());
  if(name==='__ALL__'){
    setSelCatFilters(new Set(['__ALL__']));
    setSelSubcatFilters(new Set(['__ALL__']));
  }else{
    filters.delete('__ALL__');
    if(filters.has(name)) filters.delete(name);
    else filters.add(name);
    if(!filters.size) filters.add('__ALL__');
    setSelCatFilters(filters);
    setSelSubcatFilters(new Set(['__ALL__']));
  }
  renderCatFilterRow();
  renderAnalytics();
}

function toggleSubcatFilter(name){
  const filters=new Set(getSelSubcatFilters());
  if(name==='__ALL__'){
    setSelSubcatFilters(new Set(['__ALL__']));
  }else{
    filters.delete('__ALL__');
    if(filters.has(name)) filters.delete(name);
    else filters.add(name);
    if(!filters.size) filters.add('__ALL__');
    setSelSubcatFilters(filters);
  }
  renderSubcatFilterRow();
  renderAnalytics();
}

function filterEntriesByPeriod(entries,start,end){
  const s=toIsoDate(start), e=toIsoDate(end);
  return entries.filter(x=>x.date&&x.date>=s&&x.date<=e);
}

function filterEntries(entries){
  const{start,end}=getPeriodDates();
  let list=filterEntriesByPeriod(entries,start,end);
  const catFilters=getSelCatFilters();
  if(!catFilters.has('__ALL__')){
    const active=getActiveCatNames();
    list=list.filter(x=>active.includes(x.cat));
  }
  const subFilters=getSelSubcatFilters();
  if(!subFilters.has('__ALL__')){
    list=list.filter(x=>x.subcat&&subFilters.has(x.subcat));
  }
  return list;
}

function getPeriodDates(){
  const now=new Date();
  let start,end,label;
  if(currentPeriod==='daily'){
    const d=new Date(now);
    d.setDate(d.getDate()+periodOffset);
    start=new Date(d.getFullYear(),d.getMonth(),d.getDate());
    end=new Date(start);
    label=formatDate(toIsoDate(start));
  }else if(currentPeriod==='weekly'){
    if(customRangeStart&&customRangeEnd){
      start=parseIsoDate(customRangeStart);
      end=parseIsoDate(customRangeEnd);
      label=`${formatDate(customRangeStart)} – ${formatDate(customRangeEnd)}`;
    }else{
      const d=new Date(now);
      d.setDate(d.getDate()+periodOffset*7);
      const day=d.getDay();
      const diff=day===0?-6:1-day;
      start=new Date(d.getFullYear(),d.getMonth(),d.getDate()+diff);
      end=new Date(start);
      end.setDate(start.getDate()+6);
      label=`${formatDate(toIsoDate(start))} – ${formatDate(toIsoDate(end))}`;
    }
  }else if(currentPeriod==='monthly'){
    const mEl=document.getElementById('sel-month');
    const yEl=document.getElementById('sel-month-year');
    let m=parseInt(mEl?.value??now.getMonth(),10);
    let y=parseInt(yEl?.value??now.getFullYear(),10);
    m+=periodOffset;
    while(m<0){m+=12;y--;}
    while(m>11){m-=12;y++;}
    if(mEl) mEl.value=((m%12)+12)%12;
    if(yEl) yEl.value=y;
    start=new Date(y,m,1);
    end=new Date(y,m+1,0);
    label=start.toLocaleString('en-IN',{month:'long',year:'numeric'});
  }else if(currentPeriod==='yearly'){
    const yEl=document.getElementById('sel-year');
    let y=parseInt(yEl?.value??now.getFullYear(),10)+periodOffset;
    if(yEl) yEl.value=y;
    start=new Date(y,0,1);
    end=new Date(y,11,31);
    label=String(y);
  }else{
    const days=Math.max(1,parseInt(document.getElementById('inp-custom-days')?.value,10)||30);
    end=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    start=new Date(end);
    start.setDate(end.getDate()-days+1);
    label=`Last ${days} days`;
  }
  return{start,end,label};
}

function setPeriod(period,btn){
  currentPeriod=period;
  periodOffset=0;
  if(period!=='weekly'){ customRangeStart=''; customRangeEnd=''; }
  document.querySelectorAll('.period-tab').forEach(t=>t.classList.remove('active'));
  if(btn) btn.classList.add('active');
  document.getElementById('weekly-picker').style.display=period==='weekly'?'flex':'none';
  document.getElementById('monthly-picker').style.display=period==='monthly'?'flex':'none';
  document.getElementById('yearly-picker').style.display=period==='yearly'?'flex':'none';
  document.getElementById('custom-picker').style.display=period==='custom'?'flex':'none';
  const showNav=period==='daily'||(period==='weekly'&&!customRangeStart);
  document.getElementById('date-nav-row').style.display=showNav?'flex':'none';
  if(period==='monthly') populateMonthPicker();
  if(period==='yearly') populateYearPicker();
  if(period==='weekly') useDefaultWeek();
  else renderAnalytics();
}

function shiftPeriod(dir){
  periodOffset+=dir;
  renderAnalytics();
}

function useDefaultWeek(){
  customRangeStart='';
  customRangeEnd='';
  periodOffset=0;
  const now=new Date();
  const day=now.getDay();
  const diff=day===0?-6:1-day;
  const start=new Date(now.getFullYear(),now.getMonth(),now.getDate()+diff);
  const end=new Date(start);
  end.setDate(start.getDate()+6);
  setDateFields('wk-from-dd','wk-from-mm','wk-from-yyyy',toIsoDate(start));
  setDateFields('wk-to-dd','wk-to-mm','wk-to-yyyy',toIsoDate(end));
  document.getElementById('date-nav-row').style.display='flex';
  renderAnalytics();
}

function applyWeeklyRange(){
  const start=readDateFields('wk-from-dd','wk-from-mm','wk-from-yyyy');
  const end=readDateFields('wk-to-dd','wk-to-mm','wk-to-yyyy');
  if(!start||!end) return showToast('Enter valid From and To dates');
  if(start>end) return showToast('From date must be before To date');
  customRangeStart=start;
  customRangeEnd=end;
  periodOffset=0;
  document.getElementById('date-nav-row').style.display='none';
  renderAnalytics();
}

function populateMonthPicker(){
  const ySel=document.getElementById('sel-month-year');
  if(!ySel) return;
  const now=new Date();
  const cur=ySel.value||now.getFullYear();
  let html='';
  for(let y=now.getFullYear()-5;y<=now.getFullYear()+1;y++) html+=`<option value="${y}"${y==cur?' selected':''}>${y}</option>`;
  ySel.innerHTML=html;
  document.getElementById('sel-month').value=now.getMonth();
}

function applyMonthPicker(){
  periodOffset=0;
  renderAnalytics();
}

function populateYearPicker(){
  const ySel=document.getElementById('sel-year');
  if(!ySel) return;
  const now=new Date();
  const cur=ySel.value||now.getFullYear();
  let html='';
  for(let y=now.getFullYear()-5;y<=now.getFullYear()+1;y++) html+=`<option value="${y}"${y==cur?' selected':''}>${y}</option>`;
  ySel.innerHTML=html;
}

function applyYearPicker(){
  periodOffset=0;
  renderAnalytics();
}

function applyCustomDays(){
  periodOffset=0;
  if(currentPeriod==='custom') renderAnalytics();
}

function renderNetSummary(){
  const{start,end}=getPeriodDates();
  const expList=filterEntriesByPeriod(expenses,start,end);
  const incList=filterEntriesByPeriod(income,start,end);
  const totalExp=expList.reduce((s,e)=>s+Number(e.amount||0),0);
  const totalInc=incList.reduce((s,e)=>s+Number(e.amount||0),0);
  const net=totalInc-totalExp;
  document.getElementById('net-total-income').textContent='₹'+totalInc.toLocaleString('en-IN');
  document.getElementById('net-total-expense').textContent='₹'+totalExp.toLocaleString('en-IN');
  const balEl=document.getElementById('net-balance');
  const sign=net>=0?'+':'-';
  balEl.textContent=sign+'₹'+Math.abs(net).toLocaleString('en-IN');
  balEl.className='net-stat-value '+(net>0?'positive':net<0?'negative':'neutral');
}

function renderAnalytics(){
  const{start,end,label}=getPeriodDates();
  document.getElementById('date-label').textContent=label;
  renderNetSummary();

  const entries=filterEntries(getAnalyticsEntries());
  const total=entries.reduce((s,e)=>s+Number(e.amount||0),0);
  const count=entries.length;
  const avg=count?total/count:0;

  const isInc=isAnalyticsIncome();
  document.getElementById('stat-total-label').textContent=isInc?'Total Earned':'Total Spent';
  document.getElementById('pie-chart-title').textContent=isInc?'Income Share':'Category Share';
  document.getElementById('trend-title').textContent=isInc?'Income Trend':'Spending Trend';
  document.getElementById('stat-total').textContent='₹'+total.toLocaleString('en-IN',{maximumFractionDigits:0});
  document.getElementById('stat-count').textContent=String(count);
  document.getElementById('stat-avg').textContent='₹'+avg.toLocaleString('en-IN',{maximumFractionDigits:0});

  const byCat={};
  entries.forEach(e=>{
    if(!byCat[e.cat]) byCat[e.cat]=0;
    byCat[e.cat]+=Number(e.amount||0);
  });
  const sorted=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  if(sorted.length){
    document.getElementById('stat-top').textContent=sorted[0][0];
    document.getElementById('stat-top-amt').textContent='₹'+sorted[0][1].toLocaleString('en-IN');
  }else{
    document.getElementById('stat-top').textContent='—';
    document.getElementById('stat-top-amt').textContent='';
  }

  const labels=sorted.map(([n])=>n);
  const data=sorted.map(([,v])=>v);
  const colors=labels.map(n=>getAnalyticsCatColor(n));
  const ctx=document.getElementById('pie-chart');
  const textColor=getComputedStyle(document.documentElement).getPropertyValue('--text').trim()||'#e8e8f0';
  const borderColor=getComputedStyle(document.documentElement).getPropertyValue('--chart-border').trim()||'#141418';
  if(pieChart) pieChart.destroy();
  if(labels.length){
    pieChart=new Chart(ctx,{
      type:'doughnut',
      data:{labels,datasets:[{data,backgroundColor:colors,borderColor,borderWidth:2}]},
      options:{
        plugins:{legend:{labels:{color:textColor,font:{family:'Inter'}}}},
        cutout:'58%'
      }
    });
  }else{
    const c2=ctx.getContext('2d');
    c2.clearRect(0,0,ctx.width,ctx.height);
  }

  const breakdown=document.getElementById('breakdown-list');
  if(!sorted.length){
    breakdown.innerHTML='<div class="empty-state" style="padding:20px">No data for this period</div>';
  }else{
    breakdown.innerHTML=sorted.map(([name,amt])=>{
      const pct=total?(amt/total*100):0;
      const color=getAnalyticsCatColor(name);
      return `<div class="breakdown-row">
        <div class="bd-dot" style="background:${color}"></div>
        <div class="bd-cat">${getAnalyticsCatIcon(name)} ${name}</div>
        <div class="bd-bar-wrap"><div class="bd-bar" style="width:${pct}%;background:${color}"></div></div>
        <div class="bd-amount">₹${amt.toLocaleString('en-IN')}</div>
        <div class="bd-pct">${pct.toFixed(0)}%</div>
      </div>`;
    }).join('');
  }
  renderTrendTable(entries,start,end);
}

function renderTrendTable(entries,start,end){
  const wrap=document.getElementById('trend-wrap');
  const buckets={};
  const addBucket=(key,label)=>{
    if(!buckets[key]) buckets[key]={label,amt:0,cnt:0};
  };
  entries.forEach(e=>{
    let key,label;
    if(currentPeriod==='yearly'){
      key=e.date.slice(0,7);
      const[y,m]=key.split('-');
      label=new Date(+y,+m-1,1).toLocaleString('en-IN',{month:'short',year:'numeric'});
    }else{
      key=e.date;
      label=formatDate(e.date);
    }
    addBucket(key,label);
    buckets[key].label=label;
    buckets[key].amt+=Number(e.amount||0);
    buckets[key].cnt++;
  });
  const rows=Object.entries(buckets).sort((a,b)=>a[0].localeCompare(b[0]));
  if(!rows.length){
    wrap.innerHTML='<div class="empty-state" style="padding:16px">No entries in this period</div>';
    return;
  }
  wrap.innerHTML=`<table class="trend-table"><thead><tr><th>Period</th><th style="text-align:right">Amount</th><th style="text-align:right">Count</th></tr></thead><tbody>
    ${rows.map(([,b])=>`<tr><td>${b.label}</td><td class="amt">₹${b.amt.toLocaleString('en-IN')}</td><td class="cnt">${b.cnt}</td></tr>`).join('')}
  </tbody></table>`;
}

// ══ PDF EXPORT ════════════════════════════════════════════════════
function openExportModal(){
  const now=new Date();
  const start=new Date(now.getFullYear(),now.getMonth(),1);
  setDateFields('exp-from-dd','exp-from-mm','exp-from-yyyy',toIsoDate(start));
  setDateFields('exp-to-dd','exp-to-mm','exp-to-yyyy',toIsoDate(now));
  expSelCats=new Set(['__ALL__']);
  setExportType(exportType||'expense');
  renderExpCatFilter();
  document.getElementById('export-modal').classList.add('open');
}

function closeExportModal(){
  document.getElementById('export-modal').classList.remove('open');
}

function setExportType(type){
  exportType=type;
  document.getElementById('export-type-expense').classList.toggle('active',type==='expense');
  document.getElementById('export-type-income').classList.toggle('active',type==='income');
  expSelCats=new Set(['__ALL__']);
  renderExpCatFilter();
}

function renderExpCatFilter(){
  const wrap=document.getElementById('exp-cat-filter');
  const list=exportType==='income'?incomeCats:cats;
  const allOn=expSelCats.has('__ALL__');
  let html=`<button type="button" class="cat-filter-pill all-pill${allOn?' active':''}" onclick="toggleExpCat('__ALL__')">All</button>`;
  html+=list.map(c=>{
    const on=!allOn&&expSelCats.has(c.name);
    return `<button type="button" class="cat-filter-pill${on?' active':''}" style="${on?`background:${c.color}`:''}" onclick="toggleExpCat('${escSingle(c.name)}')">${c.icon} ${c.name}</button>`;
  }).join('');
  wrap.innerHTML=html;
}

function toggleExpCat(name){
  if(name==='__ALL__') expSelCats=new Set(['__ALL__']);
  else{
    expSelCats.delete('__ALL__');
    if(expSelCats.has(name)) expSelCats.delete(name);
    else expSelCats.add(name);
    if(!expSelCats.size) expSelCats.add('__ALL__');
  }
  renderExpCatFilter();
}

function parseModalDate(ddId,mmId,yyyyId){
  return readDateFields(ddId,mmId,yyyyId);
}

function fmtRs(n){ return '₹'+Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:0,maximumFractionDigits:2}); }
function safeStr(s){ return String(s||'').replace(/[^\x20-\x7E]/g,'').slice(0,80); }
function safeNote(s){ return safeStr(s).slice(0,60); }

function hexToRgb(hex){
  const h=(hex||'#c8f55a').replace('#','');
  const n=parseInt(h.length===3?h.split('').map(c=>c+c).join(''):h,16);
  return{r:(n>>16)&255,g:(n>>8)&255,b:n&255};
}

function getExportCatColor(name){
  const list=exportType==='income'?incomeCats:cats;
  const c=list.find(x=>x.name===name);
  return c?c.color:'#c8f55a';
}

function drawTableHeader(doc,y,title,from,to){
  doc.setFillColor(20,20,24);
  doc.rect(0,0,doc.internal.pageSize.getWidth(),52,'F');
  doc.setTextColor(200,245,90);
  doc.setFont('helvetica','bold');
  doc.setFontSize(16);
  doc.text(title,40,28);
  doc.setFont('helvetica','normal');
  doc.setFontSize(10);
  doc.setTextColor(180,180,190);
  doc.text(`${formatDate(from)}  →  ${formatDate(to)}`,40,42);
  return y||60;
}

function runExportPDF(){
  const from=parseModalDate('exp-from-dd','exp-from-mm','exp-from-yyyy');
  const to=parseModalDate('exp-to-dd','exp-to-mm','exp-to-yyyy');
  if(!from||!to) return showToast('Enter valid date range');
  if(from>to) return showToast('From date must be before To date');

  const source=exportType==='income'?income:expenses;
  let rows=source.filter(e=>e.date&&e.date>=from&&e.date<=to);
  if(!expSelCats.has('__ALL__')) rows=rows.filter(e=>expSelCats.has(e.cat));
  rows.sort((a,b)=>(a.date||'').localeCompare(b.date||'')||String(a.cat).localeCompare(b.cat));

  if(!rows.length) return showToast('No entries in this range');

  const{jsPDF}=window.jspdf;
  const doc=new jsPDF({unit:'pt',format:'a4'});
  const pageW=doc.internal.pageSize.getWidth();
  const margin=40;
  const title=exportType==='income'?'Income Report':'Expense Report';
  let y=drawTableHeader(doc,60,title,from,to);
  y+=10;

  const total=rows.reduce((s,e)=>s+Number(e.amount||0),0);
  doc.setFont('helvetica','bold');
  doc.setFontSize(11);
  doc.setTextColor(60,60,70);
  doc.text(`Total: ${fmtRs(total)}  ·  ${rows.length} entries`,margin,y);
  y+=22;

  const colX={date:margin,cat:margin+72,sub:margin+165,note:margin+250,amt:pageW-margin};
  const drawRowHead=()=>{
    doc.setFillColor(240,240,236);
    doc.rect(margin,y-12,pageW-margin*2,18,'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(8);
    doc.setTextColor(100,100,110);
    doc.text('DATE',colX.date,y);
    doc.text('CATEGORY',colX.cat,y);
    doc.text('SUB',colX.sub,y);
    doc.text('NOTE',colX.note,y);
    doc.text('AMOUNT',colX.amt,y,{align:'right'});
    y+=14;
  };
  drawRowHead();

  doc.setFont('helvetica','normal');
  doc.setFontSize(9);
  rows.forEach((e,i)=>{
    if(y>760){
      doc.addPage();
      y=drawTableHeader(doc,60,title,from,to)+30;
      drawRowHead();
      doc.setFont('helvetica','normal');
      doc.setFontSize(9);
    }
    if(i%2===0){
      doc.setFillColor(248,248,245);
      doc.rect(margin,y-11,pageW-margin*2,16,'F');
    }
    const rgb=hexToRgb(getExportCatColor(e.cat));
    doc.setFillColor(rgb.r,rgb.g,rgb.b);
    doc.circle(margin+4,y-4,3,'F');
    doc.setTextColor(40,40,48);
    doc.text(formatDate(e.date),colX.date,y);
    doc.text(safeStr(e.cat),colX.cat,y);
    doc.text(safeStr(e.subcat||'—'),colX.sub,y);
    doc.text(safeNote(e.note||''),colX.note,y);
    doc.setFont('helvetica','bold');
    doc.text(fmtRs(e.amount),colX.amt,y,{align:'right'});
    doc.setFont('helvetica','normal');
    y+=16;
  });

  y+=8;
  doc.setDrawColor(200,200,210);
  doc.line(margin,y,pageW-margin,y);
  y+=14;
  doc.setFont('helvetica','bold');
  doc.setFontSize(11);
  doc.text(`Grand Total: ${fmtRs(total)}`,margin,y);

  doc.save(`${exportType}-report-${from}-to-${to}.pdf`);
  closeExportModal();
  showToast('PDF downloaded');
}

// ══ TOAST ═════════════════════════════════════════════════════════
let toastTimer=null;
function showToast(msg){
  const el=document.getElementById('toast');
  el.textContent=msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.classList.remove('show'),2800);
}
