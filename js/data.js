// ========================================
// data.js - ゲームデータ管理
// ========================================

const GameData = {
  monsters: [],
  moves: [],
  items: [],
  maps: [],
  trainers: [],

  // 相性テーブル（完全指定版）
  // 攻撃タイプ → { 防御タイプ: 倍率 } (記載なし = 1倍)
  typeChart: {
    normal:   { rock: 0.5, steel: 0.5, ghost: 0 },
    fire:     { grass: 2, ice: 2, bug: 2, steel: 2, fire: 0.5, water: 0.5, rock: 0.5, dragon: 0.5 },
    water:    { fire: 2, ground: 2, rock: 2, water: 0.5, grass: 0.5, dragon: 0.5 },
    electric: { water: 2, flying: 2, electric: 0.5, grass: 0.5, dragon: 0.5, ground: 0 },
    grass:    { water: 2, ground: 2, rock: 2, fire: 0.5, grass: 0.5, poison: 0.5, flying: 0.5, bug: 0.5, dragon: 0.5, steel: 0.5 },
    ice:      { grass: 2, ground: 2, flying: 2, dragon: 2, fire: 0.5, water: 0.5, ice: 0.5, steel: 0.5 },
    fighting: { normal: 2, ice: 2, rock: 2, dark: 2, steel: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, fairy: 0.5, ghost: 0 },
    poison:   { grass: 2, fairy: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0 },
    ground:   { fire: 2, electric: 2, poison: 2, rock: 2, steel: 2, grass: 0.5, bug: 0.5, flying: 0 },
    flying:   { grass: 2, fighting: 2, bug: 2, electric: 0.5, rock: 0.5, steel: 0.5 },
    psychic:  { fighting: 2, poison: 2, psychic: 0.5, steel: 0.5, dark: 0 },
    bug:      { grass: 2, psychic: 2, dark: 2, fire: 0.5, fighting: 0.5, poison: 0.5, flying: 0.5, ghost: 0.5, steel: 0.5, fairy: 0.5 },
    rock:     { fire: 2, ice: 2, flying: 2, bug: 2, fighting: 0.5, ground: 0.5, steel: 0.5 },
    ghost:    { psychic: 2, ghost: 2, dark: 0.5, normal: 0 },
    dragon:   { dragon: 2, steel: 0.5, fairy: 0 },
    dark:     { psychic: 2, ghost: 2, fighting: 0.5, dark: 0.5, fairy: 0.5 },
    steel:    { ice: 2, rock: 2, fairy: 2, fire: 0.5, water: 0.5, electric: 0.5, steel: 0.5 },
    fairy:    { fighting: 2, dragon: 2, dark: 2, fire: 0.5, poison: 0.5, steel: 0.5 }
  },

  // 属性ごとの色
  typeColors: {
    normal: '#9e9e9e', fire: '#e53935', water: '#1e88e5', electric: '#fdd835',
    grass: '#43a047', ice: '#4dd0e1', fighting: '#c62828', poison: '#9c27b0',
    ground: '#8d6e63', flying: '#7e57c2', psychic: '#ec407a', bug: '#8bc34a',
    rock: '#a1887f', ghost: '#6a1b9a', dragon: '#5c6bc0', dark: '#37474f',
    steel: '#78909c', fairy: '#f48fb1'
  },

  // 属性ごとのアイコン
  typeIcons: {
    normal: '⭐', fire: '🔥', water: '💧', electric: '⚡',
    grass: '🌿', ice: '❄️', fighting: '👊', poison: '☠️',
    ground: '🏔️', flying: '🦅', psychic: '🔮', bug: '🐛',
    rock: '🪨', ghost: '👻', dragon: '🐉', dark: '🌑',
    steel: '🔩', fairy: '🧚'
  },

  // 属性名（日本語）
  typeNames: {
    normal: 'ノーマル', fire: 'ほのお', water: 'みず', electric: 'でんき',
    grass: 'くさ', ice: 'こおり', fighting: 'かくとう', poison: 'どく',
    ground: 'じめん', flying: 'ひこう', psychic: 'エスパー', bug: 'むし',
    rock: 'いわ', ghost: 'ゴースト', dragon: 'ドラゴン', dark: 'あく',
    steel: 'はがね', fairy: 'フェアリー'
  },

  async load() {
    try {
      const [monstersRes, movesRes, itemsRes, mapsRes, trainersRes] = await Promise.all([
        fetch('data/monsters.json'),
        fetch('data/moves.json'),
        fetch('data/items.json'),
        fetch('data/maps.json'),
        fetch('data/trainers.json')
      ]);
      this.monsters = await monstersRes.json();
      this.moves = await movesRes.json();
      this.items = await itemsRes.json();
      const mapsData = await mapsRes.json();
      this.maps = mapsData.maps;
      this.trainers = await trainersRes.json();
      console.log('Game data loaded successfully.');
    } catch (e) {
      console.error('Failed to load game data:', e);
    }
  },

  getMonster(id) {
    return this.monsters.find(m => m.id === id);
  },

  getMove(name) {
    return this.moves.find(m => m.name === name);
  },

  getItem(id) {
    return this.items.find(i => i.id === id);
  },

  getMap(id) {
    return this.maps.find(m => m.id === id);
  },

  getTrainer(id) {
    return this.trainers.find(t => t.id === id);
  },

  getTrainersForMap(mapId) {
    return this.trainers.filter(t => t.map === mapId);
  },

  // 単一タイプへの有効度
  getTypeEffectiveness(attackType, defenseType) {
    const chart = this.typeChart[attackType];
    if (!chart) return 1;
    return chart[defenseType] !== undefined ? chart[defenseType] : 1;
  },

  // 複合タイプ対応: 防御側が2タイプの場合は掛け算
  getTypeEffectivenessMulti(attackType, defenseTypes) {
    if (!defenseTypes || defenseTypes.length === 0) return 1;
    let mult = 1;
    for (const dt of defenseTypes) {
      mult *= this.getTypeEffectiveness(attackType, dt);
    }
    return mult;
  },

  // モンスター個別の技習得テーブルを取得
  getLearnMove(monsterId, level) {
    const mon = this.getMonster(monsterId);
    if (!mon) return null;
    if (mon.learnset) {
      const entry = mon.learnset.find(e => e.level === level);
      if (entry) return entry.move;
    }
    // フォールバック: タイプから自動候補
    const monTypes = Array.isArray(mon.type) ? mon.type : [mon.type];
    const typeMoves = this.moves.filter(mv => mv.power > 0 && monTypes.includes(mv.type)).sort((a, b) => a.power - b.power);
    const tier = Math.floor(level / 10);
    const idx = Math.min(tier, typeMoves.length - 1);
    return typeMoves[idx] ? typeMoves[idx].name : null;
  }
};