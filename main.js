const API = 'https://api.open-meteo.com/v1/forecast';

// Load Chart.js UMD bundle at runtime to avoid unresolved ESM dependency (@kurkle/color)
function loadChartUmd(){
  if(window.Chart) return Promise.resolve();
  return new Promise((resolve, reject)=>{
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js/dist/chart.umd.min.js';
    s.onload = () => resolve();
    s.onerror = (e) => reject(new Error('Failed to load Chart.js: '+e));
    document.head.appendChild(s);
  });
}


const refreshBtn = document.getElementById('refreshBtn');

async function getPosition(){
  return new Promise((res, rej)=>{
    if(!navigator.geolocation){ rej('No geolocation'); return; }
    navigator.geolocation.getCurrentPosition(p=>res(p.coords), e=>rej(e));
  });
}



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


function renderSummary(summary){
  const container = document.getElementById('summary');
  container.innerHTML = '';

  // Build periods (two columns per date: dag, nacht)
  const rawPeriods = [];
  summary.forEach(s=>{
    const d = s.date.replace(/(\d{4})-(\d{2})-(\d{2})/,'$3/$2'); // dd/mm
    rawPeriods.push({label: d + ' (dag)', data: s.day});
    rawPeriods.push({label: d + ' (nacht)', data: s.night});
  });

  const isEmptyPeriod = (p) => {
    const d = p.data;
    if(!d) return true;
    if(d.min_temp === null || d.min_temp === undefined) return true;
    const minT = Number(d.min_temp);
    const maxT = Number(d.max_temp);
    const totP = Number(d.tot_prec);
    const avgP = Number(d.avg_pprob);
    const vals = [minT, maxT, totP, avgP];
    const allZeroOrNaN = vals.every(v => (isNaN(v) || v === 0));
    if(allZeroOrNaN) return true;
    if(!isNaN(minT) && !isNaN(maxT) && Math.abs(maxT - minT) < 0.1 && (isNaN(avgP) || avgP === 0) && totP === 0) return true;
    return false;
  };

  const periods = rawPeriods.filter(p=>!isEmptyPeriod(p)).slice(0,6);

  // create a semantic table element
  const table = document.createElement('table');
  table.className = 'summary-table-table';

  // THEAD
  const thead = document.createElement('thead');
  const htr = document.createElement('tr');
  const thMetric = document.createElement('th'); thMetric.textContent = '';
  htr.appendChild(thMetric);
  periods.forEach(p=>{ const th = document.createElement('th'); th.innerHTML = p.label.replace('\n','<br>'); htr.appendChild(th); });
  thead.appendChild(htr);
  table.appendChild(thead);

  // TBODY
  const tbody = document.createElement('tbody');
  const metrics = [
    {id:'min', label:'Min. temp (°C)', getter: s=>s.min_temp},
    {id:'max', label:'Max. temp (°C)', getter: s=>s.max_temp},
    {id:'prec', label:'Tot. neerslag (mm)', getter: s=>s.tot_prec},
    {id:'pp', label:'Gem. kans neerslag (%)', getter: s=>s.avg_pprob},
    {id:'wind', label:'Max wind (km/h)', getter: s=>s.max_wind},
    {id:'fruc', label:'Fructaanindex (units)', getter: s=>s.fructaan},
  ];

  metrics.forEach(m=>{
    const tr = document.createElement('tr');
    const tdLabel = document.createElement('td'); tdLabel.className='metric'; tdLabel.textContent = m.label; tr.appendChild(tdLabel);
    periods.forEach(p=>{
      const td = document.createElement('td'); td.className='numeric';
      const v = m.getter(p.data);
      td.textContent = (v == null || Number.isNaN(v)) ? '-' : (Math.round((v+Number.EPSILON)*10)/10);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  // Fructaan risico row
  const trRisk = document.createElement('tr');
  const tdRiskLabel = document.createElement('td'); tdRiskLabel.className='metric'; tdRiskLabel.textContent='Fructaan risico'; trRisk.appendChild(tdRiskLabel);
  periods.forEach(p=>{
    const td = document.createElement('td');
    const val = p.data.fructaan;
    if(val===undefined || val===null || isNaN(Number(val))){ td.textContent='-'; }
    else{
      const v = Number(val);
      let risk='laag';
      if(v>30) risk='zeer hoog';
      else if(v>15) risk='hoog';
      else if(v>5) risk='gematigd';
      else risk='laag';
      td.textContent = `${Math.round(v*10)/10} (${risk})`;
    }
    trRisk.appendChild(td);
  });
  tbody.appendChild(trRisk);

  // Dekenadvies
  const trDek = document.createElement('tr');
  const tdDekLabel = document.createElement('td'); tdDekLabel.className='metric'; tdDekLabel.textContent='Dekenadvies'; trDek.appendChild(tdDekLabel);
  periods.forEach(p=>{
    const td = document.createElement('td'); td.className='iconcell';
    const adv = blanketAdvice(p.data.min_temp);
    const span = document.createElement('span'); span.className='ic ic-'+adv.code; span.style.marginRight='6px'; td.appendChild(span);
    td.appendChild(document.createTextNode(' '+adv.grams+'g'));
    trDek.appendChild(td);
  });
  tbody.appendChild(trDek);

  // Weideadvies
  const trWeide = document.createElement('tr');
  const tdWeideLabel = document.createElement('td'); tdWeideLabel.className='metric'; tdWeideLabel.textContent='Weideadvies'; trWeide.appendChild(tdWeideLabel);
  periods.forEach(p=>{
    const td = document.createElement('td'); td.className='iconcell';
    const adv = pastureAdvice(p.data.tot_prec);
    const span = document.createElement('span'); span.className='ic ic-'+adv.code; span.style.marginRight='6px'; td.appendChild(span);
    td.appendChild(document.createTextNode(' '+adv.text));
    trWeide.appendChild(td);
  });
  tbody.appendChild(trWeide);

  table.appendChild(tbody);
  container.appendChild(table);
}

let chartInstance = null;

function renderChart(times, temps, precs){
  const ctx = document.getElementById('forecastChart').getContext('2d');
  const labels = times.map(t=> new Date(t).toLocaleString('nl-NL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}));
  const tempData = temps.map(v=>Math.round(v*10)/10);
  const precData = precs.map(v=>Math.round(v*10)/10);
  if(chartInstance) chartInstance.destroy();
  // compute overall stats for additional lines
  const overallMin = Math.min(...temps.map(v=>v));
  const overallMax = Math.max(...temps.map(v=>v));
  const overallMean = temps.reduce((a,b)=>a+b,0)/temps.length;

  // create constant arrays for min/max/mean so they render as horizontal lines
  const minLine = new Array(tempData.length).fill(Number((overallMin).toFixed(2)));
  const maxLine = new Array(tempData.length).fill(Number((overallMax).toFixed(2)));
  const meanLine = new Array(tempData.length).fill(Number((overallMean).toFixed(2)));

  chartInstance = new Chart(ctx,{
    data: {
      labels,
      datasets: [
        { type:'bar', label:'Neerslag (mm)', data:precData, backgroundColor:'#87c1ff', yAxisID:'y1', barPercentage:0.8, categoryPercentage:0.9 },
        { type:'line', label:'Temperatuur (°C)', data:tempData, borderColor:'#d62728', backgroundColor:'#d62728', fill:false, yAxisID:'y2', tension:0.2, pointRadius:2 },
        { type:'line', label:'Minimum (°C)', data:minLine, borderColor:'#6b7280', borderDash:[6,4], pointRadius:0, yAxisID:'y2' },
        { type:'line', label:'Maximum (°C)', data:maxLine, borderColor:'#6b7280', borderDash:[6,4], pointRadius:0, yAxisID:'y2' },
        { type:'line', label:'Gemiddelde (°C)', data:meanLine, borderColor:'#ff7f0e', borderDash:[4,3], pointRadius:0, yAxisID:'y2' }
      ]
    },
    options: {
      responsive:true,
      maintainAspectRatio:false,
      scales: {
        y1: { beginAtZero:true, position:'left', grid:{display:false}, title:{display:true,text:'Neerslag (mm)'} },
        y2: { beginAtZero:true, position:'right', title:{display:true,text:'Temperatuur (°C)'} }
      },
      plugins: { legend:{display:true} },
      elements: { line:{borderWidth:2} }
    }
  });
}

async function update(){
  let lat, lon;

  const manualFallback = async () => {
    const useDefault = confirm('Wil je Heteren als locatie gebruiken (51.95667, 5.75556)? OK = Heteren, Annuleren = handmatige invoer.');
    if(useDefault){ lat = 51.95667; lon = 5.75556; return; }
    const input = prompt('Voer coordinaten in als: lat,lon (bijv. 51.95667,5.75556)');
    if(input && input.includes(',')){
      const parts = input.split(',').map(s=>parseFloat(s.trim()));
      if(parts.length===2 && !isNaN(parts[0]) && !isNaN(parts[1])){ lat = parts[0]; lon = parts[1]; return; }
      else { alert('Ongeldige invoer; gebruik Heteren als fallback'); lat = 51.95667; lon = 5.75556; return; }
    } else { alert('Geen geldige invoer; gebruik Heteren als fallback'); lat = 51.95667; lon = 5.75556; return; }
  };

  try{
    if(navigator.permissions && navigator.permissions.query){
      try{
        const perm = await navigator.permissions.query({ name: 'geolocation' });
        if(perm.state === 'granted'){
          const pos = await getPosition(); lat = pos.latitude; lon = pos.longitude;
        } else if(perm.state === 'prompt'){
          try{ const pos = await getPosition(); lat = pos.latitude; lon = pos.longitude; }
          catch(e){
            const retry = confirm('De app heeft toestemming nodig om automatisch je locatie te gebruiken. Wil je toestemming geven? OK = probeer opnieuw, Annuleer = handmatige invoer/Heteren.');
            if(retry){
              try{ const pos = await getPosition(); lat = pos.latitude; lon = pos.longitude; }
              catch(err){ await manualFallback(); }
            } else {
              await manualFallback();
            }
          }
        } else if(perm.state === 'denied'){
          const go = confirm('Locatie delen is geblokkeerd in je browser. Wil je instructies zien om toestemming te wijzigen? OK = toon instructies, Annuleer = handmatige invoer/Heteren.');
          if(go){
            alert('Open je browserinstellingen en geef locatie toegang voor deze site. Nadat je dat hebt gedaan, klik OK.');
            try{ const pos = await getPosition(); lat = pos.latitude; lon = pos.longitude; }
            catch(e){ await manualFallback(); }
          } else {
            await manualFallback();
          }
        }
      } catch(ePerm){
        try{ const pos = await getPosition(); lat = pos.latitude; lon = pos.longitude; }
        catch(e){ await manualFallback(); }
      }
    } else {
      try{ const pos = await getPosition(); lat = pos.latitude; lon = pos.longitude; }
      catch(e){ await manualFallback(); }
    }
  } catch(e){
    console.warn('Geolocation flow error:', e);
    await manualFallback();
  }

  try{
    const url = `${API}?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation,precipitation_probability,windspeed_10m,cloudcover&daily=sunrise,sunset&forecast_days=3&timezone=Europe/Amsterdam&windspeed_unit=kmh`;
    const res = await fetch(url);
    const data = await res.json();
    // raw hourly arrays from API
    let rawTimes = data.hourly.time;
    let rawTemps = data.hourly.temperature_2m;
    let rawPrecs = data.hourly.precipitation;
    let rawPps = data.hourly.precipitation_probability;
    let rawWinds = data.hourly.windspeed_10m;
    let rawClouds = data.hourly.cloudcover || new Array(rawTimes.length).fill(0);

    // choose only future hours starting from now (in the API timezone) up to next 72 hours
    const nowInTZString = (timeZone) => {
      const now = new Date();
      const f = new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false });
      const parts = f.formatToParts(now);
      const p = {};
      parts.forEach(x=>p[x.type]=x.value);
      const yyyy = p.year; const mm = p.month; const dd = p.day; const hh = p.hour; const min = p.minute;
      return `${yyyy}-${mm}-${dd}T${hh}:${min}`; // matches API format
    }
    const nowStr = nowInTZString('Europe/Amsterdam');
    let startIdx = rawTimes.findIndex(t => t >= nowStr);
    if(startIdx === -1) startIdx = 0;
    const endIdx = Math.min(startIdx + 72, rawTimes.length);

    const times = rawTimes.slice(startIdx, endIdx);
    const temps = rawTemps.slice(startIdx, endIdx);
    const precs = rawPrecs.slice(startIdx, endIdx);
    const pps = rawPps.slice(startIdx, endIdx);
    const winds = rawWinds.slice(startIdx, endIdx);
    const clouds = rawClouds.slice(startIdx, endIdx);

    // daily sunrise/sunset arrays
    const daily = data.daily || {};
    
    

    // helper: compute fructaan units for each hour
    const fructaanForHour = (idx) => {
      const T = temps[idx];
      const cloud = clouds[idx];
      // consumption
      let cons = 0;
      if(T > 15) cons = 3;
      else if(T > 10) cons = 2;
      else if(T > 5) cons = 1;
      else cons = 0;
      // production
      let prod = 0;
      if(T < 5) {
        // frost accumulation overrides
        prod = 2;
      } else {
        // cloud-based
        if(cloud >= 75) prod = 1;
        else if(cloud >= 25) prod = 2;
        else prod = 3;
      }
      // find sunrise/sunset for this hour's date
      const dt = new Date(times[idx]);
      const dateStr = dt.toISOString().slice(0,10);
      let dayIndex = null;
      if(daily.time){
        dayIndex = daily.time.indexOf(dateStr);
      }
      if(dayIndex !== -1 && dayIndex !== null && daily.sunrise && daily.sunset){
        const sr = new Date(daily.sunrise[dayIndex]);
        const ss = new Date(daily.sunset[dayIndex]);
        const fourHours = 4 * 60 * 60 * 1000;
        if(dt - sr > fourHours && ss - dt > fourHours){
          prod += 1;
        }
      }
      return prod - cons; // net change per hour
    };

    // Build summary with fructaan computed per period
    const hourlyNet = times.map((t,i)=>fructaanForHour(i));
    const per = {};
    times.forEach((t, i)=>{
      const dt = new Date(t);
      const dateKey = dt.toISOString().slice(0,10);
      if(!per[dateKey]) per[dateKey] = {day:[], night:[]};
      const hour = dt.getHours();
      const slot = (hour >= 8 && hour < 20) ? 'day' : 'night';
      per[dateKey][slot].push({t, temp:temps[i], prec:precs[i], pprob:pps[i], wind:winds[i], net: hourlyNet[i]});
    });

    // Derive summary and render
    const keys = Object.keys(per).slice(0,3);
    const summary = keys.map(k=>{
      const day = per[k].day; const night = per[k].night;
      const summarize = (arr) => {
        if(!arr || arr.length===0) return {min_temp:null, max_temp:null, tot_prec:0, avg_pprob:0, max_wind:0, fructaan:0};
        const tempsArr = arr.map(x=>x.temp); const precsArr = arr.map(x=>x.prec); const ppsArr = arr.map(x=>x.pprob); const windsArr = arr.map(x=>x.wind); const nets = arr.map(x=>x.net || 0);
        return {min_temp: Math.min(...tempsArr), max_temp:Math.max(...tempsArr), tot_prec: precsArr.reduce((a,b)=>a+b,0), avg_pprob: ppsArr.reduce((a,b)=>a+b,0)/ppsArr.length, max_wind: Math.max(...windsArr), fructaan: nets.reduce((a,b)=>a+b,0)};
      };
      return {date:k, day:summarize(day), night:summarize(night)};
    });

    // Render chart and summary
    renderChart(times, temps, precs);
    renderSummary(summary);

  } catch(e){
    console.error('Failed to fetch forecast or render:', e);
    alert('Kon weerdata niet ophalen. Controleer netwerk of probeer later.');
  }
}

refreshBtn.addEventListener('click', ()=>update());

// Install prompt handling
const installBtn = document.getElementById('installBtn');
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e; // Save the event for later
  if(installBtn) {
    installBtn.style.display = 'inline-block';
  }
});

if(installBtn){
  installBtn.addEventListener('click', async () => {
    if(deferredPrompt){
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if(choiceResult.outcome === 'accepted'){
        console.log('User accepted the install prompt');
        installBtn.style.display = 'none';
      } else {
        console.log('User dismissed the install prompt');
      }
      deferredPrompt = null;
    } else {
      const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      if(isiOS){
        alert('iOS install: gebruik de deelknop onderaan (Square met pijl) en kies "Zet in beginscherm"');
      } else {
        alert('Android/Chrome: open het menu (⋮) en kies "Add to Home screen" of gebruik de browser UI om toe te voegen.');
      }
    }
  });
}

window.addEventListener('appinstalled', () => {
  console.log('App installed');
  if(installBtn) installBtn.style.display = 'none';
});

// simple service worker registration for PWA with update flow
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('/sw.js').then(async (reg) => {
    try { await reg.update(); } catch(e){ /* ignore */ }

    if(reg.waiting){
      reg.waiting.postMessage({action:'skipWaiting'});
    }

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  }).catch(() => { /* ignore */ });
}

// Ensure Chart.js UMD is loaded before first update
loadChartUmd().then(()=>update()).catch((e)=>{console.error('Chart load failed',e); update();});
