// ========================================
// ui.js - ダブルスクリーンUI
// 上画面: マップ/バトルシーン表示
// 下画面: パーティ情報/コマンドUI
// ========================================

// 共通タイプ表示関数（2タイプ対応）
function formatTypes(types) {
  if (!types || types.length === 0) return '';
  return types.filter(Boolean).map(t => {
    const name = GameData.typeNames[t] || t;
    return `<span class="type-badge type-${t}">${name}</span>`;
  }).join(' ');
}

function formatTypeIcons(types) {
  if (!types || types.length === 0) return '?';
  return types.filter(Boolean).map(t => GameData.typeIcons[t] || '?').join('');
}

// 技情報HTML生成
function getMoveInfoHtml(moveName) {
  const md = GameData.getMove(moveName);
  if (!md) return '';
  const tn = GameData.typeNames[md.type] || md.type;
  const cat = md.category === 'physical' ? 'ぶつり' : md.category === 'special' ? 'とくしゅ' : 'へんか';
  const pw = md.power > 0 ? md.power : '—';
  return `<div style="margin-top:8px;padding:8px;background:#1a1a2a;border:1px solid #444;border-radius:6px;font-size:11px;">
    <div><strong>${md.name}</strong></div>
    <div>タイプ: <span class="type-badge type-${md.type}">${tn}</span> | 分類: ${cat}</div>
    <div>威力: ${pw} | 命中: ${md.accuracy}</div>
    <div style="color:#aaa;margin-top:2px;">${md.desc}</div>
  </div>`;
}

class GameUI {
  constructor(game) {
    this.game = game;
    this.dialogBox = document.getElementById('dialog-box');
    this.menuOverlay = document.getElementById('menu-overlay');
    this.hud = document.getElementById('hud');
    this.minimapInfo = document.getElementById('minimap-info');
    this.battleSceneArea = document.getElementById('battle-scene-area');
    this.partyPanel = document.getElementById('party-panel');
    this.battleCmdPanel = document.getElementById('battle-commands-panel');
    this.upperOverlay = document.getElementById('upper-overlay');
    console.log("UI Loaded", {
      dialogBox: !!this.dialogBox,
      menuOverlay: !!this.menuOverlay,
      battleSceneArea: !!this.battleSceneArea,
      partyPanel: !!this.partyPanel,
      battleCmdPanel: !!this.battleCmdPanel
    });
  }

  // ===== HUD更新 =====
  updateHUD() {
    const p = this.game.player;
    const lead = p.getLeadMonster();
    const map = GameData.getMap(p.currentMapId);
    const onGrass = this.game.mapRenderer.isGrass(p.x, p.y);
    const gi = onGrass ? ' <span style="color:#8f8">🌿</span>' : '';
    this.hud.innerHTML = `💰${p.money}G | 📖${p.encyclopedia.size}/${GameData.monsters.length}`;
    this.minimapInfo.innerHTML = `📍${map?map.name:''}${gi} | WASD E M`;
    this.updatePartyPanel();
  }

  // ===== 下画面: パーティパネル（6スロット固定） =====
  updatePartyPanel() {
    if (this.game.state === 'battle') return;
    this.partyPanel.style.display = 'grid';
    this.battleCmdPanel.classList.remove('show');
    const party = this.game.player.party;
    let slots = '';
    for (let i = 0; i < 6; i++) {
      const m = party[i];
      if (m) {
        const icon = formatTypeIcons(m.types);
        const hpPct = Math.max(0, m.hpPercent() * 100);
        const hpCls = hpPct <= 25 ? 'low' : hpPct <= 50 ? 'mid' : '';
        slots += `<div class="party-slot filled">
          <span class="party-slot-icon">${icon}</span>
          <div class="party-slot-info">
            <div class="party-slot-name">${m.name}</div>
            <div class="party-slot-lv">Lv.${m.level}</div>
            <div class="hp-bar-container"><div class="hp-bar ${hpCls}" style="width:${hpPct}%"></div></div>
            <div class="party-slot-hp">HP ${m.currentHp}/${m.maxHp}</div>
          </div>
        </div>`;
      } else {
        slots += `<div class="party-slot empty"><span class="party-slot-icon" style="opacity:0.3">—</span><div class="party-slot-info"><div class="party-slot-name" style="color:#555">空きスロット</div></div></div>`;
      }
    }
    this.partyPanel.innerHTML = slots;
  }

  // ===== ダイアログ =====
  showDialog(text, callback) {
    this.dialogBox.innerHTML = text + '<br><span style="color:#666;font-size:11px">[Enter]</span>';
    this.dialogBox.classList.add('show');
    this.game.dialogCallback = callback || null;
  }
  hideDialog() {
    this.dialogBox.classList.remove('show');
    if (this.game.dialogCallback) { this.game.dialogCallback(); this.game.dialogCallback = null; }
  }

  // ===== バトルUI（上画面=シーン、下画面=コマンド） =====
  showBattle() {
    console.log("[UI] showBattle called");
    if (this.battleSceneArea) this.battleSceneArea.classList.add('show');
    if (this.partyPanel) this.partyPanel.style.display = 'none';
    if (this.battleCmdPanel) this.battleCmdPanel.classList.add('show');
    this.updateBattle();
  }
  hideBattle() {
    console.log("[UI] hideBattle called");
    if (this.battleSceneArea) { this.battleSceneArea.classList.remove('show'); this.battleSceneArea.innerHTML = ''; }
    if (this.battleCmdPanel) { this.battleCmdPanel.classList.remove('show'); this.battleCmdPanel.innerHTML = ''; }
    if (this.partyPanel) this.partyPanel.style.display = 'grid';
  }

  updateBattle() {
    const b = this.game.battle;
    if (!b || !b.playerMonster || !b.enemyMonster) return;
    if (b.currentState === null) return;
    if (!this.battleSceneArea || !this.battleCmdPanel) return;
    this.renderBattleUpperScreen(b);
    this.renderBattleLowerScreen(b);
    // カーソル位置を維持して復元（リセットしない）
    if (this.game.restoreCursor) this.game.restoreCursor();
  }

  renderBattleUpperScreen(b) {
    console.log("[UI] Battle Render Applied");
    const pMon = b.playerMonster, eMon = b.enemyMonster;
    const pHp = Math.max(0, pMon.hpPercent()*100), eHp = Math.max(0, eMon.hpPercent()*100);
    const pCls = pHp<=25?'low':pHp<=50?'mid':'', eCls = eHp<=25?'low':eHp<=50?'mid':'';
    const eC = GameData.typeColors[eMon.type] || '#999', pC = GameData.typeColors[pMon.type] || '#999';
    const eI = formatTypeIcons(eMon.types), pI = formatTypeIcons(pMon.types);
    const eTypes = formatTypes(eMon.types), pTypes = formatTypes(pMon.types);
    const msg = b.messages.slice(-2).join('<br>');

    // 敵の捕獲済みチェック
    const isCaptured = this.game.player.encyclopedia.has(eMon.id);
    const captureCheck = isCaptured ? ' <span style="color:#4caf50;font-weight:bold;">✓</span>' : '';

    this.battleSceneArea.innerHTML = `
      <div style="position:absolute;top:20px;right:40px;display:flex;align-items:center;gap:10px;">
        <div class="monster-sprite" style="background:${eC}20;border-color:${eC}">${eI}</div>
        <div class="monster-info">
          <div class="monster-name">${eMon.name}${captureCheck}</div>
          <div style="margin:2px 0;">${eTypes}</div>
          <div class="monster-level">Lv.${eMon.level}</div>
          <div class="hp-bar-container"><div class="hp-bar ${eCls}" style="width:${eHp}%"></div></div>
          <div class="hp-text">HP ${eMon.currentHp}/${eMon.maxHp}</div>
        </div>
      </div>
      <div style="position:absolute;bottom:60px;left:40px;display:flex;align-items:center;gap:10px;">
        <div class="monster-sprite" style="background:${pC}20;border-color:${pC}">${pI}</div>
        <div class="monster-info">
          <div class="monster-name">${pMon.name}</div>
          <div style="margin:2px 0;">${pTypes}</div>
          <div class="monster-level">Lv.${pMon.level} EXP:${pMon.exp}/${pMon.expToNext}</div>
          <div class="hp-bar-container"><div class="hp-bar ${pCls}" style="width:${pHp}%"></div></div>
          <div class="hp-text">HP ${pMon.currentHp}/${pMon.maxHp}</div>
        </div>
      </div>
      ${this.renderPartyIndicators()}
      <div class="battle-msg-upper">${msg}</div>`;
  }

  // 残り手持ち数インジケーター
  renderPartyIndicators() {
    const b = this.game.battle;
    // プレイヤー側
    const pParty = this.game.player.party;
    const pAlive = pParty.filter(m => !m.isFainted()).length;
    const pTotal = pParty.length;
    const pDots = Array.from({length: pTotal}, (_, i) => i < pAlive ? '●' : '○').join('');

    // 敵側（トレーナー戦のみ）
    let eDots = '';
    if (b.isTrainerBattle && b.trainerParty) {
      const eAlive = b.trainerParty.filter(m => !m.isFainted()).length;
      const eTotal = b.trainerParty.length;
      eDots = Array.from({length: eTotal}, (_, i) => i < eAlive ? '●' : '○').join('');
    }

    return `<div style="position:absolute;top:4px;left:50%;transform:translateX(-50%);font-size:10px;color:#aaa;display:flex;gap:20px;">
      <span style="color:#4caf50;">自分 ${pDots} ${pAlive}/${pTotal}</span>
      ${eDots ? `<span style="color:#f44336;">相手 ${eDots}</span>` : ''}
    </div>`;
  }

  renderBattleLowerScreen(b) {
    const showCmd = b.currentState === 'PLAYER_INPUT' && !b.isProcessingMessages;
    if (showCmd) {
      const pMon = b.playerMonster;
      if (pMon.isFainted() && this.game.player.hasAliveMon()) {
        this.showSwitchMenu();
      } else {
        // 常にコマンド選択画面から開始
        this.battleCmdPanel.innerHTML = this.renderBattleCommands(b);
      }
    } else {
      const msg = b.messages.slice(-3).join('<br>');
      this.battleCmdPanel.innerHTML = `<div class="battle-msg">${msg}</div>`;
    }
  }

  renderBattleCommands(b) {
    const isTrainer = b.isTrainerBattle;
    // トレーナー戦: にげる無効、アイテムは回復のみ
    const runBtn = isTrainer
      ? `<button class="battle-btn" disabled style="opacity:0.4;">🚫 にげられない</button>`
      : `<button class="battle-btn" onclick="game.battleAction('run')">[R] 🏃 にげる</button>`;
    const itemBtn = isTrainer
      ? `<button class="battle-btn" onclick="game.ui.showItemMenuTrainer()">💊 どうぐ</button>`
      : `<button class="battle-btn" onclick="game.ui.showItemMenu()">🎒 アイテム</button>`;

    return `<div class="battle-commands" style="grid-template-columns:1fr 1fr;max-width:360px;margin:auto;">
      <button class="battle-btn" onclick="game.ui.showFightMenu()">⚔️ たたかう</button>
      ${itemBtn}
      <button class="battle-btn" onclick="game.ui.showSwitchMenu()">🔄 こうたい</button>
      ${runBtn}
    </div>`;
  }

  // たたかう→技一覧（技情報付き）
  showFightMenu() {
    const b = this.game.battle;
    if (!b || b.currentState !== 'PLAYER_INPUT') return;
    const pMon = b.playerMonster;
    let btns = pMon.moves.map((m, i) => {
      const md = GameData.getMove(m);
      const pw = md && md.power > 0 ? `威力${md.power}` : '変化';
      const tp = md ? `<span class="type-badge type-${md.type}">${GameData.typeNames[md.type]||md.type}</span>` : '';
      return `<button class="battle-btn" onclick="game.battleAction('attack',${i})" onmouseover="game.ui.showMoveTooltip('${m}')">[${i+1}] ${m} ${tp} ${pw}</button>`;
    }).join('');
    this.battleCmdPanel.innerHTML = `<div class="cmd-section-title">⚔️ 技を選択 (1〜4キー)</div>
      <div class="battle-commands">${btns}</div>
      <button class="battle-btn" style="margin-top:6px;" onclick="game.ui.updateBattle()">← もどる</button>
      <div id="move-tooltip" style="margin-top:8px;padding:8px;background:#1a1a2a;border:1px solid #444;border-radius:6px;font-size:11px;min-height:50px;"></div>`;
  }

  // アイテム一覧
  showItemMenu() {
    const b = this.game.battle;
    if (!b || b.currentState !== 'PLAYER_INPUT') return;
    const capItems = this.game.player.bag.filter(x=>{const it=GameData.getItem(x.id);return it&&it.type==='capture';});
    const healItems = this.game.player.bag.filter(x=>{const it=GameData.getItem(x.id);return it&&it.type==='heal';});
    let btns = '';
    capItems.forEach(x=>{const it=GameData.getItem(x.id);btns+=`<button class="battle-btn" onclick="game.battleAction('catch',${x.id})">🔵 ${it.name} x${x.count}</button>`;});
    healItems.forEach(x=>{const it=GameData.getItem(x.id);btns+=`<button class="battle-btn" onclick="game.battleAction('heal',${x.id})">💊 ${it.name} x${x.count}</button>`;});
    if (!btns) btns = '<div style="color:#888;padding:8px;">アイテムがありません</div>';
    this.battleCmdPanel.innerHTML = `<div class="cmd-section-title">🎒 アイテムを選択</div>
      <div class="battle-commands">${btns}</div>
      <button class="battle-btn" style="margin-top:6px;" onclick="game.ui.updateBattle()">← もどる</button>`;
  }

  // トレーナー戦用アイテムメニュー（回復のみ、ボール禁止）
  showItemMenuTrainer() {
    const b = this.game.battle;
    if (!b || b.currentState !== 'PLAYER_INPUT') return;
    const healItems = this.game.player.bag.filter(x=>{const it=GameData.getItem(x.id);return it&&it.type==='heal';});
    let btns = '';
    healItems.forEach(x=>{const it=GameData.getItem(x.id);btns+=`<button class="battle-btn" onclick="game.battleAction('heal',${x.id})">💊 ${it.name} x${x.count}</button>`;});
    if (!btns) btns = '<div style="color:#888;padding:8px;">回復アイテムがありません</div>';
    this.battleCmdPanel.innerHTML = `<div class="cmd-section-title">💊 どうぐ（トレーナー戦：ボール使用不可）</div>
      <div class="battle-commands">${btns}</div>
      <button class="battle-btn" style="margin-top:6px;" onclick="game.ui.updateBattle()">← もどる</button>`;
  }

  // こうたい（6スロット表示）
  showSwitchMenu() {
    const b = this.game.battle;
    if (!b || b.currentState !== 'PLAYER_INPUT') return;
    const party = this.game.player.party;
    let btns = '';
    for (let i = 0; i < 6; i++) {
      const m = party[i];
      if (!m) { btns += `<button class="battle-btn" disabled>— 空き —</button>`; continue; }
      if (m.isFainted()) { btns += `<button class="battle-btn" disabled>${m.name}(瀕死)</button>`; continue; }
      if (m === b.playerMonster) { btns += `<button class="battle-btn" disabled>${m.name}(戦闘中)</button>`; continue; }
      btns += `<button class="battle-btn" onclick="game.battleAction('switch',${i})">${m.name} Lv.${m.level} HP:${m.currentHp}/${m.maxHp}</button>`;
    }
    this.battleCmdPanel.innerHTML = `<div class="cmd-section-title">🔄 交代先を選択（1ターン消費）</div>
      <div class="battle-commands">${btns}</div>
      <button class="battle-btn" style="margin-top:6px;" onclick="game.ui.updateBattle()">← もどる</button>`;
  }

  showPartySwitch() { this.updateBattle(); }

  // 技情報HTML（インスタンスメソッド）
  getMoveInfoHtml(moveName) { return getMoveInfoHtml(moveName); }

  // ツールチップ表示
  showMoveTooltip(moveName) {
    const el = document.getElementById('move-tooltip');
    if (!el) return;
    const md = GameData.getMove(moveName);
    if (!md) { el.innerHTML = ''; return; }
    const tn = GameData.typeNames[md.type] || md.type;
    const cat = md.category === 'physical' ? 'ぶつり' : md.category === 'special' ? 'とくしゅ' : 'へんか';
    const pw = md.power > 0 ? md.power : '—';
    el.innerHTML = `<strong>${md.name}</strong> <span class="type-badge type-${md.type}">${tn}</span> ${cat}<br>威力:${pw} 命中:${md.accuracy}<br><span style="color:#aaa">${md.desc}</span>`;
  }

  // ===== メニュー =====
  showMenu(type) {
    this.menuOverlay.classList.add('show');
    switch(type){
      case 'main': this.renderMainMenu(); break;
      case 'party': this.renderPartyMenu(); break;
      case 'bag': this.renderBagMenu(); break;
      case 'encyclopedia': this.renderEncyclopedia(); break;
      case 'typeChart': this.renderTypeChart(); break;
      case 'worldMap': this.renderWorldMap(); break;
      case 'shop': this.renderShop(); break;
      case 'box': this.renderBox(); break;
    }
  }
  hideMenu() { this.menuOverlay.classList.remove('show'); }

  renderMainMenu() {
    console.log("[UI] Menu Render Check");
    this.menuOverlay.innerHTML = `<span class="close-btn" onclick="game.closeMenu()">✕</span>
      <div class="menu-title">メニュー</div><div class="menu-list">
      <div class="menu-item" onclick="game.openMenu('party')">🐾 パーティ</div>
      <div class="menu-item" onclick="game.openMenu('bag')">🎒 バッグ</div>
      <div class="menu-item" onclick="game.openMenu('encyclopedia')">📖 図鑑</div>
      <div class="menu-item" onclick="game.openMenu('worldMap')">🗺️ マップ</div>
      <div class="menu-item" onclick="game.openMenu('typeChart')">⚔️ タイプ相性表</div>
      <div class="menu-item" onclick="game.saveGameManual()">💾 セーブ</div>
      <div class="menu-item" onclick="game.closeMenu()">❌ 閉じる</div></div>`;
  }

  renderPartyMenu() {
    const party = this.game.player.party;
    let html = party.map((m,i)=>{
      const icon = formatTypeIcons(m.types);
      const typeBadges = formatTypes(m.types);
      const up = i>0?`<button class="battle-btn" style="padding:3px 6px;font-size:10px;" onclick="game.swapParty(${i},${i-1})">▲</button>`:'';
      const dn = i<party.length-1?`<button class="battle-btn" style="padding:3px 6px;font-size:10px;" onclick="game.swapParty(${i},${i+1})">▼</button>`:'';
      return `<div class="menu-item"><div style="display:flex;align-items:center;gap:8px;">
        <div style="display:flex;flex-direction:column;gap:1px;">${up}${dn}</div>
        <span style="font-size:20px">${icon}</span>
        <div style="flex:1"><div><strong>${i+1}.${m.name}</strong> Lv.${m.level} ${typeBadges}${i===0?' <span style="color:#ffcc00;font-size:9px;">★先頭</span>':''}</div>
        <div class="party-stats">HP:${m.currentHp}/${m.maxHp} | 技: ${m.moves.join(', ')}</div></div>
        <button class="battle-btn" style="padding:4px 8px;font-size:10px;" onclick="game.ui.showMonsterDetail(${i})">詳細</button>
      </div></div>`;
    }).join('');
    this.menuOverlay.innerHTML = `<span class="close-btn" onclick="game.openMenu('main')">←</span>
      <div class="menu-title">🐾 パーティ(${party.length}/6)</div>
      <div style="font-size:10px;color:#666;text-align:center;margin-bottom:6px;">▲▼並替 | 詳細でステータス確認</div>
      <div class="menu-list">${html||'<div class="menu-item">なし</div>'}</div>`;
  }

  // モンスター詳細ステータス
  showMonsterDetail(index) {
    console.log("[UI] Party Stats Loaded");
    const m = this.game.player.party[index];
    if (!m) return;
    const icon = formatTypeIcons(m.types);
    const typeBadges = formatTypes(m.types);
    this.menuOverlay.innerHTML = `<span class="close-btn" onclick="game.ui.renderPartyMenu()">←</span>
      <div class="menu-title">${icon} ${m.name} Lv.${m.level}</div>
      <div style="text-align:center;margin-bottom:12px;">${typeBadges}</div>
      <div class="menu-list">
        <div class="menu-item"><strong>HP</strong>: ${m.currentHp} / ${m.maxHp}</div>
        <div class="menu-item"><strong>こうげき</strong>: ${m.attack || 0}</div>
        <div class="menu-item"><strong>ぼうぎょ</strong>: ${m.defense || 0}</div>
        <div class="menu-item"><strong>とくこう</strong>: ${m.spAttack || 0}</div>
        <div class="menu-item"><strong>とくぼう</strong>: ${m.spDefense || 0}</div>
        <div class="menu-item"><strong>すばやさ</strong>: ${m.speed || 0}</div>
        <div class="menu-item" style="margin-top:8px;"><strong>技</strong>: ${m.moves.join(' / ')}</div>
        <div class="menu-item"><strong>EXP</strong>: ${m.exp} / ${m.expToNext}</div>
        <div class="menu-item" style="margin-top:8px;cursor:pointer;color:#88aaff;" onclick="game.ui.showMoveManager(${index})">🔧 技管理（入れ替え）</div>
      </div>`;
  }

  // 技管理画面
  showMoveManager(partyIndex) {
    const m = this.game.player.party[partyIndex];
    if (!m) return;
    const forgotten = m.getForgottenMoves();
    const icon = formatTypeIcons(m.types);

    let currentHtml = m.moves.map((mv, i) => {
      const md = GameData.getMove(mv);
      const info = md ? `(${GameData.typeNames[md.type]||md.type} ${md.power>0?'威力'+md.power:'変化'})` : '';
      return `<div class="menu-item"><strong>${i+1}.</strong> ${mv} ${info}</div>`;
    }).join('');

    let forgottenHtml = '';
    if (forgotten.length > 0) {
      forgottenHtml = forgotten.map(mv => {
        const md = GameData.getMove(mv);
        const info = md ? `(${GameData.typeNames[md.type]||md.type} ${md.power>0?'威力'+md.power:'変化'})` : '';
        return `<div class="menu-item" style="cursor:pointer;color:#8f8;" onclick="game.ui.showSwapTarget(${partyIndex},'${mv}')">🔄 ${mv} ${info}</div>`;
      }).join('');
    } else {
      forgottenHtml = '<div class="menu-item" style="color:#666;">忘れた技はありません</div>';
    }

    this.menuOverlay.innerHTML = `<span class="close-btn" onclick="game.ui.showMonsterDetail(${partyIndex})">←</span>
      <div class="menu-title">${icon} ${m.name} 技管理</div>
      <div style="color:#aaa;font-size:11px;text-align:center;margin-bottom:8px;">覚えた技の中から入れ替え可能</div>
      <div class="menu-list">
        <div style="color:#ffcc00;font-size:12px;padding:4px 10px;">現在の技</div>
        ${currentHtml}
        <div style="color:#88ff88;font-size:12px;padding:4px 10px;margin-top:8px;">忘れた技（再セット可能）</div>
        ${forgottenHtml}
      </div>`;
  }

  // 入れ替え先選択
  showSwapTarget(partyIndex, newMove) {
    const m = this.game.player.party[partyIndex];
    if (!m) return;
    const icon = formatTypeIcons(m.types);
    const md = GameData.getMove(newMove);
    const newInfo = md ? `(${GameData.typeNames[md.type]||md.type} ${md.power>0?'威力'+md.power:'変化'})` : '';

    let btns = m.moves.map((mv, i) => {
      const mdi = GameData.getMove(mv);
      const info = mdi ? `(${GameData.typeNames[mdi.type]||mdi.type} ${mdi.power>0?'威力'+mdi.power:'変化'})` : '';
      return `<div class="menu-item" style="cursor:pointer;" onclick="game.swapMonsterMove(${partyIndex},${i},'${newMove}')">${i+1}. ${mv} ${info} → 忘れる</div>`;
    }).join('');

    this.menuOverlay.innerHTML = `<span class="close-btn" onclick="game.ui.showMoveManager(${partyIndex})">←</span>
      <div class="menu-title">${icon} どの技を忘れますか？</div>
      <div style="text-align:center;color:#8f8;margin-bottom:8px;">新しい技: ${newMove} ${newInfo}</div>
      <div class="menu-list">${btns}</div>`;
  }

  renderBagMenu() {
    const bag = this.game.player.bag;
    let html = bag.map(b=>{const it=GameData.getItem(b.id);if(!it)return '';const ic=it.type==='capture'?'🔵':'💊';
      return `<div class="menu-item"><div class="shop-item"><span>${ic} ${it.name} x${b.count}</span><span style="color:#888">${it.desc}</span></div></div>`;}).join('');
    this.menuOverlay.innerHTML = `<span class="close-btn" onclick="game.openMenu('main')">←</span>
      <div class="menu-title">🎒 バッグ(💰${this.game.player.money}G)</div>
      <div class="menu-list">${html||'<div class="menu-item">空</div>'}</div>`;
  }

  renderEncyclopedia() {
    const entries = GameData.monsters.map(m=>{
      const d=this.game.player.encyclopedia.has(m.id);
      const s=this.game.player.seen.has(m.id);
      const mTypes = Array.isArray(m.type) ? m.type : [m.type];
      const icon=formatTypeIcons(mTypes);
      const color=GameData.typeColors[mTypes[0]]||'#999';
      const typeBadges = formatTypes(mTypes);
      const check = d ? ' ✓' : '';
      if(d) return `<div class="encyclopedia-entry"><div class="entry-icon" style="background:${color}30;border-color:${color}">${icon}</div><div class="entry-details"><div class="entry-name">No.${m.id} ${m.name}${check} ${typeBadges}</div><div class="entry-desc">${m.desc}</div></div></div>`;
      if(s) return `<div class="encyclopedia-entry" style="opacity:0.6"><div class="entry-icon">❓</div><div class="entry-details"><div class="entry-name">No.${m.id} ${m.name}(未捕獲)</div></div></div>`;
      return `<div class="encyclopedia-entry undiscovered"><div class="entry-icon">？</div><div class="entry-details"><div class="entry-name">No.${m.id} ???</div></div></div>`;
    }).join('');
    this.menuOverlay.innerHTML = `<span class="close-btn" onclick="game.openMenu('main')">←</span>
      <div class="menu-title">📖 図鑑(${this.game.player.encyclopedia.size}/${GameData.monsters.length})</div>
      <div class="menu-list" style="max-height:500px;overflow-y:auto">${entries}</div>`;
  }

  renderTypeChart() {
    const chart = [
      {a:'ほのお🔥',s:'くさ・こおり・むし・はがね',w:'ほのお・みず・いわ・ドラゴン'},
      {a:'みず💧',s:'ほのお・じめん・いわ',w:'みず・くさ・ドラゴン'},
      {a:'でんき⚡',s:'みず・ひこう',w:'でんき・くさ・ドラゴン / じめん(無効)'},
      {a:'くさ🌿',s:'みず・じめん・いわ',w:'ほのお・くさ・どく・ひこう・むし・ドラゴン・はがね'},
      {a:'こおり❄️',s:'くさ・じめん・ひこう・ドラゴン',w:'ほのお・みず・こおり・はがね'},
      {a:'かくとう👊',s:'ノーマル・こおり・いわ・あく・はがね',w:'どく・ひこう・エスパー・むし・フェアリー / ゴースト(無効)'},
      {a:'どく☠️',s:'くさ・フェアリー',w:'どく・じめん・いわ・ゴースト / はがね(無効)'},
      {a:'じめん🏔️',s:'ほのお・でんき・どく・いわ・はがね',w:'くさ・むし / ひこう(無効)'},
      {a:'ひこう🦅',s:'くさ・かくとう・むし',w:'でんき・いわ・はがね'},
      {a:'エスパー🔮',s:'かくとう・どく',w:'エスパー・はがね / あく(無効)'},
      {a:'むし🐛',s:'くさ・エスパー・あく',w:'ほのお・かくとう・どく・ひこう・ゴースト・はがね・フェアリー'},
      {a:'いわ🪨',s:'ほのお・こおり・ひこう・むし',w:'かくとう・じめん・はがね'},
      {a:'ゴースト👻',s:'エスパー・ゴースト',w:'あく / ノーマル(無効)'},
      {a:'ドラゴン🐉',s:'ドラゴン',w:'はがね / フェアリー(無効)'},
      {a:'あく🌑',s:'エスパー・ゴースト',w:'かくとう・あく・フェアリー'},
      {a:'はがね🔩',s:'こおり・いわ・フェアリー',w:'ほのお・みず・でんき・はがね'},
      {a:'フェアリー🧚',s:'かくとう・ドラゴン・あく',w:'ほのお・どく・はがね'},
    ];
    const rows = chart.map(r=>`<div class="menu-item" style="padding:5px 10px;"><div style="display:flex;gap:8px;align-items:flex-start;">
      <span style="font-weight:bold;min-width:90px;font-size:12px;">${r.a}</span>
      <span style="color:#4caf50;font-size:11px;flex:1;">◎${r.s}</span>
      <span style="color:#f44336;font-size:11px;flex:1;">△${r.w}</span></div></div>`).join('');
    this.menuOverlay.innerHTML = `<span class="close-btn" onclick="game.openMenu('main')">←</span>
      <div class="menu-title">⚔️ タイプ相性表</div>
      <div style="font-size:10px;color:#666;text-align:center;margin-bottom:4px;">◎効果抜群 △いまひとつ/無効</div>
      <div class="menu-list" style="max-height:480px;overflow-y:auto">${rows}</div>`;
  }

  // ワールドマップ表示（完全動的生成）
  renderWorldMap() {
    const currentMap = this.game.player.currentMapId;
    const visited = this.game.player.visitedMaps || new Set();
    visited.add(currentMap);
    this.game.player.visitedMaps = visited;

    // 全マップ取得（building除外のみ、他のフィルタなし）
    const maps = GameData.maps.filter(m => m.type !== 'building');
    console.log("ALL MAP IDS:", maps.map(m => m.id));
    const W = 760, H = 440;

    // ノード位置を自動計算（BFSでgraph layout）
    const nodePositions = this.calcNodePositions(maps, W, H);

    let canvasHtml = `<canvas id="worldmap-canvas" width="${W}" height="${H}" style="display:block;margin:auto;border-radius:8px;background:#0a1a0a;"></canvas>`;

    this.menuOverlay.innerHTML = `<span class="close-btn" onclick="game.openMenu('main')">←</span>
      <div class="menu-title">🗺️ ワールドマップ</div>
      <div style="font-size:10px;color:#888;text-align:center;margin-bottom:4px;">📍=現在地 | 暗い=未訪問</div>
      ${canvasHtml}`;

    setTimeout(() => this.drawWorldMapCanvas(maps, nodePositions, currentMap, visited, W, H), 50);
  }

  // BFS/グラフベースでノード位置を自動計算
  calcNodePositions(maps, W, H) {
    const positions = {};
    if (maps.length === 0) return positions;

    // 隣接リスト構築
    const adj = {};
    for (const m of maps) {
      adj[m.id] = [];
      const conns = m.connections || {};
      for (const target of Object.values(conns)) {
        if (maps.some(x => x.id === target)) {
          adj[m.id].push(target);
        }
      }
    }

    // BFSでレイヤー分け（town1起点）
    const startId = 'town1';
    const layers = [];
    const visited = new Set();
    let queue = [startId];
    visited.add(startId);

    while (queue.length > 0) {
      layers.push([...queue]);
      const next = [];
      for (const id of queue) {
        for (const neighbor of (adj[id] || [])) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            next.push(neighbor);
          }
        }
      }
      queue = next;
    }

    // 未到達ノードを最後のレイヤーに追加
    for (const m of maps) {
      if (!visited.has(m.id)) {
        layers.push([m.id]);
        visited.add(m.id);
      }
    }

    // レイヤーごとにY座標、レイヤー内でX座標を均等配置
    const marginX = 60, marginY = 40;
    const usableW = W - marginX * 2;
    const usableH = H - marginY * 2;
    const layerCount = layers.length;
    const layerSpacing = layerCount > 1 ? usableH / (layerCount - 1) : 0;

    for (let ly = 0; ly < layers.length; ly++) {
      const layer = layers[ly];
      const nodeSpacing = layer.length > 1 ? usableW / (layer.length - 1) : 0;
      for (let ni = 0; ni < layer.length; ni++) {
        const x = layer.length > 1 ? marginX + ni * nodeSpacing : W / 2;
        const y = marginY + ly * layerSpacing;
        positions[layer[ni]] = { x: Math.round(x), y: Math.round(y) };
      }
    }

    return positions;
  }

  drawWorldMapCanvas(maps, positions, currentMap, visited, W, H) {
    const canvas = document.getElementById('worldmap-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    console.log(`[WORLDMAP] Drawing ${maps.length} maps, ${Object.keys(positions).length} positions`);

    // 接続線を描画
    ctx.strokeStyle = '#334';
    ctx.lineWidth = 2;
    for (const m of maps) {
      const pos = positions[m.id];
      if (!pos) continue;
      const conns = m.connections || {};
      for (const dir of Object.values(conns)) {
        const targetPos = positions[dir];
        if (targetPos) {
          const isPath = visited.has(m.id) && visited.has(dir);
          ctx.strokeStyle = isPath ? '#4a7a4a' : '#222';
          ctx.lineWidth = isPath ? 3 : 1;
          ctx.beginPath();
          ctx.moveTo(pos.x, pos.y);
          ctx.lineTo(targetPos.x, targetPos.y);
          ctx.stroke();
        }
      }
    }

    // ノードを描画
    for (const m of maps) {
      const pos = positions[m.id];
      if (!pos) continue;
      const isCurrent = m.id === currentMap;
      const isVisited = visited.has(m.id);

      // ノード色
      let color, icon;
      if (m.type === 'town') { color = '#ffcc00'; icon = '🏠'; }
      else {
        const tiles = m.tiles || 'grass';
        const tileColors = { grass:'#4a8a3a', hill:'#7a8a5a', lava:'#8a3030', forest:'#2a6a3a', mountain:'#6a6a8a' };
        color = tileColors[tiles] || '#4a8a3a';
        const tileIcons = { grass:'🌿', hill:'⛰️', lava:'🌋', forest:'🌲', mountain:'🏔️' };
        icon = tileIcons[tiles] || '🌿';
      }

      // 未訪問は暗く（ただし見える程度）
      const alpha = isVisited ? 1.0 : 0.5;
      ctx.globalAlpha = alpha;

      // ノード円
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, isCurrent ? 18 : 14, 0, Math.PI * 2);
      ctx.fill();

      // 枠線
      ctx.strokeStyle = isCurrent ? '#fff' : '#555';
      ctx.lineWidth = isCurrent ? 3 : 1;
      ctx.stroke();

      // アイコン
      ctx.globalAlpha = 1;
      ctx.font = isCurrent ? '16px sans-serif' : '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(icon, pos.x, pos.y + 5);

      // 名前ラベル
      ctx.font = '9px sans-serif';
      ctx.fillStyle = isVisited ? '#ccc' : '#555';
      ctx.fillText(m.name, pos.x, pos.y + 28);

      // 現在地マーカー（点滅風）
      if (isCurrent) {
        ctx.fillStyle = '#ff0';
        ctx.font = '14px sans-serif';
        ctx.fillText('📍', pos.x, pos.y - 20);
      }

      // レベル帯表示
      const lvRange = this.game.mapRenderer.levelRanges[m.id];
      if (lvRange && isVisited) {
        ctx.font = '8px sans-serif';
        ctx.fillStyle = '#888';
        ctx.fillText(`Lv${lvRange.min}-${lvRange.max}`, pos.x, pos.y + 38);
      }
    }
    ctx.globalAlpha = 1;
  }

  renderShop() {
    const items = GameData.items;
    let html = items.map(it=>{const ic=it.type==='capture'?'🔵':'💊';const ow=this.game.player.getItemCount(it.id);
      return `<div class="menu-item" onclick="game.buyItem(${it.id})"><div class="shop-item"><span>${ic} ${it.name} ${ow>0?'('+ow+')':''}</span><span class="shop-price">${it.price}G</span></div><div style="font-size:10px;color:#666;">${it.desc}</div></div>`;}).join('');
    const bag=this.game.player.bag;let sell='';
    if(bag.length>0){sell='<div style="margin-top:12px;padding-top:8px;border-top:1px solid #333;"><div style="color:#888;font-size:11px;margin-bottom:4px;">💰売却(半額)</div>';
      sell+=bag.map(b=>{const it=GameData.getItem(b.id);if(!it)return'';const sp=Math.floor(it.price*0.5);const ic=it.type==='capture'?'🔵':'💊';
        return `<div class="menu-item" onclick="game.ui.renderSellQuantity(${it.id})"><div class="shop-item"><span>${ic}${it.name}×${b.count}</span><span style="color:#8c8;">${sp}G/個</span></div></div>`;}).join('');
      sell+='</div>';}
    this.menuOverlay.innerHTML = `<span class="close-btn" onclick="game.closeMenu()">✕</span>
      <div class="menu-title">🏪 ショップ(${this.game.player.money}G)</div>
      <div class="menu-list" style="max-height:460px;overflow-y:auto">${html}${sell}</div>`;
  }

  renderShopQuantity(item) {
    const max = Math.min(Math.floor(this.game.player.money/item.price), 99-this.game.player.getItemCount(item.id));
    if(max<=0){this.showNotification('購入不可');return;}
    const ic=item.type==='capture'?'🔵':'💊';
    this.menuOverlay.innerHTML = `<span class="close-btn" onclick="game.ui.renderShop()">←</span>
      <div class="menu-title">購入:${ic}${item.name}</div>
      <div style="text-align:center;padding:16px;">
      <div style="color:#aaa;font-size:12px;">単価${item.price}G | 最大${max}個</div>
      <div style="font-size:26px;font-weight:bold;margin:12px 0;" id="buy-qty-display">1</div>
      <div style="display:flex;gap:6px;justify-content:center;margin-bottom:8px;">
        <button class="battle-btn" onclick="game.ui.adjBuy(-10)">-10</button>
        <button class="battle-btn" onclick="game.ui.adjBuy(-1)">-1</button>
        <button class="battle-btn" onclick="game.ui.adjBuy(1)">+1</button>
        <button class="battle-btn" onclick="game.ui.adjBuy(10)">+10</button></div>
      <div style="display:flex;gap:6px;justify-content:center;margin-bottom:12px;">
        <button class="battle-btn" onclick="game.ui.setBuy(1)">1</button>
        <button class="battle-btn" onclick="game.ui.setBuy(5)">5</button>
        <button class="battle-btn" onclick="game.ui.setBuy(10)">10</button>
        <button class="battle-btn" onclick="game.ui.setBuy(${max})">最大</button></div>
      <div style="color:#ffcc00;margin-bottom:12px;" id="buy-total-display">合計:${item.price}G</div>
      <div style="display:flex;gap:10px;justify-content:center;">
        <button class="battle-btn" style="background:#2a4a2a;" onclick="game.confirmBuy(${item.id},game.ui._bq)">購入</button>
        <button class="battle-btn" onclick="game.ui.renderShop()">やめる</button></div></div>`;
    this._bq=1;this._bmax=max;this._bp=item.price;
  }
  adjBuy(d){this._bq=Utils.clamp(this._bq+d,1,this._bmax);this._updBuy();}
  setBuy(v){this._bq=Utils.clamp(v,1,this._bmax);this._updBuy();}
  _updBuy(){const q=document.getElementById('buy-qty-display'),t=document.getElementById('buy-total-display');if(q)q.textContent=this._bq;if(t)t.textContent=`合計:${this._bq*this._bp}G`;}

  renderSellQuantity(itemId) {
    const it=GameData.getItem(itemId);if(!it)return;const ow=this.game.player.getItemCount(itemId);if(ow<=0)return;
    const sp=Math.floor(it.price*0.5);
    this.menuOverlay.innerHTML = `<span class="close-btn" onclick="game.ui.renderShop()">←</span>
      <div class="menu-title">売却:${it.name}</div>
      <div style="text-align:center;padding:16px;">
      <div style="color:#aaa;font-size:12px;">売値${sp}G/個 | 所持${ow}個</div>
      <div style="font-size:26px;font-weight:bold;margin:12px 0;" id="sell-qty-display">1</div>
      <div style="display:flex;gap:6px;justify-content:center;margin-bottom:8px;">
        <button class="battle-btn" onclick="game.ui.adjSell(-10)">-10</button>
        <button class="battle-btn" onclick="game.ui.adjSell(-1)">-1</button>
        <button class="battle-btn" onclick="game.ui.adjSell(1)">+1</button>
        <button class="battle-btn" onclick="game.ui.adjSell(10)">+10</button></div>
      <div style="display:flex;gap:6px;justify-content:center;margin-bottom:12px;">
        <button class="battle-btn" onclick="game.ui.setSell(1)">1</button>
        <button class="battle-btn" onclick="game.ui.setSell(${ow})">最大</button></div>
      <div style="color:#8c8;margin-bottom:12px;" id="sell-total-display">合計:${sp}G</div>
      <div style="display:flex;gap:10px;justify-content:center;">
        <button class="battle-btn" style="background:#4a2a2a;" onclick="game.confirmSell(${it.id},game.ui._sq)">売却</button>
        <button class="battle-btn" onclick="game.ui.renderShop()">やめる</button></div></div>`;
    this._sq=1;this._smax=ow;this._sp=sp;
  }
  adjSell(d){this._sq=Utils.clamp(this._sq+d,1,this._smax);this._updSell();}
  setSell(v){this._sq=Utils.clamp(v,1,this._smax);this._updSell();}
  _updSell(){const q=document.getElementById('sell-qty-display'),t=document.getElementById('sell-total-display');if(q)q.textContent=this._sq;if(t)t.textContent=`合計:${this._sq*this._sp}G`;}

  renderBox() {
    const p=this.game.player;
    let partyHtml=p.party.map((m,i)=>{const ic=GameData.typeIcons[m.type];const canD=p.party.length>1;
      return `<div class="menu-item" style="padding:5px 10px;"><div style="display:flex;align-items:center;gap:6px;"><span>${ic}</span><span style="flex:1;font-size:12px;">${m.name} Lv.${m.level} HP:${m.currentHp}/${m.maxHp}</span>${canD?`<button class="battle-btn" style="padding:3px 8px;font-size:10px;" onclick="game.depositToBox(${i})">預ける</button>`:''}</div></div>`;}).join('');
    let boxHtml=p.box.length===0?'<div class="menu-item" style="color:#666;">空</div>':
      p.box.map((m,i)=>{const ic=GameData.typeIcons[m.type];const canW=p.party.length<6;
        return `<div class="menu-item" style="padding:5px 10px;"><div style="display:flex;align-items:center;gap:6px;"><span>${ic}</span><span style="flex:1;font-size:12px;">${m.name} Lv.${m.level} HP:${m.currentHp}/${m.maxHp}</span>${canW?`<button class="battle-btn" style="padding:3px 8px;font-size:10px;" onclick="game.withdrawFromBox(${i})">引出す</button>`:'<span style="font-size:9px;color:#888;">満員</span>'}</div></div>`;}).join('');
    this.menuOverlay.innerHTML = `<span class="close-btn" onclick="game.closeMenu()">✕</span>
      <div class="menu-title">📦 モンスターボックス</div>
      <div class="menu-list" style="max-height:480px;overflow-y:auto">
      <div style="color:#ffcc00;font-size:12px;padding:4px 10px;border-bottom:1px solid #333;">🐾 パーティ(${p.party.length}/6)</div>${partyHtml}
      <div style="color:#88aaff;font-size:12px;padding:4px 10px;border-bottom:1px solid #333;margin-top:8px;">📦 ボックス(${p.box.length}体)</div>${boxHtml}</div>`;
  }

  showNotification(text, callback) {
    const n=document.createElement('div');n.className='notification';
    n.innerHTML=`<div>${text}</div><button class="notification-btn" id="notif-ok">OK</button>`;
    document.getElementById('game-container').appendChild(n);
    document.getElementById('notif-ok').onclick=()=>{n.remove();if(callback)callback();};
  }
}
