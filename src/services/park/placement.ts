/**
 * 站位解算：从背景插画里挑出「能站人」的点。
 *
 * 为什么这么做：背景是一张画好的等距插画，小岛的位置、形状都在画里。
 * 与其手工调一个椭圆去凑，不如**直接读图的像素** —— 找出草地 / 沙滩的像素，
 * 从里面采样。这样换背景图也不用重调参数。
 *
 * 坐标是图像像素（原点左上），由 ParkScene 反投影到世界坐标。
 */

export interface GroundMap {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface ImagePoint {
  u: number;
  v: number;
}

/**
 * 房子占的矩形（图像宽高的比例）。插画里的房子是平面的，
 * 站在它后面的角色会画到房子前面，所以这块区域要排除。
 */
const HOUSE_BOX = { x0: 0.27, y0: 0.22, x1: 0.62, y1: 0.6 };

/** 只在画面上这条水平带里找站位（上方是天空与远景）。 */
const BAND = { y0: 0.38, y1: 0.79 };

/** 判定用的网格粒度（图像像素）。 */
const CELL_SIZE = 80;

export async function loadGroundMap(url: string): Promise<GroundMap | null> {
  if (!url) return null;
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.crossOrigin = "anonymous";
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("背景图加载失败"));
      element.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { data, width: canvas.width, height: canvas.height };
  } catch {
    // 跨域且没开 CORS 时 canvas 会被污染，getImageData 抛异常 —— 退回椭圆布局。
    return null;
  }
}

/**
 * 像素分类。阈值是按这张插画实测出来的：
 * 草地是黄绿色（绿通道明显高于红蓝），沙滩是暖橙（红 > 绿 > 蓝，且绿通道不能太低
 * —— 这条把房子的橙红屋顶挡在外面）。
 */
function classify(map: GroundMap, u: number, v: number): "grass" | "sand" | "other" {
  const x = Math.floor(u);
  const y = Math.floor(v);
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return "other";
  const index = (y * map.width + x) * 4;
  const r = map.data[index]!;
  const g = map.data[index + 1]!;
  const b = map.data[index + 2]!;

  if (g > r + 12 && g > b + 12) return "grass";
  if (r > 170 && g > 140 && r - b > 38 && g - b > 12 && r - g < 90) return "sand";
  return "other";
}

function insideHouse(map: GroundMap, u: number, v: number): boolean {
  const nx = u / map.width;
  const ny = v / map.height;
  return nx > HOUSE_BOX.x0 && nx < HOUSE_BOX.x1 && ny > HOUSE_BOX.y0 && ny < HOUSE_BOX.y1;
}

function hash(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 16777619) >>> 0;
  }
  return result >>> 0;
}

/**
 * 挑 `count` 个可站立的图像点。
 *
 * 做法：先在可用带里铺一层细网格，用像素判定把「草地 / 沙滩」的格子留下，
 * 再确定性地打乱、按最小间距贪心取够 `count` 个。
 * 这样角色一定踩在岛上，且分布均匀、不会叠在一起。
 *
 * 拿不到像素图（跨域 / 加载失败）时退回居中的椭圆分布。
 */
export function pickGroundPoints(
  map: GroundMap | null,
  count: number,
  layoutSeed = 0,
): ImagePoint[] {
  if (count <= 0) return [];

  if (!map) {
    const points: ImagePoint[] = [];
    for (let i = 0; i < count; i += 1) {
      const ratio = Math.sqrt((i + 0.5) / count) * 0.85;
      const angle = i * 2.399963229728653 + layoutSeed;
      points.push({ u: 960 + Math.cos(angle) * ratio * 430, v: 1080 + Math.sin(angle) * ratio * 150 });
    }
    return points;
  }

  const { width, height } = map;
  const y0 = height * BAND.y0;
  const y1 = height * BAND.y1;
  const originX = width * 0.02;
  const columns = Math.max(1, Math.floor((width * 0.96) / CELL_SIZE));
  const rows = Math.max(1, Math.floor((y1 - y0) / CELL_SIZE));

  const walkable: ImagePoint[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      // 格子中心加一点抖动，避免排成方阵；用坐标当种子保证每次布局一致。
      const seed = hash(`${column}:${row}:${layoutSeed}`);
      const jx = (seed % 997) / 997 - 0.5;
      const jy = (Math.floor(seed / 997) % 997) / 997 - 0.5;
      const u = originX + (column + 0.5) * CELL_SIZE + jx * CELL_SIZE * 0.7;
      const v = y0 + (row + 0.5) * CELL_SIZE + jy * CELL_SIZE * 0.7;
      if (insideHouse(map, u, v)) continue;
      if (classify(map, u, v) === "other") continue;
      walkable.push({ u, v });
    }
  }

  if (walkable.length === 0) return pickGroundPoints(null, count, layoutSeed);

  // 确定性打乱：同一个背景 + 同一批节点，每次刷新站位都一样。
  walkable.sort((a, b) => {
    const ha = hash(`${a.u.toFixed(0)},${a.v.toFixed(0)},${layoutSeed}`);
    const hb = hash(`${b.u.toFixed(0)},${b.v.toFixed(0)},${layoutSeed}`);
    return ha - hb;
  });

  // 先宽松取够数量，再逐步加大间距，兼顾「不叠」与「够用」。
  for (const minDistance of [CELL_SIZE * 0.95, CELL_SIZE * 0.75, CELL_SIZE * 0.55, 0]) {
    const picked: ImagePoint[] = [];
    for (const point of walkable) {
      if (picked.length >= count) break;
      let tooClose = false;
      for (const other of picked) {
        const dx = other.u - point.u;
        const dy = other.v - point.v;
        if (dx * dx + dy * dy < minDistance * minDistance) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;
      picked.push(point);
    }
    if (picked.length >= Math.min(count, walkable.length)) return picked;
    if (minDistance === 0) return picked;
  }

  return walkable.slice(0, count);
}
