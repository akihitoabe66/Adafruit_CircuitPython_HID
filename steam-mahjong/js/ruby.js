/* ふりがな: むずかしい漢字(麻雀の用語・牌の名前)に、読みがなを付ける。
   すでに「雀頭(ジャントウ)」のように読みが書いてある所には付けない */
(function (G) {
  const MJ = (G.MJ = G.MJ || {});
  const D = {
    麻雀: 'まーじゃん', 手牌: 'てはい', 字牌: 'じはい', 役牌: 'やくはい', 有効牌: 'ゆうこうはい', 安牌: 'あんぱい', 危険牌: 'きけんはい', 牌効率: 'はいこうりつ', 切り牌: 'きりはい', 捨て牌: 'すてはい', 数牌: 'すうはい', 么九牌: 'やおちゅうはい', 幺九牌: 'やおちゅうはい', 中張牌: 'ちゅんちゃんはい', 表示牌: 'ひょうじはい', 待ち牌: 'まちはい', 和了牌: 'ほーらはい', 孤立牌: 'こりつはい',
    面子: 'めんつ', 雀頭: 'じゃんとう', 刻子: 'こうつ', 順子: 'しゅんつ', 暗刻: 'あんこう', 明刻: 'みんこう', 槓子: 'かんつ', 搭子: 'たーつ', 塔子: 'たーつ', 対子: 'といつ', 両面: 'りょうめん', 嵌張: 'かんちゃん', 辺張: 'ぺんちゃん', 双碰: 'しゃんぽん', 単騎: 'たんき', 聴牌: 'てんぱい', 不聴: 'のーてん', 向聴: 'しゃんてん', 連続形: 'れんぞくけい', 完成形: 'かんせいけい',
    現物: 'げんぶつ', 無筋: 'むすじ', 中筋: 'なかすじ', 半筋: 'はんすじ', 筋: 'すじ', 壁: 'かべ', 振り込み: 'ふりこみ', 放銃: 'ほうじゅう', 安全度: 'あんぜんど', 危険度: 'きけんど',
    門前清自摸和: 'めんぜんちんつもほー', 門前: 'めんぜん', 自摸: 'つも', 立直: 'りーち', 一発: 'いっぱつ', 平和: 'ぴんふ', 断么九: 'たんやおちゅう', 一盃口: 'いーぺーこー', 二盃口: 'りゃんぺーこー', 七対子: 'ちーといつ', 対々和: 'といといほー', 三暗刻: 'さんあんこう', 四暗刻: 'すーあんこう', 三色同順: 'さんしょくどうじゅん', 三色同刻: 'さんしょくどうこう', 三色: 'さんしょく', 一気通貫: 'いっきつうかん', 混全帯么九: 'ほんちゃんたいやおちゅう', 純全帯么九: 'じゅんちゃんたいやおちゅう', 混一色: 'ほんいーそー', 清一色: 'ちんいーそー', 小三元: 'しょうさんげん', 大三元: 'だいさんげん', 国士無双: 'こくしむそう', 緑一色: 'りゅういーそー', 字一色: 'つーいーそー', 小四喜: 'しょうすーしー', 大四喜: 'だいすーしー', 混老頭: 'ほんろうとう', 清老頭: 'ちんろうとう', 三槓子: 'さんかんつ', 四槓子: 'すーかんつ', 天和: 'てんほー', 地和: 'ちーほー', 槍槓: 'ちゃんかん', 嶺上開花: 'りんしゃんかいほー', 海底摸月: 'はいていもーゆえ', 河底撈魚: 'ほーていらおゆい', 食い下がり: 'くいさがり', 喰い下がり: 'くいさがり',
    満貫: 'まんがん', 跳満: 'はねまん', 倍満: 'ばいまん', 三倍満: 'さんばいまん', 役満: 'やくまん', 数え役満: 'かぞえやくまん', 基本点: 'きほんてん',
    暗槓: 'あんかん', 明槓: 'みんかん', 加槓: 'かかん', 鳴き: 'なき', 鳴く: 'なく', 鳴い: 'ない', 食い替え: 'くいかえ', 喰い替え: 'くいかえ', 副露: 'ふーろ',
    東風戦: 'とんぷうせん', 東南戦: 'とんなんせん', 流局: 'りゅうきょく', 荒牌平局: 'こうはいへいきょく', 和了: 'あがり', 親番: 'おやばん', 連荘: 'れんちゃん', 本場: 'ほんば', 持ち点: 'もちてん', 点棒: 'てんぼう', 配牌: 'はいぱい', 王牌: 'わんぱい', 嶺上牌: 'りんしゃんぱい', 裏ドラ: 'うらどら', 赤ドラ: 'あかどら', 場風: 'ばかぜ', 自風: 'じかぜ', 東家: 'とんちゃ', 南家: 'なんちゃ', 西家: 'しゃーちゃ', 北家: 'ぺーちゃ', 荒牌: 'こうはい',
    振聴: 'ふりてん', 同巡内: 'どうじゅんない', 手出し: 'てだし', 順位: 'じゅんい', 点差: 'てんさ', 符: 'ふ', 飜: 'はん', 翻: 'はん', 切り上げ: 'きりあげ', 待ち: 'まち', 河: 'かわ', 萬子: 'まんず', 筒子: 'ぴんず', 索子: 'そーず', 萬: 'まん', 雀: 'じゃん', 牌: 'はい',
  };
  const keys = Object.keys(D).sort((a, b) => b.length - a.length);
  const RE = new RegExp(keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  const R = (MJ.Ruby = {
    on: true,
    dict: D,
    apply(root) {
      if (!R.on || !root || typeof document === 'undefined') return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(n) {
          if (!n.nodeValue || !/[一-鿿]/.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
          const p = n.parentElement;
          if (!p || p.closest('ruby, rt, script, style, textarea, input, select, svg, .tile, .gl-skip, .no-ruby, #overlay .cf h2')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      const nodes = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
      nodes.forEach((n) => {
        const text = n.nodeValue;
        RE.lastIndex = 0;
        let m, last = 0, frag = null;
        while ((m = RE.exec(text))) {
          const next = text[m.index + m[0].length];
          if (next === '(' || next === '（') continue; // すでに読みが書いてある
          if (!frag) frag = document.createDocumentFragment();
          if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
          const ru = document.createElement('ruby');
          ru.appendChild(document.createTextNode(m[0]));
          const rt = document.createElement('rt');
          rt.textContent = D[m[0]];
          ru.appendChild(rt);
          frag.appendChild(ru);
          last = m.index + m[0].length;
        }
        if (frag) {
          if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
          n.parentNode.replaceChild(frag, n);
        }
      });
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
