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
    // Day: 08:00 (inclusive) to 20:00 (exclusive)
    const slot = (hour >= 8 && hour < 20) ? 'day' : 'night';
    per[dateKey][slot].push({t, temp:temps[i], prec:precs[i], pprob:pprobs[i], wind:winds[i]});
  });
  const keys = Object.keys(per).slice(0,3);
  const summary = keys.map(k=>{
    const day = per[k].day; const night = per[k].night;
    function summarize(arr){
      if(!arr || arr.length===0) return {min_temp:null, max_temp:null, tot_prec:0, avg_pprob:0, max_wind:0};
      const temps = arr.map(x=>x.temp); const precs = arr.map(x=>x.prec); const pps = arr.map(x=>x.pprob); const winds = arr.map(x=>x.wind);
      return {min_temp: Math.min(...temps), max_temp:Math.max(...temps), tot_prec: precs.reduce((a,b)=>a+b,0), avg_pprob: pps.reduce((a,b)=>a+b,0)/pps.length, max_wind: Math.max(...winds)};
    }
    return {date:k, day:summarize(day), night:summarize(night)};
  });
  return summary;
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

  function isEmptyPeriod(p){
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
  }

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
    // API times are in the requested timezone (Europe/Amsterdam). Build current time string in that timezone.
    function nowInTZString(timeZone){
      const now = new Date();
      const f = new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false });
      const parts = f.formatToParts(now);
      const p = {};
      parts.forEach(x=>p[x.type]=x.value);
      // en-CA gives YYYY-MM-DD, but parts allow us to assemble
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
    const sunrises = daily.sunrise || [];
    const sunsets = daily.sunset || [];

    // helper: compute fructaan units for each hour
    function fructaanForHour(idx){
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
      // find matching daily index
      let dayIndex = null;
      if(daily.time){
        dayIndex = daily.time.indexOf(dateStr);
      }
      if(dayIndex !== -1 && dayIndex !== null && daily.sunrise && daily.sunset){
        // parse sunrise/sunset to datetime
        const sr = new Date(daily.sunrise[dayIndex]);
        const ss = new Date(daily.sunset[dayIndex]);
        // if more than 4 hours after sunrise and more than 4 before sunset
        const fourHours = 4 * 60 * 60 * 1000;
        if(dt - sr > fourHours && ss - dt > fourHours){
          prod += 1;
        }
      }
      return prod - cons; // net change per hour
    }

    // Build summary with fructaan computed per period
    // First compute per-hour net array
    const hourlyNet = times.map((t,i)=>fructaanForHour(i));
    // attach to grouping
    const per = {};
    times.forEach((t, i)=>{
      const dt = new Date(t);
      const dateKey = dt.toISOString().slice(0,10);
      if(!per[dateKey]) per[dateKey] = {day:[], night:[]};
      // Day: 08:00 (inclusive) to 20:00 (exclusive). Night: 20:00 - 08:00
    const hour = dt.getHours();
    const slot = (hour >= 8 && hour < 20) ? 'day' : 'night';
      per[dateKey][slot].push({t, temp:temps[i], prec:precs[i], pprob:pps[i], wind:winds[i], net: hourlyNet[i]});
    });

I need to replace groupDayNight earlier: we already changed it but maybe double. But user's main point: classes and ids mismatched. They now say styling is gone; likely because CSS selectors target .summary-table-table but actual DOM still creates div class 'summary-table' earlier; we replaced with semantic table but current file still had div earlier; but we overwrote with new content that uses table. We wrote full main.js replacement earlier. Now user says classes and ids mismatched and wants fix — they also pasted CSS earlier; now they say classes/ids do not match. Let's inspect generated DOM: user likely sees plain text because table element doesn't have class matching CSS: our CSS uses .summary-table-table; our table has class summary-table-table — correct. But perhaps the inserted DOM uses class 'summary-table-table' but CSS loaded with different version? However user earlier said CSS shows 