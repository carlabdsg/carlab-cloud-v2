(function(){
  const state={reports:[],fleet:[],schedules:[],campaigns:[],parts:[],period:'30',company:'',search:'',loaded:false,loading:false};
  const token=()=>localStorage.getItem('carlabToken')||localStorage.getItem('token')||localStorage.getItem('authToken')||'';
  const user=()=>{try{const p=token().split('.')[1];return JSON.parse(decodeURIComponent(atob(p.replace(/-/g,'+').replace(/_/g,'/')).split('').map(c=>'%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)).join('')))}catch{return {}}};
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
  const arr=v=>Array.isArray(v)?v:Array.isArray(v?.items)?v.items:Array.isArray(v?.data)?v.data:[];
  const dt=v=>{const d=new Date(v||0);return Number.isNaN(d.getTime())?null:d};
  const api=async url=>{const r=await fetch(url,{cache:'no-store',headers:{Authorization:`Bearer ${token()}`}});const d=await r.json().catch(()=>[]);if(!r.ok)throw new Error(d.error||`Error ${r.status}`);return d};
  const num=(o,keys)=>{for(const k of keys){const n=Number(o?.[k]);if(Number.isFinite(n))return n}return 0};
  const field=(o,keys)=>{for(const k of keys){if(o?.[k]!==undefined&&o?.[k]!==null&&String(o[k]).trim()!=='')return o[k]}return ''};
  const role=()=>user()?.role||'';
  const isFleetSupervisor=()=>role()==='supervisor_flotas';
  const cutoff=()=>{const d=new Date();d.setDate(d.getDate()-Number(state.period||30));return d};
  const companyOf=o=>field(o,['empresa','company']);
  const unitOf=o=>field(o,['numeroEconomico','numero_economico','unidad','unit']);
  const reportDate=o=>dt(field(o,['createdAt','created_at','fechaIngreso','fecha_ingreso']));
  const statusOf=o=>norm(field(o,['estatusOperativo','estatus_operativo','status','estado']));
  const validationOf=o=>norm(field(o,['estatusValidacion','estatus_validacion','validationStatus']));
  const textOf=o=>norm(JSON.stringify(o));
  function periodItems(list,dateFn){const c=cutoff();return list.filter(x=>{const d=dateFn(x);return !d||d>=c})}
  function scoped(list){const u=user();const company=isFleetSupervisor()?u.empresa:state.company;return list.filter(x=>(!company||norm(companyOf(x))===norm(company))&&(!state.search||textOf(x).includes(norm(state.search))))}
  function reports(){return scoped(periodItems(state.reports,reportDate))}
  function fleet(){return scoped(state.fleet)}
  function schedules(){return scoped(periodItems(state.schedules,x=>dt(field(x,['scheduledFor','scheduled_for','proposedAt','createdAt']))))}
  function classifyFleet(x){const s=statusOf(x);if(/esperarefaccion|refaccion|detenid/.test(s))return 'parts';if(/taller|proceso|reparacion|ingresad/.test(s))return 'workshop';if(/programad|agenda/.test(s))return 'scheduled';return 'available'}
  function kpis(){
    const f=fleet(),r=reports(),s=schedules();
    const total=f.length,available=f.filter(x=>classifyFleet(x)==='available').length,workshop=f.filter(x=>classifyFleet(x)==='workshop').length,parts=f.filter(x=>classifyFleet(x)==='parts').length;
    const confirmed=s.filter(x=>norm(x.status)==='confirmed').length,cancelled=s.filter(x=>['cancelled','rejected'].includes(norm(x.status))).length;
    const compliance=(confirmed+cancelled)?Math.round(confirmed*100/(confirmed+cancelled)):100;
    const open=r.filter(x=>!/(terminada|finalizada|cerrada)/.test(statusOf(x))).length;
    const avgDays=(()=>{const rows=r.filter(x=>reportDate(x));if(!rows.length)return 0;return rows.reduce((sum,x)=>{const start=reportDate(x);const end=/(terminada|finalizada|cerrada)/.test(statusOf(x))?(dt(field(x,['updatedAt','updated_at','fechaTerminada']))||new Date()):new Date();return sum+Math.max(0,(end-start)/86400000)},0)/rows.length})();
    return{total,available,availability:total?Math.round(available*100/total):100,workshop,parts,open,compliance,avgDays:avgDays.toFixed(1)};
  }
  function repeatUnits(){const map=new Map();for(const r of reports()){const u=unitOf(r);if(!u)continue;const key=norm(u);const row=map.get(key)||{unit:u,company:companyOf(r),count:0,last:'',types:new Map()};row.count++;const d=reportDate(r);if(d&&(!row.last||d>row.last))row.last=d;const t=field(r,['tipoIncidencia','tipo_incidencia','categoria','descripcionFallo','descripcion_fallo'])||'Sin clasificar';row.types.set(t,(row.types.get(t)||0)+1);map.set(key,row)}return [...map.values()].filter(x=>x.count>=2).sort((a,b)=>b.count-a.count).slice(0,8).map(x=>({...x,topType:[...x.types.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||'Sin clasificar'}))}
  function failureTypes(){const map=new Map();for(const r of reports()){let t=String(field(r,['categoria','tipoServicio','tipo_servicio','tipoIncidencia','tipo_incidencia','descripcionFallo','descripcion_fallo'])||'Sin clasificar').trim();if(t.length>32)t=t.slice(0,32)+'…';map.set(t,(map.get(t)||0)+1)}return [...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,7)}
  function alerts(){const out=[],r=reports(),s=schedules(),f=fleet();
    const noSchedule=r.filter(x=>validationOf(x)==='aceptada'&&!s.some(a=>norm(unitOf(a))===norm(unitOf(x))&&!['cancelled','rejected'].includes(norm(a.status))));
    if(noSchedule.length)out.push({level:'danger',title:`${noSchedule.length} reportes aceptados sin agenda`,detail:'Requieren fecha de ingreso.',nav:'navScheduleBtn'});
    const waiting=f.filter(x=>classifyFleet(x)==='parts');if(waiting.length)out.push({level:'danger',title:`${waiting.length} unidades esperando refacción`,detail:'Afectan disponibilidad de flota.',nav:'navPartsBtn'});
    const cancelled=s.filter(x=>['cancelled','rejected'].includes(norm(x.status)));if(cancelled.length)out.push({level:'warning',title:`${cancelled.length} citas canceladas o no realizadas`,detail:'Revisa reprogramaciones pendientes.',nav:'navScheduleBtn'});
    const repeats=repeatUnits();if(repeats.length)out.push({level:'warning',title:`${repeats.length} unidades reincidentes`,detail:'Dos o más reportes en el periodo.',nav:'navHistoryBtn'});
    return out.slice(0,6)}
  function campaignStats(){const list=scoped(state.campaigns);return list.slice(0,6).map(c=>{const total=num(c,['totalUnits','total_unidades','total'])||arr(c.unidades).length;const done=num(c,['completedUnits','realizadas','completadas']);return{name:field(c,['nombre','name'])||'Campaña',total,done,pct:total?Math.round(done*100/total):0}})}
  function money(){const r=reports();return r.reduce((s,x)=>s+num(x,['totalCobro','total_cobro','total','importe','costoTotal','costo_total']),0)}
  function fmtMoney(n){return new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(n||0)}
  function go(id){document.getElementById(id)?.click()}
  function openUnit(unit){go('navHistoryBtn');setTimeout(()=>{const i=document.getElementById('unitHistoryInput');if(i){i.value=unit;document.getElementById('unitHistoryBtn')?.click()}},180)}
  function render(){const panel=document.getElementById('analyticsPanel');if(!panel)return;const old=panel.querySelector('.analytics-grid');if(old)old.style.display='none';let root=document.getElementById('fleetKpiRoot');if(!root){root=document.createElement('div');root.id='fleetKpiRoot';root.className='fleet-kpi';panel.appendChild(root)}
    const k=kpis(),rep=repeatUnits(),fails=failureTypes(),al=alerts(),camps=campaignStats(),f=fleet();
    const availableEnd=`${k.availability}%`,workshopEnd=`${Math.min(100,k.availability+Math.round(k.workshop*100/Math.max(1,k.total)))}%`;
    const companies=[...new Set(state.reports.map(companyOf).filter(Boolean))].sort();
    root.innerHTML=`<section class="fk-hero"><div><span class="fk-kicker">CONTROL DE FLOTA</span><h2>KPI de disponibilidad y mantenimiento</h2><p>${isFleetSupervisor()?`Información exclusiva de ${esc(user().empresa||'tu empresa')}`:'Vista ejecutiva por empresa, unidad y periodo.'}</p></div><div class="fk-health"><strong>${k.availability}%</strong><span>Disponibilidad actual</span></div></section>
    <section class="fk-toolbar"><input class="fk-search" id="fkSearch" placeholder="Buscar unidad, modelo, falla o contacto" value="${esc(state.search)}"><select id="fkPeriod"><option value="7" ${state.period==='7'?'selected':''}>Últimos 7 días</option><option value="30" ${state.period==='30'?'selected':''}>Últimos 30 días</option><option value="90" ${state.period==='90'?'selected':''}>Últimos 90 días</option><option value="365" ${state.period==='365'?'selected':''}>Último año</option></select>${isFleetSupervisor()?`<select disabled><option>${esc(user().empresa||'Mi empresa')}</option></select>`:`<select id="fkCompany"><option value="">Todas las empresas</option>${companies.map(c=>`<option ${state.company===c?'selected':''}>${esc(c)}</option>`).join('')}</select>`}<select id="fkFocus"><option value="">Todos los estados</option><option value="workshop">En taller</option><option value="parts">Esperando refacción</option><option value="available">Disponibles</option></select><button class="fk-refresh" id="fkRefresh">Actualizar</button></section>
    <section class="fk-summary">${[
      ['Disponibilidad',`${k.availability}%`,`${k.available} de ${k.total} unidades`,'#22c55e','navFleetBtn'],
      ['En taller',k.workshop,'Unidades fuera de operación','#f59e0b','navFleetBtn'],
      ['Esperando refacción',k.parts,'Atención prioritaria','#ef4444','navPartsBtn'],
      ['Reportes abiertos',k.open,'Pendientes de cierre','#2563eb','navBoardBtn'],
      ['Cumplimiento agenda',`${k.compliance}%`,`Promedio fuera: ${k.avgDays} días`,'#8b5cf6','navScheduleBtn']
    ].map(x=>`<button class="fk-stat" style="--accent:${x[3]}" data-nav="${x[4]}"><span>${x[0]}</span><strong>${x[1]}</strong><small>${x[2]}</small></button>`).join('')}</section>
    <section class="fk-grid"><article class="fk-card"><div class="fk-card-head"><div><h3>Disponibilidad de flota</h3><span>Situación actual de las unidades</span></div><button class="fk-action" data-nav="navFleetBtn">Abrir Flotas</button></div><div class="fk-donut-wrap"><div class="fk-donut" style="--available:${availableEnd};--workshop:${workshopEnd}" data-value="${k.availability}%"></div><div class="fk-legend"><span><i style="background:#22c55e"></i>Disponibles: <strong>${k.available}</strong></span><span><i style="background:#f59e0b"></i>En taller: <strong>${k.workshop}</strong></span><span><i style="background:#ef4444"></i>Esperando refacción: <strong>${k.parts}</strong></span><span><i style="background:#94a3b8"></i>Total: <strong>${k.total}</strong></span></div></div></article>
    <article class="fk-card"><div class="fk-card-head"><div><h3>Atención requerida</h3><span>Acciones que afectan disponibilidad</span></div></div><div class="fk-list">${al.length?al.map(a=>`<div class="fk-alert ${a.level==='warning'?'warning':''}"><i class="fk-alert-dot"></i><div><strong>${esc(a.title)}</strong><span>${esc(a.detail)}</span></div><button data-nav="${a.nav}">Atender</button></div>`).join(''):'<div class="fk-empty">Sin alertas críticas en el periodo.</div>'}</div></article>
    <article class="fk-card"><div class="fk-card-head"><div><h3>Unidades reincidentes</h3><span>Repetición de fallas en el periodo</span></div><button class="fk-action" data-nav="navHistoryBtn">Historial</button></div><div class="fk-list">${rep.length?rep.map(x=>`<div class="fk-row"><strong>Unidad ${esc(x.unit)}</strong><span>${esc(x.topType)} · ${x.count} reportes</span><button data-unit="${esc(x.unit)}">Ver historial</button></div>`).join(''):'<div class="fk-empty">No hay unidades reincidentes.</div>'}</div></article>
    <article class="fk-card"><div class="fk-card-head"><div><h3>Fallas más frecuentes</h3><span>Distribución de incidencias</span></div></div><div class="fk-bars">${fails.length?fails.map(([name,count])=>`<div><div class="fk-bar-label"><span>${esc(name)}</span><strong>${count}</strong></div><div class="fk-bar-track"><div class="fk-bar-fill" style="--w:${Math.round(count*100/Math.max(1,fails[0][1]))}%"></div></div></div>`).join(''):'<div class="fk-empty">Sin datos de fallas.</div>'}</div></article>
    <article class="fk-card"><div class="fk-card-head"><div><h3>Campañas de la flota</h3><span>Avance de unidades atendidas</span></div><button class="fk-action" data-nav="navCampaignsBtn">Abrir campañas</button></div><div class="fk-bars">${camps.length?camps.map(c=>`<div><div class="fk-bar-label"><span>${esc(c.name)}</span><strong>${c.done}/${c.total||0}</strong></div><div class="fk-bar-track"><div class="fk-bar-fill" style="--w:${c.pct}%"></div></div></div>`).join(''):'<div class="fk-empty">Sin campañas activas para mostrar.</div>'}</div></article>
    <article class="fk-card"><div class="fk-card-head"><div><h3>Lectura económica</h3><span>Costos registrados en el periodo</span></div><button class="fk-action" data-nav="navCobranzaBtn">Abrir cobranza</button></div><div class="fk-list"><div class="fk-row"><strong>Importe acumulado</strong><span>Según reportes y cobros disponibles</span><button data-nav="navCobranzaBtn">${fmtMoney(money())}</button></div><div class="fk-row"><strong>Costo promedio por reporte</strong><span>${reports().length} reportes considerados</span><button data-nav="navCobranzaBtn">${fmtMoney(reports().length?money()/reports().length:0)}</button></div></div></article></section>`;
    root.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>go(b.dataset.nav));root.querySelectorAll('[data-unit]').forEach(b=>b.onclick=()=>openUnit(b.dataset.unit));
    root.querySelector('#fkPeriod').onchange=e=>{state.period=e.target.value;render()};const cs=root.querySelector('#fkCompany');if(cs)cs.onchange=e=>{state.company=e.target.value;render()};root.querySelector('#fkSearch').oninput=e=>{state.search=e.target.value;clearTimeout(window.__fkTimer);window.__fkTimer=setTimeout(render,180)};root.querySelector('#fkRefresh').onclick=()=>load(true);root.querySelector('#fkFocus').onchange=e=>{const v=e.target.value;if(!v)return;const ids={workshop:'navFleetBtn',parts:'navPartsBtn',available:'navFleetBtn'};go(ids[v])};
  }
  async function load(force=false){if(state.loading||(state.loaded&&!force))return;state.loading=true;const panel=document.getElementById('analyticsPanel');if(panel){let r=document.getElementById('fleetKpiRoot');if(!r){r=document.createElement('div');r.id='fleetKpiRoot';r.className='fleet-kpi';panel.appendChild(r)}r.innerHTML='<div class="fk-loading">Calculando indicadores de flota…</div>'}
    const calls=[['reports','/api/garantias?limit=1000'],['fleet','/api/fleet/units'],['schedules','/api/schedules?limit=500'],['campaigns','/api/campaigns'],['parts','/api/parts/requests']];const results=await Promise.allSettled(calls.map(x=>api(x[1])));results.forEach((r,i)=>{state[calls[i][0]]=r.status==='fulfilled'?arr(r.value):[]});state.loaded=true;state.loading=false;render();
  }
  function open(){setTimeout(()=>load(false),80)}
  function boot(){document.getElementById('navAnalyticsBtn')?.addEventListener('click',open);const p=document.getElementById('analyticsPanel');if(!p)return;new MutationObserver(()=>{if(!p.classList.contains('hidden')&&getComputedStyle(p).display!=='none')open()}).observe(p,{attributes:true,attributeFilter:['class','style']});if(!p.classList.contains('hidden'))open()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();