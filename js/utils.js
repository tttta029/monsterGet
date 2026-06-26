// ========================================
// utils.js - ユーティリティ関数
// ========================================

const Utils = {
  randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; },
  chance(p) { return Math.random() < p; },
  randomPick(arr) { return (!arr || arr.length === 0) ? null : arr[Math.floor(Math.random() * arr.length)]; },
  clamp(val, min, max) { return Math.max(min, Math.min(max, val)); },
  sleep(ms) { return new Promise(r => setTimeout(r, Math.min(ms, 5000))); },

  // レベル経験値（Lv10まで25%減）
  expForLevel(level) {
    if (level <= 5) return [0, 0, 6, 12, 20, 30][level] || 30;
    if (level <= 10) return Math.floor(level * level * 4 * 0.75);
    return Math.floor(level * level * 4);
  },

  // ダメージ計算（0ダメージルール対応）
  calcDamage(attackerLevel, atkStat, defStat, movePower, typeBonus) {
    if (movePower === 0) return 0;
    if (typeBonus === 0) return 0;
    if (defStat <= 0) defStat = 1;
    if (atkStat <= 0) atkStat = 1;
    if (attackerLevel <= 0) attackerLevel = 1;
    const base = ((2 * attackerLevel / 5 + 2) * movePower * atkStat / defStat) / 50 + 2;
    const rand = Utils.randInt(85, 100) / 100;
    return Math.max(1, Math.floor(base * typeBonus * rand));
  },

  // 捕獲率計算（HP依存 + ボール補正 + 低HP保証）
  calcCatchRate(monsterCatchRate, currentHp, maxHp, ballRate, enemyLevel) {
    if (maxHp <= 0) maxHp = 1;
    if (currentHp < 0) currentHp = 0;
    const lvl = enemyLevel || 1;

    // HP割合
    const hpRatio = currentHp / maxHp;
    // HP係数: HP低いほど高い (HP0%で3.0, HP100%で0.33)
    const hpFactor = (3 * maxHp - 2 * currentHp) / (3 * maxHp);

    // レベル補正（緩め: Lv50で75%、Lv100で50%）
    const levelPenalty = Math.max(0.5, 1 - lvl * 0.005);

    // 基本捕獲率
    let rate = (monsterCatchRate * hpFactor * ballRate * levelPenalty) / 255;
    // 3倍ブースト
    rate *= 3;

    // ★ ハイパーボール(×3.0) + HP10%以下 → 80%保証
    if (ballRate >= 3.0 && hpRatio <= 0.10) {
      rate = Math.max(rate, 0.80);
    }
    // ★ スーパーボール(×2.0) + HP10%以下 → 50%保証
    else if (ballRate >= 2.0 && hpRatio <= 0.10) {
      rate = Math.max(rate, 0.50);
    }
    // ★ HP20%以下の一般ボーナス
    else if (hpRatio <= 0.20) {
      rate = Math.max(rate, 0.25);
    }

    // 上限95%、最低5%
    return Math.min(0.95, Math.max(0.05, rate));
  }
};
