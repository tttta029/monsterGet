// ========================================
// player.js - プレイヤー管理
// ========================================

class Player {
  constructor() {
    this.x = 10;
    this.y = 7;
    this.direction = 'down';
    this.party = [];    // モンスターパーティ（最大6体）
    this.box = [];      // モンスターボックス（上限なし）
    this.bag = [];      // アイテム [{id, count}]
    this.money = 3000;
    this.encyclopedia = new Set();
    this.seen = new Set();
    this.currentMapId = 'town1';
    this.lastHealTown = 'town1'; // 最後に回復した町
    this.steps = 0;
  }

  // モンスター追加（パーティ満員ならボックスへ自動送り＋全回復）
  addMonster(monster) {
    this.encyclopedia.add(monster.id);
    if (this.party.length < 6) {
      this.party.push(monster);
      return 'party';
    } else {
      monster.fullHeal(); // ボックス送り時は全回復
      this.box.push(monster);
      return 'box';
    }
  }

  // ボックスからパーティへ引き出す
  withdrawFromBox(boxIndex) {
    if (this.party.length >= 6) return false;
    if (boxIndex < 0 || boxIndex >= this.box.length) return false;
    const mon = this.box.splice(boxIndex, 1)[0];
    this.party.push(mon);
    return true;
  }

  // パーティからボックスへ預ける（全回復して預ける）
  depositToBox(partyIndex) {
    if (this.party.length <= 1) return false;
    if (partyIndex < 0 || partyIndex >= this.party.length) return false;
    const mon = this.party.splice(partyIndex, 1)[0];
    mon.fullHeal(); // ボックス預け時は全回復
    this.box.push(mon);
    return true;
  }

  // アイテム追加
  addItem(itemId, count = 1) {
    const existing = this.bag.find(i => i.id === itemId);
    if (existing) {
      existing.count += count;
    } else {
      this.bag.push({ id: itemId, count });
    }
  }

  // アイテム使用
  useItem(itemId) {
    const existing = this.bag.find(i => i.id === itemId);
    if (existing && existing.count > 0) {
      existing.count--;
      if (existing.count <= 0) {
        this.bag = this.bag.filter(i => i.id !== itemId);
      }
      return true;
    }
    return false;
  }

  // アイテム所持数
  getItemCount(itemId) {
    const existing = this.bag.find(i => i.id === itemId);
    return existing ? existing.count : 0;
  }

  // パーティ全回復
  healAll() {
    this.party.forEach(m => m.fullHeal());
  }

  // 戦闘可能なモンスターがいるか
  hasAliveMon() {
    return this.party.some(m => !m.isFainted());
  }

  // 先頭の戦闘可能モンスター
  getLeadMonster() {
    return this.party.find(m => !m.isFainted());
  }

  // 移動
  move(dx, dy) {
    this.x += dx;
    this.y += dy;
    this.steps++;
    if (dx > 0) this.direction = 'right';
    if (dx < 0) this.direction = 'left';
    if (dy > 0) this.direction = 'down';
    if (dy < 0) this.direction = 'up';
  }
}
