function hash(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = Math.imul(31, h) + name.charCodeAt(i) | 0;
  }
  return Math.abs(h);
}

export function colorFromName(name: string): string {
  const h = hash(name);
  const hue = h % 360;
  const sat = 45 + (h >> 8) % 25;
  const lit = 18 + (h >> 16) % 10;
  return `hsl(${hue},${sat}%,${lit}%)`;
}

export function gradientFromName(name: string): string {
  const h = hash(name);
  const hue1 = h % 360;
  const hue2 = (hue1 + 40 + (h >> 8) % 20) % 360;
  return `linear-gradient(135deg, hsl(${hue1},55%,18%) 0%, hsl(${hue2},50%,12%) 100%)`;
}

export function accentFromName(name: string): string {
  const h = hash(name);
  const hue = h % 360;
  return `hsl(${hue},65%,60%)`;
}
