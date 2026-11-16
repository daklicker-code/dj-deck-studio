/**
 * DrawUtils — photorealistic canvas drawing helpers.
 * Assumes light source from top-left for all 3-D effects.
 */

/* ── Color helpers ──────────────────────────────────────── */
function hex2rgb(hex) {
  const h = hex.startsWith('#') ? hex.slice(1) : hex;
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
export function lighten(c, a) {
  const [r,g,b] = hex2rgb(c);
  return `rgb(${Math.min(255,Math.round(r+a*255))},${Math.min(255,Math.round(g+a*255))},${Math.min(255,Math.round(b+a*255))})`;
}
export function darken(c, a) {
  const [r,g,b] = hex2rgb(c);
  return `rgb(${Math.max(0,Math.round(r-a*255))},${Math.max(0,Math.round(g-a*255))},${Math.max(0,Math.round(b-a*255))})`;
}
export function alpha(c, a) {
  const [r,g,b] = hex2rgb(c);
  return `rgba(${r},${g},${b},${a})`;
}

/* ── Rounded rectangle path ─────────────────────────────── */
export function rr(ctx, x, y, w, h, r = 4) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y); ctx.arcTo(x+w, y, x+w, y+r, r);
  ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
  ctx.lineTo(x+r, y+h); ctx.arcTo(x, y+h, x, y+h-r, r);
  ctx.lineTo(x, y+r); ctx.arcTo(x, y, x+r, y, r);
  ctx.closePath();
}

/* ── Hardware body / chassis ────────────────────────────── */
export function drawBody(ctx, x, y, w, h, r = 6, color = '#17171f') {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
  const g = ctx.createLinearGradient(x, y, x + w * 0.15, y + h);
  g.addColorStop(0, lighten(color, 0.12));
  g.addColorStop(0.08, color);
  g.addColorStop(0.92, color);
  g.addColorStop(1,   darken(color, 0.18));
  ctx.fillStyle = g; rr(ctx, x, y, w, h, r); ctx.fill();
  ctx.shadowColor = 'transparent';
  // top-edge highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.11)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x+r, y+0.5); ctx.lineTo(x+w-r, y+0.5); ctx.stroke();
  // bottom-edge shadow
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x+r, y+h-0.5); ctx.lineTo(x+w-r, y+h-0.5); ctx.stroke();
  ctx.restore();
}

/* ── Photorealistic rotary knob ─────────────────────────── */
export function drawKnob(ctx, cx, cy, r, angle, {
  color = '#252530', accent = null, dotColor = 'rgba(255,255,255,0.9)',
  label = null, labelColor = 'rgba(200,200,215,0.6)', shadow = true
} = {}) {
  ctx.save();
  if (shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = r * 0.9;
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = r * 0.3;
  }
  if (accent) {
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, Math.PI*2); ctx.fill();
  }
  const bg = ctx.createRadialGradient(cx - r*.32, cy - r*.42, 0, cx + r*.08, cy + r*.08, r * 1.1);
  bg.addColorStop(0, lighten(color, 0.28));
  bg.addColorStop(0.4, color);
  bg.addColorStop(1, darken(color, 0.32));
  ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  // specular
  const sp = ctx.createRadialGradient(cx - r*.3, cy - r*.44, 0, cx, cy, r);
  sp.addColorStop(0, 'rgba(255,255,255,0.38)');
  sp.addColorStop(0.42, 'rgba(255,255,255,0.08)');
  sp.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sp; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
  // tick ring
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.arc(cx, cy, r * .84, -135*Math.PI/180, 135*Math.PI/180); ctx.stroke();
  // indicator dot
  const ax = cx + Math.cos(angle) * r * .62, ay = cy + Math.sin(angle) * r * .62;
  ctx.fillStyle = dotColor; ctx.shadowColor = 'rgba(255,255,255,0.4)'; ctx.shadowBlur = 2;
  ctx.beginPath(); ctx.arc(ax, ay, r * .1, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0;
  if (label) {
    ctx.fillStyle = labelColor;
    ctx.font = `bold ${Math.max(6, r * 0.52)}px 'Courier New', monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(label, cx, cy + r + 3);
  }
  ctx.restore();
}

/* ── 3-D push-button ────────────────────────────────────── */
export function drawButton(ctx, x, y, w, h, {
  color = '#202028', lit = false, litColor = '#00ff44',
  label = '', pressed = false, r = 2, fontSize = null
} = {}) {
  ctx.save();
  const dy = pressed ? 1 : 0;
  ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = pressed ? 0 : 1.5;
  const bg = ctx.createLinearGradient(x, y+dy, x, y+h+dy);
  if (lit) {
    const [lr,lg,lb] = hex2rgb(litColor.startsWith('#') ? litColor : '#00ff44');
    bg.addColorStop(0, `rgba(${lr},${lg},${lb},0.9)`);
    bg.addColorStop(1, `rgba(${Math.max(0,lr-70)},${Math.max(0,lg-70)},${Math.max(0,lb-70)},0.9)`);
  } else {
    bg.addColorStop(0, pressed ? '#1c1c28' : lighten(color, 0.12));
    bg.addColorStop(1, pressed ? '#131318' : darken(color, 0.1));
  }
  ctx.fillStyle = bg; rr(ctx, x, y+dy, w, h, r); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  // top sheen
  if (!pressed) {
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    rr(ctx, x+1, y+1, w-2, h*0.4, r); ctx.fill();
  }
  ctx.strokeStyle = lit ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 0.5; rr(ctx, x, y+dy, w, h, r); ctx.stroke();
  if (label) {
    ctx.fillStyle = lit ? '#fff' : 'rgba(230,230,245,0.72)';
    ctx.font = `bold ${fontSize || Math.max(6, h*.44)}px 'Courier New', monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (lit) { ctx.shadowColor = litColor; ctx.shadowBlur = 5; }
    ctx.fillText(label, x + w/2, y + h/2 + dy * 0.5);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

/* ── LED indicator ──────────────────────────────────────── */
export function drawLED(ctx, cx, cy, r, { lit = false, color = '#00ff44' } = {}) {
  ctx.save();
  if (lit) { ctx.shadowColor = color; ctx.shadowBlur = r * 2.5; }
  ctx.fillStyle = lit ? color : '#141418';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
  if (lit) {
    const sp = ctx.createRadialGradient(cx-r*.3, cy-r*.3, 0, cx, cy, r);
    sp.addColorStop(0, 'rgba(255,255,255,0.65)'); sp.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sp; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
  }
  ctx.restore();
}

/* ── VU meter (LED segments) ────────────────────────────── */
export function drawVU(ctx, x, y, w, h, level, vertical = true, segments = 12) {
  if (vertical) {
    const sh = (h - (segments - 1) * 1) / segments;
    for (let i = 0; i < segments; i++) {
      const iy = y + h - (i + 1) * (sh + 1);
      const lit = i / segments < level;
      ctx.fillStyle = i >= 10 ? (lit?'#ff2244':'#330a10') : i >= 8 ? (lit?'#ffaa00':'#1e1200') : (lit?'#00dd44':'#0a1a0a');
      ctx.fillRect(x, iy, w, sh);
    }
  } else {
    const sw = (w - (segments-1)*1) / segments;
    for (let i = 0; i < segments; i++) {
      const ix = x + i * (sw + 1);
      const lit = i / segments < level;
      ctx.fillStyle = i >= 10 ? (lit?'#ff2244':'#330a10') : i >= 8 ? (lit?'#ffaa00':'#1e1200') : (lit?'#00dd44':'#0a1a0a');
      ctx.fillRect(ix, y, sw, h);
    }
  }
}

/* ── LCD/LED display ────────────────────────────────────── */
export function drawDisplay(ctx, x, y, w, h, text, {
  bg = '#000a10', textColor = '#00e5ff', r = 3, glow = true, font = null, align = 'center'
} = {}) {
  ctx.save();
  rr(ctx, x, y, w, h, r);
  const sg = ctx.createLinearGradient(x, y, x, y+h);
  sg.addColorStop(0, bg); sg.addColorStop(1, darken(bg, 0.15));
  ctx.fillStyle = sg; ctx.fill();
  ctx.strokeStyle = 'rgba(0,180,255,0.18)'; ctx.lineWidth = 1; ctx.stroke();
  // reflection
  const ref = ctx.createLinearGradient(x, y, x+w*.5, y+h*.4);
  ref.addColorStop(0, 'rgba(255,255,255,0.055)'); ref.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = ref; rr(ctx, x, y, w, h*0.5, r); ctx.fill();
  if (text) {
    if (glow) { ctx.shadowColor = textColor; ctx.shadowBlur = 7; }
    ctx.fillStyle = textColor;
    ctx.font = font || `${Math.min(h*.5, 14)}px 'Courier New', monospace`;
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.fillText(text, align==='center' ? x+w/2 : align==='left' ? x+6 : x+w-6, y+h/2);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

/* ── Phillips screw ─────────────────────────────────────── */
export function drawScrew(ctx, cx, cy, r = 4) {
  ctx.save();
  const g = ctx.createRadialGradient(cx-r*.3, cy-r*.3, 0, cx, cy, r);
  g.addColorStop(0, '#686878'); g.addColorStop(1, '#282835');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#3a3a4a'; ctx.lineWidth = 0.6;
  const a = Math.PI/4;
  for (let i = 0; i < 4; i++) {
    const ax = Math.cos(a + i*Math.PI/2), ay = Math.sin(a + i*Math.PI/2);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx+ax*r*.55, cy+ay*r*.55); ctx.stroke();
  }
  ctx.restore();
}

/* ── Vertical fader ─────────────────────────────────────── */
export function drawFaderV(ctx, x, y, w, h, value, { trackColor = '#0d0d18' } = {}) {
  const tw = Math.round(w * .28), tx = x + (w - tw) / 2;
  // track
  const tg = ctx.createLinearGradient(tx, y, tx+tw, y);
  tg.addColorStop(0, '#080810'); tg.addColorStop(1, '#1a1a28');
  ctx.fillStyle = tg; rr(ctx, tx, y, tw, h, tw/2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 0.5;
  rr(ctx, tx, y, tw, h, tw/2); ctx.stroke();
  // cap
  const capH = Math.round(h * .1), capY = y + (1 - value) * (h - capH);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4; ctx.shadowOffsetX = 1;
  const cg = ctx.createLinearGradient(x, capY, x+w, capY);
  cg.addColorStop(0, '#5a5a6a'); cg.addColorStop(.5, '#4a4a5a'); cg.addColorStop(1, '#252530');
  ctx.fillStyle = cg; rr(ctx, x, capY, w, capH, 2); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 0.5;
  rr(ctx, x, capY, w, capH, 2); ctx.stroke();
  // center line on cap
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(x+w*.2, capY+capH/2); ctx.lineTo(x+w*.8, capY+capH/2); ctx.stroke();
  ctx.restore();
}

/* ── Horizontal fader ───────────────────────────────────── */
export function drawFaderH(ctx, x, y, w, h, value) {
  const th = Math.round(h * .28), ty = y + (h - th) / 2;
  const tg = ctx.createLinearGradient(x, ty, x, ty+th);
  tg.addColorStop(0, '#080810'); tg.addColorStop(1, '#1a1a28');
  ctx.fillStyle = tg; rr(ctx, x, ty, w, th, th/2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 0.5;
  rr(ctx, x, ty, w, th, th/2); ctx.stroke();
  const capW = Math.round(w * .08), capX = x + value * (w - capW);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;
  const cg = ctx.createLinearGradient(capX, y, capX, y+h);
  cg.addColorStop(0, '#5a5a6a'); cg.addColorStop(.5, '#4a4a5a'); cg.addColorStop(1, '#252530');
  ctx.fillStyle = cg; rr(ctx, capX, y, capW, h, 2); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 0.5;
  rr(ctx, capX, y, capW, h, 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(capX+capW/2, y+h*.2); ctx.lineTo(capX+capW/2, y+h*.8); ctx.stroke();
  ctx.restore();
}

/* ── Rubber pad ─────────────────────────────────────────── */
export function drawPad(ctx, x, y, w, h, { color = '#1a1a24', lit = false, litColor = '#3a9bd5', r = 3 } = {}) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
  const bg = ctx.createLinearGradient(x, y, x+w*.3, y+h);
  if (lit) {
    bg.addColorStop(0, lighten(litColor, 0.15)); bg.addColorStop(1, darken(litColor, 0.3));
  } else {
    bg.addColorStop(0, lighten(color, 0.1)); bg.addColorStop(1, darken(color, 0.1));
  }
  ctx.fillStyle = bg; rr(ctx, x, y, w, h, r); ctx.fill();
  ctx.shadowColor = 'transparent';
  if (lit) { ctx.shadowColor = litColor; ctx.shadowBlur = 10; }
  // inner inset shadow
  ctx.strokeStyle = lit ? alpha(litColor, 0.6) : 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 0.8; rr(ctx, x, y, w, h, r); ctx.stroke();
  ctx.restore();
}

/* ── Brushed aluminum fill ──────────────────────────────── */
export function aluminumGrad(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(x, y, x, y+h);
  g.addColorStop(0,   '#d8d8e0');
  g.addColorStop(0.08,'#b8b8c4');
  g.addColorStop(0.3, '#c0c0cc');
  g.addColorStop(0.5, '#a8a8b8');
  g.addColorStop(0.7, '#b4b4c0');
  g.addColorStop(0.92,'#c8c8d4');
  g.addColorStop(1,   '#a0a0ae');
  return g;
}

/* ── Chrome ring ────────────────────────────────────────── */
export function chromeGrad(ctx, cx, cy, r0, r1) {
  const g = ctx.createRadialGradient(cx - r1*.2, cy - r1*.2, r0, cx, cy, r1);
  g.addColorStop(0,   '#e0e0e8');
  g.addColorStop(0.3, '#b0b0bc');
  g.addColorStop(0.6, '#d0d0dc');
  g.addColorStop(0.8, '#888898');
  g.addColorStop(1,   '#c8c8d4');
  return g;
}
