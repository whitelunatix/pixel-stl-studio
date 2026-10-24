require("./fonts");
const sharp = require("sharp");
const { nearestBeadColor, rgbToLab } = require("./color");

const COLOR_BUCKET_SIZE = 8;
const INITIAL_CLUSTER_DISTANCE = 6;
const DEFAULT_KERNEL_TOLERANCE = 8;

function dataUrlToBuffer(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl || "");
  if (!match) throw new Error("Invalid image data URL");
  return Buffer.from(match[2], "base64");
}

function clampInt(value, fallback, min, max) {
  const number = Number(value);
  const next = Number.isFinite(number) ? Math.round(number) : fallback;
  return Math.max(min, Math.min(max, next));
}

function targetSize(width, height, maxGridSize) {
  const maxSize = Math.max(8, Math.min(128, Math.round(Number(maxGridSize) || 64)));
  if (width >= height) {
    return {
      width: maxSize,
      height: Math.max(1, Math.round((height / width) * maxSize)),
    };
  }
  return {
    width: Math.max(1, Math.round((width / height) * maxSize)),
    height: maxSize,
  };
}

function requestedTargetSize(geometry = {}) {
  const target = geometry.targetGrid;
  if (!target || typeof target !== "object") return null;
  const width = clampInt(target.width, 0, 1, 256);
  const height = clampInt(target.height, 0, 1, 256);
  return width > 0 && height > 0 ? { width, height } : null;
}

function manualCropRect(width, height, geometry = {}) {
  const left = clampInt(geometry.cropLeft, 0, 0, Math.max(0, width - 1));
  const top = clampInt(geometry.cropTop, 0, 0, Math.max(0, height - 1));
  const right = clampInt(geometry.cropRight, 0, 0, Math.max(0, width - left - 1));
  const bottom = clampInt(geometry.cropBottom, 0, 0, Math.max(0, height - top - 1));
  return {
    left,
    top,
    width: Math.max(1, width - left - right),
    height: Math.max(1, height - top - bottom),
  };
}

function validAlphaMask(data, width, height, alphaThreshold) {
  const mask = new Uint8Array(width * height);
  for (let index = 0; index < width * height; index += 1) {
    mask[index] = data[index * 4 + 3] > alphaThreshold ? 1 : 0;
  }
  return mask;
}

function connectedComponents(mask, width, height) {
  const visited = new Uint8Array(mask.length);
  const components = [];
  const queue = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    let head = 0;
    let count = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    const pixels = [];
    queue.length = 0;
    queue.push(start);
    visited[start] = 1;

    while (head < queue.length) {
      const index = queue[head];
      head += 1;
      pixels.push(index);
      count += 1;
      const x = index % width;
      const y = Math.floor(index / width);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      const left = index - 1;
      const right = index + 1;
      const up = index - width;
      const down = index + width;
      if (x > 0 && mask[left] && !visited[left]) {
        visited[left] = 1;
        queue.push(left);
      }
      if (x < width - 1 && mask[right] && !visited[right]) {
        visited[right] = 1;
        queue.push(right);
      }
      if (y > 0 && mask[up] && !visited[up]) {
        visited[up] = 1;
        queue.push(up);
      }
      if (y < height - 1 && mask[down] && !visited[down]) {
        visited[down] = 1;
        queue.push(down);
      }
    }

    components.push({ count, minX, minY, maxX, maxY, pixels });
  }
  return components;
}

function componentMaskAndBounds(data, width, height, alphaThreshold, componentTolerance) {
  const mask = validAlphaMask(data, width, height, alphaThreshold);
  const components = connectedComponents(mask, width, height).sort((a, b) => b.count - a.count);
  if (components.length === 0) {
    return {
      mask: new Uint8Array(width * height),
      bounds: null,
      components,
    };
  }

  const minArea = Math.max(0, Math.round(Number(componentTolerance) || 0));
  const largest = components[0];
  const kept = components.filter((component, index) => index === 0 || minArea === 0 || component.count >= minArea);
  if (!kept.includes(largest)) kept.unshift(largest);

  const nextMask = new Uint8Array(width * height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (const component of kept) {
    minX = Math.min(minX, component.minX);
    minY = Math.min(minY, component.minY);
    maxX = Math.max(maxX, component.maxX);
    maxY = Math.max(maxY, component.maxY);
    for (const index of component.pixels) nextMask[index] = 1;
  }

  return {
    mask: nextMask,
    bounds: { minX, minY, maxX, maxY },
    components,
  };
}

async function prepareCleanedImage(sourceImage, geometry = {}) {
  if (!sourceImage || !sourceImage.dataUrl) throw new Error("Missing source image");
  const buffer = dataUrlToBuffer(sourceImage.dataUrl);
  const metadata = await sharp(buffer).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Unsupported image");

  const crop = manualCropRect(metadata.width, metadata.height, geometry);
  const alphaThreshold = clampInt(geometry.alphaThreshold, 0, 0, 255);
  const componentTolerance = clampInt(geometry.componentTolerance, 0, 0, 1000000);
  const { data, info } = await sharp(buffer)
    .extract(crop)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { mask, bounds, components } = componentMaskAndBounds(data, info.width, info.height, alphaThreshold, componentTolerance);
  const outputBounds = bounds ?? { minX: 0, minY: 0, maxX: info.width - 1, maxY: info.height - 1 };
  const outputWidth = outputBounds.maxX - outputBounds.minX + 1;
  const outputHeight = outputBounds.maxY - outputBounds.minY + 1;
  const cleaned = Buffer.alloc(outputWidth * outputHeight * 4);

  if (bounds) {
    for (let y = 0; y < outputHeight; y += 1) {
      for (let x = 0; x < outputWidth; x += 1) {
        const sourceX = outputBounds.minX + x;
        const sourceY = outputBounds.minY + y;
        const sourceIndex = sourceY * info.width + sourceX;
        const sourceOffset = sourceIndex * 4;
        const targetOffset = (y * outputWidth + x) * 4;
        cleaned[targetOffset] = data[sourceOffset];
        cleaned[targetOffset + 1] = data[sourceOffset + 1];
        cleaned[targetOffset + 2] = data[sourceOffset + 2];
        cleaned[targetOffset + 3] = mask[sourceIndex] ? data[sourceOffset + 3] : 0;
      }
    }
  }

  return {
    data: cleaned,
    info: { width: outputWidth, height: outputHeight, channels: 4 },
    alphaThreshold,
    crop,
    originalWidth: metadata.width,
    originalHeight: metadata.height,
    outputWidth,
    outputHeight,
    componentBounds: bounds
      ? {
          left: crop.left + bounds.minX,
          top: crop.top + bounds.minY,
          right: crop.left + bounds.maxX,
          bottom: crop.top + bounds.maxY,
        }
      : null,
    components: components.map((component) => ({ count: component.count, minX: component.minX, minY: component.minY, maxX: component.maxX, maxY: component.maxY })),
  };
}

function outputTargetSize(prepared, geometry = {}) {
  return requestedTargetSize(geometry) ?? targetSize(prepared.info.width, prepared.info.height, geometry.maxGridSize);
}

async function processedImageData(sourceImage, geometry = {}) {
  const prepared = await prepareCleanedImage(sourceImage, geometry);
  const size = outputTargetSize(prepared, geometry);
  const resized = await sharp(prepared.data, { raw: { width: prepared.info.width, height: prepared.info.height, channels: 4 } })
    .resize(size.width, size.height, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    ...prepared,
    data: resized.data,
    info: resized.info,
    outputWidth: resized.info.width,
    outputHeight: resized.info.height,
  };
}

function kernelTolerance(geometry = {}) {
  const value = Number(geometry.imageTolerance);
  return Number.isFinite(value) ? Math.max(0, Math.min(80, value)) : DEFAULT_KERNEL_TOLERANCE;
}

const PIXEL_ALGORITHMS = new Set(["dominant-vote", "mean-sample", "median-sample", "center-weighted", "edge-preserve", "global-cluster"]);

function normalizeAlgorithm(value) {
  return PIXEL_ALGORITHMS.has(value) ? value : "dominant-vote";
}

function regionColorVotes(data, width, alphaThreshold, x0, y0, x1, y1, tolerance = DEFAULT_KERNEL_TOLERANCE) {
  const clusters = [];
  let total = 0;
  const thresholdSquared = Math.max(0, tolerance) ** 2;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const offset = (y * width + x) * 4;
      if (data[offset + 3] <= alphaThreshold) continue;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const brightness = (r + g + b) / 3;
      total += 1;

      const color = { r, g, b, lab: rgbToLab({ r, g, b }) };
      let nearest = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const cluster of clusters) {
        const distance = labDistanceSquared(color, cluster);
        if (distance < nearestDistance) {
          nearest = cluster;
          nearestDistance = distance;
        }
      }
      if (nearest && nearestDistance <= thresholdSquared) {
        nearest.count += 1;
        nearest.rSum += r;
        nearest.gSum += g;
        nearest.bSum += b;
        nearest.darkCount += brightness < 32 ? 1 : 0;
        refreshCluster(nearest);
      } else {
        clusters.push(
          refreshCluster({
            count: 1,
            rSum: r,
            gSum: g,
            bSum: b,
            darkCount: brightness < 32 ? 1 : 0,
          }),
        );
      }
    }
  }
  if (total === 0 || clusters.length === 0) return { votes: [], total: 0 };
  return {
    votes: clusters.sort((a, b) => b.count - a.count),
    total,
  };
}

function regionMeanColor(data, width, alphaThreshold, x0, y0, x1, y1) {
  let count = 0;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const offset = (y * width + x) * 4;
      if (data[offset + 3] <= alphaThreshold) continue;
      count += 1;
      rSum += data[offset];
      gSum += data[offset + 1];
      bSum += data[offset + 2];
    }
  }
  if (count === 0) return null;
  return {
    r: Math.round(rSum / count),
    g: Math.round(gSum / count),
    b: Math.round(bSum / count),
    count,
    rSum,
    gSum,
    bSum,
  };
}

function regionMedianColor(data, width, alphaThreshold, x0, y0, x1, y1) {
  const rValues = [];
  const gValues = [];
  const bValues = [];
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const offset = (y * width + x) * 4;
      if (data[offset + 3] <= alphaThreshold) continue;
      rValues.push(data[offset]);
      gValues.push(data[offset + 1]);
      bValues.push(data[offset + 2]);
    }
  }
  if (rValues.length === 0) return null;
  const median = (values) => {
    values.sort((a, b) => a - b);
    const mid = Math.floor(values.length / 2);
    return values.length % 2 === 0 ? Math.round((values[mid - 1] + values[mid]) / 2) : values[mid];
  };
  return {
    r: median(rValues),
    g: median(gValues),
    b: median(bValues),
    count: rValues.length,
  };
}

function regionWeightedMeanColor(data, width, height, alphaThreshold, x0, y0, x1, y1, weightAt) {
  let count = 0;
  let weightSum = 0;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const offset = (y * width + x) * 4;
      if (data[offset + 3] <= alphaThreshold) continue;
      const weight = Math.max(0.001, weightAt(x, y, offset));
      count += 1;
      weightSum += weight;
      rSum += data[offset] * weight;
      gSum += data[offset + 1] * weight;
      bSum += data[offset + 2] * weight;
    }
  }
  if (count === 0 || weightSum <= 0) return null;
  return {
    r: Math.round(rSum / weightSum),
    g: Math.round(gSum / weightSum),
    b: Math.round(bSum / weightSum),
    count,
    rSum: Math.round(rSum),
    gSum: Math.round(gSum),
    bSum: Math.round(bSum),
  };
}

function regionCenterWeightedColor(data, width, height, alphaThreshold, x0, y0, x1, y1) {
  const cx = (x0 + x1 - 1) / 2;
  const cy = (y0 + y1 - 1) / 2;
  const radius = Math.max(1, Math.hypot(Math.max(1, x1 - x0) / 2, Math.max(1, y1 - y0) / 2));
  return regionWeightedMeanColor(data, width, height, alphaThreshold, x0, y0, x1, y1, (x, y) => {
    const distance = Math.hypot(x - cx, y - cy) / radius;
    return 0.02 + Math.exp(-(distance ** 2) * 10) * 40;
  });
}

function pixelBrightness(data, width, height, x, y) {
  const safeX = Math.max(0, Math.min(width - 1, x));
  const safeY = Math.max(0, Math.min(height - 1, y));
  const offset = (safeY * width + safeX) * 4;
  return (data[offset] + data[offset + 1] + data[offset + 2]) / 3;
}

function regionEdgePreserveColor(data, width, height, alphaThreshold, x0, y0, x1, y1) {
  return regionWeightedMeanColor(data, width, height, alphaThreshold, x0, y0, x1, y1, (x, y) => {
    const gx = Math.abs(pixelBrightness(data, width, height, x + 1, y) - pixelBrightness(data, width, height, x - 1, y));
    const gy = Math.abs(pixelBrightness(data, width, height, x, y + 1) - pixelBrightness(data, width, height, x, y - 1));
    return 0.2 + Math.min(18, Math.hypot(gx, gy) / 8);
  });
}

function regionDominantColor(data, width, alphaThreshold, x0, y0, x1, y1, tolerance = DEFAULT_KERNEL_TOLERANCE) {
  const result = regionColorVotes(data, width, alphaThreshold, x0, y0, x1, y1, tolerance);
  if (result.total === 0 || result.votes.length === 0) return null;
  const bucket = result.votes[0];
  return {
    r: bucket.r,
    g: bucket.g,
    b: bucket.b,
    count: bucket.count,
    samples: bucket.count,
    total: result.total,
    darkTotal: bucket.darkCount,
  };
}

function colorLimit(maxColors) {
  return Math.max(1, Math.min(32, Math.round(Number(maxColors) || 8)));
}

function colorHex(color) {
  return [color.r, color.g, color.b]
    .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0"))
    .join("");
}

function labDistanceSquared(a, b) {
  const labA = a.lab ?? rgbToLab(a);
  const labB = b.lab ?? rgbToLab(b);
  return (labA.l - labB.l) ** 2 + (labA.a - labB.a) ** 2 + (labA.b - labB.b) ** 2;
}

function refreshCluster(cluster) {
  cluster.r = Math.round(cluster.rSum / cluster.count);
  cluster.g = Math.round(cluster.gSum / cluster.count);
  cluster.b = Math.round(cluster.bSum / cluster.count);
  cluster.lab = rgbToLab(cluster);
  return cluster;
}

function mergeCluster(target, source) {
  target.count += source.count;
  target.rSum += source.rSum;
  target.gSum += source.gSum;
  target.bSum += source.bSum;
  target.darkCount = (target.darkCount || 0) + (source.darkCount || 0);
  return refreshCluster(target);
}

function weightedMergeCost(a, b) {
  const aCount = Math.max(1, a.count || 1);
  const bCount = Math.max(1, b.count || 1);
  return labDistanceSquared(a, b) * ((aCount * bCount) / (aCount + bCount));
}

function bucketedCellColors(colors) {
  const buckets = new Map();
  for (const color of colors) {
    if (!color) continue;
    const key = `${Math.floor(color.r / COLOR_BUCKET_SIZE)}:${Math.floor(color.g / COLOR_BUCKET_SIZE)}:${Math.floor(color.b / COLOR_BUCKET_SIZE)}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count += 1;
      bucket.rSum += color.r;
      bucket.gSum += color.g;
      bucket.bSum += color.b;
    } else {
      buckets.set(key, { count: 1, rSum: color.r, gSum: color.g, bSum: color.b });
    }
  }
  return Array.from(buckets.values())
    .map((bucket) => refreshCluster(bucket))
    .sort((a, b) => b.count - a.count);
}

function clusterSimilarColors(colors, maxColors) {
  const limit = colorLimit(maxColors);
  const thresholdSquared = INITIAL_CLUSTER_DISTANCE ** 2;
  const clusters = [];

  for (const bucket of bucketedCellColors(colors)) {
    let nearest = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const cluster of clusters) {
      const distance = labDistanceSquared(bucket, cluster);
      if (distance < nearestDistance) {
        nearest = cluster;
        nearestDistance = distance;
      }
    }
    if (nearest && nearestDistance <= thresholdSquared) {
      mergeCluster(nearest, bucket);
    } else {
      clusters.push({ ...bucket });
    }
  }

  while (clusters.length > limit) {
    let mergeA = 0;
    let mergeB = 1;
    let bestCost = Number.POSITIVE_INFINITY;
    for (let a = 0; a < clusters.length; a += 1) {
      for (let b = a + 1; b < clusters.length; b += 1) {
        const cost = weightedMergeCost(clusters[a], clusters[b]);
        if (cost < bestCost) {
          mergeA = a;
          mergeB = b;
          bestCost = cost;
        }
      }
    }
    mergeCluster(clusters[mergeA], clusters[mergeB]);
    clusters.splice(mergeB, 1);
  }

  return clusters.sort((a, b) => b.count - a.count);
}

function weightedColorBuckets(colors) {
  const buckets = new Map();
  for (const color of colors) {
    if (!color) continue;
    const count = Math.max(1, Math.round(Number(color.count) || 1));
    const rSum = Number.isFinite(color.rSum) ? color.rSum : color.r * count;
    const gSum = Number.isFinite(color.gSum) ? color.gSum : color.g * count;
    const bSum = Number.isFinite(color.bSum) ? color.bSum : color.b * count;
    const r = rSum / count;
    const g = gSum / count;
    const b = bSum / count;
    const key = `${Math.floor(r / COLOR_BUCKET_SIZE)}:${Math.floor(g / COLOR_BUCKET_SIZE)}:${Math.floor(b / COLOR_BUCKET_SIZE)}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count += count;
      bucket.rSum += rSum;
      bucket.gSum += gSum;
      bucket.bSum += bSum;
      bucket.darkCount += color.darkCount || 0;
    } else {
      buckets.set(key, { count, rSum, gSum, bSum, darkCount: color.darkCount || 0 });
    }
  }
  return Array.from(buckets.values())
    .map((bucket) => refreshCluster(bucket))
    .sort((a, b) => b.count - a.count);
}

function clusterWeightedColors(colors, maxColors) {
  const limit = colorLimit(maxColors);
  const thresholdSquared = INITIAL_CLUSTER_DISTANCE ** 2;
  const clusters = [];

  for (const bucket of weightedColorBuckets(colors)) {
    let nearest = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const cluster of clusters) {
      const distance = labDistanceSquared(bucket, cluster);
      if (distance < nearestDistance) {
        nearest = cluster;
        nearestDistance = distance;
      }
    }
    if (nearest && nearestDistance <= thresholdSquared) {
      mergeCluster(nearest, bucket);
    } else {
      clusters.push({ ...bucket });
    }
  }

  while (clusters.length > limit) {
    let mergeA = 0;
    let mergeB = 1;
    let bestCost = Number.POSITIVE_INFINITY;
    for (let a = 0; a < clusters.length; a += 1) {
      for (let b = a + 1; b < clusters.length; b += 1) {
        const cost = weightedMergeCost(clusters[a], clusters[b]);
        if (cost < bestCost) {
          mergeA = a;
          mergeB = b;
          bestCost = cost;
        }
      }
    }
    mergeCluster(clusters[mergeA], clusters[mergeB]);
    clusters.splice(mergeB, 1);
  }

  return clusters.sort((a, b) => b.count - a.count);
}

function cellBounds(sourceSize, targetSize, cellIndex) {
  const start = Math.floor((cellIndex * sourceSize) / targetSize);
  const end = Math.floor(((cellIndex + 1) * sourceSize) / targetSize);
  return [start, Math.max(start + 1, end)];
}

function cellDominantColors(data, width, height, alphaThreshold, targetWidth, targetHeight, tolerance = DEFAULT_KERNEL_TOLERANCE) {
  const colors = [];
  for (let cellY = 0; cellY < targetHeight; cellY += 1) {
    const [fullY0, fullY1] = cellBounds(height, targetHeight, cellY);
    for (let cellX = 0; cellX < targetWidth; cellX += 1) {
      const [fullX0, fullX1] = cellBounds(width, targetWidth, cellX);
      colors.push(regionDominantColor(data, width, alphaThreshold, fullX0, fullY0, fullX1, fullY1, tolerance));
    }
  }
  return colors;
}

function cellColorVotes(data, width, height, alphaThreshold, targetWidth, targetHeight, tolerance = DEFAULT_KERNEL_TOLERANCE) {
  const cells = [];
  for (let cellY = 0; cellY < targetHeight; cellY += 1) {
    const [fullY0, fullY1] = cellBounds(height, targetHeight, cellY);
    for (let cellX = 0; cellX < targetWidth; cellX += 1) {
      const [fullX0, fullX1] = cellBounds(width, targetWidth, cellX);
      cells.push(regionColorVotes(data, width, alphaThreshold, fullX0, fullY0, fullX1, fullY1, tolerance));
    }
  }
  return cells;
}

function cellMeanColors(data, width, height, alphaThreshold, targetWidth, targetHeight) {
  const colors = [];
  for (let cellY = 0; cellY < targetHeight; cellY += 1) {
    const [fullY0, fullY1] = cellBounds(height, targetHeight, cellY);
    for (let cellX = 0; cellX < targetWidth; cellX += 1) {
      const [fullX0, fullX1] = cellBounds(width, targetWidth, cellX);
      colors.push(regionMeanColor(data, width, alphaThreshold, fullX0, fullY0, fullX1, fullY1));
    }
  }
  return colors;
}

function cellSampleColors(data, width, height, alphaThreshold, targetWidth, targetHeight, algorithm) {
  if (algorithm === "mean-sample" || algorithm === "global-cluster") {
    return cellMeanColors(data, width, height, alphaThreshold, targetWidth, targetHeight);
  }
  const colors = [];
  for (let cellY = 0; cellY < targetHeight; cellY += 1) {
    const [fullY0, fullY1] = cellBounds(height, targetHeight, cellY);
    for (let cellX = 0; cellX < targetWidth; cellX += 1) {
      const [fullX0, fullX1] = cellBounds(width, targetWidth, cellX);
      if (algorithm === "median-sample") {
        colors.push(regionMedianColor(data, width, alphaThreshold, fullX0, fullY0, fullX1, fullY1));
      } else if (algorithm === "center-weighted") {
        colors.push(regionCenterWeightedColor(data, width, height, alphaThreshold, fullX0, fullY0, fullX1, fullY1));
      } else if (algorithm === "edge-preserve") {
        colors.push(regionEdgePreserveColor(data, width, height, alphaThreshold, fullX0, fullY0, fullX1, fullY1));
      } else {
        colors.push(regionMeanColor(data, width, alphaThreshold, fullX0, fullY0, fullX1, fullY1));
      }
    }
  }
  return colors;
}

function dominantColorsFromRaw(data, width, height, alphaThreshold, maxColors) {
  const buckets = new Map();
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    if (data[offset + 3] <= alphaThreshold) continue;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const key = `${Math.round(r / COLOR_BUCKET_SIZE)}:${Math.round(g / COLOR_BUCKET_SIZE)}:${Math.round(b / COLOR_BUCKET_SIZE)}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count += 1;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
    } else {
      buckets.set(key, { count: 1, r, g, b });
    }
  }
  return Array.from(buckets.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, colorLimit(maxColors))
    .map((bucket) => {
      const hex = [bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count]
        .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0"))
        .join("");
      return `#${hex}`;
    });
}

function dominantColorsFromCells(colors, maxColors) {
  return clusterSimilarColors(colors, maxColors).map((cluster) => `#${colorHex(cluster)}`);
}

function dominantColorsFromCellVotes(cells, maxColors) {
  const colors = [];
  for (const cell of cells) {
    for (const vote of cell.votes) colors.push(vote);
  }
  return clusterWeightedColors(colors, maxColors).map((cluster) => `#${colorHex(cluster)}`);
}

function dominantColorsFromMeanCells(cells, maxColors) {
  return clusterWeightedColors(cells.filter(Boolean), maxColors).map((cluster) => `#${colorHex(cluster)}`);
}

function dominantColorsFromSampleCells(cells, maxColors) {
  return clusterWeightedColors(cells.filter(Boolean), maxColors).map((cluster) => `#${colorHex(cluster)}`);
}

function clusterPaletteFromCells(cells, maxColors) {
  return clusterWeightedColors(cells.filter(Boolean), maxColors);
}

function nearestClusterColor(color, clusters) {
  if (!color || clusters.length === 0) return color;
  return clusters.slice().sort((a, b) => labDistanceSquared(color, a) - labDistanceSquared(color, b))[0] ?? color;
}

function dominantColorFromVotes(cell, colors) {
  if (!cell || !Array.isArray(cell.votes) || cell.votes.length === 0) return null;
  const votes = new Map();
  for (const color of cell.votes) {
    const beadColor = nearestBeadColor(color, colors);
    if (!beadColor) continue;
    votes.set(beadColor.id, (votes.get(beadColor.id) || 0) + color.count);
  }

  let bestId = null;
  let bestCount = 0;
  for (const color of colors) {
    const count = votes.get(color.id) || 0;
    if (count > bestCount) {
      bestId = color.id;
      bestCount = count;
    }
  }
  return bestId;
}

function colorIdFromMean(color, colors) {
  if (!color) return null;
  return nearestBeadColor(color, colors)?.id ?? null;
}

function hexFromMean(color) {
  return color ? `#${colorHex(color)}` : null;
}

function dominantHexFromVotes(cell) {
  if (!cell || !Array.isArray(cell.votes) || cell.votes.length === 0) return null;
  const best = cell.votes[0];
  return `#${colorHex(best)}`;
}

async function analyzeImageColors(payload = {}) {
  const { sourceImage, geometry = {}, colorCount = 8 } = payload || {};
  const algorithm = normalizeAlgorithm(payload.algorithm);
  const prepared = await prepareCleanedImage(sourceImage, geometry);
  const size = outputTargetSize(prepared, geometry);
  const sampledCells = cellSampleColors(prepared.data, prepared.info.width, prepared.info.height, prepared.alphaThreshold, size.width, size.height, algorithm);
  const colors =
    algorithm === "dominant-vote"
      ? dominantColorsFromCellVotes(
          cellColorVotes(prepared.data, prepared.info.width, prepared.info.height, prepared.alphaThreshold, size.width, size.height, kernelTolerance(geometry)),
          colorCount,
        )
      : dominantColorsFromSampleCells(sampledCells, colorCount);
  return {
    colors,
    image: {
      width: prepared.originalWidth,
      height: prepared.originalHeight,
      outputWidth: size.width,
      outputHeight: size.height,
      crop: prepared.crop,
      componentBounds: prepared.componentBounds,
      components: prepared.components,
    },
  };
}

async function rasterizeImage(payload = {}) {
  const { sourceImage, colors, geometry = {} } = payload || {};
  if (!Array.isArray(colors)) throw new Error("Missing bead colors");
  const algorithm = normalizeAlgorithm(payload.algorithm);
  const matchColors = colors.map((color) => ({ ...color, enabled: true }));
  const prepared = await prepareCleanedImage(sourceImage, geometry);
  const size = outputTargetSize(prepared, geometry);
  if (algorithm === "dominant-vote") {
    const voteCells = cellColorVotes(prepared.data, prepared.info.width, prepared.info.height, prepared.alphaThreshold, size.width, size.height, kernelTolerance(geometry));
    return {
      width: size.width,
      height: size.height,
      cells: voteCells.map((cell) => dominantColorFromVotes(cell, matchColors)),
      kernelColorGrid: {
        width: size.width,
        height: size.height,
        cells: voteCells.map(dominantHexFromVotes),
      },
    };
  }

  const sampledColors = cellSampleColors(prepared.data, prepared.info.width, prepared.info.height, prepared.alphaThreshold, size.width, size.height, algorithm);
  const paletteClusters =
    algorithm === "global-cluster"
      ? clusterPaletteFromCells(sampledColors, matchColors.length)
      : null;
  const cells = sampledColors.map((sample) => {
    if (!sample) return null;
    const anchor = paletteClusters ? nearestClusterColor(sample, paletteClusters) : sample;
    return colorIdFromMean(anchor, matchColors);
  });
  const kernelColorGrid = {
    width: size.width,
    height: size.height,
    cells: sampledColors.map((sample) => (sample ? `#${colorHex(paletteClusters ? nearestClusterColor(sample, paletteClusters) : sample)}` : null)),
  };

  return {
    width: size.width,
    height: size.height,
    cells,
    kernelColorGrid,
  };
}

module.exports = {
  rasterizeImage,
  analyzeImageColors,
  processedImageData,
  prepareCleanedImage,
  cellDominantColors,
  cellColorVotes,
  cellMeanColors,
  cellSampleColors,
  dominantColorsFromCells,
  dominantColorsFromCellVotes,
  dominantColorsFromMeanCells,
  dominantColorsFromRaw,
  clusterSimilarColors,
  clusterWeightedColors,
  connectedComponents,
  dataUrlToBuffer,
};
