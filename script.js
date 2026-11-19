/* Dragon Tiger — virtual credits only. All logic runs in the browser. */
'use strict';

const STARTING_BALANCE = 1000;
const BET_AMOUNTS = [10, 50, 100, 250, 500];
const PAYOUT = { dragon: 1, tiger: 1, tie: 8 };      // profit multiplier on a winning bet
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const HISTORY_LIMIT = 10;
const STORE_KEY = 'dragonTiger.v1';

const state = {
  balance: STARTING_BALANCE,
  history: [],
  side: null,
  amount: null,
  roundActive: false,
  roundDone: false
};

const $ = (id) => document.getElementById(id);
const el = {
  balance: $('balance'), result: $('result'), summary: $('summary'), chips: $('chips'),
  betBtn: $('btn-bet'), newBtn: $('btn-new'), resetBtn: $('btn-reset'), history: $('history'),
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
    }
  } catch (e) { /* storage unavailable or corrupt: keep defaults */ }
}
function saveState() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ balance: state.balance, history: state.history }));
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

function renderHistory() {
  el.history.innerHTML = '';
  if (!state.history.length) {
    el.history.innerHTML = '<li class="empty"><span>No rounds yet.</span></li>';
    return;
  }
  state.history.forEach((h) => {
    const li = document.createElement('li');
    const net = h.payout - h.amount;
    li.innerHTML = `<span>${h.dragon} vs ${h.tiger} → <b>${label(h.winner)}</b> (bet ${label(h.bet)} ${fmt(h.amount)})</span>` +
      `<span class="${net > 0 ? 'won' : 'lost'}">${net > 0 ? '+' : ''}${fmt(net)}</span>`;
    el.history.appendChild(li);
  });
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

loadState();
renderBalance(false);
renderHistory();
render();
