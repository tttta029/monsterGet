// ========================================
// map.js - マップ管理・描画（草むらシステム対応版）
// ========================================

class MapRenderer {
  constructor(game) {
    this.game = game;
    this.tileSize = 32;
    this.viewCols = 25;
    this.viewRows = 18;
    this.currentMap = null;
    this.collisionMap = [];
    this.grassTiles = [];

    // スムーズカメラ
    this.camX = 0;
    this.camY = 0;

    // プレイヤースプライト画像（キャッシュ）
    this.playerSprites = {};
    const spriteMap = {
      down: 'image/player/player_front.png',
      up: 'image/player/player_back.png',
      left: 'image/player/player_left.png',
      right: 'image/player/player_right.png'
    };
    for (const [dir, src] of Object.entries(spriteMap)) {
      const img = new Image();
      img.src = src;
      this.playerSprites[dir] = img;
    }

    // マップごとのレベル帯定義
    this.levelRanges = {
      'field1': { min: 2, max: 4 },
      'field2': { min: 4, max: 6 },
      'field3': { min: 6, max: 8 },
      'field4': { min: 8, max: 12 },
      'field5': { min: 12, max: 16 },
      'field6': { min: 15, max: 19 },
      'field7': { min: 18, max: 23 },
      'field8': { min: 20, max: 25 },
      'field9': { min: 35, max: 45 },
      'field10': { min: 40, max: 50 },
      'field11': { min: 45, max: 55 },
      'field12': { min: 55, max: 70 },
      'field13': { min: 25, max: 35 },
      'field14': { min: 35, max: 45 },
      'field15': { min: 45, max: 60 }
    };
  }

  loadMap(mapId) {
    try {
      this.currentMap = GameData.getMap(mapId);
      if (this.currentMap) {
        this.generateCollision();
        // マップ遷移時はカメラ・表示位置を即リセット
        const p = this.game.player;
        this.displayX = p.x;
        this.displayY = p.y;
        this.camX = p.x * this.tileSize - 400 + this.tileSize / 2;
        this.camY = p.y * this.tileSize - 180 + this.tileSize / 2;
        console.log(`[MAP] マップ読み込み完了: ${mapId} (${this.currentMap.name})`);
      } else {
        console.error(`[MAP] マップが見つからない: ${mapId}`);
      }
    } catch (e) {
      console.error(`[MAP] マップ読み込みエラー:`, e);
    }
  }

  // 衝突マップ＋草むら生成
  generateCollision() {
    const map = this.currentMap;
    this.collisionMap = [];
    this.grassTiles = [];

    for (let y = 0; y < map.height; y++) {
      this.collisionMap[y] = [];
      for (let x = 0; x < map.width; x++) {
        // 境界は壁
        if (x === 0 || y === 0 || x === map.width - 1 || y === map.height - 1) {
          const conns = map.connections;
          let isExit = false;
          if (conns.north && y === 0 && x >= Math.floor(map.width/2)-1 && x <= Math.floor(map.width/2)+1) isExit = true;
          if (conns.south && y === map.height-1 && x >= Math.floor(map.width/2)-1 && x <= Math.floor(map.width/2)+1) isExit = true;
          if (conns.east && x === map.width-1 && y >= Math.floor(map.height/2)-1 && y <= Math.floor(map.height/2)+1) isExit = true;
          if (conns.west && x === 0 && y >= Math.floor(map.height/2)-1 && y <= Math.floor(map.height/2)+1) isExit = true;
          this.collisionMap[y][x] = isExit ? 0 : 1;
        } else {
          this.collisionMap[y][x] = 0;
        }
      }
    }

    // 町の場合、NPC配置
    if (map.type === 'town' && map.npcs) {
      map.npcs.forEach(npc => {
        if (this.collisionMap[npc.y]) {
          this.collisionMap[npc.y][npc.x] = 2;
        }
      });
    }

    // フィールドの場合、トレーナーNPCを動的配置
    if (map.type === 'field') {
      const trainers = GameData.getTrainersForMap(map.id);
      if (!map._trainersPlaced && trainers.length > 0) {
        if (!map.npcs) map.npcs = [];
        const seed = this.hashString(map.id + 'trainer');
        trainers.forEach((t, i) => {
          const tx = 3 + ((seed * (i + 3) * 11) % (map.width - 6));
          const ty = 3 + ((seed * (i + 5) * 7) % (map.height - 6));
          // 壁でない位置に配置
          if (this.collisionMap[ty] && this.collisionMap[ty][tx] === 0) {
            this.collisionMap[ty][tx] = 2;
            map.npcs.push({ x: tx, y: ty, type: 'trainer', trainerId: t.id, dialog: t.dialog });
          }
        });
        map._trainersPlaced = true;
      }
    }

    // フィールドの場合、草むらを生成
    if (map.type === 'field') {
      this.generateGrassPatches(map);
    }
    // building タイプでは草むらなし・エンカウントなし
  }

  // 草むらパッチをフィールドに配置
  generateGrassPatches(map) {
    // シード的に一貫性を持たせるため、マップIDから決定的にパッチを配置
    const seed = this.hashString(map.id);
    const patchCount = 6 + (seed % 4); // 6〜9パッチ

    for (let p = 0; p < patchCount; p++) {
      // パッチの中心座標（疑似ランダム、ただし壁から離す）
      const cx = 3 + ((seed * (p + 1) * 7) % (map.width - 6));
      const cy = 3 + ((seed * (p + 1) * 13) % (map.height - 6));
      const radius = 2 + ((seed * (p + 2)) % 2); // 2〜3タイルの半径

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const gx = cx + dx;
          const gy = cy + dy;
          // 範囲内＆壁でない＆出入口付近でない
          if (gy > 1 && gy < map.height - 2 && gx > 1 && gx < map.width - 2) {
            if (this.collisionMap[gy][gx] === 0) {
              // 円形に近い形にする
              if (Math.abs(dx) + Math.abs(dy) <= radius + 1) {
                this.collisionMap[gy][gx] = 3; // 草むら
                this.grassTiles.push({ x: gx, y: gy });
              }
            }
          }
        }
      }
    }
  }

  // 文字列から簡易ハッシュ（決定的な草むら配置用）
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  // 移動可能か判定（草むらも通行可能）
  canMove(x, y) {
    if (!this.currentMap) return false;
    if (y < 0 || y >= this.currentMap.height || x < 0 || x >= this.currentMap.width) return false;
    const tile = this.collisionMap[y][x];
    return tile !== 1 && tile !== 2; // 壁とNPCは不可、道路(0)と草むら(3)はOK
  }

  // 現在位置が草むらかどうか
  isGrass(x, y) {
    if (!this.currentMap) return false;
    if (y < 0 || y >= this.currentMap.height || x < 0 || x >= this.currentMap.width) return false;
    return this.collisionMap[y][x] === 3;
  }

  // マップ遷移判定
  checkTransition(x, y) {
    if (!this.currentMap) return null;
    const map = this.currentMap;
    const conns = map.connections;
    const midX = Math.floor(map.width / 2);
    const midY = Math.floor(map.height / 2);

    if (conns.north && y < 0 && x >= midX-1 && x <= midX+1) return { mapId: conns.north, entry: 'south' };
    if (conns.south && y >= map.height && x >= midX-1 && x <= midX+1) return { mapId: conns.south, entry: 'north' };
    if (conns.east && x >= map.width && y >= midY-1 && y <= midY+1) return { mapId: conns.east, entry: 'west' };
    if (conns.west && x < 0 && y >= midY-1 && y <= midY+1) return { mapId: conns.west, entry: 'east' };

    return null;
  }

  // プレイヤーの入場位置
  getEntryPoint(entry) {
    const map = this.currentMap;
    const midX = Math.floor(map.width / 2);
    const midY = Math.floor(map.height / 2);
    switch (entry) {
      case 'north': return { x: midX, y: 1 };
      case 'south': return { x: midX, y: map.height - 2 };
      case 'east': return { x: map.width - 2, y: midY };
      case 'west': return { x: 1, y: midY };
      case 'center': return { x: midX, y: midY + 1 }; // センター出口の前
      default: return { x: midX, y: midY };
    }
  }

  // NPC判定
  getNpcAt(x, y) {
    if (!this.currentMap || !this.currentMap.npcs) return null;
    return this.currentMap.npcs.find(npc => npc.x === x && npc.y === y);
  }

  // エンカウント判定（草むらの上にいる時のみ、10%固定）
  checkEncounter(playerX, playerY) {
    if (!this.currentMap || this.currentMap.type !== 'field') return null;

    // 草むらでなければエンカウントしない
    if (!this.isGrass(playerX, playerY)) return null;

    // 草むら上で10%の確率
    if (Math.random() < 0.10) {
      const monsterId = Utils.randomPick(this.currentMap.encounters);
      const range = this.levelRanges[this.currentMap.id] || { min: 1, max: 3 };
      const level = Utils.randInt(range.min, range.max);
      const monster = Monster.createWild(monsterId, level);
      if (monster) {
        console.log(`[ENCOUNTER] 草むらエンカウント: ${monster.name} Lv.${monster.level} (マップ: ${this.currentMap.name})`);
      }
      return monster;
    }
    return null;
  }

  // マップ描画（スムーズカメラ + スムーズプレイヤー）
  render(ctx) {
    if (!this.currentMap) return;
    const map = this.currentMap;
    const player = this.game.player;

    // プレイヤー描画位置の補間（スムーズ移動）
    if (this.displayX === undefined) { this.displayX = player.x; this.displayY = player.y; }
    this.displayX += (player.x - this.displayX) * 0.25;
    this.displayY += (player.y - this.displayY) * 0.25;
    // 近ければスナップ
    if (Math.abs(player.x - this.displayX) < 0.05) this.displayX = player.x;
    if (Math.abs(player.y - this.displayY) < 0.05) this.displayY = player.y;

    // カメラ: プレイヤー描画位置に追従（固定補間0.15）
    const targetCamX = this.displayX * this.tileSize - 400 + this.tileSize / 2;
    const targetCamY = this.displayY * this.tileSize - 180 + this.tileSize / 2;
    this.camX += (targetCamX - this.camX) * 0.15;
    this.camY += (targetCamY - this.camY) * 0.15;

    ctx.save();
    ctx.translate(-Math.round(this.camX), -Math.round(this.camY));

    // 背景タイル描画
    this.renderTiles(ctx, map);

    // NPC描画
    if (map.npcs) {
      map.npcs.forEach(npc => this.renderNpc(ctx, npc));
    }

    // プレイヤー描画
    this.renderPlayer(ctx, player);

    ctx.restore();
  }

  renderTiles(ctx, map) {
    const colors = this.getMapColors(map.tiles);

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const px = x * this.tileSize;
        const py = y * this.tileSize;
        const tile = this.collisionMap[y][x];

        if (tile === 1) {
          // 壁
          ctx.fillStyle = colors.wall;
          ctx.fillRect(px, py, this.tileSize, this.tileSize);
        } else if (tile === 3) {
          // 草むら — 明確に区別できるデザイン
          ctx.fillStyle = colors.ground;
          ctx.fillRect(px, py, this.tileSize, this.tileSize);
          ctx.fillStyle = colors.grass;
          ctx.fillRect(px + 2, py + 2, this.tileSize - 4, this.tileSize - 4);
          // 草の模様
          ctx.fillStyle = colors.grassDetail;
          ctx.fillRect(px + 6, py + 8, 3, 12);
          ctx.fillRect(px + 14, py + 6, 3, 14);
          ctx.fillRect(px + 22, py + 10, 3, 10);
        } else {
          // 通常の道路/地面
          ctx.fillStyle = colors.ground;
          ctx.fillRect(px, py, this.tileSize, this.tileSize);

          // 道路の模様（軽く）
          if (map.type === 'field' && (x + y) % 5 === 0) {
            ctx.fillStyle = colors.path;
            ctx.fillRect(px + 8, py + 8, this.tileSize - 16, this.tileSize - 16);
          }
        }

        // グリッド線
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.strokeRect(px, py, this.tileSize, this.tileSize);
      }
    }

    // 出入口表示
    const conns = map.connections;
    const midX = Math.floor(map.width / 2);
    const midY = Math.floor(map.height / 2);
    ctx.fillStyle = '#ffcc00';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';

    if (conns.north) {
      ctx.fillText('▲ 出口', midX * this.tileSize + 16, 14);
    }
    if (conns.south) {
      ctx.fillText('▼ 出口', midX * this.tileSize + 16, map.height * this.tileSize - 6);
    }
    if (conns.east) {
      ctx.save();
      ctx.fillText('▶', (map.width - 1) * this.tileSize + 28, midY * this.tileSize + 18);
      ctx.restore();
    }
    if (conns.west) {
      ctx.fillText('◀', 8, midY * this.tileSize + 18);
    }
  }

  getMapColors(tileType) {
    const themes = {
      town:     { ground: '#5a7a4a', wall: '#8b4513', grass: '#2d6b1e', grassDetail: '#1a5510', path: '#6b8e5a' },
      grass:    { ground: '#6b8c5a', wall: '#2d5016', grass: '#2a7a1a', grassDetail: '#1a5a0a', path: '#7a9a6a' },
      hill:     { ground: '#7a8a6a', wall: '#4a5a3a', grass: '#4a7a3a', grassDetail: '#3a6a2a', path: '#8a9a7a' },
      lava:     { ground: '#5a3a30', wall: '#2a1a1a', grass: '#3a5a2a', grassDetail: '#2a4a1a', path: '#6a4a3a' },
      forest:   { ground: '#3a6a4a', wall: '#1a3a2a', grass: '#1a5a1a', grassDetail: '#0a4a0a', path: '#4a7a5a' },
      mountain: { ground: '#6a6a7a', wall: '#3a3a4a', grass: '#4a6a4a', grassDetail: '#3a5a3a', path: '#7a7a8a' }
    };
    return themes[tileType] || themes.grass;
  }

  renderNpc(ctx, npc) {
    const px = npc.x * this.tileSize;
    const py = npc.y * this.tileSize;

    // NPC背景
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(px + 2, py + 2, this.tileSize - 4, this.tileSize - 4);

    // NPCアイコン
    const icons = { healer: '💊', shop: '🏪', guide: '👤', box: '📦', center: '🏥', exit: '🚪', trainer: '🧑‍🤝‍🧑' };
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(icons[npc.type] || '👤', px + 16, py + 24);
  }

  renderPlayer(ctx, player) {
    // スムーズ描画位置を使用
    const px = this.displayX * this.tileSize;
    const py = this.displayY * this.tileSize;

    // スプライト画像を方向に応じて描画
    const img = this.playerSprites[player.direction];
    if (img && img.complete && img.naturalWidth > 0) {
      // 32x32タイルに収まるようスケーリング
      const drawW = this.tileSize;
      const drawH = this.tileSize;
      ctx.drawImage(img, px, py - 4, drawW, drawH + 4);
    } else {
      // フォールバック（画像未ロード時は円で描画）
      ctx.fillStyle = '#ffcc00';
      ctx.beginPath();
      ctx.arc(px + 16, py + 16, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#333';
      const dirOffsets = { up: [16, 10], down: [16, 22], left: [10, 16], right: [22, 16] };
      const [dx, dy] = dirOffsets[player.direction] || [16, 16];
      ctx.beginPath();
      ctx.arc(px + dx, py + dy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
