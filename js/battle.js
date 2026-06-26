// ========================================
// battle.js - 安定版ステートマシンバトル
// フロー: PLAYER_INPUT → PLAYER_ACTION → ENEMY_ACTION → TURN_END → PLAYER_INPUT
// メッセージは自動送り（350ms）。フリーズしない。
// ========================================

class BattleSystem {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.playerMonster = null;
    this.enemyMonster = null;
    this.currentState = null;
    this.turnCount = 0;
    this.messages = [];
    this.messageQueue = [];
    this.isProcessingMessages = false;
    this._waitingForInput = false;
    this.watchdogId = null;
  }

  // ======== バトル開始（即座に、入力待ちなし） ========
  start(playerMonster, enemyMonster) {
    this.reset();
    this.isTrainerBattle = false;
    this.trainerParty = null;
    this.trainerData = null;
    this.trainerPartyIndex = 0;
    this.playerMonster = playerMonster;
    this.enemyMonster = enemyMonster;
    this.game.player.seen.add(enemyMonster.id);
    this.playerMonster.resetStatMods();
    this.enemyMonster.resetStatMods();
    console.log("Battle Start Init");
    this.addMsg(`野生の ${enemyMonster.name} (Lv.${enemyMonster.level}) が現れた！`);
    this.goToPlayerInput();
  }

  // ======== トレーナーバトル開始 ========
  startTrainer(playerMonster, trainerParty, trainerData) {
    this.reset();
    this.isTrainerBattle = true;
    this.trainerParty = trainerParty;
    this.trainerData = trainerData;
    this.trainerPartyIndex = 0;
    this.playerMonster = playerMonster;
    this.enemyMonster = trainerParty[0];
    this.game.player.seen.add(this.enemyMonster.id);
    this.playerMonster.resetStatMods();
    this.enemyMonster.resetStatMods();
    console.log("Trainer Battle Start:", trainerData.name);
    this.addMsg(`${trainerData.name} が勝負を仕掛けてきた！`);
    this.addMsg(`${trainerData.name} は ${this.enemyMonster.name} を繰り出した！`);
    this.goToPlayerInput();
  }

  // ======== ステート遷移 ========
  setState(s) {
    this.currentState = s;
    console.log(`[BATTLE] STATE ${s}`);
    this.resetWatchdog();
  }

  goToPlayerInput() {
    this.turnCount++;
    console.log(`[BATTLE] TURN ${this.turnCount}`);
    this.setState('PLAYER_INPUT');
    this.game.ui.updateBattle();
  }

  // ======== ウォッチドッグ（5秒、PLAYER_INPUT/VICTORY/null除外） ========
  resetWatchdog() {
    clearTimeout(this.watchdogId);
    this.watchdogId = setTimeout(() => {
      // 以下の状態ではフリーズ検出しない
      if (this.currentState === 'PLAYER_INPUT') return;
      if (this.currentState === 'VICTORY') return;
      if (this.currentState === 'DEFEAT') return;
      if (this.currentState === null) return;
      // game側が技習得/進化UIを表示中なら除外
      if (this.game && this.game.isLearnMoveState) return;
      console.error("FORCE RECOVER FROM STUCK STATE:", this.currentState);
      this.messageQueue = [];
      this.isProcessingMessages = false;
      this._waitingForInput = false;
      this.goToPlayerInput();
    }, 5000);
  }

  // ======== メッセージ（自動送り 350ms） ========
  addMsg(m) { this.messages.push(m); }

  showMsgs(msgs, cb) {
    msgs.forEach(m => { this.messages.push(m); this.messageQueue.push(m); });
    this.drainMsgs(cb);
  }

  drainMsgs(cb) {
    this.game.ui.updateBattle();
    if (this.messageQueue.length === 0) {
      this.isProcessingMessages = false;
      if (cb) cb();
      return;
    }
    this.isProcessingMessages = true;
    setTimeout(() => {
      this.messageQueue.shift();
      this.drainMsgs(cb);
    }, 350);
  }

  // advanceMessage kept for compatibility but not needed
  advanceMessage() {}

  // ======== プレイヤー入力 ========
  playerAttack(i) {
    if (this.currentState !== 'PLAYER_INPUT' || this.isProcessingMessages) return;
    const name = this.playerMonster.moves[i];
    const move = GameData.getMove(name);
    if (!move) return;
    this.doTurn('attack', move, null);
  }
  tryCatch(itemId) {
    if (this.currentState !== 'PLAYER_INPUT' || this.isProcessingMessages) return;
    if (this.isTrainerBattle) {
      this.showMsgs(['トレーナーのモンスターには使えない！'], () => this.goToPlayerInput());
      return;
    }
    const item = GameData.getItem(itemId);
    if (!item || !this.game.player.useItem(itemId)) return;
    this.doTurn('catch', null, item);
  }
  useHealItem(itemId) {
    if (this.currentState !== 'PLAYER_INPUT' || this.isProcessingMessages) return;
    const item = GameData.getItem(itemId);
    if (!item || !this.game.player.useItem(itemId)) return;
    this.doTurn('heal', null, item);
  }
  tryRun() {
    if (this.currentState !== 'PLAYER_INPUT' || this.isProcessingMessages) return;
    if (this.isTrainerBattle) {
      this.showMsgs(['トレーナー戦からは逃げられない！'], () => this.goToPlayerInput());
      return;
    }
    this.doTurn('run', null, null);
  }
  switchMonster(index) {
    if (this.currentState !== 'PLAYER_INPUT' || this.isProcessingMessages) return;
    const mon = this.game.player.party[index];
    if (!mon || mon.isFainted() || mon === this.playerMonster) return;
    const wasFainted = this.playerMonster.isFainted();
    this.playerMonster = mon;
    if (wasFainted) {
      this.showMsgs([`ゆけ！ ${mon.name}！`], () => this.goToPlayerInput());
    } else {
      this.setState('PLAYER_ACTION');
      const eMove = this.pickEnemyMove();
      this.showMsgs([`ゆけ！ ${mon.name}！`], () => this.doEnemy(eMove));
    }
  }

  // ======== ターン実行 ========
  doTurn(type, move, item) {
    this.setState('PLAYER_ACTION');
    const pSpd = this.playerMonster.getEffectiveSpeed();
    const eSpd = this.enemyMonster.getEffectiveSpeed();
    const eMove = this.pickEnemyMove();

    if (type === 'run') { this.doRun(eMove); return; }
    if (type === 'catch') { this.doCatch(item, eMove); return; }
    if (type === 'heal') { this.doHeal(item, eMove); return; }

    // 攻撃
    if (pSpd >= eSpd) {
      this.doPlayerThenEnemy(move, eMove);
    } else {
      this.doEnemyThenPlayer(move, eMove);
    }
  }

  // プレイヤー先攻
  doPlayerThenEnemy(pMove, eMove) {
    const msgs = this.calcDmg(this.playerMonster, this.enemyMonster, pMove, true);
    this.showMsgs(msgs, () => {
      if (this.enemyMonster.currentHp <= 0) { this.onEnemyFainted(); return; }
      this.doEnemy(eMove);
    });
  }

  // 敵先攻
  doEnemyThenPlayer(pMove, eMove) {
    this.setState('ENEMY_ACTION');
    const msgs = this.calcDmg(this.enemyMonster, this.playerMonster, eMove, false);
    this.showMsgs(msgs, () => {
      if (this.playerMonster.currentHp <= 0) { this.doDefeat(); return; }
      const msgs2 = this.calcDmg(this.playerMonster, this.enemyMonster, pMove, true);
      this.showMsgs(msgs2, () => {
        if (this.enemyMonster.currentHp <= 0) { this.onEnemyFainted(); return; }
        this.doTurnEnd();
      });
    });
  }

  // 敵行動（後攻）
  doEnemy(eMove) {
    this.setState('ENEMY_ACTION');
    const msgs = this.calcDmg(this.enemyMonster, this.playerMonster, eMove, false);
    this.showMsgs(msgs, () => {
      if (this.playerMonster.currentHp <= 0) { this.doDefeat(); return; }
      this.doTurnEnd();
    });
  }

  doTurnEnd() {
    this.setState('TURN_END');
    console.log("STATE END: TURN_END");
    this.goToPlayerInput();
  }

  // ======== 逃走 ========
  doRun(eMove) {
    if (Math.random() < 0.80) {
      this.showMsgs(['うまく逃げ切れた！'], () => this.finish(true));
    } else {
      this.showMsgs(['逃げられなかった！'], () => this.doEnemy(eMove));
    }
  }

  // ======== 捕獲 ========
  doCatch(item, eMove) {
    const rate = Utils.calcCatchRate(this.enemyMonster.catchRate, this.enemyMonster.currentHp, this.enemyMonster.maxHp, item.captureRate, this.enemyMonster.level);
    if (Math.random() < rate) {
      const result = this.game.player.addMonster(this.enemyMonster);
      const msg = result === 'party' ? `${this.enemyMonster.name} がパーティに加わった！` : `${this.enemyMonster.name} はボックスに送られた！`;
      this.showMsgs([`${item.name} を投げた！`, `✨ ${this.enemyMonster.name} を捕まえた！`, msg], () => this.finish(true));
    } else {
      this.showMsgs([`${item.name} を投げた！`, `${this.enemyMonster.name} はボールから逃げ出した！`], () => this.doEnemy(eMove));
    }
  }

  // ======== 回復 ========
  doHeal(item, eMove) {
    this.playerMonster.heal(item.healAmount);
    this.showMsgs([`${item.name} を使った！ HPが回復した！`], () => this.doEnemy(eMove));
  }

  // ======== 敵モンスター倒れた ========
  onEnemyFainted() {
    if (this.isTrainerBattle && this.trainerParty) {
      // トレーナー戦: 次のモンスターがいるか
      this.trainerPartyIndex++;
      if (this.trainerPartyIndex < this.trainerParty.length) {
        const next = this.trainerParty[this.trainerPartyIndex];
        this.showMsgs([
          `${this.enemyMonster.name} を倒した！`,
          `${this.trainerData.name} は ${next.name} を繰り出した！`
        ], () => {
          this.enemyMonster = next;
          this.enemyMonster.resetStatMods();
          this.game.player.seen.add(this.enemyMonster.id);
          this.goToPlayerInput();
        });
        return;
      }
    }
    // 全滅 or 野生戦 → 勝利
    this.doVictory();
  }

  // ======== 勝利 ========
  doVictory() {
    this.setState('VICTORY');
    const msgs = [`野生の ${this.enemyMonster.name} を倒した！`];
    let exp = Math.floor(this.enemyMonster.expYield * this.enemyMonster.level / 7) * 2;
    if (this.game.player.currentMapId === 'field1') exp = Math.floor(exp * 1.5);
    if (this.playerMonster.level <= 5) exp = Math.floor(exp * 1.3);
    for (const mon of this.game.player.party) {
      if (mon.isFainted()) continue;
      const lvs = mon.gainExp(exp);
      for (const lv of lvs) msgs.push(`🎉 ${mon.name} → Lv.${lv}！`);
      if (mon._lastLearnedMove) {
        msgs.push(`${mon.name} は ${mon._lastLearnedMove} をおぼえた！`);
        mon._lastLearnedMove = null;
      }
    }
    msgs.push(`全員 +${exp} EXP`);
    // ゴールド計算
    let gold;
    if (this.isTrainerBattle && this.trainerData) {
      gold = this.trainerData.reward;
      msgs.push(`${this.trainerData.name} を倒した！`);
      // 倒したトレーナーを記録
      if (!this.game.player.defeatedTrainers) this.game.player.defeatedTrainers = new Set();
      this.game.player.defeatedTrainers.add(this.trainerData.id);
    } else {
      const baseGold = Utils.randInt(60, 150);
      const goldMultiplier = 1 + this.enemyMonster.level * 0.2;
      gold = Math.floor(baseGold * goldMultiplier);
    }
    this.game.player.money += gold;
    msgs.push(`+${gold}G`);
    this.showMsgs(msgs, () => {
      // pendingMoves処理 → 進化チェック → 終了
      this.game.processPendingMoves(() => {
        this.game.processEvolutions(() => {
          this.finish(true);
        });
      });
    });
  }

  // ======== 敗北 ========
  doDefeat() {
    this.setState('DEFEAT');
    if (this.game.player.hasAliveMon()) {
      this.showMsgs([`${this.playerMonster.name} は倒れた！`, '次のモンスターを選ぼう！'], () => this.goToPlayerInput());
    } else {
      const healTown = this.game.player.lastHealTown || 'town1';
      console.log(`[BATTLE] 全滅 → ${healTown} へワープ`);
      this.showMsgs(['全滅した...', '町に戻された...'], () => {
        this.game.player.currentMapId = healTown;
        // 安全なリスポーン位置を計算
        const spawnPos = this.game.getSafeSpawnPosition(healTown);
        this.game.player.x = spawnPos.x;
        this.game.player.y = spawnPos.y;
        this.game.player.healAll();
        this.finish(false);
      });
    }
  }

  finish(won) {
    this.currentState = null;
    clearTimeout(this.watchdogId);
    setTimeout(() => this.game.endBattle(won), 200);
  }

  // ======== 敵技選択 ========
  pickEnemyMove() {
    const valid = this.enemyMonster.moves.filter(m => GameData.getMove(m));
    if (valid.length === 0) return GameData.getMove('たいあたり');
    return GameData.getMove(Utils.randomPick(valid));
  }

  // ======== ダメージ計算 ========
  calcDmg(atk, def, move, isPlayer) {
    const msgs = [];
    if (!move || atk.isFainted()) return msgs;
    const pre = isPlayer ? '' : '野生の';
    msgs.push(`${pre}${atk.name} の ${move.name}！`);

    // 命中
    const acc = Math.min(100, Math.max(10, move.accuracy));
    if (Math.random() * 100 >= acc) { msgs.push('外れた！'); return msgs; }

    // 変化技
    if (move.power === 0) { msgs.push(this.applyEffect(move, atk, def)); return msgs; }

    // タイプ相性（攻撃者の全タイプでSTABチェック）
    const defTypes = def.types || [def.type];
    const atkTypes = atk.types || [atk.type];
    let bonus = GameData.getTypeEffectivenessMulti(move.type, defTypes);
    // STAB: 攻撃者のいずれかのタイプが技タイプと一致
    if (atkTypes.includes(move.type)) bonus *= 1.5;
    console.log("TypeCalc:", move.type, "→", defTypes, "=", bonus.toFixed(2));
    if (bonus === 0) { msgs.push('こうかがないようだ…'); return msgs; }

    // 物理/特殊
    let a, d;
    if (move.category === 'physical') { a = atk.getEffectiveAttack(); d = def.getEffectiveDefense(); }
    else { a = atk.getEffectiveSpAttack ? atk.getEffectiveSpAttack() : atk.getEffectiveAttack(); d = def.getEffectiveSpDefense ? def.getEffectiveSpDefense() : def.getEffectiveDefense(); }

    const dmg = Utils.calcDamage(atk.level, a, d, move.power, bonus);
    def.takeDamage(dmg);
    // タイプ相性メッセージ（倍率から動的判定）
    if (bonus >= 2) msgs.push('こうかはばつぐんだ！');
    else if (bonus > 1 && bonus < 2) msgs.push('こうかはばつぐんだ！');
    else if (bonus > 0 && bonus < 1) msgs.push('あまりきいていない…');
    return msgs;
  }

  calcTypeBonus(moveType, atkType, defTypes) {
    const arr = Array.isArray(defTypes) ? defTypes : [defTypes];
    let b = GameData.getTypeEffectivenessMulti(moveType, arr);
    // STAB: atkTypeは攻撃者の第1タイプ。攻撃者がそのタイプを持っていればボーナス
    if (moveType === atkType) b *= 1.5;
    console.log("TypeCalc:", moveType, "→", arr, "=", b.toFixed(2));
    return b;
  }

  applyEffect(move, atk, def) {
    switch (move.effect) {
      case 'heal': atk.heal(move.healAmount||30); return `${atk.name}のHPが回復！`;
      case 'defenseDown': def.statMods.defense = Math.max(-6, def.statMods.defense-1); return `${def.name}の防御↓`;
      case 'attackUp': atk.statMods.attack = Math.min(6, atk.statMods.attack+1); return `${atk.name}の攻撃↑`;
      case 'speedDown': def.statMods.speed = Math.max(-6, def.statMods.speed-1); return `${def.name}の素早さ↓`;
      case 'accuracyDown': def.statMods.accuracy = Math.max(-6, def.statMods.accuracy-1); return `${def.name}の命中↓`;
      case 'protect': return `${atk.name}は身を守った！`;
      default: return '何も起こらなかった...';
    }
  }
}
