// ========================================
// main.js - エントリーポイント
// ========================================

let game;

// データ読み込み後にスターター選択画面を表示
async function init() {
  await GameData.load();
  console.log("[INIT] データロード完了:", GameData.monsters.length, "体のモンスター");
  if (GameData.monsters.length === 0) {
    console.error("[INIT] モンスターデータが空です！");
    document.getElementById('starter-area').innerHTML = '<p style="color:red">データ読み込みエラー。ページをリロードしてください。</p>';
    return;
  }
  showStarterSelection();
}

function showStarterSelection() {
  // セーブデータがあれば復元オプション表示
  const hasSave = !!localStorage.getItem('monsterCollectSave');

  const starters = [
    { id: 1, name: 'ヒノコグマ', type: 'fire', icon: '🔥', desc: 'ほのお / 攻撃型 Lv.5' },
    { id: 3, name: 'アクアビト', type: 'water', icon: '💧', desc: 'みず / バランス型 Lv.5' },
    { id: 5, name: 'リーフィ', type: 'grass', icon: '🌿', desc: 'くさ / 素早さ型 Lv.5' }
  ];

  const starterArea = document.getElementById('starter-area');
  const startBtn = document.getElementById('start-btn');

  let selectedId = null;

  starterArea.innerHTML = `
    <p style="margin-bottom:12px;color:#ccc;">最初のパートナーを選ぼう！</p>
    <div class="starter-selection">
      ${starters.map(s => `
        <div class="starter-option" data-id="${s.id}" id="starter-${s.id}">
          <div class="starter-icon" style="background:${GameData.typeColors[s.type]}30;border-color:${GameData.typeColors[s.type]}">${s.icon}</div>
          <div style="font-weight:bold;margin-top:4px;">${s.name}</div>
          <div style="font-size:11px;color:#aaa;">${s.desc}</div>
        </div>
      `).join('')}
    </div>
  `;

  // スターター選択イベント
  document.querySelectorAll('.starter-option').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.starter-option').forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
      selectedId = parseInt(el.dataset.id);
      startBtn.style.display = 'inline-block';
    });
  });

  // ゲーム開始ボタン
  startBtn.addEventListener('click', () => {
    if (selectedId) {
      game = new Game();
      game.startGame(selectedId);
    }
  });

  // セーブデータ復元ボタン
  if (hasSave) {
    const loadBtn = document.createElement('button');
    loadBtn.textContent = '📂 つづきから';
    loadBtn.style.cssText = 'margin-top:16px;padding:12px 32px;font-size:15px;background:#4488ff;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:bold;display:block;margin-left:auto;margin-right:auto;';
    loadBtn.addEventListener('click', () => {
      game = new Game();
      if (game.loadGame()) {
        document.getElementById('start-screen').style.display = 'none';
        game.state = 'explore';
        game.ui.updateHUD();
        game.gameLoop();
      }
    });
    starterArea.parentElement.appendChild(loadBtn);
  }
}

// 初期化実行
window.addEventListener('DOMContentLoaded', init);
