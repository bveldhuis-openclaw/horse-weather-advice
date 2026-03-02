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

  // Build periods (two columns per date: dag, nacht)
  const rawPeriods = [];
  summary.forEach(s=>{
    const d = s.date.replace(/(\d{4})-(\d{2})-(\d{2})/,'$3/$2'); // dd/mm
    rawPeriods.push({label: d + ' (dag)', data: s.day});
    rawPeriods.push({label: d + ' (nacht)', data: s.night});
  });

  // Filter out empty periods (no meaningful data) and limit to 5 columns
  function isEmptyPeriod(p){
    const d = p.data;
    if(!d) return true;
    // if min temp missing => empty
    if(d.min_temp === null || d.min_temp === undefined) return true;
    // numericize
    const minT = Number(d.min_temp);
    const maxT = Number(d.max_temp);
    const totP = Number(d.tot_prec);
    const avgP = Number(d.avg_pprob);
    // if all stats are zero or NaN, treat as empty
    const vals = [minT, maxT, totP, avgP];
    const allZeroOrNaN = vals.every(v => (isNaN(v) || v === 0));
    if(allZeroOrNaN) return true;
    // if temperature range is negligible and no precipitation probability, consider empty
    if(!isNaN(minT) && !isNaN(maxT) && Math.abs(maxT - minT) < 0.1 && (isNaN(avgP) || avgP === 0) && totP === 0) return true;
    return false;
  }
  let periods = rawPeriods.filter(p=>!isEmptyPeriod(p));
  // debug logs to help diagnose client-side
  console.debug('rawPeriods', rawPeriods);
  console.debug('filtered periods', periods);
  periods = periods.slice(0,6);

  // build header row with one metric cell + one header per period
  const header = document.createElement('div'); header.className='row header';
  const metricHeader = document.createElement('div'); metricHeader.className = 'cell metric';
  header.appendChild(metricHeader);
  periods.forEach(p=>{
    const ph = document.createElement('div'); ph.className = 'cell period';
    ph.innerHTML = p.label.replace('\n','<br>');
    header.appendChild(ph);
  });
  table.appendChild(header);

  // metrics definitions
  const metrics = [
    {id:'min', label:'Min. temp (°C)', getter: s=>s.min_temp},
    {id:'max', label:'Max. temp (°C)', getter: s=>s.max_temp},
    {id:'prec', label:'Tot. neerslag (mm)', getter: s=>s.tot_prec},
    {id:'pp', label:'Gem. kans neerslag (%)', getter: s=>s.avg_pprob},
    {id:'wind', label:'Max wind (km/h)', getter: s=>s.max_wind},
  ];

  // Build rows for each metric
  metrics.forEach(m=>{
    const row = document.createElement('div'); row.className='row';
    const metricCell = document.createElement('div'); metricCell.className='cell metric'; metricCell.textContent=m.label;
    row.appendChild(metricCell);
    periods.forEach(p=>{
      const c = document.createElement('div'); c.className='cell numeric';
      const v = m.getter(p.data);
      c.textContent = (v == null || Number.isNaN(v))? '-' : (Math.round((v+Number.EPSILON)*10)/10);
      row.appendChild(c);
    });
    table.appendChild(row);
  });

  // Dekenadvies row with icons + grams
  const rowDek = document.createElement('div'); rowDek.className='row';
  const dekLabel = document.createElement('div'); dekLabel.className='cell metric'; dekLabel.textContent='Dekenadvies';
  rowDek.appendChild(dekLabel);
  periods.forEach(p=>{
    const c=document.createElement('div'); c.className='cell iconcell';
    const adv = blanketAdvice(p.data.min_temp);
    const span = document.createElement('span'); span.className = 'ic ic-' + adv.code;
    c.appendChild(span);
    const txt = document.createTextNode(' ' + adv.grams + 'g');
    c.appendChild(txt);
    rowDek.appendChild(c);
  });
  table.appendChild(rowDek);

  // Weideadvies
  const rowWeide = document.createElement('div'); rowWeide.className='row';
  const weideLabel = document.createElement('div'); weideLabel.className='cell metric'; weideLabel.textContent='Weideadvies';
  rowWeide.appendChild(weideLabel);
  periods.forEach(p=>{
    const c=document.createElement('div'); c.className='cell iconcell';
    const adv = pastureAdvice(p.data.tot_prec);
    const span = document.createElement('span'); span.className = 'ic ic-' + adv.code;
    c.appendChild(span);
    const txt = document.createTextNode(' ' + adv.text);
    c.appendChild(txt);
    rowWeide.appendChild(c);
  });
  table.appendChild(rowWeide);

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
  // draw min/max/mean as horizontal lines using Chart.js plugin? Simple overlay: draw on canvas after render
  // We will add plugin
}

async function update(){
  let lat, lon;

  async function manualFallback(){
    const useDefault = confirm('Wil je Heteren als locatie gebruiken (51.95667, 5.75556)? OK = Heteren, Annuleren = handmatige invoer.');
    if(useDefault){ lat = 51.95667; lon = 5.75556; return; }
    const input = prompt('Voer coordinaten in als: lat,lon (bijv. 51.95667,5.75556)');
    if(input && input.includes(',')){
      const parts = input.split(',').map(s=>parseFloat(s.trim()));
      if(parts.length===2 && !isNaN(parts[0]) && !isNaN(parts[1])){ lat = parts[0]; lon = parts[1]; return; }
      else { alert('Ongeldige invoer; gebruik Heteren als fallback'); lat = 51.95667; lon = 5.75556; return; }
    } else { alert('Geen geldige invoer; gebruik Heteren als fallback'); lat = 51.95667; lon = 5.75556; return; }
  }

  try{
    if(navigator.permissions && navigator.permissions.query){
      try{
        const perm = await navigator.permissions.query({ name: 'geolocation' });
        if(perm.state === 'granted'){
          const pos = await getPosition(); lat = pos.latitude; lon = pos.longitude;
        } else if(perm.state === 'prompt'){
          // This will trigger the permission prompt
          try{ const pos = await getPosition(); lat = pos.latitude; lon = pos.longitude; }
          catch(e){
            // user denied or other error
            const retry = confirm('De app heeft toestemming nodig om automatisch je locatie te gebruiken. Wil je toestemming geven? OK = probeer opnieuw, Annuleer = handmatige invoer/Heteren.');
            if(retry){
              try{ const pos = await getPosition(); lat = pos.latitude; lon = pos.longitude; }
              catch(err){ await manualFallback(); }
            } else {
              await manualFallback();
            }
          }
        } else if(perm.state === 'denied'){
          const go = confirm('Locatie delen is geblokkeerd in je browser. Wil je instructies zien om toestemming te wijzigen? OK = toon instructies, Annuleren = handmatige invoer/Heteren.');
          if(go){
            alert('Open je browserinstellingen en geef locatie toegang voor deze site. Nadat je dat hebt gedaan, klik OK.');
            try{ const pos = await getPosition(); lat = pos.latitude; lon = pos.longitude; }
            catch(e){ await manualFallback(); }
          } else {
            await manualFallback();
          }
        }
      } catch(ePerm){
        // fallback when permissions.query fails
        try{ const pos = await getPosition(); lat = pos.latitude; lon = pos.longitude; }
        catch(e){ await manualFallback(); }
      }
    } else {
      // Permissions API not available; prompt directly
      try{ const pos = await getPosition(); lat = pos.latitude; lon = pos.longitude; }
      catch(e){ await manualFallback(); }
    }
  } catch(e){
    console.warn('Geolocation flow error:', e);
    await manualFallback();
  }

  try{
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
      // No beforeinstallprompt available - show manual instructions
      const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      if(isiOS){
        alert('iOS install: gebruik de deelknop onderaan (Square met pijl) en kies "Zet in beginscherm"');
      } else {
        alert('Android/Chrome: open het menu (⋮) en kies "Add to Home screen" of gebruik de browser UI om toe te voegen.');
      }
    }
  });
}

window.addEventListener('appinstalled', (evt) => {
  console.log('App installed');
  if(installBtn) installBtn.style.display = 'none';
});

// on load
update();

// simple service worker registration for PWA with update flow
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('/sw.js').then(async (reg) => {
    // try update immediately
    try { await reg.update(); } catch(e){}

    if(reg.waiting){
      // ask waiting SW to skipWaiting, then reload when controller changes
      reg.waiting.postMessage({action:'skipWaiting'});
    }

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // reload once when new service worker takes control
      window.location.reload();
    });
  }).catch(()=>{});
}
