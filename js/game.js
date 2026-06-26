// ========================================
// game.js - ゲーム全体の状態管理（安定版）
// ========================================

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.player = new Player();
    this.mapRenderer = new MapRenderer(this);
    this.battle = new BattleSystem(this);
    this.ui = new GameUI(this);
    this.fadeOverlay = document.getElementById('fade-overlay');

    this.state = 'title';
    this.dialogCallback = null;
    this.keys = {};
    this.lastMove = 0;
    this.moveDelay = 150;
    this.noEncounterSteps = 0;
    this.isLearnMoveState = false; // 技習得/進化UI表示中フラグ
    this.isTransitioning = false; // フェード中完全ロック

    // バトルUIカーソル
    this.cursorIndex = 0;
    this.cursorButtons = [];

    this.setupInput();
  }

  setupInput() {
    document.addEventListener('keydown', (e) => {
      // トランジション中は全入力無効
      if (this.isTransitioning) return;

      this.keys[e.key.toLowerCase()] = true;
      const key = e.key.toLowerCase();

      // ダイアログ
      if (this.state === 'dialog') {
        if (e.key === 'Enter' || e.key === ' ') { this.ui.hideDialog(); this.state = 'explore'; }
        return;
      }

      // フェード中は操作無効
      if (this.state === 'fading') return;

      // バトル中
      if (this.state === 'battle') {
        if (this.battle.currentState === 'PLAYER_INPUT' && !this.battle.isProcessingMessages) {
          // カーソル移動（WASD / 矢印）
          if (key === 'a' || key === 'arrowleft') { this.moveCursor(-1, 0); e.preventDefault(); return; }
          if (key === 'd' || key === 'arrowright') { this.moveCursor(1, 0); e.preventDefault(); return; }
          if (key === 'w' || key === 'arrowup') { this.moveCursor(0, -1); e.preventDefault(); return; }
          if (key === 's' || key === 'arrowdown') { this.moveCursor(0, 1); e.preventDefault(); return; }
          // 決定
          if (e.key === 'Enter' || e.key === ' ') { this.confirmCursor(); e.preventDefault(); return; }
          // キャンセル
          if (key === 'x' || e.key === 'Escape') { this.ui.updateBattle(); this.resetCursor(); return; }
          // 数字キー直接（技選択中のショートカット）
          if (key === '1') { this.battleAction('attack', 0); return; }
          if (key === '2') { this.battleAction('attack', 1); return; }
          if (key === '3') { this.battleAction('attack', 2); return; }
          if (key === '4') { this.battleAction('attack', 3); return; }
          if (key === 'r') { this.battleAction('run'); return; }
        }
        return;
      }

      // 探索中
      if (this.state === 'explore') {
        if (key === 'm') this.openMenu('main');
        if (key === 'e') this.interact();
      }

      if (e.key === 'Escape' && this.state === 'menu') this.closeMenu();
    });

    document.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
  }

  // ===== カーソルシステム =====
  resetCursor() {
    this.cursorIndex = 0;
    this.updateCursorDisplay();
  }

  // ターン間でカーソル位置を維持（リセットしない）
  restoreCursor() {
    this.updateCursorDisplay();
  }

  moveCursor(dx, dy) {
    this.refreshCursorButtons();
    if (this.cursorButtons.length === 0) return;
    // 2列グリッド想定
    const cols = 2;
    const rows = Math.ceil(this.cursorButtons.length / cols);
    let col = this.cursorIndex % cols;
    let row = Math.floor(this.cursorIndex / cols);
    col = Utils.clamp(col + dx, 0, cols - 1);
    row = Utils.clamp(row + dy, 0, rows - 1);
    this.cursorIndex = Utils.clamp(row * cols + col, 0, this.cursorButtons.length - 1);
    this.updateCursorDisplay();
  }

  confirmCursor() {
    this.refreshCursorButtons();
    const btn = this.cursorButtons[this.cursorIndex];
    if (btn && !btn.disabled) btn.click();
  }

  refreshCursorButtons() {
    const panel = document.getElementById('battle-commands-panel');
    if (!panel) { this.cursorButtons = []; return; }
    this.cursorButtons = Array.from(panel.querySelectorAll('.battle-btn'));
  }

  updateCursorDisplay() {
    this.refreshCursorButtons();
    this.cursorButtons.forEach((btn, i) => {
      btn.classList.toggle('cursor-active', i === this.cursorIndex);
    });
  }

  // ゲーム開始（スターター選択後）
  startGame(starterId) {
    try {
      console.log("Starter selection:", starterId);
      const starterData = GameData.getMonster(starterId);
      console.log("Monster data:", starterData);

      let starterMon = null;

      if (!starterData || !starterData.id) {
        console.error("[GAME] スターターデータが見つからない! id:", starterId);
        console.error("[GAME] GameData.monsters:", GameData.monsters.length, "件ロード済み");
        const fallback = GameData.monsters[0];
        if (!fallback) {
          alert("ゲームデータの読み込みに失敗しました。ページをリロードしてください。");
          return;
        }
        console.warn("[GAME] フォールバック使用:", fallback.name);
        starterMon = new Monster(fallback, 5);
      } else {
        starterMon = new Monster(starterData, 5);
      }

      this.player.addMonster(starterMon);

      // 初期アイテム（捕獲ボール10個無料配布）
      this.player.addItem(1, 10); // キャプチャーボール x10
      this.player.addItem(4, 3);  // 回復薬 x3

      // スタート画面非表示
      document.getElementById('start-screen').style.display = 'none';

      // マップ読み込み
      this.mapRenderer.loadMap('town1');
      this.state = 'explore';

      this.ui.showDialog(
        `${starterMon.name} (Lv.5) をパートナーに選んだ！<br>` +
        `冒険の始まりだ！<br>` +
        `<span style="color:#8f8">🌿 草むら</span> に入るとモンスターに出会えるよ。<br>` +
        `<span style="color:#aaa">道路では出現しないので安全に移動できます。</span>`
      );
      this.state = 'dialog';

      console.log('[GAME] ゲーム開始 - スターター:', starterMon.name, 'Lv.5');
      this.gameLoop();
    } catch (e) {
      console.error('[GAME] startGame エラー:', e);
    }
  }

  // ゲームループ
  gameLoop() {
    this.update();
    this.render();
    requestAnimationFrame(() => this.gameLoop());
  }

  // 更新
  update() {
    if (this.isTransitioning) return;
    if (this.state !== 'explore') return;

    const now = Date.now();
    if (now - this.lastMove < this.moveDelay) return;

    let dx = 0, dy = 0;
    if (this.keys['w'] || this.keys['arrowup']) dy = -1;
    else if (this.keys['s'] || this.keys['arrowdown']) dy = 1;
    else if (this.keys['a'] || this.keys['arrowleft']) dx = -1;
    else if (this.keys['d'] || this.keys['arrowright']) dx = 1;

    if (dx === 0 && dy === 0) return;
    this.lastMove = now;

    const newX = this.player.x + dx;
    const newY = this.player.y + dy;

    // マップ遷移チェック
    const transition = this.mapRenderer.checkTransition(newX, newY);
    if (transition) {
      this.changeMap(transition.mapId, transition.entry);
      return;
    }

    // 移動可能判定
    if (this.mapRenderer.canMove(newX, newY)) {
      this.player.move(dx, dy);

      // エンカウントチェック（草むらのみ、7歩無効）
      if (this.noEncounterSteps > 0) {
        this.noEncounterSteps--;
      } else {
        const wildMon = this.mapRenderer.checkEncounter(this.player.x, this.player.y);
        if (wildMon) {
          this.startBattle(wildMon);
        }
      }
    }

    this.ui.updateHUD();
  }

  // 描画
  render() {
    this.ctx.fillStyle = '#111';
    this.ctx.fillRect(0, 0, 800, 360);

    if (this.state === 'explore' || this.state === 'dialog' || this.state === 'menu') {
      this.mapRenderer.render(this.ctx);
    }
  }

  // マップ遷移（フェードトランジション付き）
  changeMap(mapId, entry) {
    if (this.state === 'fading') return;
    this.fadeOut(() => {
      try {
        console.log(`[MAP] マップ遷移: ${this.player.currentMapId} → ${mapId} (entry: ${entry})`);
        this.player.currentMapId = mapId;
        if (!this.player.visitedMaps) this.player.visitedMaps = new Set();
        this.player.visitedMaps.add(mapId);
        this.mapRenderer.loadMap(mapId);
        const entryPoint = this.mapRenderer.getEntryPoint(entry);
        this.player.x = entryPoint.x;
        this.player.y = entryPoint.y;
        // カメラ即座リセット
        this.mapRenderer.displayX = this.player.x;
        this.mapRenderer.displayY = this.player.y;
        this.mapRenderer.camX = this.player.x * 32 - 400 + 16;
        this.mapRenderer.camY = this.player.y * 32 - 180 + 16;
        this.state = 'explore';
        this.ui.updateHUD();
      } catch (e) {
        console.error('[MAP] マップ遷移エラー:', e);
        this.player.currentMapId = 'town1';
        this.player.x = 10; this.player.y = 7;
        this.mapRenderer.loadMap('town1');
        this.state = 'explore';
      }
      this.fadeIn();
    });
  }

  // インタラクション（Eキー）
  interact() {
    const dirs = { up: [0,-1], down: [0,1], left: [-1,0], right: [1,0] };
    const [dx, dy] = dirs[this.player.direction];
    const targetX = this.player.x + dx;
    const targetY = this.player.y + dy;

    const npc = this.mapRenderer.getNpcAt(targetX, targetY);
    if (npc) {
      this.handleNpc(npc);
    }
  }

  // NPC処理
  handleNpc(npc) {
    switch (npc.type) {
      case 'healer':
        this.player.healAll();
        this.player.lastHealTown = this.player.currentMapId;
        this.ui.showDialog('💊 みんな元気になったよ！');
        this.state = 'dialog';
        break;
      case 'shop':
        this.openMenu('shop');
        break;
      case 'box':
        this.openMenu('box');
        break;
      case 'center':
        // モンスターセンター入口 → 内部マップへ遷移
        this.changeMap(npc.targetMap || 'center1_inside', 'south');
        break;
      case 'guide':
        this.ui.showDialog(npc.dialog);
        this.state = 'dialog';
        break;
      case 'exit':
        // 建物出口 → 元の町へ遷移
        this.changeMap(npc.targetMap || 'town1', npc.targetEntry || 'center');
        break;
      case 'trainer':
        // トレーナーバトル開始
        this.startTrainerBattle(npc.trainerId);
        break;
    }
  }

  // ===== 安全なリスポーン位置計算 =====
  getSafeSpawnPosition(mapId) {
    const mapData = GameData.getMap(mapId);
    if (!mapData) return { x: 5, y: 5 };

    // センターNPCの位置を探す（回復NPCの1マス下が理想）
    if (mapData.npcs) {
      const centerNpc = mapData.npcs.find(n => n.type === 'center');
      if (centerNpc) {
        // センター入口の1マス下
        return { x: centerNpc.x, y: centerNpc.y + 1 };
      }
      const healerNpc = mapData.npcs.find(n => n.type === 'healer');
      if (healerNpc) {
        return { x: healerNpc.x, y: healerNpc.y + 1 };
      }
    }

    // NPCが見つからない場合、マップ中央付近の安全位置
    const midX = Math.floor(mapData.width / 2);
    const midY = Math.floor(mapData.height / 2);
    // 壁でない位置を探す（中央から下方向に探索）
    for (let dy = 0; dy < 5; dy++) {
      const y = midY + dy;
      if (y > 0 && y < mapData.height - 1 && midX > 0 && midX < mapData.width - 1) {
        return { x: midX, y: y };
      }
    }
    return { x: midX, y: midY };
  }

  // ===== フェードトランジション =====
  fadeOut(callback) {
    this.isTransitioning = true;
    this.state = 'fading';
    this.keys = {}; // キー状態クリア
    this.fadeOverlay.classList.add('active');
    setTimeout(() => { if (callback) callback(); }, 300);
  }

  fadeIn(callback) {
    this.fadeOverlay.classList.remove('active');
    this.keys = {}; // キー状態クリア
    setTimeout(() => {
      this.isTransitioning = false;
      if (callback) callback();
    }, 300);
  }

  // バトル開始（フェード付き）
  startBattle(wildMonster) {
    if (this.state === 'battle' || this.state === 'fading') return;
    if (!this.player.hasAliveMon()) return;

    this.fadeOut(() => {
      this.state = 'battle';
      const lead = this.player.getLeadMonster();
      this.mapRenderer.displayX = this.player.x;
      this.mapRenderer.displayY = this.player.y;
      this.mapRenderer.camX = this.player.x * 32 - 400 + 16;
      this.mapRenderer.camY = this.player.y * 32 - 180 + 16;
      this.battle.start(lead, wildMonster);
      this.ui.showBattle();
      this.resetCursor();
      this.fadeIn();
    });
  }

  // トレーナーバトル開始
  startTrainerBattle(trainerId) {
    if (this.state === 'battle' || this.state === 'fading') return;
    if (!this.player.hasAliveMon()) return;
    const trainer = GameData.getTrainer(trainerId);
    if (!trainer) return;

    // 既に倒したトレーナーかチェック
    if (!this.player.defeatedTrainers) this.player.defeatedTrainers = new Set();
    if (this.player.defeatedTrainers.has(trainerId)) {
      this.ui.showDialog(`${trainer.name}：「もう勝負はついたよ。」`);
      this.state = 'dialog';
      return;
    }

    // トレーナーの台詞を表示してからバトル開始
    this.ui.showDialog(`${trainer.name}：「${trainer.dialog}」`);
    this.state = 'dialog';
    this.dialogCallback = () => {
      this.fadeOut(() => {
        this.state = 'battle';
        const lead = this.player.getLeadMonster();
        this.mapRenderer.displayX = this.player.x;
        this.mapRenderer.displayY = this.player.y;
        this.mapRenderer.camX = this.player.x * 32 - 400 + 16;
        this.mapRenderer.camY = this.player.y * 32 - 180 + 16;
        // トレーナーパーティ生成
        const trainerParty = trainer.party.map(p => Monster.createWild(p.id, p.level)).filter(m => m);
        this.battle.startTrainer(lead, trainerParty, trainer);
        this.ui.showBattle();
        this.resetCursor();
        this.fadeIn();
      });
    };
  }

  // バトル終了（フェード付き）
  endBattle(won) {
    console.log(`[GAME] バトル終了処理 (won: ${won})`);
    for (const mon of this.player.party) { mon.hasEvolved = false; }
    this.fadeOut(() => {
      this.ui.hideBattle();
      this.state = 'explore';
      this.noEncounterSteps = 7;

      // 敗北時: マップが変わっているのでリロード
      if (!won) {
        this.mapRenderer.loadMap(this.player.currentMapId);
      }

      this.mapRenderer.displayX = this.player.x;
      this.mapRenderer.displayY = this.player.y;
      this.mapRenderer.camX = this.player.x * 32 - 400 + 16;
      this.mapRenderer.camY = this.player.y * 32 - 180 + 16;
      this.ui.updateHUD();
      this.saveGame();
      this.fadeIn();
    });
  }

  // バトルアクション（UIからのコールバック）
  battleAction(action, param) {
    if (this.state !== 'battle') return;
    if (this.battle.currentState !== 'PLAYER_INPUT') return;
    if (this.battle.isProcessingMessages) return;

    // アクション実行
    switch (action) {
      case 'attack':
        this.battle.playerAttack(param);
        break;
      case 'catch':
        this.battle.tryCatch(param);
        break;
      case 'heal':
        this.battle.useHealItem(param);
        break;
      case 'run':
        this.battle.tryRun();
        break;
      case 'switch':
        this.battle.switchMonster(param);
        break;
    }
  }

  // メニュー操作
  openMenu(type) {
    this.state = 'menu';
    this.ui.showMenu(type);
  }

  closeMenu() {
    this.state = 'explore';
    this.ui.hideMenu();
  }

  // ショップ: 数量選択画面を表示
  buyItem(itemId) {
    const item = GameData.getItem(itemId);
    if (!item) return;
    this.ui.renderShopQuantity(item);
  }

  // ショップ: 確定購入（数量指定）
  confirmBuy(itemId, quantity) {
    const item = GameData.getItem(itemId);
    if (!item || quantity <= 0) return;

    const totalCost = item.price * quantity;
    if (this.player.money >= totalCost) {
      this.player.money -= totalCost;
      this.player.addItem(itemId, quantity);
      this.ui.renderShop();
      this.ui.showNotification(`${item.name} ×${quantity} を購入しました！ (-${totalCost}G)`);
    } else {
      this.ui.showNotification('お金が足りません...');
    }
  }

  // ショップ: 売却
  confirmSell(itemId, quantity) {
    const item = GameData.getItem(itemId);
    if (!item || quantity <= 0) return;

    const owned = this.player.getItemCount(itemId);
    const sellQty = Math.min(quantity, owned);
    if (sellQty <= 0) return;

    const sellPrice = Math.floor(item.price * 0.5) * sellQty;
    // アイテムを減らす
    for (let i = 0; i < sellQty; i++) {
      this.player.useItem(itemId);
    }
    this.player.money += sellPrice;
    this.ui.renderShop();
    this.ui.showNotification(`${item.name} ×${sellQty} を売却しました！ (+${sellPrice}G)`);
  }

  // パーティ並び替え
  swapParty(indexA, indexB) {
    const party = this.player.party;
    if (indexA < 0 || indexA >= party.length || indexB < 0 || indexB >= party.length) return;
    [party[indexA], party[indexB]] = [party[indexB], party[indexA]];
    this.ui.renderPartyMenu();
  }

  // 技入れ替え
  swapMonsterMove(partyIndex, moveIndex, newMove) {
    const m = this.player.party[partyIndex];
    if (!m) return;
    if (m.swapMove(moveIndex, newMove)) {
      this.ui.showNotification(`${m.name} は ${newMove} を思い出した！`);
      this.ui.showMoveManager(partyIndex);
    }
  }

  // ===== 技習得フロー（pendingMoves処理） =====
  processPendingMoves(callback) {
    // 技習得UI中はフリーズ防止を無効化
    this.isLearnMoveState = true;
    // パーティ全体からpendingMovesを収集
    const queue = [];
    for (const mon of this.player.party) {
      if (mon.pendingMoves && mon.pendingMoves.length > 0) {
        for (const move of mon.pendingMoves) {
          queue.push({ mon, move });
        }
        mon.pendingMoves = [];
      }
    }
    this._learnQueue = queue;
    this._learnCallback = callback;
    this.processNextLearn();
  }

  processNextLearn() {
    if (!this._learnQueue || this._learnQueue.length === 0) {
      this.isLearnMoveState = false;
      if (this._learnCallback) this._learnCallback();
      return;
    }
    const { mon, move } = this._learnQueue.shift();
    this.showLearnMoveUI(mon, move);
  }

  // 技習得UI表示
  showLearnMoveUI(mon, newMove) {
    const panel = this.ui.battleCmdPanel || document.getElementById('battle-commands-panel');
    if (!panel) { this.processNextLearn(); return; }

    panel.innerHTML = `
      <div style="padding:12px;font-size:14px;line-height:1.8;">
        <div>${mon.name} は あたらしく <strong>${newMove}</strong> を おぼえたい……</div>
        <div style="margin-top:8px;">しかし ${mon.name} は わざを 4つおぼえるので せいいっぱいだ！</div>
        <div style="margin-top:4px;"><strong>${newMove}</strong> の かわりに ほかの わざを わすれさせますか？</div>
        <div class="battle-commands" style="margin-top:12px;">
          <button class="battle-btn" onclick="game.showForgetMoveUI('${mon.name}','${newMove}')">はい</button>
          <button class="battle-btn" onclick="game.showGiveUpLearnUI('${mon.name}','${newMove}')">いいえ</button>
        </div>
      </div>
      ${this.ui.getMoveInfoHtml(newMove)}`;
  }

  // 技を忘れさせる画面
  showForgetMoveUI(monName, newMove) {
    const mon = this.player.party.find(m => m.name === monName);
    if (!mon) { this.processNextLearn(); return; }
    const panel = this.ui.battleCmdPanel || document.getElementById('battle-commands-panel');
    if (!panel) { this.processNextLearn(); return; }

    const btns = mon.moves.map((mv, i) => {
      return `<button class="battle-btn" onclick="game.confirmForgetMove('${monName}',${i},'${newMove}')" onmouseover="game.ui.showMoveTooltip('${mv}')" >${mv}</button>`;
    }).join('');

    panel.innerHTML = `
      <div style="padding:12px;font-size:14px;">
        <div>どの わざを わすれさせたい？</div>
        <div class="battle-commands" style="margin-top:10px;">${btns}</div>
        <button class="battle-btn" style="margin-top:8px;" onclick="game.showLearnMoveUI(game.player.party.find(m=>m.name==='${monName}'),'${newMove}')">← もどる</button>
      </div>
      <div id="move-tooltip" style="margin-top:8px;padding:8px;background:#1a1a2a;border:1px solid #444;border-radius:6px;font-size:12px;min-height:60px;"></div>`;
  }

  // 技忘却確定
  confirmForgetMove(monName, forgetIndex, newMove) {
    const mon = this.player.party.find(m => m.name === monName);
    if (!mon) { this.processNextLearn(); return; }
    const panel = this.ui.battleCmdPanel || document.getElementById('battle-commands-panel');

    const forgotten = mon.moves[forgetIndex];
    mon.moves[forgetIndex] = newMove;
    if (!mon.learnedMoves.includes(newMove)) mon.learnedMoves.push(newMove);

    panel.innerHTML = `
      <div style="padding:12px;font-size:14px;line-height:2;">
        <div>1…… 2の…… ポカン！</div>
        <div>${mon.name} は ${forgotten} を きれいに わすれた！</div>
        <div>そして……！</div>
        <div><strong>${mon.name} は あたらしく ${newMove} を おぼえた！</strong></div>
        <button class="battle-btn" style="margin-top:12px;" onclick="game.processNextLearn()">▶ つぎへ</button>
      </div>`;
  }

  // 覚えない確認
  showGiveUpLearnUI(monName, newMove) {
    const panel = this.ui.battleCmdPanel || document.getElementById('battle-commands-panel');
    if (!panel) { this.processNextLearn(); return; }

    panel.innerHTML = `
      <div style="padding:12px;font-size:14px;line-height:1.8;">
        <div>それでは…… <strong>${newMove}</strong> を おぼえるのを あきらめますか？</div>
        <div class="battle-commands" style="margin-top:12px;">
          <button class="battle-btn" onclick="game.confirmGiveUp('${monName}','${newMove}')">はい</button>
          <button class="battle-btn" onclick="game.showLearnMoveUI(game.player.party.find(m=>m.name==='${monName}'),'${newMove}')">いいえ</button>
        </div>
      </div>`;
  }

  // 覚えない確定
  confirmGiveUp(monName, newMove) {
    const panel = this.ui.battleCmdPanel || document.getElementById('battle-commands-panel');
    if (!panel) { this.processNextLearn(); return; }

    panel.innerHTML = `
      <div style="padding:12px;font-size:14px;line-height:1.8;">
        <div>${monName} は ${newMove} を おぼえずに おわった！</div>
        <button class="battle-btn" style="margin-top:12px;" onclick="game.processNextLearn()">▶ つぎへ</button>
      </div>`;
  }

  // ===== 進化処理 =====
  processEvolutions(callback) {
    this.isLearnMoveState = true;
    const queue = [];
    console.log("[EVO] Checking party for evolution...");
    for (const mon of this.player.party) {
      const data = GameData.getMonster(mon.id);
      const evo = data ? data.evolution : null;
      console.log(`[EVO] ${mon.name} ID${mon.id} Lv${mon.level} hasEvolved=${mon.hasEvolved} evo=${JSON.stringify(evo)}`);
      if (mon.canEvolve()) {
        if (data && data.evolution && data.evolution.to) {
          const evoData = GameData.getMonster(data.evolution.to);
          if (evoData) {
            console.log(`[EVO] ✓ ${mon.name} will evolve to ${evoData.name}`);
            queue.push({ mon, oldName: mon.name, newName: evoData.name });
          }
        }
      }
    }
    console.log(`[EVO] Evolution queue: ${queue.length} pending`);
    this._evoQueue = queue;
    this._evoCallback = callback;
    this.processNextEvolution();
  }

  processNextEvolution() {
    if (!this._evoQueue || this._evoQueue.length === 0) {
      this.isLearnMoveState = false;
      if (this._evoCallback) this._evoCallback();
      return;
    }
    const { mon, oldName, newName } = this._evoQueue.shift();
    this.showEvolutionUI(mon, oldName, newName);
  }

  showEvolutionUI(mon, oldName, newName) {
    const panel = this.ui.battleCmdPanel || document.getElementById('battle-commands-panel');
    if (!panel) { mon.evolve(); this.processNextEvolution(); return; }

    panel.innerHTML = `
      <div style="padding:16px;font-size:15px;line-height:2;text-align:center;">
        <div>おや……？</div>
        <div><strong>${oldName}</strong> の ようすが……！</div>
        <div style="margin:12px 0;font-size:24px;">・・・・・・</div>
        <button class="battle-btn" style="padding:12px 24px;" onclick="game.completeEvolution('${oldName}','${newName}')">▶ つぎへ</button>
      </div>`;

    // 進化実行（表示前に実行してOK）
    mon.evolve();
    // 図鑑に登録
    this.player.encyclopedia.add(mon.id);
  }

  completeEvolution(oldName, newName) {
    const panel = this.ui.battleCmdPanel || document.getElementById('battle-commands-panel');
    if (!panel) { this.processNextEvolution(); return; }

    panel.innerHTML = `
      <div style="padding:16px;font-size:15px;line-height:2;text-align:center;">
        <div>おめでとう！</div>
        <div><strong>${oldName}</strong> は <strong style="color:#ffcc00;font-size:18px;">${newName}</strong> に しんかした！</div>
        <button class="battle-btn" style="margin-top:16px;padding:12px 24px;" onclick="game.processNextEvolution()">▶ つぎへ</button>
      </div>`;
  }

  // ボックス操作
  depositToBox(partyIndex) {
    if (this.player.depositToBox(partyIndex)) {
      this.ui.renderBox();
    }
  }

  withdrawFromBox(boxIndex) {
    if (this.player.withdrawFromBox(boxIndex)) {
      this.ui.renderBox();
    }
  }

  // ===== セーブ/ロード =====
  saveGameManual() {
    this.saveGame();
    this.ui.showNotification('💾 セーブしました！');
  }

  saveGame() {
    try {
      const save = {
        player: {
          x: this.player.x, y: this.player.y,
          direction: this.player.direction,
          currentMapId: this.player.currentMapId,
          lastHealTown: this.player.lastHealTown,
          money: this.player.money,
          bag: this.player.bag,
          encyclopedia: [...this.player.encyclopedia],
          seen: [...this.player.seen],
          visitedMaps: this.player.visitedMaps ? [...this.player.visitedMaps] : [],
          defeatedTrainers: this.player.defeatedTrainers ? [...this.player.defeatedTrainers] : [],
          party: this.player.party.map(m => m.toSaveData()),
          box: this.player.box.map(m => m.toSaveData())
        }
      };
      localStorage.setItem('monsterCollectSave', JSON.stringify(save));
      console.log('[SAVE] ゲームをセーブしました');
    } catch (e) { console.error('[SAVE] セーブ失敗:', e); }
  }

  loadGame() {
    try {
      const raw = localStorage.getItem('monsterCollectSave');
      if (!raw) return false;
      const save = JSON.parse(raw);
      const p = save.player;
      this.player.x = p.x;
      this.player.y = p.y;
      this.player.direction = p.direction;
      this.player.currentMapId = p.currentMapId;
      this.player.lastHealTown = p.lastHealTown || 'town1';
      this.player.money = p.money;
      this.player.bag = p.bag;
      this.player.encyclopedia = new Set(p.encyclopedia);
      this.player.seen = new Set(p.seen);
      this.player.visitedMaps = new Set(p.visitedMaps || []);
      this.player.defeatedTrainers = new Set(p.defeatedTrainers || []);
      this.player.party = p.party.map(s => Monster.fromSaveData(s)).filter(m => m);
      this.player.box = p.box.map(s => Monster.fromSaveData(s)).filter(m => m);
      this.mapRenderer.loadMap(this.player.currentMapId);
      console.log('[SAVE] ゲームをロードしました');
      return true;
    } catch (e) { console.error('[SAVE] ロード失敗:', e); return false; }
  }
}
