const API = 'https://api.open-meteo.com/v1/forecast';
const chartEl = document.getElementById('forecastChart');
const refreshBtn = document.getElementById('refreshBtn');

async function getPosition(){
  return new Promise((res, rej)=>{
    if(!navigator.geolocation){ rej('No geolocation'); return; }
    navigator.geolocation.getCurrentPosition(p=>res(p.coords), e=>rej(e));
  });
}

function hoursFromNowArray(times){ return times.map(t=>new Date(t)); }

function blanketAdvice(minTemp){
  if(minTemp==null) return {text:'Geen data',code:'none', grams:0};
  const t = minTemp;
  if(t>=10) return {text:'Geen deken',code:'none', grams:0};
  if(t>=5) return {text:'Lichte sheet',code:'light', grams:100};
  if(t>=0) return {text:'Dunne/medium',code:'medium', grams:200};
  return {text:'Medium/zwaar',code:'heavy', grams:300};
}

function pastureAdvice(totPrec){
  if(totPrec==null) return {text:'Onbekend',code:'unknown'};
  if(totPrec>=10) return {text:'Te nat',code:'bad'};
  if(totPrec>=5) return {text:'Waarschuwing',code:'warn'};
  return {text:'OK',code:'ok'};
}

function groupDayNight(times, temps, precs, pprobs, winds){
  const per = {};
  times.forEach((t, i)=>{
    const dt = new Date(t);
    const dateKey = dt.toISOString().slice(0,10);
    if(!per[dateKey]) per[dateKey] = {day:[], night:[]};
    const hour = dt.getHours();
    const slot = (hour>=9 && hour<=21)? 'day':'night';
    per[dateKey][slot].push({t, temp:temps[i], prec:precs[i], pprob:pprobs[i], wind:winds[i]});
  });
  const keys = Object.keys(per).slice(0,3);
  const summary = keys.map(k=>{
    const day = per[k].day; const night = per[k].night;
    function summarize(arr){
      if(!arr || arr.length===0) return {min_temp:null, max_temp:null, tot_prec:0, avg_pprob:0, max_wind:0};
      const temps = arr.map(x=>x.temp); const precs = arr.map(x=>x.prec); const pps = arr.map(x=>x.pprob); const winds = arr.map(x=>x.wind);
      return {min_temp: Math.min(...temps), max_temp:Math.max(...temps), tot_prec: precs.reduce((a,b)=>a+b,0), avg_ppob: pps.reduce((a,b)=>a+b,0)/pps.length, avg_pprob: pps.reduce((a,b)=>a+b,0)/pps.length, max_wind: Math.max(...winds)};
    }
    return {date:k, day:summarize(day), night:summarize(night)};
  });
  return summary;
}

function renderSummary(summary){
  const container = document.getElementById('summary');
  container.innerHTML = '';
  // create table transposed
  const table = document.createElement('div');
  table.className='summary-table';
  // build header row
  const header = document.createElement('div'); header.className='row header';
  header.innerHTML = '<div class="cell metric"></div>' + summary.map(s=>`<div class="cell period">${s.date.replace(/(\d{4})-(\d{2})-(\d{2})/,'$3/$2')}</div>`).join('');
  table.appendChild(header);
  // metrics
  const metrics = [
    {id:'min', label:'Min. temp (°C)', getter: s=>s.day.min_temp},
    {id:'max', label:'Max. temp (°C)', getter: s=>s.day.max_temp},
    {id:'prec', label:'Tot. neerslag (mm)', getter: s=>s.day.tot_prec},
    {id:'pp', label:'Gem. kans neerslag (%)', getter: s=>s.day.avg_pprob},
    {id:'wind', label:'Max wind (km/h)', getter: s=>s.day.max_wind},
  ];
  // we will show for day and night separately as periods
  // flatten periods
  const periods = [];
  summary.forEach(s=>{ periods.push({label:s.date+' (dag)', data:s.day}); periods.push({label:s.date+' (nacht)', data:s.night}); });
  // Build rows for each metric
  metrics.forEach(m=>{
    const row = document.createElement('div'); row.className='row';
    const metricCell = document.createElement('div'); metricCell.className='cell metric'; metricCell.textContent=m.label;
    row.appendChild(metricCell);
    periods.forEach(p=>{ const c=document.createElement('div'); c.className='cell'; const v = (m.id==='min')? p.data.min_temp : (m.id==='max')? p.data.max_temp : (m.id==='prec')? p.data.tot_prec : (m.id==='pp')? p.data.avg_pprob : p.data.max_wind; c.textContent = (v==null)? '-' : (Math.round((v+Number.EPSILON)*10)/10); row.appendChild(c); });
    table.appendChild(row);
  });
  // Dekenadvies row with icons + grams
  const rowDek = document.createElement('div'); rowDek.className='row'; rowDek.innerHTML='<div class="cell metric">Dekenadvies</div>';
  periods.forEach(p=>{ const c=document.createElement('div'); c.className='cell iconcell'; const adv = blanketAdvice(p.data.min_temp); c.innerHTML=`<span class="ic ic-${adv.code}"></span> ${adv.grams}g`; rowDek.appendChild(c); }); table.appendChild(rowDek);
  // Weideadvies
  const rowWeide = document.createElement('div'); rowWeide.className='row'; rowWeide.innerHTML='<div class="cell metric">Weideadvies</div>';
  periods.forEach(p=>{ const c=document.createElement('div'); c.className='cell iconcell'; const adv = pastureAdvice(p.data.tot_prec); c.innerHTML=`<span class="ic ic-${adv.code}"></span> ${adv.text}`; rowWeide.appendChild(c); }); table.appendChild(rowWeide);

  container.appendChild(table);
}

let chartInstance = null;

function renderChart(times, temps, precs){
  const ctx = document.getElementById('forecastChart').getContext('2d');
  const labels = times.map(t=> new Date(t).toLocaleString('nl-NL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}));
  const tempData = temps.map(v=>Math.round(v*10)/10);
  const precData = precs.map(v=>Math.round(v*10)/10);
  const overallMin = Math.min(...temps);
  const overallMax = Math.max(...temps);
  const overallMean = temps.reduce((a,b)=>a+b,0)/temps.length;
  if(chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx,{
    type:'bar',
    data:{
      labels,
      datasets:[
        { type:'bar', label:'Neerslag (mm)', data:precData, backgroundColor:'#87c1ff', yAxisID:'y1', barPercentage:0.8, categoryPercentage:0.9 },
        { type:'line', label:'Temperatuur (°C)', data:tempData, borderColor:'#d62728', fill:false, yAxisID:'y2', tension:0.2 }
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      scales:{
        y1:{ beginAtZero:true, position:'left', grid:{display:false}, title:{display:true,text:'Neerslag (mm)'} },
        y2:{ beginAtZero:true, position:'right', title:{display:true,text:'Temperatuur (°C)'}}
      },
      plugins:{legend:{display:true}},
      elements:{
        line:{borderWidth:3}
      }
    }
  });
  // draw min/max/mean as horizontal lines using Chart.js plugin? Simple overlay: draw on canvas after render
  // We will add plugin
}

async function update(){
  try{
    const pos = await getPosition();
    const lat = pos.latitude, lon = pos.longitude;
    const url = `${API}?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation,precipitation_probability,windspeed_10m&forecast_days=3&timezone=Europe/Amsterdam&windspeed_unit=kmh`;
    const res = await fetch(url);
    const data = await res.json();
    const times = data.hourly.time.slice(0,72);
    const temps = data.hourly.temperature_2m.slice(0,72);
    const precs = data.hourly.precipitation.slice(0,72);
    const pps = data.hourly.precipitation_probability.slice(0,72);
    const winds = data.hourly.windspeed_10m.slice(0,72);
    const summary = groupDayNight(times, temps, precs, pps, winds);

    renderChart(times, temps, precs);
    renderSummary(summary);
  }catch(e){
    alert('Kon locatie/weerdata niet ophalen: '+e);
  }
}

refreshBtn.addEventListener('click', ()=>update());

// on load
update();

// simple service worker registration for PWA
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('/sw.js').catch(()=>{});
}
