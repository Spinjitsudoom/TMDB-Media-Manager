export interface CustomTheme { name: string; bg: string; accent: string }

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6
          : max === g ? ((b - r) / d + 2) / 6
          : ((r - g) / d + 4) / 6;
  return [h * 360, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  h /= 360; s /= 100; l /= 100;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const hue = (t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    return t < 1/6 ? p + (q - p) * 6 * t : t < 1/2 ? q : t < 2/3 ? p + (q - p) * (2/3 - t) * 6 : p;
  };
  return '#' + [hue(h + 1/3), hue(h), hue(h - 1/3)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}

export function injectCustomThemeCss(slot: 1 | 2 | 3, t: CustomTheme) {
  const [bh, bs, bl] = hexToHsl(t.bg);
  const [ah, as_, al] = hexToHsl(t.accent);
  const bg = (step: number) => hslToHex(bh, bs, Math.min(bl + step, 95));
  const ac = (step: number) => hslToHex(ah, as_, Math.max(0, Math.min(al + step, 95)));

  const css = `[data-theme="Custom${slot}"] {
    --bg-900: ${bg(0)}; --bg-800: ${bg(3)}; --bg-750: ${bg(5)};
    --bg-700: ${bg(7)}; --bg-600: ${bg(11)}; --bg-500: ${bg(15)}; --bg-400: ${bg(19)};
    --accent-400: ${ac(15)}; --accent-500: ${t.accent}; --accent-600: ${ac(-10)}; --accent-700: ${ac(-18)};
    --text-primary: #e2e8f0; --text-secondary: #94a3b8; --text-muted: #64748b;
    --border: rgba(255,255,255,0.07);
  }`;

  let el = document.getElementById(`custom-theme-${slot}`) as HTMLStyleElement | null;
  if (!el) { el = document.createElement('style'); el.id = `custom-theme-${slot}`; document.head.appendChild(el); }
  el.textContent = css;
}
