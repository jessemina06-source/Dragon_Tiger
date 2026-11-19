/* Dragon Tiger — virtual credits only. All logic runs in the browser. */
'use strict';

const STARTING_BALANCE = 1000;
const BET_AMOUNTS = [10, 50, 100, 250, 500];
const PAYOUT = { dragon: 1, tiger: 1, tie: 8 };      // profit multiplier on a winning bet
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const HISTORY_LIMIT = 120;
const STORE_KEY = 'dragonTiger.v1';

const state = {
  balance: STARTING_BALANCE,
  history: [],
  side: null,
  amount: null,
  roundActive: false,
  roundDone: false,
  tab: 'bigroad',
  sound: true
};

const $ = (id) => document.getElementById(id);
const el = {
  balance: $('balance'), result: $('result'), summary: $('summary'), chips: $('chips'),
  betBtn: $('btn-bet'), newBtn: $('btn-new'), resetBtn: $('btn-reset'), board: $('board'), soundBtn: $('btn-sound'),
  sides: document.querySelectorAll('.side'),
  cards: { dragon: $('card-dragon'), tiger: $('card-tiger') },
  seats: { dragon: $('seat-dragon'), tiger: $('seat-tiger') }
};

/* ---------- Storage ---------- */
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved && Number.isFinite(saved.balance)) {
      state.balance = saved.balance;
      state.history = Array.isArray(saved.history) ? saved.history.slice(0, HISTORY_LIMIT) : [];
      state.sound = saved.sound !== false;
    }
  } catch (e) { /* storage unavailable or corrupt: keep defaults */ }
}
function saveState() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ balance: state.balance, history: state.history, sound: state.sound }));
  } catch (e) { /* ignore */ }
}

/* ---------- Game logic ---------- */

/** Fresh 52-card deck, shuffled with Fisher-Yates so no card repeats within a round. */
function createShuffledDeck() {
  const deck = [];
  for (const suit of SUITS) RANKS.forEach((rank, i) => deck.push({ rank, suit, value: i + 1 }));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** Returns 'dragon', 'tiger' or 'tie' by comparing card values (A=1 ... K=13). */
function determineWinner(dragonCard, tigerCard) {
  if (dragonCard.value > tigerCard.value) return 'dragon';
  if (tigerCard.value > dragonCard.value) return 'tiger';
  return 'tie';
}

/** Credits returned to the player: stake + profit on a win, 0 on a loss. A tie loses Dragon/Tiger bets. */
function calculatePayout(bet, winner, amount) {
  return bet === winner ? amount * (1 + PAYOUT[bet]) : 0;
}

/** Console self-test: run runSelfTests() in dev tools. */
function runSelfTests() {
  const c = (v) => ({ value: v });
  const checks = [
    determineWinner(c(13), c(2)) === 'dragon',
    determineWinner(c(1), c(9)) === 'tiger',
    determineWinner(c(7), c(7)) === 'tie',
    calculatePayout('dragon', 'dragon', 100) === 200,
    calculatePayout('tie', 'tie', 100) === 900,
    calculatePayout('dragon', 'tie', 100) === 0,
    new Set(createShuffledDeck().map((x) => x.rank + x.suit)).size === 52
  ];
  console.log(checks.every(Boolean) ? 'All tests passed' : 'Tests failed', checks);
  return checks.every(Boolean);
}
window.runSelfTests = runSelfTests;

/* ---------- Rendering ---------- */
const fmt = (n) => n.toLocaleString('en-US');
const label = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function showResult(text, kind = '') {
  el.result.textContent = text;
  el.result.className = 'result ' + kind;
}

function renderBalance(animate) {
  el.balance.textContent = fmt(state.balance);
  if (animate) {
    el.balance.parentElement.classList.remove('bump');
    void el.balance.offsetWidth;
    el.balance.parentElement.classList.add('bump');
  }
}

function renderChips() {
  el.chips.innerHTML = '';
  BET_AMOUNTS.forEach((amt) => {
    const b = document.createElement('button');
    b.className = 'chip' + (state.amount === amt ? ' selected' : '');
    b.textContent = amt;
    b.disabled = state.roundActive || amt > state.balance;   // cannot bet more than balance
    b.setAttribute('aria-pressed', state.amount === amt);
    b.addEventListener('click', () => { state.amount = amt; render(); });
    el.chips.appendChild(b);
  });
}

function renderSummary() {
  if (!state.side || !state.amount) { el.summary.textContent = 'No bet selected.'; return; }
  const profit = state.amount * PAYOUT[state.side];
  el.summary.innerHTML = `Bet <b>${fmt(state.amount)}</b> on <b>${label(state.side)}</b> · win <b>+${fmt(profit)}</b> (${fmt(state.amount + profit)} back)`;
}

/** Draws the scoreboard tab that is currently selected (Big Road, Bead Plate or Stats). */
function renderHistory() {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === state.tab));
  const rounds = state.history.slice().reverse();            // oldest first
  if (state.tab === 'stats') { el.board.innerHTML = buildStats(rounds); return; }

  const items = state.tab === 'bead' ? buildBeadPlate(rounds) : buildBigRoad(rounds);
  const cols = Math.max(28, ...items.map((i) => i.col + 2));
  el.board.innerHTML = `<div class="grid" style="min-width:calc(var(--cell) * ${cols})">${items.map((i) => i.html).join('')}</div>`;
  el.board.scrollLeft = el.board.scrollWidth;                 // keep the newest results in view
}

/** Big Road: a streak of the same winner goes down a column (max 6), then turns right. Ties mark the last circle. */
function buildBigRoad(rounds) {
  const items = [], used = new Set();
  let startCol = -1, col = -1, row = 0, last = null;
  rounds.forEach((r) => {
    if (r.winner === 'tie') { if (items.length) items[items.length - 1].ties = true; return; }
    if (r.winner === last) {
      if (row < 5 && !used.has(`${col},${row + 1}`)) row++; else col++;
    } else { startCol = Math.max(startCol, col) + 1; col = startCol; row = 0; }
    last = r.winner;
    used.add(`${col},${row}`);
    items.push({ col, row, winner: r.winner, ties: false });
  });
  items.forEach((i) => { i.html = `<div class="cell" style="grid-column:${i.col + 1};grid-row:${i.row + 1}"><span class="ring ${i.winner}${i.ties ? ' ties' : ''}"></span></div>`; });
  return items;
}

/** Bead Plate: every round in order, filled top to bottom, 6 per column. */
function buildBeadPlate(rounds) {
  return rounds.map((r, n) => {
    const col = Math.floor(n / 6), row = n % 6, letter = r.winner === 'tie' ? 'T' : r.winner === 'dragon' ? 'D' : 'T';
    const text = r.winner === 'tie' ? 'Ti' : letter;
    return { col, html: `<div class="cell" style="grid-column:${col + 1};grid-row:${row + 1}"><span class="bead ${r.winner}" title="${label(r.winner)}">${text}</span></div>` };
  });
}

function buildStats(rounds) {
  const count = (w) => rounds.filter((r) => r.winner === w).length;
  const wins = rounds.filter((r) => r.payout > 0).length;
  const net = rounds.reduce((sum, r) => sum + r.payout - r.amount, 0);
  const cell = (cls, v, t) => `<div class="${cls}"><b>${v}</b><span>${t}</span></div>`;
  return `<div class="stats">${cell('dragon', count('dragon'), 'Dragon')}${cell('tiger', count('tiger'), 'Tiger')}${cell('tie', count('tie'), 'Ties')}` +
    `${cell('', rounds.length, 'Rounds')}${cell('', `${wins} / ${rounds.length - wins}`, 'Your wins / losses')}${cell('', (net > 0 ? '+' : '') + fmt(net), 'Net credits')}</div>`;
}

/* ---------- Sound (generated with the Web Audio API, no audio files needed) ---------- */
let audioCtx = null;
function initAudio() {                                       // called from a click so browsers allow audio
  if (!state.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { audioCtx = null; }
}
function playNote(freq, start, length, type, volume) {
  const osc = audioCtx.createOscillator(), gain = audioCtx.createGain(), t = audioCtx.currentTime + start;
  osc.type = type; osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t); osc.stop(t + length + 0.05);
}
/** Bright rising fanfare for a win, slow falling tones for a loss. */
function playResultSound(won) {
  if (!state.sound || !audioCtx) return;
  if (won) {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => playNote(f, i * 0.12, 0.35, 'triangle', 0.3));
    [523.25, 659.25, 783.99].forEach((f) => playNote(f, 0.55, 0.9, 'triangle', 0.18));
  } else {
    [392, 370, 349.23].forEach((f, i) => playNote(f, i * 0.28, 0.4, 'sawtooth', 0.12));
    playNote(311.13, 0.84, 1.1, 'sawtooth', 0.12);
  }
}

function render() {
  el.sides.forEach((b) => {
    b.classList.toggle('selected', b.dataset.side === state.side);
    b.disabled = state.roundActive;                         // no betting during a round
  });
  renderChips();
  renderSummary();
  const canBet = !state.roundActive && !state.roundDone && state.side && state.amount && state.amount <= state.balance;
  el.betBtn.disabled = !canBet;
  el.newBtn.disabled = state.roundActive || !state.roundDone;
  el.resetBtn.disabled = state.roundActive;
}

/* ---------- Round flow ---------- */
function setCardFace(side, card) {
  const front = el.cards[side].querySelector('.front');
  front.querySelector('.rank').textContent = card.rank;
  front.querySelector('.suit').textContent = card.suit;
  front.classList.toggle('red', card.suit === '♥' || card.suit === '♦');
}

/** Validates the bet, takes the stake, draws two cards and reveals them one after another. */
function placeBet() {
  if (state.roundActive || state.roundDone) return;
  if (!state.side || !state.amount) return showResult('Pick a side and a bet amount first.');
  if (state.amount > state.balance) return showResult('Not enough credits for that bet.', 'lose');

  initAudio();
  state.roundActive = true;
  state.balance -= state.amount;                            // stake leaves the balance up front
  saveState();
  renderBalance(true);
  showResult('Cards are being drawn…');
  render();

  const [dragon, tiger] = createShuffledDeck();             // top two cards of a fresh deck
  setCardFace('dragon', dragon);
  setCardFace('tiger', tiger);
  setTimeout(() => el.cards.dragon.classList.add('flipped'), 400);
  setTimeout(() => el.cards.tiger.classList.add('flipped'), 1400);
  setTimeout(() => finishRound(dragon, tiger), 2300);
}

/** Settles the bet, updates balance and history, and announces the result. */
function finishRound(dragon, tiger) {
  const winner = determineWinner(dragon, tiger);
  const payout = calculatePayout(state.side, winner, state.amount);
  state.balance += payout;

  state.history.unshift({
    dragon: dragon.rank + dragon.suit, tiger: tiger.rank + tiger.suit,
    winner, bet: state.side, amount: state.amount, payout
  });
  state.history = state.history.slice(0, HISTORY_LIMIT);

  if (winner !== 'tie') el.seats[winner].classList.add('winner');
  const winnerText = winner === 'tie' ? 'Tie!' : `${label(winner)} wins!`;
  if (payout > 0) showResult(`${winnerText} You won ${fmt(payout - state.amount)} credits.`, 'win');
  else showResult(`${winnerText} You lost ${fmt(state.amount)} credits.`, 'lose');

  playResultSound(payout > 0);
  state.roundActive = false;
  state.roundDone = true;
  saveState();
  renderBalance(true);
  renderHistory();
  render();
  if (state.balance < BET_AMOUNTS[0]) showResult(`${el.result.textContent} Out of credits — use Reset Balance.`, 'lose');
}

/** Clears the table for the next round, keeping the chosen side and amount if still affordable. */
function newRound() {
  if (state.roundActive) return;
  Object.values(el.cards).forEach((c) => c.classList.remove('flipped'));
  Object.values(el.seats).forEach((s) => s.classList.remove('winner'));
  state.roundDone = false;
  if (state.amount > state.balance) state.amount = null;
  showResult('Place your bet for the next round.');
  render();
}

function resetBalance() {
  if (state.roundActive) return;
  state.balance = STARTING_BALANCE;
  state.history = [];
  state.side = state.amount = null;
  saveState();
  renderBalance(true);
  renderHistory();
  newRound();
  showResult(`Balance reset to ${fmt(STARTING_BALANCE)} credits.`);
}

/* ---------- Events ---------- */
el.sides.forEach((b) => b.addEventListener('click', () => {
  if (state.roundActive) return;
  state.side = b.dataset.side;
  render();
}));
el.betBtn.addEventListener('click', placeBet);
el.newBtn.addEventListener('click', newRound);
el.resetBtn.addEventListener('click', resetBalance);
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => { state.tab = t.dataset.tab; renderHistory(); }));
el.soundBtn.addEventListener('click', () => {
  state.sound = !state.sound;
  el.soundBtn.textContent = 'Sound: ' + (state.sound ? 'On' : 'Off');
  el.soundBtn.setAttribute('aria-pressed', state.sound);
  saveState();
  initAudio();
});

loadState();
el.soundBtn.textContent = 'Sound: ' + (state.sound ? 'On' : 'Off');
renderBalance(false);
renderHistory();
render();
