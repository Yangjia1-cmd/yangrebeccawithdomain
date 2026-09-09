// Drawing tool — follows the cursor. Three modes, switched from the sidebar:
//   pencil      — pixelated squares trailing the cursor
//   keyboard    — random keyboard symbols scattered along the path that fade away
//   replication — a single persistent cursor copy, offset down-and-right
// The muted color cycles every 3 seconds.
(function () {
  if (!document.querySelector('.tool-option')) return;

  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999;';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const MUTED_COLORS = [
    '#d38f9d', // muted pink
    '#8ba7c4', // muted blue
    '#8fae8b', // muted green
    '#b57eae', // muted magenta
    '#d69e72'  // muted orange
  ];
  const SYMBOLS = ['*','&','^','%','$','#','@','!','~','+','=','?','/','<','>'];
  const PIXEL_SIZE = 4;
  const REP_OFFSET = 46; // replicated cursor sits this far down-and-right of the real one
  const CURSOR_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="26" viewBox="0 0 22 26">' +
    '<path d="M2 2 L2 22 L7.5 16.5 L11 24 L14 22.6 L10.5 15.2 L18 15 Z" ' +
    'fill="#191714" stroke="#ffffff" stroke-width="1.4" stroke-linejoin="round"/></svg>';

  let colorIndex = 0;
  let mode = 'pencil';
  let last = null;
  let lastCharTime = 0;
  let repCursorEl = null;

  const currentColor = () => MUTED_COLORS[colorIndex];

  function applyStyle() {
    ctx.fillStyle = currentColor();
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = window.innerWidth  * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    applyStyle();
    last = null;
  }
  resize();
  window.addEventListener('resize', resize);

  function spawnSymbol(x, y) {
    const el = document.createElement('span');
    el.textContent = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    const size = (13 + Math.random() * 9).toFixed(0);
    el.style.cssText =
      'position:fixed;left:' + x + 'px;top:' + y + 'px;' +
      'transform:translate(-50%,-50%) rotate(' + ((Math.random() - 0.5) * 44).toFixed(1) + 'deg);' +
      'pointer-events:none;z-index:9999;font-family:var(--font-sans);' +
      'font-size:' + size + 'px;color:' + currentColor() + ';' +
      'opacity:1;transition:opacity 0.55s ease;';
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '0'; });
    setTimeout(() => el.remove(), 650);
  }

  // Scatter n symbols along the segment a->b with a little jitter.
  function emitAlong(ax, ay, bx, by, n) {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 1 : i / (n - 1);
      spawnSymbol(
        ax + (bx - ax) * t + (Math.random() - 0.5) * 18,
        ay + (by - ay) * t + (Math.random() - 0.5) * 18
      );
    }
  }

  // Pixel pencil — fill one grid-snapped square, like a pixel-art brush.
  function drawPixel(x, y) {
    const gx = Math.floor(x / PIXEL_SIZE) * PIXEL_SIZE;
    const gy = Math.floor(y / PIXEL_SIZE) * PIXEL_SIZE;
    ctx.fillStyle = currentColor();
    ctx.fillRect(gx, gy, PIXEL_SIZE, PIXEL_SIZE);
  }

  // Stamp pixels along a->b so fast mouse movement still leaves a solid trail.
  function drawPixelTrail(ax, ay, bx, by) {
    const dist = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.ceil(dist / (PIXEL_SIZE * 0.7)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      drawPixel(ax + (bx - ax) * t, ay + (by - ay) * t);
    }
  }

  // Replication — a single cursor copy that stays on screen, offset from the real one.
  function ensureRepCursor() {
    if (!repCursorEl) {
      repCursorEl = document.createElement('div');
      repCursorEl.innerHTML = CURSOR_SVG;
      repCursorEl.style.cssText =
        'position:fixed;left:0;top:0;pointer-events:none;z-index:9999;opacity:0.9;';
      document.body.appendChild(repCursorEl);
    }
    return repCursorEl;
  }

  function moveRepCursor(x, y) {
    const el = ensureRepCursor();
    el.style.display = 'block';
    el.style.transform = 'translate(' + (x + REP_OFFSET) + 'px,' + (y + REP_OFFSET) + 'px)';
  }

  function hideRepCursor() {
    if (repCursorEl) repCursorEl.style.display = 'none';
  }

  window.addEventListener('mousemove', (e) => {
    const p = { x: e.clientX, y: e.clientY };
    const from = last || p;

    if (mode === 'pencil') {
      if (last) drawPixelTrail(last.x, last.y, p.x, p.y);
      else drawPixel(p.x, p.y);
    } else if (mode === 'keyboard') {
      // One symbol per ~7px travelled — the count rises directly with
      // mouse speed — plus a time fallback so a slow drift still trails.
      const moved = Math.hypot(p.x - from.x, p.y - from.y);
      let count = Math.floor(moved / 7);
      if (count === 0 && moved > 1 && e.timeStamp - lastCharTime > 70) count = 1;
      count = Math.min(count, 16);
      if (count > 0) {
        emitAlong(from.x, from.y, p.x, p.y, count);
        lastCharTime = e.timeStamp;
      }
    } else if (mode === 'replication') {
      moveRepCursor(p.x, p.y);
    }

    last = p;
  });

  document.addEventListener('mouseleave', () => { last = null; });

  // Scrolling drives the keyboard tool: symbols scatter at the cursor,
  // scaled by scroll speed. The pencil line does not draw on scroll.
  window.addEventListener('wheel', (e) => {
    if (mode !== 'keyboard' || !last) return;
    const count = Math.min(14, 1 + Math.floor(Math.abs(e.deltaY) / 20));
    for (let i = 0; i < count; i++) {
      spawnSymbol(
        last.x + (Math.random() - 0.5) * 48,
        last.y + (Math.random() - 0.5) * 48
      );
    }
  }, { passive: true });

  setInterval(() => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let next;
    do {
      next = Math.floor(Math.random() * MUTED_COLORS.length);
    } while (next === colorIndex);
    colorIndex = next;
    applyStyle();
    last = null;
  }, 3000);

  // Sidebar tool switcher
  document.querySelectorAll('.tool-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tool-option')
        .forEach((b) => b.classList.toggle('is-active', b === btn));
      mode = btn.dataset.tool;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      last = null;
      if (mode !== 'replication') hideRepCursor();
    });
  });
})();
