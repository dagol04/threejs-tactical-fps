// The match, kept in one place: rounds, phases, money and score. A round is a buy
// phase, a live phase, then an end banner; the first team to 5 round wins takes the
// match. Money is earned per round and per kill, and spent in the buy menu.
import { GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';

export const BUY_SECONDS = 12;
export const ROUND_SECONDS = 100;
export const END_SECONDS = 5;
export const WIN_ROUNDS = 5;
export const KILL_REWARD = 300;
export const WIN_REWARD = 325;
export const LOSS_REWARD = 150;
export const PLANT_REWARD = 300;
export const START_MONEY = 800;

export function createMatch() {
  const match = {
    phase: 'buy',
    phaseLeft: BUY_SECONDS,
    round: 1,
    wins: { vanguard: 0, sentinel: 0 },
    money: START_MONEY,
    kills: 0,
    deaths: 0,
    lastReason: '',
    winner: null,
    matchWinner: null,
  };

  return {
    match,
    reset() {
      match.phase = 'buy';
      match.phaseLeft = BUY_SECONDS;
      match.round = 1;
      match.wins.vanguard = 0;
      match.wins.sentinel = 0;
      match.money = START_MONEY;
      match.kills = 0;
      match.deaths = 0;
      match.lastReason = '';
      match.winner = null;
      match.matchWinner = null;
    },
    startLive() {
      match.phase = 'live';
      match.phaseLeft = ROUND_SECONDS;
    },
    endRound(winner, reason) {
      match.phase = 'end';
      match.phaseLeft = END_SECONDS;
      match.winner = winner;
      match.lastReason = reason;
      match.wins[winner] += 1;
      match.money += winner === 'vanguard' ? WIN_REWARD : LOSS_REWARD;
      if (match.wins[winner] >= WIN_ROUNDS) match.matchWinner = winner;
    },
    nextRound() {
      match.round += 1;
      match.phase = 'buy';
      match.phaseLeft = BUY_SECONDS;
      match.winner = null;
      match.lastReason = '';
    },
    addKillReward() {
      match.money += KILL_REWARD;
      match.kills += 1;
    },
    addPlantReward() {
      match.money += PLANT_REWARD;
    },
    onDeath() {
      match.deaths += 1;
    },
    buyGrenade() {
      if (match.money < GRENADE_PRICE) return false;
      match.money -= GRENADE_PRICE;
      return true;
    },
    buyArmor() {
      if (match.money < ARMOR_PRICE) return false;
      match.money -= ARMOR_PRICE;
      return true;
    },
  };
}
