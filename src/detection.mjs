export const CLASS_NAMES = ['可降解垃圾', '纸板', '玻璃', '金属', '纸张', '塑料'];
export const COLORS = ['#ffd166', '#ffae70', '#77ddd5', '#bda7ff', '#91c8ff', '#65ecab'];

export function letterbox(width, height, size) {
  const scale = Math.min(size / width, size / height);
  const resizedWidth = Math.round(width * scale), resizedHeight = Math.round(height * scale);
  return { scale, resizedWidth, resizedHeight, padX: Math.floor((size - resizedWidth) / 2), padY: Math.floor((size - resizedHeight) / 2), width, height, size };
}

export function toTensor(rgba, size) {
  const plane = size * size, result = new Float32Array(plane * 3);
  for (let i = 0; i < plane; i++) {
    result[i] = rgba[i * 4] / 255;
    result[plane + i] = rgba[i * 4 + 1] / 255;
    result[plane * 2 + i] = rgba[i * 4 + 2] / 255;
  }
  return result;
}

export function iou(a, b) {
  const area = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return area / Math.max(1e-9, a.w * a.h + b.w * b.h - area);
}

export function decode(data, dims, geometry, threshold = 0.25, nmsThreshold = 0.45) {
  // YOLOv5 export: [batch=1, candidates, xywh + objectness + class probabilities].
  const classes = dims[2] - 5;
  if (dims.length !== 3 || dims[0] !== 1 || classes !== CLASS_NAMES.length) throw new Error('模型输出类别不匹配，请重新加载模型。');
  const candidates = [];
  for (let row = 0; row < dims[1]; row++) {
    const offset = row * dims[2], objectness = data[offset + 4];
    if (!Number.isFinite(objectness) || objectness < threshold) continue;
    let label = 0, probability = 0;
    for (let c = 0; c < classes; c++) if (data[offset + 5 + c] > probability) { probability = data[offset + 5 + c]; label = c; }
    const score = objectness * probability;
    if (score < threshold) continue;
    const x1 = (data[offset] - data[offset + 2] / 2 - geometry.padX) / geometry.scale;
    const y1 = (data[offset + 1] - data[offset + 3] / 2 - geometry.padY) / geometry.scale;
    const x2 = (data[offset] + data[offset + 2] / 2 - geometry.padX) / geometry.scale;
    const y2 = (data[offset + 1] + data[offset + 3] / 2 - geometry.padY) / geometry.scale;
    // Match upstream NMS on un-clipped boxes; clip only the selected boxes.
    const x = x1, y = y1, w = x2 - x1, h = y2 - y1;
    if ([x,y,w,h,score].every(Number.isFinite) && w > 0 && h > 0) candidates.push({ x,y,w,h,score,label });
  }
  candidates.sort((a,b) => b.score - a.score);
  const selected = [];
  for (const candidate of candidates.slice(0, 3000)) {
    if (!selected.some(box => box.label === candidate.label && iou(box, candidate) > nmsThreshold)) selected.push(candidate);
    if (selected.length >= 100) break;
  }
  return selected.map(box => {
    const x = Math.max(0, Math.min(geometry.width, box.x)), y = Math.max(0, Math.min(geometry.height, box.y));
    return {...box,x,y,w:Math.min(geometry.width,box.x+box.w)-x,h:Math.min(geometry.height,box.y+box.h)-y};
  }).filter(box => box.w > 0 && box.h > 0);
}
