// ========================================
// monster.js - モンスタークラス (6stat + 技履歴版)
// ========================================

class Monster {
  constructor(data, level) {
    if (!data || !data.id) {
      console.error("[MONSTER] Invalid Monster Data:", data);
      throw new Error("Invalid Monster Data");
    }
    this.id = data.id;
    this.name = data.name;
    // types配列対応（新旧どちらのフォーマットも受け付ける）
    if (data.types) {
      this.types = data.types;
      this.type = data.types[0];
    } else if (Array.isArray(data.type)) {
      this.types = data.type;
      this.type = data.type[0];
    } else {
      this.types = [data.type];
      this.type = data.type;
    }
    this.level = level || 5;
    // baseStats対応（新旧どちらも対応）
    const bs = data.baseStats || data;
    this.baseHp = bs.hp;
    this.baseAttack = bs.attack;
    this.baseDefense = bs.defense;
    this.baseSpAttack = bs.spAttack || bs.attack;
    this.baseSpDefense = bs.spDefense || bs.defense;
    this.baseSpeed = bs.speed;
    this.moves = data.moves.slice(0, 4);
    this.learnedMoves = data.moves.slice(0, 4); // 全習得履歴
    this.catchRate = data.catchRate;
    this.expYield = data.expYield;
    this.desc = data.desc;

    this.maxHp = this.calcStat(this.baseHp, true);
    this.currentHp = this.maxHp;
    this.attack = this.calcStat(this.baseAttack);
    this.defense = this.calcStat(this.baseDefense);
    this.spAttack = this.calcStat(this.baseSpAttack);
    this.spDefense = this.calcStat(this.baseSpDefense);
    this.speed = this.calcStat(this.baseSpeed);

    this.exp = 0;
    this.expToNext = Utils.expForLevel(this.level + 1);
    this.statMods = { attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0, accuracy: 0 };
    this.hasEvolved = false;
    this.pendingMoves = [];
    if (!this.learnedMoves) this.learnedMoves = this.moves.slice();
  }

  calcStat(base, isHp = false) {
    if (isHp) return Math.floor(((base * 2) * this.level / 100) + this.level + 10);
    return Math.floor(((base * 2) * this.level / 100) + 5);
  }

  recalcStats() {
    const oldMaxHp = this.maxHp;
    this.maxHp = this.calcStat(this.baseHp, true);
    this.currentHp += (this.maxHp - oldMaxHp);
    this.attack = this.calcStat(this.baseAttack);
    this.defense = this.calcStat(this.baseDefense);
    this.spAttack = this.calcStat(this.baseSpAttack);
    this.spDefense = this.calcStat(this.baseSpDefense);
    this.speed = this.calcStat(this.baseSpeed);
    this.expToNext = Utils.expForLevel(this.level + 1);
  }

  gainExp(amount) {
    if (amount <= 0) return [];
    this.exp += amount;
    const leveledUp = [];
    let safe = 0;
    while (this.exp >= this.expToNext && this.level < 100 && safe < 50) {
      this.exp -= this.expToNext;
      this.level++;
      this.recalcStats();
      leveledUp.push(this.level);
      // Lv5刻みで技習得チェック — キューに溜める（自動忘却しない）
      if (this.level % 5 === 0) {
        const newMove = GameData.getLearnMove(this.id, this.level);
        if (newMove && !this.learnedMoves.includes(newMove)) {
          this.learnedMoves.push(newMove);
          if (!this.moves.includes(newMove)) {
            if (this.moves.length < 4) {
              this.moves.push(newMove);
              this._lastLearnedMove = newMove;
            } else {
              // 4技満杯 → pendingMoveに保存（UIで処理）
              if (!this.pendingMoves) this.pendingMoves = [];
              this.pendingMoves.push(newMove);
            }
          }
        }
      }
      // 進化判定（level >= 進化レベルなら必ずフラグ立て）
      if (!this.hasEvolved && this.canEvolve()) {
        this._pendingEvolution = true;
      }
      safe++;
    }
    return leveledUp;
  }

  takeDamage(amount) {
    if (amount < 0) amount = 0;
    this.currentHp = Math.max(0, this.currentHp - amount);
    return this.currentHp <= 0;
  }

  heal(amount) { this.currentHp = Math.min(this.maxHp, this.currentHp + amount); }
  fullHeal() { this.currentHp = this.maxHp; this.resetStatMods(); }
  isFainted() { return this.currentHp <= 0; }
  hpPercent() { return this.maxHp > 0 ? this.currentHp / this.maxHp : 0; }

  resetStatMods() { this.statMods = { attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0, accuracy: 0 }; }

  getModMultiplier(stage) {
    const stages = [0.25, 0.28, 0.33, 0.4, 0.5, 0.66, 1, 1.5, 2, 2.5, 3, 3.5, 4];
    return stages[Utils.clamp(stage + 6, 0, 12)];
  }
  getEffectiveAttack() { return Math.max(1, Math.floor(this.attack * this.getModMultiplier(this.statMods.attack))); }
  getEffectiveDefense() { return Math.max(1, Math.floor(this.defense * this.getModMultiplier(this.statMods.defense))); }
  getEffectiveSpAttack() { return Math.max(1, Math.floor(this.spAttack * this.getModMultiplier(this.statMods.spAttack))); }
  getEffectiveSpDefense() { return Math.max(1, Math.floor(this.spDefense * this.getModMultiplier(this.statMods.spDefense))); }
  getEffectiveSpeed() { return Math.max(1, Math.floor(this.speed * this.getModMultiplier(this.statMods.speed))); }

  // 技習得
  learnMove(moveName) {
    if (!this.learnedMoves.includes(moveName)) this.learnedMoves.push(moveName);
    if (this.moves.includes(moveName)) return 'already';
    if (this.moves.length < 4) { this.moves.push(moveName); return 'learned'; }
    return 'full';
  }

  // 技入れ替え（履歴にある技のみ可能）
  swapMove(currentIndex, newMoveName) {
    if (currentIndex < 0 || currentIndex >= this.moves.length) return false;
    if (!this.learnedMoves.includes(newMoveName)) return false;
    if (this.moves.includes(newMoveName)) return false; // 重複禁止
    this.moves[currentIndex] = newMoveName;
    return true;
  }

  // 忘れている技リスト（learnedMovesにあるがmovesにない）
  getForgottenMoves() {
    return this.learnedMoves.filter(m => !this.moves.includes(m));
  }

  // セーブ
  toSaveData() {
    return {
      id: this.id, level: this.level, currentHp: this.currentHp,
      exp: this.exp, moves: this.moves.slice(),
      learnedMoves: this.learnedMoves.slice()
    };
  }

  // ロード
  static fromSaveData(saveData) {
    const data = GameData.getMonster(saveData.id);
    if (!data) return null;
    const mon = new Monster(data, saveData.level);
    mon.currentHp = saveData.currentHp;
    mon.exp = saveData.exp;
    mon.moves = saveData.moves || mon.moves;
    mon.learnedMoves = saveData.learnedMoves || mon.moves.slice();
    return mon;
  }

  static createWild(monsterId, level) {
    const data = GameData.getMonster(monsterId);
    if (!data) return null;
    return new Monster(data, Math.max(1, level || Utils.randInt(1, 5)));
  }

  // 進化判定（hasEvolvedで2重防止、>= で高レベル対応）
  canEvolve() {
    if (this.hasEvolved) return false;
    const data = GameData.getMonster(this.id);
    if (!data) return false;
    if (!data.evolution) return false;
    if (!data.evolution.to) return false;
    if (this.level < data.evolution.level) return false;
    // 進化先が存在するか確認
    const evoData = GameData.getMonster(data.evolution.to);
    if (!evoData) return false;
    return true;
  }

  // 進化実行（安全版）
  evolve() {
    if (this.hasEvolved) return false;
    const data = GameData.getMonster(this.id);
    if (!data || !data.evolution || !data.evolution.to) return false;
    const evoData = GameData.getMonster(data.evolution.to);
    if (!evoData) return false;

    console.log(`[EVOLVE] ${this.name}(ID${this.id}) → ${evoData.name}(ID${evoData.id})`);

    // HP割合保持
    const hpRatio = this.maxHp > 0 ? this.currentHp / this.maxHp : 1;

    // 進化先データに更新
    this.id = evoData.id;
    this.name = evoData.name;

    // タイプ更新
    if (evoData.types) { this.types = evoData.types; this.type = evoData.types[0]; }
    else if (Array.isArray(evoData.type)) { this.types = evoData.type; this.type = evoData.type[0]; }
    else { this.types = [evoData.type || 'normal']; this.type = this.types[0]; }

    // 種族値更新
    const bs = evoData.baseStats || evoData;
    this.baseHp = bs.hp || this.baseHp;
    this.baseAttack = bs.attack || this.baseAttack;
    this.baseDefense = bs.defense || this.baseDefense;
    this.baseSpAttack = bs.spAttack || this.baseSpAttack;
    this.baseSpDefense = bs.spDefense || this.baseSpDefense;
    this.baseSpeed = bs.speed || this.baseSpeed;
    this.catchRate = evoData.catchRate || this.catchRate;
    this.expYield = evoData.expYield || this.expYield;
    this.desc = evoData.desc || this.desc;

    // ステータス再計算
    this.recalcStats();
    // HP割合維持
    this.currentHp = Math.max(1, Math.floor(this.maxHp * hpRatio));

    // 進化済みフラグ（このバトル中の2重進化防止）
    this.hasEvolved = true;

    return true;
  }
}
