import type { Map as MapLibreMap } from 'maplibre-gl';
import { POINT_ICON_OPTIONS } from './styleOptions';

const ICON_SIZE = 64;

export function registerDefaultPointIcons(map: MapLibreMap): void {
  for (const icon of POINT_ICON_OPTIONS) {
    try {
      if ((map as any).hasImage?.(icon.id)) continue;
      const image = drawIconImage(icon.id);
      map.addImage(icon.id, image as any, { sdf: true, pixelRatio: 2 });
    } catch {}
  }
}

function drawIconImage(id: string): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.clearRect(0, 0, ICON_SIZE, ICON_SIZE);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (id) {
    case 'odl-circle-dot':
      ctx.beginPath();
      ctx.arc(32, 32, 16, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'odl-square':
      roundRect(ctx, 16, 16, 32, 32, 5);
      ctx.fill();
      break;
    case 'odl-diamond':
      ctx.beginPath();
      ctx.moveTo(32, 12);
      ctx.lineTo(52, 32);
      ctx.lineTo(32, 52);
      ctx.lineTo(12, 32);
      ctx.closePath();
      ctx.fill();
      break;
    case 'odl-triangle':
      ctx.beginPath();
      ctx.moveTo(32, 12);
      ctx.lineTo(52, 50);
      ctx.lineTo(12, 50);
      ctx.closePath();
      ctx.fill();
      break;
    case 'odl-star':
      drawStar(ctx, 32, 32, 21, 9, 5);
      ctx.fill();
      break;
    case 'odl-cross':
      ctx.beginPath();
      ctx.moveTo(32, 14);
      ctx.lineTo(32, 50);
      ctx.moveTo(14, 32);
      ctx.lineTo(50, 32);
      ctx.stroke();
      break;
    case 'odl-flag':
      ctx.beginPath();
      ctx.moveTo(19, 52);
      ctx.lineTo(19, 13);
      ctx.moveTo(21, 14);
      ctx.lineTo(49, 14);
      ctx.lineTo(41, 27);
      ctx.lineTo(49, 40);
      ctx.lineTo(21, 40);
      ctx.stroke();
      break;
    case 'odl-marker':
    default:
      ctx.beginPath();
      ctx.moveTo(32, 58);
      ctx.bezierCurveTo(22, 43, 14, 35, 14, 25);
      ctx.bezierCurveTo(14, 15, 22, 8, 32, 8);
      ctx.bezierCurveTo(42, 8, 50, 15, 50, 25);
      ctx.bezierCurveTo(50, 35, 42, 43, 32, 58);
      ctx.closePath();
      ctx.fill();
      ctx.clearRect(26, 19, 12, 12);
      ctx.beginPath();
      ctx.arc(32, 25, 6, 0, Math.PI * 2);
      ctx.fill();
      break;
  }

  return ctx.getImageData(0, 0, ICON_SIZE, ICON_SIZE);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number, points: number): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / points;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}
