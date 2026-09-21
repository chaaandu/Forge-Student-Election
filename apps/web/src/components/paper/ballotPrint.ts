/**
 * Draws the ballot's printed face onto a 2D canvas, which is then used as the
 * texture for the 3D sheet.
 *
 * Drawing the title *onto the paper* rather than floating it above the canvas
 * is the whole trick: the type creases and catches the light with the sheet,
 * so it reads as printed matter instead of a caption over a background.
 */
export interface BallotPrintOptions {
  title: string;
  subtitle: string;
  footer: string;
}

export const PRINT_WIDTH = 1024;
export const PRINT_HEIGHT = 724;

export function drawBallotPrint(
  canvas: HTMLCanvasElement,
  { title, subtitle, footer }: BallotPrintOptions,
): void {
  canvas.width = PRINT_WIDTH;
  canvas.height = PRINT_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = PRINT_WIDTH;
  const H = PRINT_HEIGHT;

  ctx.fillStyle = '#FCFAF4';
  ctx.fillRect(0, 0, W, H);

  // The printed frame of an official form.
  ctx.strokeStyle = '#CFC6B0';
  ctx.lineWidth = 2;
  ctx.strokeRect(44, 44, W - 88, H - 88);
  ctx.strokeStyle = '#E2DAC7';
  ctx.lineWidth = 1;
  ctx.strokeRect(56, 56, W - 112, H - 112);

  ctx.textAlign = 'center';

  // Masthead
  ctx.fillStyle = '#837C6D';
  ctx.font = '600 22px "Inter Variable", system-ui, sans-serif';
  ctx.letterSpacing = '9px';
  ctx.fillText('MESA SCHOOL OF BUSINESS', W / 2, 136);
  ctx.letterSpacing = '0px';

  // Title — the reason the sheet exists.
  ctx.fillStyle = '#1B1A16';
  ctx.font = '600 92px "Fraunces Variable", Georgia, serif';
  ctx.fillText(title, W / 2, 262);

  ctx.fillStyle = '#56524A';
  ctx.font = '400 30px "Inter Variable", system-ui, sans-serif';
  ctx.fillText(subtitle, W / 2, 316);

  // Rule
  ctx.strokeStyle = '#D9D1BE';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 190, 362);
  ctx.lineTo(W / 2 + 190, 362);
  ctx.stroke();

  // Ballot rows: empty boxes with ruled lines beside them. Suggests the form
  // without pretending to be a specific one.
  const rows = 5;
  const top = 412;
  const gap = 52;
  for (let i = 0; i < rows; i += 1) {
    const y = top + i * gap;
    ctx.strokeStyle = '#CFC6B0';
    ctx.lineWidth = 2;
    ctx.strokeRect(232, y, 30, 30);

    ctx.strokeStyle = '#E6DFCE';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(288, y + 24);
    ctx.lineTo(792 - i * 46, y + 24);
    ctx.stroke();
  }

  // One box already marked, in ink. The sheet shows you what to do.
  ctx.strokeStyle = '#B04A2F';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(234, top + gap * 2 + 15);
  ctx.quadraticCurveTo(242, top + gap * 2 + 26, 247, top + gap * 2 + 33);
  ctx.quadraticCurveTo(255, top + gap * 2 + 12, 266, top + gap * 2 - 2);
  ctx.stroke();

  ctx.fillStyle = '#837C6D';
  ctx.font = '600 19px "Inter Variable", system-ui, sans-serif';
  ctx.letterSpacing = '7px';
  ctx.fillText(footer, W / 2, H - 92);
  ctx.letterSpacing = '0px';
}
