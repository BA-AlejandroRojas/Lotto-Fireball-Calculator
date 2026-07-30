(function(){
"use strict";

// ============================================================
// PAYOUT TABLES (single source of truth)
// ============================================================
const PAYOUTS = {
  2: { straight: 90, box: {"1,1": {name:"2-Way Box", odds:45}} },
  3: { straight: 900, box: {
        "1,1,1":{name:"6-Way Box",odds:150},
        "2,1":{name:"3-Way Box",odds:300}
      } },
  4: { straight: 9000, box: {
        "1,1,1,1":{name:"24-Way Box",odds:375},
        "2,1,1":{name:"12-Way Box",odds:750},
        "2,2":{name:"6-Way Box",odds:1500},
        "3,1":{name:"4-Way Box",odds:2250}
      } },
  5: { straight: 90000, box: {
        "1,1,1,1,1":{name:"120-Way Box",odds:750},
        "2,1,1,1":{name:"60-Way Box",odds:1500},
        "2,2,1":{name:"30-Way Box",odds:3000},
        "3,1,1":{name:"20-Way Box",odds:4500},
        "3,2":{name:"10-Way Box",odds:9000},
        "4,1":{name:"5-Way Box",odds:18000}
      } }
};

// Fireball payouts (only Straight + the single "all digits different" Box
// category per pick, per the official Fireball Odds table).
const FIREBALL_PAYOUTS = {
  2: { straight: 30, box: {"1,1": {name:"2-Way Box", odds:15}} },
  3: { straight: 240, box: {
        "1,1,1":{name:"6-Way Box",odds:40}
      } },
  4: { straight: 1950, box: {
        "1,1,1,1":{name:"24-Way Box",odds:81.25}
      } },
  5: { straight: 16300, box: {
        "1,1,1,1,1":{name:"120-Way Box",odds:135.8}
      } }
};

function getPattern(str){
  const counts = {};
  for(const ch of str) counts[ch] = (counts[ch]||0) + 1;
  return Object.values(counts).sort((a,b)=>b-a).join(',');
}
function multisetEqual(a,b){
  return [...a].sort().join('') === [...b].sort().join('');
}
function boxCategory(len, str, table){
  const pattern = getPattern(str);
  const boxTable = table[len].box;
  return boxTable[pattern] || null;
}
function generateFireballCombos(winning, fireball){
  const combos = [];
  for(let i=0;i<winning.length;i++){
    const arr = winning.split('');
    arr[i] = fireball;
    combos.push({position:i+1, combo:arr.join('')});
  }
  return combos;
}

function roundMoney(n){
  // Guards against floating-point representation errors (e.g. 1.005*100 = 100.49999999999999)
  // so half-cent winnings round UP as expected (40.235 -> 40.24).
  return Math.round((n * 100) + 1e-7) / 100;
}

function evaluateTicket(t){
  const len = t.draw;
  const totalWager = t.bet;
  const baseWager = roundMoney(totalWager/2);
  const fireballWager = roundMoney(totalWager/2);

  let baseWin=false, baseCategory=null, baseOdds=0;
  if(t.playType==='straight'){
    baseWin = t.player === t.winning;
    if(baseWin){ baseCategory='Straight'; baseOdds=PAYOUTS[len].straight; }
  } else {
    baseWin = multisetEqual(t.player, t.winning);
    if(baseWin){
      const cat = boxCategory(len, t.winning, PAYOUTS);
      if(cat){ baseCategory=cat.name; baseOdds=cat.odds; } else { baseWin=false; }
    }
  }
  const baseWinnings = baseWin ? roundMoney(baseWager*baseOdds) : 0;

  const rawCombos = generateFireballCombos(t.winning, t.fireball);
  const seen = new Map();
  for(const c of rawCombos){ if(!seen.has(c.combo)) seen.set(c.combo, c.position); }
  const dedupedCombos = [...seen.keys()];

  let fireballWin=false, fireballCategory=null, fireballOdds=0, winningCombo=null;
  if(t.playType==='straight'){
    for(const c of dedupedCombos){
      if(t.player === c){ fireballWin=true; winningCombo=c; break; }
    }
    if(fireballWin){ fireballCategory='Straight'; fireballOdds=FIREBALL_PAYOUTS[len].straight; }
  } else {
    for(const c of dedupedCombos){
      if(multisetEqual(t.player, c)){
        const cat = boxCategory(len, c, FIREBALL_PAYOUTS);
        if(cat){ fireballWin=true; winningCombo=c; fireballCategory=cat.name; fireballOdds=cat.odds; break; }
      }
    }
  }
  const fireballWinnings = fireballWin ? roundMoney(fireballWager*fireballOdds) : 0;

  return {
    baseWager, fireballWager, baseWin, baseCategory, baseOdds, baseWinnings,
    rawCombos, dedupedCombos, fireballWin, fireballCategory, fireballOdds, fireballWinnings, winningCombo,
    totalWinnings: roundMoney(baseWinnings+fireballWinnings)
  };
}

// ============================================================
// TICKET STATE / RENDERING
// ============================================================
let ticketSeq = 0;
const tickets = new Map(); // id -> { calculated:boolean }
const PICK_LABELS = {2:'Pick 2', 3:'Pick 3', 4:'Pick 4', 5:'Pick 5'};

function fmtMoney(n){
  return '$' + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function ticketTemplate(id, index){
  return `
  <div class="ticket" data-id="${id}">
    <div class="ticket-head">
      <div class="label"><span class="num">${index}</span> Sub-Ticket ${index}</div>
      <button class="remove-btn" data-action="remove" title="Remove sub-ticket">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
      </button>
    </div>

    <div class="field-grid">
      <div class="field col-1">
        <label>Draw</label>
        <div class="select-wrap">
          <select data-field="draw">
            <option value="2">Pick 2</option>
            <option value="3" selected>Pick 3</option>
            <option value="4">Pick 4</option>
            <option value="5">Pick 5</option>
          </select>
        </div>
      </div>
      <div class="field col-1">
        <label>Play Type</label>
        <div class="select-wrap">
          <select data-field="playType">
            <option value="straight" selected>Straight</option>
            <option value="boxed">Boxed</option>
          </select>
        </div>
      </div>
      <div class="field col-1">
        <label>Player Combo</label>
        <input type="text" data-field="player" inputmode="numeric" autocomplete="off" placeholder="000" maxlength="3">
        <div class="error-msg" data-err="player"></div>
      </div>
      <div class="field col-1">
        <label>Winning Combo</label>
        <input type="text" data-field="winning" inputmode="numeric" autocomplete="off" placeholder="000" maxlength="3">
        <div class="error-msg" data-err="winning"></div>
      </div>
      <div class="field col-1">
        <label>Fireball</label>
        <input type="text" class="fireball-input" data-field="fireball" inputmode="numeric" autocomplete="off" placeholder="0" maxlength="1">
        <div class="error-msg" data-err="fireball"></div>
      </div>
      <div class="field col-1">
        <label>Bet Amount</label>
        <input type="number" data-field="bet" min="0.01" step="0.01" placeholder="1.00">
        <div class="error-msg" data-err="bet"></div>
      </div>
    </div>

    <div class="results" data-role="results"></div>
  </div>`;
}

function el(sel, root){ return (root||document).querySelector(sel); }
function els(sel, root){ return Array.from((root||document).querySelectorAll(sel)); }

function addTicket(){
  ticketSeq += 1;
  const id = 't' + ticketSeq;
  tickets.set(id, { calculated:false });
  const container = el('#tickets-container');
  const wrap = document.createElement('div');
  wrap.innerHTML = ticketTemplate(id, tickets.size);
  const node = wrap.firstElementChild;
  container.appendChild(node);
  bindTicketEvents(node, id);
  applyDrawConstraints(node);
  renumberTickets();
}

function renumberTickets(){
  const nodes = els('.ticket');
  nodes.forEach((node, i) => {
    el('.label', node).innerHTML = `<span class="num">${i+1}</span> Sub-Ticket ${i+1}`;
  });
}

function applyDrawConstraints(node){
  const draw = parseInt(el('[data-field="draw"]', node).value, 10);
  const playerInput = el('[data-field="player"]', node);
  const winningInput = el('[data-field="winning"]', node);
  playerInput.maxLength = draw;
  winningInput.maxLength = draw;
  playerInput.placeholder = '0'.repeat(draw);
  winningInput.placeholder = '0'.repeat(draw);
}

function digitsOnly(str, maxLen){
  return str.replace(/\D/g, '').slice(0, maxLen);
}

function bindTicketEvents(node, id){
  el('[data-action="remove"]', node).addEventListener('click', () => {
    tickets.delete(id);
    node.remove();
    renumberTickets();
    recalcAll(false);
  });

  el('[data-field="draw"]', node).addEventListener('change', () => {
    applyDrawConstraints(node);
    // re-trim inputs if they now exceed new max length
    const draw = parseInt(el('[data-field="draw"]', node).value, 10);
    const playerInput = el('[data-field="player"]', node);
    const winningInput = el('[data-field="winning"]', node);
    playerInput.value = digitsOnly(playerInput.value, draw);
    winningInput.value = digitsOnly(winningInput.value, draw);
    maybeAutoRecalc(node, id);
  });
  el('[data-field="playType"]', node).addEventListener('change', () => maybeAutoRecalc(node, id));

  ['player','winning'].forEach(fieldName => {
    const input = el(`[data-field="${fieldName}"]`, node);
    input.addEventListener('input', () => {
      const draw = parseInt(el('[data-field="draw"]', node).value, 10);
      const cursor = input.selectionStart;
      const cleaned = digitsOnly(input.value, draw);
      input.value = cleaned;
      maybeAutoRecalc(node, id);
    });
  });

  const fbInput = el('[data-field="fireball"]', node);
  fbInput.addEventListener('input', () => {
    fbInput.value = digitsOnly(fbInput.value, 1);
    maybeAutoRecalc(node, id);
  });

  const betInput = el('[data-field="bet"]', node);
  betInput.addEventListener('input', () => maybeAutoRecalc(node, id));

  // copy button delegation happens after render in renderResults
}

function maybeAutoRecalc(node, id){
  const state = tickets.get(id);
  if(state && state.calculated){
    calculateTicket(node, id);
    updateSummary();
  }
}

// ============================================================
// VALIDATION
// ============================================================
function clearErrors(node){
  els('.field', node).forEach(f => f.classList.remove('has-error'));
  els('[data-err]', node).forEach(e => e.textContent = '');
}
function setError(node, fieldName, message){
  const input = el(`[data-field="${fieldName}"]`, node);
  const field = input.closest('.field');
  field.classList.add('has-error');
  el(`[data-err="${fieldName}"]`, node).textContent = message;
}

function readTicket(node){
  return {
    draw: parseInt(el('[data-field="draw"]', node).value, 10),
    playType: el('[data-field="playType"]', node).value,
    player: el('[data-field="player"]', node).value.trim(),
    winning: el('[data-field="winning"]', node).value.trim(),
    fireball: el('[data-field="fireball"]', node).value.trim(),
    bet: parseFloat(el('[data-field="bet"]', node).value)
  };
}

function validateTicket(node, t){
  clearErrors(node);
  let ok = true;
  if(t.player.length !== t.draw || !/^\d+$/.test(t.player)){
    setError(node, 'player', `Enter exactly ${t.draw} digit${t.draw>1?'s':''}.`);
    ok = false;
  }
  if(t.winning.length !== t.draw || !/^\d+$/.test(t.winning)){
    setError(node, 'winning', `Enter exactly ${t.draw} digit${t.draw>1?'s':''}.`);
    ok = false;
  }
  if(t.fireball.length !== 1 || !/^\d$/.test(t.fireball)){
    setError(node, 'fireball', 'Enter one digit (0-9).');
    ok = false;
  }
  if(!(t.bet > 0) || isNaN(t.bet)){
    setError(node, 'bet', 'Enter a valid amount greater than $0.');
    ok = false;
  }
  return ok;
}

// ============================================================
// CANNED RESPONSE
// ============================================================
function drawName(len){ return PICK_LABELS[len]; }
function playTypeName(pt){ return pt === 'straight' ? 'Straight' : 'Boxed'; }

function buildResponse(t, r){
  const draw = drawName(t.draw);
  const pt = playTypeName(t.playType);
  const lines = [];

  lines.push(`Thank you for reaching out about your ${draw} ${pt} play.`);
  lines.push('');
  lines.push('TICKET DETAILS');
  lines.push(`Player Combination: ${t.player}`);
  lines.push(`Winning Combination: ${t.winning}`);
  lines.push(`Fireball Number: ${t.fireball}`);
  lines.push(`Total Wager: ${fmtMoney(t.bet)} (Base ${fmtMoney(r.baseWager)} / Fireball ${fmtMoney(r.fireballWager)})`);
  lines.push('');

  lines.push('BASE TICKET');
  if(r.baseWin){
    lines.push(`Result: WIN \u2014 ${t.player} matched the winning combination ${t.winning} as ${r.baseCategory}.`);
    lines.push(`Odds Used: ${r.baseOdds} to 1 on the ${fmtMoney(r.baseWager)} Base wager.`);
    lines.push(`Base Winnings: ${fmtMoney(r.baseWinnings)}`);
  } else {
    lines.push(`Result: No win \u2014 ${t.player} did not match the winning combination ${t.winning}.`);
    lines.push(`Base Winnings: $0.00`);
  }
  lines.push('');

  lines.push('FIREBALL');
  if(r.fireballWin){
    let posNote = '';
    if(t.playType === 'straight'){
      const posEntry = r.rawCombos.find(c => c.combo === r.winningCombo);
      if(posEntry) posNote = ` (Fireball ${t.fireball} substituted into position ${posEntry.position})`;
    }
    lines.push(`Result: WIN \u2014 ${t.player} matched the Fireball combination ${r.winningCombo}${posNote} as ${r.fireballCategory}.`);
    lines.push(`Odds Used: ${r.fireballOdds} to 1 on the ${fmtMoney(r.fireballWager)} Fireball wager.`);
    lines.push(`Fireball Winnings: ${fmtMoney(r.fireballWinnings)}`);
  } else {
    lines.push(`Result: No win \u2014 none of the Fireball combinations generated from the Fireball number ${t.fireball} matched ${t.player}.`);
    lines.push(`Fireball Winnings: $0.00`);
  }
  lines.push('');

  lines.push(`TOTAL WINNINGS: ${fmtMoney(r.totalWinnings)}`);
  lines.push('');
  lines.push(r.totalWinnings > 0
    ? 'Congratulations on your win!'
    : 'Unfortunately, this play was not a winner this time. Thank you for playing!');

  return lines.join('\n');
}

// ============================================================
// RESULTS RENDERING
// ============================================================
function fbTableRows(t, r){
  return r.rawCombos.map(c => {
    const isWinningCombo = r.fireballWin && c.combo === r.winningCombo;
    return `<tr class="${isWinningCombo ? 'matched' : ''}"><td class="pos">Position ${c.position}</td><td>${c.combo}</td></tr>`;
  }).join('');
}

function renderResults(node, t, r){
  const box = el('[data-role="results"]', node);

  let bannerClass = 'lose', bannerText = 'No Win';
  if(r.baseWin && r.fireballWin){ bannerClass = 'win-both'; bannerText = 'Base Win + Fireball Win'; }
  else if(r.baseWin){ bannerClass = 'win-base'; bannerText = 'Base Win'; }
  else if(r.fireballWin){ bannerClass = 'win-fireball'; bannerText = 'Fireball Win'; }

  const responseText = buildResponse(t, r);

  box.innerHTML = `
    <div class="result-banner ${bannerClass}">${bannerText}</div>
    <div class="cards-row">
      <div class="rcard">
        <h4>Base Ticket</h4>
        <div class="rline"><span class="k">Result</span><span class="v ${r.baseWin?'win':'lose'}">${r.baseWin?'WIN':'LOSS'}</span></div>
        <div class="rline"><span class="k">Base Wager</span><span class="v">${fmtMoney(r.baseWager)}</span></div>
        <div class="rline"><span class="k">Combination</span><span class="v mono">${r.baseCategory ? t.winning : '&mdash;'}</span></div>
        <div class="rline"><span class="k">Category</span><span class="v">${r.baseCategory || '&mdash;'}</span></div>
        <div class="rline"><span class="k">Payout Odds</span><span class="v">${r.baseOdds ? r.baseOdds + ' to 1' : '&mdash;'}</span></div>
        <div class="rline"><span class="k">Base Winnings</span><span class="v gold">${fmtMoney(r.baseWinnings)}</span></div>
      </div>
      <div class="rcard fireball-card">
        <h4>Fireball</h4>
        <div class="rline"><span class="k">Fireball Number</span><span class="v mono">${t.fireball}</span></div>
        <div class="rline"><span class="k">Result</span><span class="v ${r.fireballWin?'win':'lose'}">${r.fireballWin?'WIN':'LOSS'}</span></div>
        <div class="rline"><span class="k">Winning Combo</span><span class="v mono">${r.winningCombo || '&mdash;'}</span></div>
        <div class="rline"><span class="k">Fireball Wager</span><span class="v">${fmtMoney(r.fireballWager)}</span></div>
        <div class="rline"><span class="k">Category</span><span class="v">${r.fireballCategory || '&mdash;'}</span></div>
        <div class="rline"><span class="k">Payout Odds</span><span class="v">${r.fireballOdds ? r.fireballOdds + ' to 1' : '&mdash;'}</span></div>
        <div class="rline"><span class="k">Fireball Winnings</span><span class="v gold">${fmtMoney(r.fireballWinnings)}</span></div>
        <div class="fb-breakdown-label">Fireball Combinations</div>
        <table class="fb-table">
          <thead><tr><th>Position</th><th>Combination</th></tr></thead>
          <tbody>${fbTableRows(t, r)}</tbody>
        </table>
      </div>
    </div>

    <div class="total-strip">
      <div class="tstat"><div class="tk">Total Wager</div><div class="tv">${fmtMoney(t.bet)}</div></div>
      <div class="tstat"><div class="tk">Total Winnings</div><div class="tv ${r.totalWinnings===0?'zero':''}">${fmtMoney(r.totalWinnings)}</div></div>
    </div>

    <div class="response-card">
      <h4>
        <span class="rc-label">
          <span class="rc-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </span>
          Canned Response
        </span>
        <button class="btn-copy" data-action="copy">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy Response
        </button>
      </h4>
      <div class="response-text" data-role="response-text">${responseText}</div>
    </div>
  `;

  box.classList.add('show');

  el('[data-action="copy"]', box).addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const text = el('[data-role="response-text"]', box).textContent;
    navigator.clipboard.writeText(text).then(() => {
      btn.classList.add('copied');
      const label = btn.childNodes[btn.childNodes.length-1];
      const original = btn.innerHTML;
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied`;
      setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = original; }, 1600);
    }).catch(() => {});
  });
}

function calculateTicket(node, id){
  const t = readTicket(node);
  if(!validateTicket(node, t)){
    el('[data-role="results"]', node).classList.remove('show');
    tickets.get(id).calculated = false;
    return null;
  }
  const r = evaluateTicket(t);
  renderResults(node, t, r);
  tickets.get(id).calculated = true;
  tickets.get(id).lastResult = r;
  tickets.get(id).lastTicket = t;
  return r;
}

function recalcAll(scrollCheck){
  const nodes = els('.ticket');
  let allValid = true;
  nodes.forEach(node => {
    const id = node.getAttribute('data-id');
    const r = calculateTicket(node, id);
    if(r === null) allValid = false;
  });
  updateSummary();
  return allValid;
}

function updateSummary(){
  const nodes = els('.ticket');
  let totalWager=0, totalBaseWager=0, totalFbWager=0, totalBaseWin=0, totalFbWin=0, count=0;
  nodes.forEach(node => {
    const id = node.getAttribute('data-id');
    const state = tickets.get(id);
    if(state && state.calculated && state.lastResult){
      const r = state.lastResult, t = state.lastTicket;
      totalWager += t.bet;
      totalBaseWager += r.baseWager;
      totalFbWager += r.fireballWager;
      totalBaseWin += r.baseWinnings;
      totalFbWin += r.fireballWinnings;
      count += 1;
    }
  });
  const summary = el('#summary');
  if(count === 0){ summary.classList.remove('show'); return; }
  summary.classList.add('show');
  el('#sumTotalWager').textContent = fmtMoney(totalWager);
  el('#sumBaseWager').textContent = fmtMoney(totalBaseWager);
  el('#sumFbWager').textContent = fmtMoney(totalFbWager);
  el('#sumBaseWin').textContent = fmtMoney(totalBaseWin);
  el('#sumFbWin').textContent = fmtMoney(totalFbWin);
  el('#sumTotalWin').textContent = fmtMoney(roundMoney(totalBaseWin + totalFbWin));
  el('#sumCount').textContent = String(count);
}

// ============================================================
// TOOLBAR ACTIONS
// ============================================================
el('#addTicketBtn').addEventListener('click', () => addTicket());

el('#calcBtn').addEventListener('click', () => {
  if(tickets.size === 0) addTicket();
  recalcAll(true);
});

let clearConfirming = false;
let clearTimeout = null;
el('#clearAllBtn').addEventListener('click', function(){
  if(!clearConfirming){
    clearConfirming = true;
    this.textContent = 'Confirm Clear All?';
    this.classList.add('confirming');
    clearTimeout = setTimeout(() => {
      clearConfirming = false;
      this.textContent = 'Clear All';
      this.classList.remove('confirming');
    }, 3000);
    return;
  }
  clearTimeout && window.clearTimeout(clearTimeout);
  clearConfirming = false;
  this.textContent = 'Clear All';
  this.classList.remove('confirming');

  tickets.clear();
  ticketSeq = 0;
  el('#tickets-container').innerHTML = '';
  el('#summary').classList.remove('show');
  addTicket();
});

// ============================================================
// THEME TOGGLE
// ============================================================
function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  try{ localStorage.setItem('ba-lotto-theme', theme); }catch(e){}
}
function initTheme(){
  let saved = null;
  try{ saved = localStorage.getItem('ba-lotto-theme'); }catch(e){}
  const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  applyTheme(saved || (prefersLight ? 'light' : 'dark'));
}
el('#themeToggle').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  applyTheme(current === 'light' ? 'dark' : 'light');
});
initTheme();

// ============================================================
// TABS
// ============================================================
els('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.getAttribute('data-tab');
    els('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
    els('.tab-panel').forEach(p => p.classList.toggle('active', p.getAttribute('data-panel') === target));
  });
});

// ============================================================
// PAYLINES TAB
// ============================================================
const PAYLINES_BASE_DATA = [
  {
    pick: 'Pick 2',
    note: 'Two-digit numbers, 00\u201399.',
    rows: [
      {type:'Straight', example:'12', range:'Any 2-digit number from 00 to 99 (exact order).', odds:90, straight:true},
      {type:'2-Way (Box)', example:'12', range:'Any 2-digit number with all different digits (any order).', odds:45}
    ]
  },
  {
    pick: 'Pick 3',
    note: 'Three-digit numbers, 000\u2013999.',
    rows: [
      {type:'Straight', example:'123', range:'Any 3-digit number from 000 to 999 (exact order).', odds:900, straight:true},
      {type:'6-Way (Box)', example:'123', range:'Any 3-digit number with all different digits (any order).', odds:150},
      {type:'3-Way (Box)', example:'112', range:'Any 3-digit number with 2 digits the same (any order).', odds:300}
    ]
  },
  {
    pick: 'Pick 4',
    note: 'Four-digit numbers, 0000\u20139999.',
    rows: [
      {type:'Straight', example:'1234', range:'Any 4-digit number from 0000 to 9999 (exact order).', odds:9000, straight:true},
      {type:'24-Way (Box)', example:'1234', range:'All digits different (any order).', odds:375},
      {type:'12-Way (Box)', example:'1123', range:'2 digits the same (any order).', odds:750},
      {type:'6-Way (Box)', example:'1122', range:'2 sets of 2 digits the same (any order).', odds:1500},
      {type:'4-Way (Box)', example:'1112', range:'3 digits the same (any order).', odds:2250}
    ]
  },
  {
    pick: 'Pick 5',
    note: 'Five-digit numbers, 00000\u201399999.',
    rows: [
      {type:'Straight', example:'12345', range:'Any 5-digit number from 00000 to 99999 (exact order).', odds:90000, straight:true},
      {type:'120-Way (Box)', example:'12345', range:'All digits different (any order).', odds:750},
      {type:'60-Way (Box)', example:'11234', range:'2 digits the same (any order).', odds:1500},
      {type:'30-Way (Box)', example:'11223', range:'2 sets of 2 digits the same (any order).', odds:3000},
      {type:'20-Way (Box)', example:'11123', range:'3 digits the same (any order).', odds:4500},
      {type:'10-Way (Box)', example:'11222', range:'2 sets of 2 and 3 digits the same (any order).', odds:9000},
      {type:'5-Way (Box)', example:'11112', range:'4 digits the same (any order).', odds:18000}
    ]
  }
];

const PAYLINES_FIREBALL_DATA = [
  {
    pick: 'Pick 2',
    note: 'Two-digit numbers \u2014 Fireball Payout for every 1 wagered.',
    rows: [
      {type:'Straight', example:'1-2', range:'Precise Order.', odds:30, straight:true},
      {type:'2-Way Box', example:'1-2', range:'Any Order.', odds:15}
    ]
  },
  {
    pick: 'Pick 3',
    note: 'Three-digit numbers \u2014 Fireball Payout for every 1 wagered.',
    rows: [
      {type:'Straight', example:'1-2-3', range:'Precise Order.', odds:240, straight:true},
      {type:'6-Way Box', example:'1-2-3', range:'Any Order.', odds:40}
    ]
  },
  {
    pick: 'Pick 4',
    note: 'Four-digit numbers \u2014 Fireball Payout for every 1 wagered.',
    rows: [
      {type:'Straight', example:'1-2-3-4', range:'Precise Order.', odds:1950, straight:true},
      {type:'24-Way Box', example:'1-2-3-4', range:'Any Order.', odds:81.25}
    ]
  },
  {
    pick: 'Pick 5',
    note: 'Five-digit numbers \u2014 Fireball Payout for every 1 wagered.',
    rows: [
      {type:'Straight', example:'1-2-3-4-5', range:'Precise Order.', odds:16300, straight:true},
      {type:'120-Way Box', example:'1-2-3-4-5', range:'Any Order.', odds:135.8}
    ]
  }
];

function fmtOdds(n){
  return n.toLocaleString('en-US', {minimumFractionDigits: (n % 1 !== 0) ? 2 : 0, maximumFractionDigits: 2});
}

function paylinesGroupHTML(group, payoutLabel){
  return `
    <div class="paylines-group">
      <h3><span class="pick-tag">${group.pick}</span></h3>
      <div class="group-note">${group.note}</div>
      <div class="table-scroll">
        <table class="paylines-table">
          <thead>
            <tr><th>Combination Type</th><th>Example</th><th>Rule</th><th>${payoutLabel}</th></tr>
          </thead>
          <tbody>
            ${group.rows.map(row => `
              <tr class="${row.straight ? 'pl-straight' : ''}">
                <td class="pl-type">${row.type}</td>
                <td class="pl-example">${row.example}</td>
                <td>${row.range}</td>
                <td class="pl-odds">${fmtOdds(row.odds)} to 1</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function renderPaylines(){
  const container = el('#paylines-container');
  container.innerHTML = `
    <div class="paylines-view active" data-view="base">
      ${PAYLINES_BASE_DATA.map(g => paylinesGroupHTML(g, 'Base Payout')).join('')}
    </div>
    <div class="paylines-view" data-view="fireball">
      ${PAYLINES_FIREBALL_DATA.map(g => paylinesGroupHTML(g, 'Fireball Payout')).join('')}
    </div>
  `;
}
renderPaylines();

els('.subtab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.getAttribute('data-subtab');
    els('.subtab-btn').forEach(b => b.classList.toggle('active', b === btn));
    els('.paylines-view').forEach(v => v.classList.toggle('active', v.getAttribute('data-view') === target));
  });
});

// ============================================================
// INIT
// ============================================================
addTicket();

})();
