const fs=require('fs'),vm=require('vm'),assert=require('assert');
const base='/workspace/scratch/0d9a07c07f35/taskforce-dashboard-cloudflare/public/';
const els={},events={};
class E{
  constructor(){this.value='';this.textContent='';this.dataset={};this.style={};this.options=[];this.children={};this.hidden=false;this.disabled=false;this.className='';this.classList={add(){},remove(){},toggle(){}};}
  set innerHTML(s){this._html=s;if(s.includes('<option'))this.options=[...s.matchAll(/<option(?: value="([^"]*)")?[^>]*>([^<]*)<\/option>/g)].map(m=>({value:m[1]??m[2],textContent:m[2],selected:false}));}
  get innerHTML(){return this._html||''}get selectedOptions(){return this.options.filter(o=>o.selected)}
  setAttribute(){}querySelector(s){return this.children[s]??=new E()}querySelectorAll(){return []}showModal(){}close(){}getBoundingClientRect(){return {width:250,height:180,left:0,top:0}}
}
const el=id=>els[id]??=new E();
global.window=global;global.document={getElementById:el,querySelectorAll:()=>[],documentElement:{dataset:{}},body:new E(),addEventListener:(k,f)=>events[k]=f};
global.addEventListener=()=>{};global.innerWidth=1000;global.innerHeight=800;global.location={protocol:'https:'};global.indexedDB={deleteDatabase(){return {}}};
const storage=new Map();global.localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};
el('category').innerHTML='<option>GT</option><option>MT</option><option>Distributor GT</option><option>Distributor MT</option>';
const rows=[
  ['2026-09-01','NDD Shah Alam','WHS','0000','Outlet 0000','1','SKU1','Wafer',1000,2,'','ZBE1','S00','Ali'],
  ['2026-09-01','NDD Shah Alam','IDS','0001','Outlet 0001','2','SKU2','Snack',250,1,'','ZBE1','S00','Ali'],
  ['2026-09-02','NDD Semenyih','WHS','0100','Outlet 0100','3','SKU1','Wafer',-50,1,'','ZBE1','S01','Bala']
];
global.fetch=async url=>({ok:true,json:async()=>String(url).startsWith('/api/status')?{latest:{file_name:'online.xlsx'},data:{row_count:3,min_date:'2026-09-01',max_date:'2026-09-02'}}:{rows,next_cursor:null}});
vm.runInThisContext(fs.readFileSync(base+'app.js','utf8'));

setTimeout(async()=>{
  const state=SalesPulseTest.getState();
  assert.equal(state.rows.length,3);assert.equal(SalesPulseTest.aggregate(state.rows).net,1200);
  assert(el('source').textContent.includes('online.xlsx'));assert(el('source').textContent.includes('3 detail lines'));
  assert.equal(el('loadingOverlay').hidden,true);assert(fs.readFileSync(base+'index.html','utf8').includes('/admin/'));
  assert(!fs.readFileSync(base+'index.html','utf8').includes('id="upload"'));
  const worker=(await import('../src/worker.js')).default;
  const health=await worker.fetch(new Request('https://example.com/api/health'),{DB:{},APP_NAME:'Taskforce Dashboard'});
  assert.equal(health.status,200);assert.equal((await health.json()).ok,true);
  const blocked=await worker.fetch(new Request('https://example.com/api/admin/imports',{method:'POST'}),{DB:{}});
  assert.equal(blocked.status,503);
  let setupStatements=0;const db={prepare:sql=>({sql}),batch:async list=>{setupStatements=list.length;return []}};
  const initialized=await worker.fetch(new Request('https://example.com/api/admin/setup',{method:'POST',headers:{authorization:'Bearer qa'}}),{DB:db,ADMIN_TOKEN:'qa'});
  assert.equal(initialized.status,200);assert.equal(setupStatements,7);
  console.log('PASS remote viewer state + no bundled upload + Worker health/auth/setup guard');
},60);
