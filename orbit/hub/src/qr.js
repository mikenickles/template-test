import qrcode from 'qrcode-generator';

function encode(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr;
}

/** The QR code as an SVG image, dark modules on a transparent background. */
export function qrSvg(text, cellSize = 8) {
  return encode(text).createSvgTag({ cellSize, margin: 0, scalable: true });
}

/**
 * The QR code drawn with block characters, two modules per line. Light areas are drawn as solid
 * blocks so the code reads correctly on the usual dark terminal background.
 */
export function qrTerminal(text, indent = '  ') {
  const qr = encode(text);
  const n = qr.getModuleCount();
  const quiet = 2;
  const light = (row, col) => row < 0 || col < 0 || row >= n || col >= n || !qr.isDark(row, col);
  const lines = [];
  for (let row = -quiet; row < n + quiet; row += 2) {
    let line = indent;
    for (let col = -quiet; col < n + quiet; col++) {
      const top = light(row, col);
      const bottom = row + 1 < n + quiet ? light(row + 1, col) : false;
      line += top && bottom ? '█' : top ? '▀' : bottom ? '▄' : ' ';
    }
    lines.push(line);
  }
  return lines.join('\n');
}

/** What the app's scanner (and deep link) reads: where the hub is and the current pairing code. */
export function pairingLink({ host, code, name }) {
  const params = new URLSearchParams({ host, code });
  if (name) params.set('name', name);
  return `orbit://pair?${params}`;
}
