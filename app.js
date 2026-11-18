/* ========== CEK LIBRARY ========== */
const libStatus = {
  jquery: typeof jQuery !== 'undefined',
  chess: typeof Chess !== 'undefined',
  chessboard: typeof Chessboard !== 'undefined'
};

if (!libStatus.jquery || !libStatus.chess || !libStatus.chessboard) {
  const msg = '❌ Gagal load: ' +
    (!libStatus.jquery ? 'jQuery ' : '') +
    (!libStatus.chess ? 'chess.js ' : '') +
    (!libStatus.chessboard ? 'chessboardjs' : '');
  const el = document.getElementById('status');
  if (el) { el.textContent = msg; el.className = 'status bad'; }
  console.error(msg, libStatus);
} else {
  init();
}

function init() {
  /* ========== SETUP ========== */
  const game = new Chess();
  const board = Chessboard('board', {
    draggable: true,
    position: 'start',
    pieceTheme: 'https://cdn.jsdelivr.net/npm/chessboardjs@1.0.0/img/chesspieces/wikipedia/{piece}.png',
    onDragStart,
    onDrop,
    onSnapEnd: () => board.position(game.fen())
  });

  const $status = document.getElementById('status');
  const $log = document.getElementById('log');
  const $evalFill = document.getElementById('evalFill');
  const $evalLabel = document.getElementById('evalLabel');
  const $qbox = document.getElementById('qbox');
  const $reviewSummary = document.getElementById('reviewSummary');
  let selectedSquare = null;

  /* ========== KUALITAS ========== */
  const QUALITY = {
    brilliant:  {label:'Brilliant',  color:'#26c2a3', emoji:'!!', desc:'Langkah terbaik + taktik.'},
    great:      {label:'Great',      color:'#5aa9ff', emoji:'!',  desc:'Sangat kuat.'},
    best:       {label:'Best',       color:'#3ddc84', emoji:'★',  desc:'Langkah terbaik.'},
    excellent:  {label:'Excellent',  color:'#8bd17c', emoji:'✓',  desc:'Sangat bagus.'},
    good:       {label:'Good',       color:'#c8d67a', emoji:'·',  desc:'Wajar.'},
    inaccuracy: {label:'Inaccuracy', color:'#f0c808', emoji:'?!', desc:'Kurang akurat.'},
    mistake:    {label:'Mistake',    color:'#ff9f43', emoji:'?',  desc:'Kesalahan.'},
    blunder:    {label:'Blunder',    color:'#ff5d5d', emoji:'??', desc:'Fatal.'}
  };

  function showQuality(q, extra) {
    const d = QUALITY[q];
    $qbox.innerHTML =
      `<span class="badge" style="background:${d.color}">${d.emoji} ${d.label}</span>` +
      `<span class="desc">${d.desc}${extra ? '<br><span style="color:#8b93a5">' + extra + '</span>' : ''}</span>`;
  }

  /* ========== ENGINE ========== */
  const PV = {p:100,n:320,b:330,r:500,q:900,k:20000};
  const PST = {
    p:[0,0,0,0,0,0,0,0,50,50,50,50,50,50,50,50,10,10,20,30,30,20,10,10,5,5,10,25,25,10,5,5,0,0,0,20,20,0,0,0,5,-5,-10,0,0,-10,-5,5,5,10,10,-20,-20,10,10,5,0,0,0,0,0,0,0,0],
    n:[-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,0,0,0,0,-20,-40,-30,0,10,15,15,10,0,-30,-30,5,15,20,20,15,5,-30,-30,0,15,20,20,15,0,-30,-30,5,10,15,15,10,5,-30,-40,-20,0,5,5,0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50],
    b:[-20,-10,-10,-10,-10,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,10,10,5,0,-10,-10,5,5,10,10,5,5,-10,-10,0,10,10,10,10,0,-10,-10,10,10,10,10,10,10,-10,-10,5,0,0,0,0,5,-10,-20,-10,-10,-10,-10,-10,-10,-20],
    r:[0,0,0,0,0,0,0,0,5,10,10,10,10,10,10,5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,0,0,0,5,5,0,0,0],
    q:[-20,-10,-10,-5,-5,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,5,5,5,0,-10,-5,0,5,5,5,5,0,-5,0,0,5,5,5,5,0,-5,-10,5,5,5,5,5,0,-10,-10,0,5,0,0,0,0,-10,-20,-10,-10,-5,-5,-10,-10,-20],
    k:[-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-20,-30,-30,-40,-40,-30,-30,-20,-10,-20,-20,-20,-20,-20,-20,-10,20,20,0,0,0,0,20,20,20,30,10,0,0,10,30,20]
  };

  function evaluateBoard(g) {
    if (g.in_checkmate()) return g.turn() === 'w' ? -99999 : 99999;
    if (g.in_draw() || g.in_stalemate()) return 0;
    let s = 0;
    const b = g.board();
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = b[r][c]; if (!p) continue;
      const idx = r * 8 + c;
      const pstIdx = p.color === 'w' ? idx : (7 - r) * 8 + c;
      const pst = PST[p.type] ? PST[p.type][pstIdx] : 0;
      s += (p.color === 'w' ? 1 : -1) * ((PV[p.type] || 0) + pst);
    }
    return s;
  }

  function negamax(g, d, a, b, col) {
    if (d === 0 || g.game_over()) return col * evaluateBoard(g);
    const ms = g.moves({verbose:true});
    ms.sort((x, y) => (y.captured ? PV[y.captured] : 0) - (x.captured ? PV[x.captured] : 0));
    let best = -Infinity;
    for (const m of ms) {
      g.move(m);
      const v = -negamax(g, d - 1, -b, -a, -col);
      g.undo();
      if (v > best) best = v;
      if (best > a) a = best;
      if (a >= b) break;
    }
    return best;
  }

  function evalBestMove(g, d = 3) {
    const ms = g.moves({verbose:true});
    if (!ms.length) return {move:null, val:0};
    let best = null, bv = -Infinity;
    const turn = g.turn() === 'w' ? 1 : -1;
    for (const m of ms) {
      g.move(m);
      const v = -negamax(g, d - 1, -Infinity, Infinity, -turn);
      g.undo();
      if (v > bv) { bv = v; best = m; }
    }
    return {move:best, val:bv};
  }

  /* ========== CLASSIFIER ========== */
  function classifyMove(deltaCp, playedIsBest, isSacrifice, isMate) {
    if (isMate) return 'best';
    if (playedIsBest) {
      if (isSacrifice) return 'brilliant';
      return 'best';
    }
    if (deltaCp <= 10) return 'great';
    if (deltaCp <= 30) return 'excellent';
    if (deltaCp <= 80) return 'good';
    if (deltaCp <= 150) return 'inaccuracy';
    if (deltaCp <= 300) return 'mistake';
    return 'blunder';
  }

  /* ========== UI ========== */
  function sqEl(sq) { return document.querySelector('.square-' + sq); }
  function clearHL() {
    document.querySelectorAll('.hl-from,.hl-to,.hl-hint,.hl-check')
      .forEach(e => e.classList.remove('hl-from','hl-to','hl-hint','hl-check'));
  }
  function hl(sq, c) { const e = sqEl(sq); if (e) e.classList.add(c); }
  function setStatus(t, type = 'ok') { $status.className = 'status ' + type; $status.textContent = t; }

  const moveEvals = [];
  function renderLog() {
    const h = game.history({verbose:true});
    if (!h.length) { $log.innerHTML = '<div style="color:#8b93a5">Belum ada langkah.</div>'; return; }
    $log.innerHTML = h.map((m, i) => {
      const n = Math.floor(i / 2) + 1;
      const side = i % 2 === 0 ? 'Putih' : 'Hitam';
      const rec = moveEvals[i];
      let cls = '';
      if (rec && (rec.quality === 'blunder' || rec.quality === 'mistake')) cls = 'blunder';
      else if (rec && (rec.quality === 'best' || rec.quality === 'brilliant' || rec.quality === 'great')) cls = 'best';
      const q = rec && QUALITY[rec.quality]
        ? `<span class="q" style="background:${QUALITY[rec.quality].color}">${QUALITY[rec.quality].emoji}</span>` : '';
      const ev = rec ? `<span class="ev">${rec.eval > 0 ? '+' : ''}${(rec.eval / 100).toFixed(2)}</span>` : '';
      return `<div class="${cls}"><span><span style="color:#8b93a5">${n}. ${side}</span> <span class="mv">${m.san}</span></span><span style="display:flex;gap:4px;align-items:center">${q}${ev}</span></div>`;
    }).join('');
    $log.scrollTop = $log.scrollHeight;
  }

  function updateEvalBar(s) {
    const cl = Math.max(-1000, Math.min(1000, s));
    $evalFill.style.width = (50 + (cl / 1000) * 50) + '%';
    $evalLabel.textContent = (s > 0 ? '+' : '') + (s / 100).toFixed(2);
  }

  function checkKing() {
    if (!game.in_check()) return;
    const t = game.turn(), b = game.board();
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = b[r][c];
      if (p && p.type === 'k' && p.color === t) hl('abcdefgh'[c] + (8 - r), 'hl-check');
    }
  }

  function updateStatus() {
    if (game.in_checkmate()) {
      const l = game.turn() === 'w' ? 'Putih' : 'Hitam';
      const w = game.turn() === 'w' ? 'Hitam' : 'Putih';
      setStatus(`♛ SKAKMAT! ${w} menang.`, 'bad'); return;
    }
    if (game.in_stalemate()) { setStatus('⚖️ Stalemate.', 'warn'); return; }
    if (game.in_threefold_repetition()) { setStatus('⚖️ Threefold.', 'warn'); return; }
    if (game.insufficient_material()) { setStatus('⚖️ Material kurang.', 'warn'); return; }
    if (game.in_draw()) { setStatus('⚖️ Draw.', 'warn'); return; }
    if (game.in_check()) setStatus(`⚠️ SKAK! Giliran ${game.turn() === 'w' ? 'Putih' : 'Hitam'}.`, 'warn');
    else setStatus(`Giliran: ${game.turn() === 'w' ? 'Putih' : 'Hitam'}`, 'ok');
  }

  function renderAll() {
    board.position(game.fen(), false);
    clearHL(); checkKing(); renderLog(); updateStatus();
    updateEvalBar(evaluateBoard(game));
  }

  /* ========== INPUT ========== */
  function onDragStart(source, piece) {
    if (game.game_over()) return false;
    if ((game.turn() === 'w' && piece.startsWith('b')) || (game.turn() === 'b' && piece.startsWith('w'))) return false;
    selectedSquare = source;
    clearHL(); hl(source, 'hl-from');
    return true;
  }

  function onDrop(source, target) {
    const mv = playMove(source, target);
    if (!mv) return 'snapback';
    renderAll(); hl(source, 'hl-from'); hl(target, 'hl-to');
  }

  $(document).on('click', '.square-55d63', function () {
    const cls = this.className.split(' ').find(c => c.startsWith('square-'));
    if (!cls) return;
    const sq = cls.replace('square-', '');
    if (!selectedSquare) {
      const p = game.get(sq); if (!p) return;
      if ((game.turn() === 'w' && p.color !== 'w') || (game.turn() === 'b' && p.color !== 'b')) return;
      selectedSquare = sq; clearHL(); hl(sq, 'hl-from'); return;
    }
    if (selectedSquare === sq) { selectedSquare = null; clearHL(); return; }
    const mv = playMove(selectedSquare, sq);
    if (mv) {
      const from = selectedSquare; selectedSquare = null;
      renderAll(); hl(from, 'hl-from'); hl(sq, 'hl-to');
    } else {
      const p = game.get(sq);
      if (p && ((game.turn() === 'w' && p.color === 'w') || (game.turn() === 'b' && p.color === 'b'))) {
        selectedSquare = sq; clearHL(); hl(sq, 'hl-from');
      } else { selectedSquare = null; clearHL(); }
    }
  });

  /* ========== PLAY + CLASSIFY ========== */
  function playMove(from, to) {
    try {
      const fenBefore = game.fen();
      const mover = game.turn();
      const { move: bestMv, val: bestVal } = evalBestMove(new Chess(fenBefore), 3);

      let mv;
      try { mv = game.move({from, to, promotion:'q'}); } catch (e) { return null; }
      if (!mv) return null;

      const scoreAfter = evaluateBoard(game);
      const isMate = game.in_checkmate();
      const sgn = mover === 'w' ? 1 : -1;
      const afterForMover = scoreAfter * sgn;
      const bestForMover = bestVal * sgn;
      const delta = Math.max(0, bestForMover - afterForMover);
      const playedIsBest = bestMv && bestMv.from === from && bestMv.to === to;

      let isSacrifice = false;
      if (playedIsBest) {
        const matBefore = materialCount(new Chess(fenBefore), mover);
        const matAfter = materialCount(game, mover);
        if (matAfter < matBefore && afterForMover > 50) isSacrifice = true;
      }

      const quality = classifyMove(delta, playedIsBest, isSacrifice, isMate);
      const bestSan = bestMv ? bestMv.san : null;
      showQuality(quality, bestSan && !playedIsBest ? `Best: ${bestSan}` : '');
      moveEvals.push({san: mv.san, eval: scoreAfter, quality});
      return mv;
    } catch (e) { return null; }
  }

  function materialCount(g, color) {
    let v = 0;
    g.board().forEach(row => row.forEach(p => {
      if (p && p.color === color && p.type !== 'k') v += PV[p.type] || 0;
    }));
    return v;
  }

  /* ========== BUTTONS ========== */
  document.getElementById('btnHint').addEventListener('click', () => {
    if (game.game_over()) return;
    setStatus('🧠 Menganalisis...', 'blue');
    setTimeout(() => {
      const {move, val} = evalBestMove(game, 3);
      if (!move) { setStatus('Tidak ada langkah.', 'bad'); return; }
      clearHL(); hl(move.from, 'hl-from'); hl(move.to, 'hl-hint');
      setStatus(`💡 Best: ${move.san} (${(val / 100).toFixed(2)})`, 'ok');
    }, 20);
  });

  document.getElementById('btnMate').addEventListener('click', () => {
    if (game.game_over()) return;
    const ms = game.moves({verbose:true});
    for (const m of ms) {
      game.move(m);
      const mate = game.in_checkmate();
      game.undo();
      if (mate) {
        clearHL(); hl(m.from, 'hl-from'); hl(m.to, 'hl-hint');
        setStatus(`🎯 SKAKMAT! ${m.san}`, 'bad'); return;
      }
    }
    setStatus('❌ Tidak ada skakmat 1 langkah.', 'warn');
  });

  document.getElementById('btnUndo').addEventListener('click', () => {
    game.undo(); moveEvals.pop(); selectedSquare = null; renderAll();
    $qbox.innerHTML = `<span class="badge" style="background:#2a2f3a;color:#8b93a5">—</span><span class="desc">Undo.</span>`;
  });

  document.getElementById('btnFlip').addEventListener('click', () => board.flip());

  document.getElementById('btnReset').addEventListener('click', () => {
    game.reset(); moveEvals.length = 0; selectedSquare = null;
    board.position('start', false); renderAll(); $reviewSummary.innerHTML = '';
    $qbox.innerHTML = `<span class="badge" style="background:#2a2f3a;color:#8b93a5">—</span><span class="desc">Reset.</span>`;
  });

  /* ========== IMPORT ========== */
  document.getElementById('btnLoadPgn').addEventListener('click', () => {
    const pgn = document.getElementById('pgnInput').value.trim();
    if (!pgn) { setStatus('⚠️ PGN kosong.', 'warn'); return; }
    try {
      game.load_pgn(pgn);
      moveEvals.length = 0;
      game.history({verbose:true}).forEach(m => moveEvals.push({san:m.san, eval:0, quality:null}));
      selectedSquare = null; renderAll(); setStatus('✅ PGN dimuat.', 'ok');
    } catch (e) { setStatus('❌ PGN invalid.', 'bad'); }
  });

  document.getElementById('btnLoadFen').addEventListener('click', () => {
    const fen = document.getElementById('fenInput').value.trim();
    if (!fen) { setStatus('⚠️ FEN kosong.', 'warn'); return; }
    try {
      game.load(fen); moveEvals.length = 0; selectedSquare = null; renderAll();
      setStatus('✅ FEN dimuat.', 'ok');
    } catch (e) { setStatus('❌ FEN invalid.', 'bad'); }
  });

  /* ========== REVIEW ========== */
  document.getElementById('btnReview').addEventListener('click', () => {
    const h = game.history({verbose:true});
    if (!h.length) { setStatus('⚠️ Belum ada langkah.', 'warn'); return; }
    setStatus('🔍 Review...', 'blue');
    setTimeout(() => {
      const replay = new Chess();
      const counts = {brilliant:0,great:0,best:0,excellent:0,good:0,inaccuracy:0,mistake:0,blunder:0};
      let totalErr = 0; const bl = [];
      for (let i = 0; i < h.length; i++) {
        const m = h[i];
        const fenBefore = replay.fen();
        const mover = replay.turn();
        const { move: bestMv, val: bestVal } = evalBestMove(new Chess(fenBefore), 2);
        replay.move(m.san);
        const scoreAfter = evaluateBoard(replay);
        const sgn = mover === 'w' ? 1 : -1;
        const afterForMover = scoreAfter * sgn;
        const bestForMover = bestVal * sgn;
        const delta = Math.max(0, bestForMover - afterForMover);
        const playedIsBest = bestMv && bestMv.san === m.san;
        let q = classifyMove(delta, playedIsBest, false, replay.in_checkmate());
        counts[q]++; totalErr += delta;
        moveEvals[i] = {san: m.san, eval: scoreAfter, quality: q};
        if (q === 'blunder' || q === 'mistake') bl.push({n: Math.floor(i / 2) + 1, side: i % 2 === 0 ? 'P' : 'H', san: m.san, delta});
      }
      renderLog();
      const acc = Math.max(0, 100 - (totalErr / h.length) / 10).toFixed(1);
      const rows = Object.entries(counts).filter(([k, v]) => v > 0)
        .map(([k, v]) => `<div>${QUALITY[k].emoji} ${QUALITY[k].label}: <span class="val">${v}</span></div>`).join('');
      const bls = bl.slice(0, 6).map(b =>
        `<div>• ${b.n}${b.side}: <b>${b.san}</b> (rugi ${(b.delta / 100).toFixed(2)})</div>`
      ).join('') || '<div>Tidak ada blunder besar 🎉</div>';
      $reviewSummary.innerHTML =
        `<div class="summary"><div>📊 Akurasi: <span class="val">${acc}%</span></div>` +
        `<div style="margin-top:4px">${rows}</div>` +
        `<div style="margin-top:6px;color:#8b93a5">Blunder:</div>` +
        `<div style="font-family:ui-monospace,monospace;font-size:.7rem">${bls}</div></div>`;
      setStatus('✅ Review selesai.', 'ok');
    }, 20);
  });

  /* ========== INIT ========== */
  renderAll();
}
