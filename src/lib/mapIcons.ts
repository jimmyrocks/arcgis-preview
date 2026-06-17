import type { Map as MapLibreMap } from 'maplibre-gl';
import { POINT_ICON_OPTIONS } from './styleOptions';

const ICON_SIZE = 64;
const PINHEAD_VIEWBOX_SIZE = 15;
const PINHEAD_PADDING = 4;

// Curated CC0 Pinhead map symbols. Keep this intentionally small; ArcGIS
// Preview is a scout, not a full icon catalog.
const PINHEAD_PATHS: Record<string, string> = {
  'pinhead-p': 'M9 0C11.76 0 14 2.24 14 5C14 7.76 11.76 10 9 10L6 10L6 15L3 15L3 0L9 0ZM6 7L9 7C10.1 7 11 6.1 11 5C11 3.9 10.1 3 9 3L6 3L6 7Z',
  'pinhead-bus': 'M2 3C2 1.9 2.9 1 4 1L11 1C12.1 1 13 1.9 13 3L13 11C13 12 12 12 12 12L12 13C12 13 12 14 11 14C10 14 10 13 10 13L10 12L5 12L5 13C5 13 5 14 4 14C3 14 3 13 3 13L3 12C2 12 2 11 2 11L2 7.2L2 3ZM3.5 2.5C3.22 2.5 3 2.72 3 3L3 7C3 7.28 3.22 7.5 3.5 7.5L11.5 7.5C11.78 7.5 12 7.28 12 7L12 3C12 2.72 11.78 2.5 11.5 2.5L3.5 2.5ZM4 9C3.45 9 3 9.45 3 10C3 10.55 3.45 11 4 11C4.55 11 5 10.55 5 10C5 9.45 4.55 9 4 9ZM11 9C10.45 9 10 9.45 10 10C10 10.55 10.45 11 11 11C11.55 11 12 10.55 12 10C12 9.45 11.55 9 11 9Z',
  'pinhead-car': 'M4.62 2L10.38 2C10.76 2 11.11 2.21 11.28 2.55L13 6C13.55 6 14 6.45 14 7L14 11.5L13 11.5L13 12.5C13 13.05 12.55 13.5 12 13.5L11 13.5C10.45 13.5 10 13.05 10 12.5L10 11.5L5 11.5L5 12.5C5 13.05 4.55 13.5 4 13.5L3 13.5C2.45 13.5 2 13.05 2 12.5L2 11.5L1 11.5L1 7C1 6.45 1.45 6 2 6L3.72 2.55C3.89 2.21 4.24 2 4.62 2ZM4.25 7.5C3.56 7.5 3 8.06 3 8.75C3 9.44 3.56 10 4.25 10C4.94 10 5.5 9.44 5.5 8.75C5.5 8.06 4.94 7.5 4.25 7.5ZM10.75 7.5C10.06 7.5 9.5 8.06 9.5 8.75C9.5 9.44 10.06 10 10.75 10C11.44 10 12 9.44 12 8.75C12 8.06 11.44 7.5 10.75 7.5ZM10.25 3.5L4.75 3.5L3.5 6L11.5 6L10.25 3.5Z',
  'pinhead-bicycle': 'M7.5 2c-0.68 -0.01 -0.68 1.01 0 1H9v1.27l-2.8 2.33L5.22 4H5.5c0.68 0.01 0.68 -1.01 0 -1h-2c-0.68 -0.01 -0.68 1.01 0 1h0.65L5.04 6.38C4.58 6.14 4.06 6 3.5 6C1.57 6 0 7.57 0 9.5S1.57 13 3.5 13S7 11.43 7 9.5c0 -0.67 -0.2 -1.29 -0.53 -1.82L9.29 5.33l0.46 1.16C8.71 7.09 8 8.21 8 9.5c0 1.93 1.57 3.5 3.5 3.5S15 11.43 15 9.5S13.43 6 11.5 6c-0.28 0 -0.55 0.04 -0.82 0.11L10 4.4V2.5c0 -0.28 -0.22 -0.5 -0.5 -0.5H7.5zM3.5 7c0.59 0 1.13 0.21 1.55 0.55l-1.87 1.56c-0.51 0.43 0.13 1.19 0.64 0.77l1.88 -1.56C5.88 8.67 6 9.07 6 9.5C6 10.89 4.89 12 3.5 12S1 10.89 1 9.5S2.11 7 3.5 7L3.5 7zM11.5 7C12.89 7 14 8.11 14 9.5S12.89 12 11.5 12S9 10.89 9 9.5c0 -0.88 0.45 -1.64 1.13 -2.09l0.91 2.27c0.25 0.62 1.18 0.25 0.93 -0.37l-0.91 -2.27C11.2 7.02 11.35 7 11.5 7L11.5 7z',
  'pinhead-charging_station': 'M2.14 1.07C0.89 1.07 0 1.92 0 3.21L0 15L7.5 15L7.5 6.56C7.5 6.56 8.44 6.43 8.44 7.5L8.44 11.79C8.44 13.93 10.44 14.06 10.71 14.06C11.01 14.06 12.99 13.93 12.99 11.79L12.99 7.5C12.99 7.5 14.48 7.52 14.46 4.32L13.66 4.32L13.66 2.18C13.66 1.57 12.86 1.57 12.86 2.14L12.86 4.29L11.79 4.29L11.79 2.14C11.79 1.56 10.98 1.56 10.98 2.14L10.98 4.29L10.18 4.29C10.19 7.49 11.65 7.5 11.65 7.5L11.65 11.79C11.65 12.72 10.83 12.72 10.71 12.72C10.6 12.72 9.78 12.68 9.78 11.79L9.78 7.5C9.78 6.13 8.57 5.22 7.5 5.22L7.5 3.21C7.5 1.9 6.63 1.07 5.36 1.07L2.14 1.07Z',
  'pinhead-campsite': 'M14 10.5L14 11.5C14 11.78 13.78 12 13.5 12L1.5 12C1.22 12 1 11.78 1 11.5L1 10.5C1 10.22 1.22 10 1.5 10L2.25 10L7.03 1.26C7.25 0.91 7.75 0.91 7.97 1.26L12.75 10L13.5 10C13.75 10 13.95 10.18 13.99 10.41L14 10.5ZM10 10L7.5 5L5 10L10 10Z',
  'pinhead-broadleaved_tree': 'M14 5.75c0.01 -0.69 -0.38 -1.32 -1 -1.61C12.95 3.49 12.4 2.99 11.75 3c-0.1 0.01 -0.2 0.03 -0.29 0.06c-0.06 -0.66 -0.64 -1.15 -1.3 -1.09C9.9 2 9.65 2.11 9.46 2.28l0 0c0 -0.69 -0.56 -1.25 -1.25 -1.25S6.96 1.59 6.96 2.28C6.96 2.28 7 2.3 7 2.33C6.49 1.89 5.72 1.95 5.28 2.46C5.13 2.63 5.03 2.85 5 3.07C4.84 3.02 4.68 3 4.51 3C3.68 2.99 3 3.66 3 4.49C3 4.69 3.03 4.89 3.11 5.07C2.32 5.29 1.85 6.11 2.08 6.91C2.22 7.41 2.61 7.8 3.11 7.94c0.25 0.78 1.09 1.21 1.88 0.96C5.52 8.73 5.91 8.27 6 7.71C6.18 7.87 6.41 7.97 6.65 8v5L5 14h5l-1.6 -1v-2c0.74 -0.89 1.69 -1.58 2.77 -2c0.8 0.19 1.6 -0.31 1.79 -1.11C12.99 7.77 13 7.64 13 7.52c0 -0.05 0 -0.11 0 -0.16C13.62 7.07 14.01 6.44 14 5.75zM8.4 10.26V6.82C8.67 7.3 9.18 7.6 9.73 7.6h0.28c0.02 0.44 0.22 0.85 0.57 1.12C9.76 9.09 9.03 9.62 8.4 10.26z',
  'pinhead-bench': 'M0.5 6L14.5 6C14.78 6 15 6.22 15 6.5L15 11L15 11L13 11L13 8L2 8L2 11L0 11L0 6.5C0 6.22 0.22 6 0.5 6Z',
  'pinhead-spoon_and_fork': 'M4.49 0c0.86 -0.01 2.29 1.78 2.5 3.71c0.2 1.93 -1.76 2.74 -1.74 3.41l0.25 6.88c0.01 0.25 -0.07 0.56 -0.26 0.73c-0.2 0.19 -0.45 0.28 -0.73 0.27c-0.26 0.01 -0.52 -0.09 -0.7 -0.27c-0.19 -0.17 -0.32 -0.48 -0.31 -0.73l0.26 -6.88c0.03 -0.78 -1.91 -1.79 -1.75 -3.42c0.18 -1.63 1.62 -3.71 2.48 -3.7zm0.12 1.19c0.26 1.18 0.41 2.06 0.41 2.65s-0.14 1.35 -0.4 2.27c0.8 -0.37 1.19 -1.13 1.19 -2.27s-0.4 -2.02 -1.2 -2.65zm4.39 -1.19l-0.51 0.01l-0.49 5.49c0.02 0.82 1.78 1.18 1.76 2l-0.26 6.5c-0.01 0.27 0.09 0.53 0.28 0.72s0.45 0.29 0.71 0.28c0.27 0.01 0.53 -0.09 0.72 -0.28s0.3 -0.45 0.29 -0.72l-0.26 -6.5c-0.03 -0.82 1.9 -1.19 1.75 -2l-0.49 -5.5l-0.49 -0.01l-0.26 4.01l-0.76 0.5l-0.25 -4.49h-0.49l-0.25 4.49l-0.75 -0.5z',
  'pinhead-water_tap': 'M14 8L14 10.5L14.25 10.5C14.53 10.5 14.75 10.72 14.75 11L14.75 11.5C14.75 11.78 14.53 12 14.25 12L9.75 12C9.47 12 9.25 11.78 9.25 11.5L9.25 11C9.25 10.72 9.47 10.5 9.75 10.5L10 10.5L10 8L0 8L0 4L10 4C12.21 4 14 5.79 14 8Z',
  'pinhead-wc_text': 'M5.73 8.57L6.53 3.5L8 3.5L6.53 11.5L5.2 11.5L4 6.36L2.8 11.5L1.47 11.5L0 3.5L1.47 3.5L2.27 8.57L3.33 3.5L4.67 3.5L5.73 8.57ZM11.75 3.5C13.19 3.5 14.4 4.49 14.83 5.87L13.41 6.38C13.18 5.63 12.52 5.1 11.75 5.1C10.78 5.1 10 5.94 10 6.97L10 8.03C10 9.06 10.78 9.9 11.75 9.9C12.52 9.9 13.18 9.37 13.41 8.62L14.83 9.13C14.4 10.51 13.19 11.5 11.75 11.5C9.96 11.5 8.5 9.95 8.5 8.03L8.5 6.97C8.5 5.05 9.96 3.5 11.75 3.5Z',
  'pinhead-bag_with_greek_cross': 'M7.5 1.07C6.26 1.07 5 1.61 4.15 2.68C3.42 3.6 3.21 4.29 3.11 5.36C1 5.25 0 6.52 0 13.93L15 13.93C15 6.52 14 5.25 11.89 5.36C11.79 4.29 11.57 3.59 10.85 2.68C10 1.61 8.74 1.07 7.5 1.07ZM7.5 3.21C8.87 3.21 9.64 4.29 9.71 5.36L5.29 5.36C5.36 4.29 6.13 3.22 7.5 3.21ZM6.43 6.43L8.57 6.43L8.57 8.57L10.71 8.57L10.71 10.71L8.57 10.71L8.57 12.86L6.43 12.86L6.43 10.71L4.29 10.71L4.29 8.57L6.43 8.57L6.43 6.43Z',
  'pinhead-book': 'M12.5 0C12.78 0 13 0.22 13 0.5L13 12.5L12.25 13.25L13 14L13 15L3 15C2.45 15 2 14.55 2 14L2 1C2 0.45 2.45 0 3 0L12.5 0ZM12 12.5L3 12.5L3 14L12 14L11.25 13.25L12 12.5ZM10.5 5L4.5 5C4.22 5 4 5.22 4 5.5C4 5.78 4.22 6 4.5 6L10.5 6C10.78 6 11 5.78 11 5.5C11 5.22 10.78 5 10.5 5ZM10.5 3L4.5 3C4.22 3 4 3.22 4 3.5C4 3.78 4.22 4 4.5 4L10.5 4C10.78 4 11 3.78 11 3.5C11 3.22 10.78 3 10.5 3Z',
  'pinhead-camera': 'M6 2C5.45 2 5.25 2.5 5 3L4.5 4h-2C1.67 4 1 4.67 1 5.5v5C1 11.33 1.67 12 2.5 12h10c0.83 0 1.5 -0.67 1.5 -1.5v-5C14 4.67 13.33 4 12.5 4h-2L10 3C9.75 2.5 9.55 2 9 2H6zM2.5 5C2.78 5 3 5.22 3 5.5S2.78 6 2.5 6S2 5.78 2 5.5S2.22 5 2.5 5zM7.5 5c1.66 0 3 1.34 3 3s-1.34 3 -3 3s-3 -1.34 -3 -3S5.84 5 7.5 5zM7.5 6.5C6.67 6.5 6 7.17 6 8l0 0c0 0.83 0.67 1.5 1.5 1.5l0 0C8.33 9.5 9 8.83 9 8l0 0C9 7.17 8.33 6.5 7.5 6.5L7.5 6.5z',
  'pinhead-town_buildings': 'M10.65 6.12c-0.04 -0.04 -0.1 -0.06 -0.16 -0.06s-0.11 0.02 -0.16 0.06l-2.24 1.81c-0.03 0.02 -0.05 0.05 -0.07 0.09c-0.02 0.03 -0.02 0.07 -0.02 0.11v4.63c0 0.07 0.03 0.13 0.07 0.18c0.05 0.05 0.11 0.07 0.18 0.07h1.49c0.07 0 0.13 -0.03 0.18 -0.07s0.07 -0.11 0.07 -0.18v-1.75h1v1.75c0 0.07 0.03 0.13 0.07 0.18c0.05 0.05 0.11 0.07 0.18 0.07h1.49c0.07 0 0.13 -0.03 0.18 -0.07s0.07 -0.11 0.07 -0.18v-4.63c0 -0.04 -0.01 -0.08 -0.02 -0.11s-0.04 -0.07 -0.07 -0.09zm-0.65 3.88h-1v-1h1zm2 0h-1v-1h1zm-6.29 -9.18c-0.02 -0.03 -0.05 -0.06 -0.09 -0.08s-0.08 -0.03 -0.12 -0.03c-0.04 0 -0.08 0.01 -0.12 0.03c-0.04 0.02 -0.07 0.05 -0.09 0.08l-3.25 4.12c-0.03 0.04 -0.04 0.09 -0.04 0.14v7.67c0 0.03 0.01 0.07 0.02 0.1s0.03 0.06 0.05 0.08c0.02 0.02 0.05 0.04 0.08 0.05c0.03 0.01 0.06 0.02 0.1 0.02h2.5c0.07 0 0.13 -0.03 0.18 -0.07c0.05 -0.05 0.07 -0.11 0.07 -0.18v-1.75h1v1.75c0 0.07 0.03 0.13 0.07 0.18s0.11 0.07 0.18 0.07h0.75v-6c0 -0.08 0.02 -0.15 0.05 -0.22c0.03 -0.07 0.08 -0.13 0.14 -0.17l1.81 -1.61c0 -0.05 -3.29 -4.18 -3.29 -4.18zm-1.71 8.18h-1v-1h1zm0 -3h-1v-1h1zm2 3h-1v-1h1zm0 -3h-1v-1h1z',
  'pinhead-utility_pole': 'M6.5 3.5C6.5 3.5 6.5 2 6.5 2C6.5 1 8.5 1 8.5 2L8.5 3.5C8.5 3.5 14 3.5 14 3.5C14.5 3.5 14.5 5 14 5C14 5 8.5 5 8.5 5C8.5 5 8.5 14 8.5 14C8.5 15 6.5 15 6.5 14C6.5 14 6.5 5 6.5 5C6.5 5 1 5 1 5C0.5 5 0.5 3.5 1 3.5C1 3.5 6.5 3.5 6.5 3.5zM11 2C11 2 13 2 13 2C13.5 2 13.5 3 13 3C13 3 11 3 11 3C10.5 3 10.5 2 11 2zM2 2C2 2 4 2 4 2C4.5 2 4.5 3 4 3C4 3 2 3 2 3C1.5 3 1.5 2 2 2z',
};

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

  if (PINHEAD_PATHS[id]) {
    drawPinheadIcon(ctx, PINHEAD_PATHS[id]);
    return ctx.getImageData(0, 0, ICON_SIZE, ICON_SIZE);
  }

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

function drawPinheadIcon(ctx: CanvasRenderingContext2D, pathData: string): void {
  if (typeof Path2D === 'undefined') return;
  const path = new Path2D(pathData);
  const scale = (ICON_SIZE - PINHEAD_PADDING * 2) / PINHEAD_VIEWBOX_SIZE;
  ctx.save();
  ctx.translate(PINHEAD_PADDING, PINHEAD_PADDING);
  ctx.scale(scale, scale);
  ctx.fill(path);
  ctx.restore();
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
