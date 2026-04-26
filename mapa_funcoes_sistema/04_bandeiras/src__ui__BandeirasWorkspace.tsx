import { ChangeEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ReactNode } from "react";
import { apiFetch } from "../lib/api";
import { base64FromText, buildAttachmentsFromRawFiles, deliveryFormatDescription, deliveryFormatLabel, DeliveryFileFormat, RawDeliveryFile, svgPagesToPdfBase64 } from "../lib/deliveryFormats";
import { findClosestCatalogColor, getCatalogColorName } from "../domain/bandeiraColorCatalog";

type PixelCell = {
  x: number;
  y: number;
  color: string;
};

type LoadedPixelArt = {
  name: string;
  width: number;
  height: number;
  pixels: PixelCell[];
};

type ColorSummary = {
  key: string;
  name: string;
  index: number;
  count: number;
  folhas: number;
};

type EmailState = {
  status: "idle" | "loading" | "success" | "error";
  message: string;
};

type ColorCorrectionMode = "rare_only" | "nearest_all" | "kmeans_palette";
type BandeiraDeliveryMode = "four_parts_plus_full" | "two_parts_plus_full";
type BandeiraScaleDeliveryMode = "original" | "scaled" | "all";

type PaletteReduceResult = {
  pixels: PixelCell[];
  groupedCountByColor: Record<string, number>;
  originalDistinct: number;
  finalDistinct: number;
};

type ToneCorrectionOption = {
  id: string;
  label: string;
  note: string;
  art: LoadedPixelArt;
  groupedCountByColor: Record<string, number>;
  originalDistinct: number;
  finalDistinct: number;
};

type PaperPreset = "A4" | "A3" | "custom";
type DeliveryActionMode = "download" | "email";
type TacoCountPreset = 117 | 60 | 30 | 18 | 10 | 5;

const MAX_PREVIEW_CELLS = 18000;
const MAX_EDITABLE_CELLS = 24000;
const MAX_EDITABLE_SIDE = 240;
const MIN_PREVIEW_ZOOM = 0.12;
const MAX_PREVIEW_ZOOM = 60;

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  if (value.length !== 6) {
    return { r: 0, g: 0, b: 0 };
  }

  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16)
  };
}

function colorDistance(a: string, b: string) {
  const colorA = hexToRgb(a);
  const colorB = hexToRgb(b);
  return Math.sqrt((colorA.r - colorB.r) ** 2 + (colorA.g - colorB.g) ** 2 + (colorA.b - colorB.b) ** 2);
}

function colorSaturation(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

function quantizeHex(hex: string, step: number) {
  const { r, g, b } = hexToRgb(hex);
  const safeStep = Math.max(1, step);
  const snap = (value: number) => Math.max(0, Math.min(255, Math.round(value / safeStep) * safeStep));
  return rgbToHex(snap(r), snap(g), snap(b));
}

function textStyleForBackground(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  if (luminance > 150) {
    return {
      fill: "#111111",
      stroke: "rgba(255,255,255,0.95)"
    };
  }

  return {
    fill: "#f8f8f8",
    stroke: "rgba(0,0,0,0.92)"
  };
}

function buildColorTableCsv(rows: ColorSummary[], groupedCountByFinal: Record<string, number>) {
  const header = ["No", "Cor", "Nome_da_cor", "Quantidade", "Cores_agrupadas", "Folhas"];
  const body = rows.map((row) => [
    row.index,
    row.key,
    row.name,
    row.count,
    groupedCountByFinal[row.key] ?? 1,
    row.folhas
  ]);
  return [header, ...body].map((line) => line.join(",")).join("\n");
}

function reducePaletteToLimit(sourcePixels: PixelCell[], maxColors: number): PaletteReduceResult {
  const limit = Math.max(2, maxColors);
  const sourceCountMap = new Map<string, number>();
  for (const pixel of sourcePixels) {
    sourceCountMap.set(pixel.color, (sourceCountMap.get(pixel.color) ?? 0) + 1);
  }

  const originalDistinct = sourceCountMap.size;
  if (originalDistinct <= limit) {
    const identityGrouped: Record<string, number> = {};
    for (const color of sourceCountMap.keys()) {
      identityGrouped[color] = 1;
    }
    return {
      pixels: sourcePixels,
      groupedCountByColor: identityGrouped,
      originalDistinct,
      finalDistinct: originalDistinct
    };
  }

  const rankedPalette = Array.from(sourceCountMap.entries())
    .map(([color, count]) => ({
      color,
      score: count * (1 + colorSaturation(color) * 3.2)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.color);

  const mapToFinal = new Map<string, string>();
  for (const sourceColor of sourceCountMap.keys()) {
    let bestColor = rankedPalette[0] ?? sourceColor;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const paletteColor of rankedPalette) {
      const distance = colorDistance(sourceColor, paletteColor);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestColor = paletteColor;
      }
    }
    mapToFinal.set(sourceColor, bestColor);
  }

  const groupedSets = new Map<string, Set<string>>();
  for (const [sourceColor, finalColor] of mapToFinal.entries()) {
    const set = groupedSets.get(finalColor) ?? new Set<string>();
    set.add(sourceColor);
    groupedSets.set(finalColor, set);
  }

  const groupedCountByColor: Record<string, number> = {};
  for (const [finalColor, set] of groupedSets.entries()) {
    groupedCountByColor[finalColor] = set.size;
  }

  const pixels = sourcePixels.map((pixel) => ({
    ...pixel,
    color: mapToFinal.get(pixel.color) ?? pixel.color
  }));

  return {
    pixels,
    groupedCountByColor,
    originalDistinct,
    finalDistinct: groupedSets.size
  };
}

function reducePaletteWithKMeans(sourcePixels: PixelCell[], maxColors: number, preserveVibrancy: boolean): PaletteReduceResult {
  const limit = Math.max(2, maxColors);
  const sourceCountMap = new Map<string, number>();
  for (const pixel of sourcePixels) {
    sourceCountMap.set(pixel.color, (sourceCountMap.get(pixel.color) ?? 0) + 1);
  }

  const originalDistinct = sourceCountMap.size;
  if (originalDistinct <= limit) {
    const identityGrouped: Record<string, number> = {};
    for (const color of sourceCountMap.keys()) {
      identityGrouped[color] = 1;
    }
    return {
      pixels: sourcePixels,
      groupedCountByColor: identityGrouped,
      originalDistinct,
      finalDistinct: originalDistinct
    };
  }

  const weightedColors = Array.from(sourceCountMap.entries()).map(([color, count]) => {
    const rgb = hexToRgb(color);
    return {
      color,
      count,
      r: rgb.r,
      g: rgb.g,
      b: rgb.b,
      saturation: colorSaturation(color),
      score: count * (1 + colorSaturation(color) * (preserveVibrancy ? 5.4 : 2.6))
    };
  });

  const ranked = [...weightedColors].sort((a, b) => b.score - a.score);
  const centers: Array<{ r: number; g: number; b: number }> = [];
  centers.push({ r: ranked[0].r, g: ranked[0].g, b: ranked[0].b });

  while (centers.length < Math.min(limit, ranked.length)) {
    let bestCandidate = ranked[centers.length] ?? ranked[0];
    let bestDistanceScore = -1;

    for (const candidate of ranked) {
      const nearestCenterDistance = Math.min(
        ...centers.map((center) =>
          Math.sqrt((candidate.r - center.r) ** 2 + (candidate.g - center.g) ** 2 + (candidate.b - center.b) ** 2)
        )
      );
      const distanceScore = nearestCenterDistance * (1 + candidate.saturation * (preserveVibrancy ? 1.4 : 0.6));
      if (distanceScore > bestDistanceScore) {
        bestDistanceScore = distanceScore;
        bestCandidate = candidate;
      }
    }

    centers.push({ r: bestCandidate.r, g: bestCandidate.g, b: bestCandidate.b });
  }

  for (let iteration = 0; iteration < 7; iteration += 1) {
    const buckets = centers.map(() => ({
      totalWeight: 0,
      r: 0,
      g: 0,
      b: 0
    }));

    for (const color of weightedColors) {
      let bestIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      centers.forEach((center, index) => {
        const distance = Math.sqrt((color.r - center.r) ** 2 + (color.g - center.g) ** 2 + (color.b - center.b) ** 2);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });

      const weight = color.count * (1 + color.saturation * (preserveVibrancy ? 0.8 : 0.25));
      buckets[bestIndex].totalWeight += weight;
      buckets[bestIndex].r += color.r * weight;
      buckets[bestIndex].g += color.g * weight;
      buckets[bestIndex].b += color.b * weight;
    }

    centers.forEach((center, index) => {
      const bucket = buckets[index];
      if (bucket.totalWeight > 0) {
        center.r = bucket.r / bucket.totalWeight;
        center.g = bucket.g / bucket.totalWeight;
        center.b = bucket.b / bucket.totalWeight;
      }
    });
  }

  const representativePalette = centers.map((center) => {
    let bestColor = ranked[0]?.color ?? "#000000";
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of ranked) {
      const distance = Math.sqrt((candidate.r - center.r) ** 2 + (candidate.g - center.g) ** 2 + (candidate.b - center.b) ** 2);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestColor = candidate.color;
      }
    }
    return bestColor;
  });

  const uniquePalette = Array.from(new Set(representativePalette));
  const mapToFinal = new Map<string, string>();
  for (const sourceColor of sourceCountMap.keys()) {
    let bestColor = uniquePalette[0] ?? sourceColor;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const paletteColor of uniquePalette) {
      const distance = colorDistance(sourceColor, paletteColor);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestColor = paletteColor;
      }
    }
    mapToFinal.set(sourceColor, bestColor);
  }

  const groupedSets = new Map<string, Set<string>>();
  for (const [sourceColor, finalColor] of mapToFinal.entries()) {
    const set = groupedSets.get(finalColor) ?? new Set<string>();
    set.add(sourceColor);
    groupedSets.set(finalColor, set);
  }

  const groupedCountByColor: Record<string, number> = {};
  for (const [finalColor, set] of groupedSets.entries()) {
    groupedCountByColor[finalColor] = set.size;
  }

  return {
    pixels: sourcePixels.map((pixel) => ({
      ...pixel,
      color: mapToFinal.get(pixel.color) ?? pixel.color
    })),
    groupedCountByColor,
    originalDistinct,
    finalDistinct: groupedSets.size
  };
}

function computeEditableColorLimit(width: number, height: number, distinctColors: number) {
  const totalPixels = Math.max(1, width * height);

  let limit =
    distinctColors <= 12 ? distinctColors :
    distinctColors <= 24 ? 10 :
    distinctColors <= 40 ? 12 :
    distinctColors <= 64 ? 14 :
    distinctColors <= 96 ? 16 :
    distinctColors <= 140 ? 18 :
    distinctColors <= 200 ? 20 :
    24;

  if (totalPixels <= 5000) {
    limit = Math.min(limit, 14);
  } else if (totalPixels <= 12000) {
    limit = Math.min(limit, 18);
  }

  return Math.max(6, Math.min(limit, distinctColors));
}

function computeInitialAutoColorLimit(width: number, height: number, distinctColors: number) {
  const editableLimit = computeEditableColorLimit(width, height, distinctColors);
  const totalPixels = Math.max(1, width * height);
  const areaBoost =
    totalPixels <= 5000 ? 12 :
    totalPixels <= 12000 ? 18 :
    24;

  const generousLimit = Math.max(
    editableLimit + areaBoost,
    Math.round(editableLimit * 2.2),
    Math.round(Math.sqrt(distinctColors))
  );

  return Math.max(12, Math.min(distinctColors, generousLimit));
}

function normalizePixelArtColors(
  sourceArt: LoadedPixelArt,
  options: {
    tolerance: number;
    minPixels: number;
    correctionMode: ColorCorrectionMode;
    vibrancy: boolean;
    targetColors: number;
  }
) {
  const effectiveTolerance = options.tolerance;
  const effectiveMinPixels = options.minPixels;
  const effectiveCorrectionMode = options.correctionMode;
  const effectiveVibrancy = options.vibrancy;
  const effectiveTargetColors = Math.max(2, options.targetColors);
  const distinctBefore = new Set(sourceArt.pixels.map((pixel) => pixel.color)).size;

  if (effectiveCorrectionMode === "kmeans_palette") {
    const reduced = reducePaletteWithKMeans(sourceArt.pixels, effectiveTargetColors, effectiveVibrancy);
    return {
      art: { ...sourceArt, pixels: reduced.pixels },
      groupedCountByColor: reduced.groupedCountByColor,
      originalDistinct: reduced.originalDistinct,
      finalDistinct: reduced.finalDistinct
    };
  }

  const stepFromTolerance = Math.max(
    1,
    Math.min(64, Math.round(Math.max(1, effectiveTolerance) / (effectiveVibrancy ? 3.6 : 2)))
  );
  const quantizedPixels =
    effectiveCorrectionMode === "nearest_all"
      ? sourceArt.pixels.map((pixel) => ({
          ...pixel,
          color: effectiveVibrancy ? pixel.color : quantizeHex(pixel.color, stepFromTolerance)
        }))
      : sourceArt.pixels;

  const countByColor = new Map<string, number>();
  for (const pixel of quantizedPixels) {
    countByColor.set(pixel.color, (countByColor.get(pixel.color) ?? 0) + 1);
  }

  const sortByPaletteScore = (a: [string, number], b: [string, number]) => {
    const scoreA = a[1] * (1 + colorSaturation(a[0]) * (effectiveVibrancy ? 4.8 : 2.4));
    const scoreB = b[1] * (1 + colorSaturation(b[0]) * (effectiveVibrancy ? 4.8 : 2.4));
    return scoreB - scoreA;
  };

  const majorPalette = Array.from(countByColor.entries())
    .filter(([, count]) => count >= effectiveMinPixels)
    .sort(sortByPaletteScore)
    .map(([color]) => color);

  if (majorPalette.length === 0) {
    return {
      art: { ...sourceArt, pixels: quantizedPixels },
      groupedCountByColor: {},
      originalDistinct: distinctBefore,
      finalDistinct: new Set(quantizedPixels.map((pixel) => pixel.color)).size
    };
  }

  const mergeThreshold = Math.max(6, effectiveTolerance * (effectiveVibrancy ? 0.72 : 1.35));
  const fallbackPalette = Array.from(countByColor.entries())
    .sort((a, b) => {
      const scoreA = a[1] * (1 + colorSaturation(a[0]) * (effectiveVibrancy ? 4 : 2));
      const scoreB = b[1] * (1 + colorSaturation(b[0]) * (effectiveVibrancy ? 4 : 2));
      return scoreB - scoreA;
    })
    .map(([color]) => color);

  const activePalette = (majorPalette.length > 0 ? majorPalette : fallbackPalette).slice(0, Math.max(4, effectiveTargetColors));
  const paletteSet = new Set(activePalette);
  let nextPixels: PixelCell[] = [];

  if (effectiveCorrectionMode === "nearest_all") {
    nextPixels = quantizedPixels.map((pixel) => {
      let bestColor = activePalette[0] ?? pixel.color;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const paletteColor of activePalette) {
        const distance = colorDistance(pixel.color, paletteColor);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestColor = paletteColor;
        }
      }

      return { ...pixel, color: bestColor };
    });
  } else {
    nextPixels = quantizedPixels.map((pixel) => {
      const count = countByColor.get(pixel.color) ?? 0;
      const isInsidePalette = paletteSet.has(pixel.color);
      if (count >= effectiveMinPixels && isInsidePalette) {
        return pixel;
      }

      let bestColor = pixel.color;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const paletteColor of activePalette) {
        const distance = colorDistance(pixel.color, paletteColor);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestColor = paletteColor;
        }
      }

      const mustForcePalette = !isInsidePalette;
      if (mustForcePalette || bestDistance <= mergeThreshold || activePalette.length === 1) {
        return { ...pixel, color: bestColor };
      }

      return pixel;
    });
  }

  const reduced =
    effectiveCorrectionMode === "nearest_all"
      ? reducePaletteToLimit(nextPixels, effectiveTargetColors)
      : {
          pixels: nextPixels,
          groupedCountByColor: Object.fromEntries(Array.from(new Set(nextPixels.map((pixel) => pixel.color))).map((color) => [color, 1])),
          originalDistinct: new Set(nextPixels.map((pixel) => pixel.color)).size,
          finalDistinct: new Set(nextPixels.map((pixel) => pixel.color)).size
        };

  return {
    art: { ...sourceArt, pixels: reduced.pixels },
    groupedCountByColor: reduced.groupedCountByColor,
    originalDistinct: reduced.originalDistinct,
    finalDistinct: reduced.finalDistinct
  };
}

async function readPixelArt(file: File): Promise<LoadedPixelArt> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error("Nao foi possivel ler a imagem."));
      nextImage.src = objectUrl;
    });

    const naturalWidth = Math.max(1, image.naturalWidth);
    const naturalHeight = Math.max(1, image.naturalHeight);
    const naturalCells = naturalWidth * naturalHeight;
    const areaScale = naturalCells > MAX_EDITABLE_CELLS ? Math.sqrt(MAX_EDITABLE_CELLS / naturalCells) : 1;
    const sideScale = Math.min(1, MAX_EDITABLE_SIDE / Math.max(naturalWidth, naturalHeight));
    const finalScale = Math.min(areaScale, sideScale);
    const targetWidth = Math.max(1, Math.round(naturalWidth * finalScale));
    const targetHeight = Math.max(1, Math.round(naturalHeight * finalScale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas nao disponivel no navegador.");
    }

    context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0, targetWidth, targetHeight);

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const pixels: PixelCell[] = [];

    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        const alpha = imageData[offset + 3];
        const color = alpha === 0 ? "#ffffff" : rgbToHex(imageData[offset], imageData[offset + 1], imageData[offset + 2]);
        pixels.push({ x, y, color });
      }
    }

    return {
      name: file.name.replace(/\.[^.]+$/, ""),
      width: canvas.width,
      height: canvas.height,
      pixels
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function getPreviewCellSize(width: number, height: number) {
  const largestSide = Math.max(width, height);
  if (largestSide <= 48) return 28;
  if (largestSide <= 72) return 20;
  if (largestSide <= 120) return 14;
  if (largestSide <= 180) return 10;
  return 8;
}

function getCompareCellSize(width: number, height: number) {
  const largestSide = Math.max(width, height);
  if (largestSide <= 48) return 8;
  if (largestSide <= 72) return 6;
  if (largestSide <= 120) return 4;
  if (largestSide <= 180) return 3;
  return 2;
}

function createSvgFromBounds(
  source: LoadedPixelArt,
  bounds: { x: number; y: number; width: number; height: number },
  options: {
    minorGrid: boolean;
    majorGrid: boolean;
    minorGridColorValue: string;
    majorGridColorValue: string;
    unitSize: number;
    includeNumbers: boolean;
    colorNumberMap: Map<string, number>;
    groupedColorMap: Map<string, string>;
  }
) {
  const selectedPixels = source.pixels.filter(
    (pixel) =>
      pixel.x >= bounds.x &&
      pixel.x < bounds.x + bounds.width &&
      pixel.y >= bounds.y &&
      pixel.y < bounds.y + bounds.height
  );

  const rects = selectedPixels
    .map((pixel) => {
      const x = pixel.x - bounds.x;
      const y = pixel.y - bounds.y;
      const stroke = options.minorGrid ? options.minorGridColorValue : "none";
      const strokeWidth = options.minorGrid ? Number((options.unitSize * 0.03).toFixed(4)) : 0;
      return `<rect x="${x * options.unitSize}" y="${y * options.unitSize}" width="${options.unitSize}" height="${options.unitSize}" fill="${pixel.color}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
    })
    .join("");

  const numbers = options.includeNumbers
    ? selectedPixels
        .map((pixel) => {
          const groupedColor = options.groupedColorMap.get(pixel.color) ?? pixel.color;
          const number = options.colorNumberMap.get(groupedColor);
          if (!number) {
            return "";
          }
          const x = (pixel.x - bounds.x + 0.5) * options.unitSize;
          const y = (pixel.y - bounds.y + 0.58) * options.unitSize;
          const textSize = Math.max(0.16, options.unitSize * 0.45);
          return `<text x="${x}" y="${y}" font-size="${textSize}" text-anchor="middle" dominant-baseline="middle" fill="#f5f5f5" stroke="#101010" stroke-width="${Math.max(0.02, options.unitSize * 0.06)}" paint-order="stroke" font-family="Arial, Helvetica, sans-serif" font-weight="700">${number}</text>`;
        })
        .join("")
    : "";

  const scaledWidth = bounds.width * options.unitSize;
  const scaledHeight = bounds.height * options.unitSize;

  const majorVertical = options.majorGrid
    ? Array.from({ length: Math.floor(bounds.width / 7) + 1 }, (_, index) => {
        const x = index * 7 * options.unitSize;
        return `<line x1="${x}" y1="0" x2="${x}" y2="${scaledHeight}" stroke="${options.majorGridColorValue}" stroke-width="${Number((options.unitSize * 0.07).toFixed(4))}" />`;
      }).join("")
    : "";

  const majorHorizontal = options.majorGrid
    ? Array.from({ length: Math.floor(bounds.height / 5) + 1 }, (_, index) => {
        const y = index * 5 * options.unitSize;
        return `<line x1="0" y1="${y}" x2="${scaledWidth}" y2="${y}" stroke="${options.majorGridColorValue}" stroke-width="${Number((options.unitSize * 0.07).toFixed(4))}" />`;
      }).join("")
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${scaledWidth}cm" height="${scaledHeight}cm" viewBox="0 0 ${scaledWidth} ${scaledHeight}">
  <rect x="0" y="0" width="${scaledWidth}" height="${scaledHeight}" fill="#ffffff" />
  ${rects}
  ${numbers}
  ${majorVertical}
  ${majorHorizontal}
</svg>`;
}

function createColorLegendSvg(name: string, rows: ColorSummary[], groupedCountByFinal: Record<string, number>, unitSize: number) {
  const safeUnit = Math.max(0.35, unitSize);
  const pageWidth = 32 * safeUnit;
  const headerHeight = 3.3 * safeUnit;
  const rowHeight = 1.15 * safeUnit;
  const pageHeight = Math.max(12 * safeUnit, headerHeight + rows.length * rowHeight + 1.2 * safeUnit);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}cm" height="${pageHeight}cm" viewBox="0 0 ${pageWidth} ${pageHeight}">
  <rect x="0" y="0" width="${pageWidth}" height="${pageHeight}" fill="#ffffff" />
  <g transform="translate(${safeUnit}, ${safeUnit})" font-family="Arial, Helvetica, sans-serif">
    <text x="0" y="${safeUnit * 0.8}" font-size="${safeUnit * 0.65}" fill="#111" font-weight="700">Tabela de cores - ${name}</text>
    <text x="0" y="${safeUnit * 1.55}" font-size="${safeUnit * 0.28}" fill="#555">Folha separada da arte principal</text>
    <line x1="0" y1="${headerHeight - safeUnit * 0.45}" x2="${pageWidth - safeUnit * 2}" y2="${headerHeight - safeUnit * 0.45}" stroke="#d8d8d8" stroke-width="${Math.max(0.02, safeUnit * 0.035)}" />
    <text x="0" y="${headerHeight}" font-size="${safeUnit * 0.3}" fill="#333" font-weight="700">No.</text>
    <text x="${safeUnit * 2.2}" y="${headerHeight}" font-size="${safeUnit * 0.3}" fill="#333" font-weight="700">Cor</text>
    <text x="${safeUnit * 5}" y="${headerHeight}" font-size="${safeUnit * 0.3}" fill="#333" font-weight="700">Nome</text>
    <text x="${safeUnit * 14.6}" y="${headerHeight}" font-size="${safeUnit * 0.3}" fill="#333" font-weight="700">Qtd</text>
    <text x="${safeUnit * 18.2}" y="${headerHeight}" font-size="${safeUnit * 0.3}" fill="#333" font-weight="700">Agrup.</text>
    <text x="${safeUnit * 22.8}" y="${headerHeight}" font-size="${safeUnit * 0.3}" fill="#333" font-weight="700">Folhas</text>
    ${rows
      .map((row, index) => {
        const y = headerHeight + (index + 1) * rowHeight;
        return `
    <line x1="0" y1="${y - safeUnit * 0.55}" x2="${pageWidth - safeUnit * 2}" y2="${y - safeUnit * 0.55}" stroke="#ececec" stroke-width="${Math.max(0.015, safeUnit * 0.025)}" />
    <text x="0" y="${y}" font-size="${safeUnit * 0.28}" fill="#111">${row.index}</text>
    <rect x="${safeUnit * 2.2}" y="${y - safeUnit * 0.42}" width="${safeUnit * 0.8}" height="${safeUnit * 0.8}" fill="${row.key}" stroke="#666" stroke-width="${Math.max(0.01, safeUnit * 0.02)}" />
    <text x="${safeUnit * 3.4}" y="${y}" font-size="${safeUnit * 0.22}" fill="#222">${row.key}</text>
    <text x="${safeUnit * 5}" y="${y}" font-size="${safeUnit * 0.24}" fill="#222">${row.name}</text>
    <text x="${safeUnit * 14.6}" y="${y}" font-size="${safeUnit * 0.28}" fill="#111">${row.count}</text>
    <text x="${safeUnit * 18.2}" y="${y}" font-size="${safeUnit * 0.28}" fill="#111">${groupedCountByFinal[row.key] ?? 1}</text>
    <text x="${safeUnit * 22.8}" y="${y}" font-size="${safeUnit * 0.28}" fill="#111">${row.folhas}</text>`;
      })
      .join("")}
  </g>
</svg>`;
}

function createCombinedBandeiraGuideSvg(
  source: LoadedPixelArt,
  rows: ColorSummary[],
  groupedCountByFinal: Record<string, number>,
  options: {
    unitSize: number;
    minorGrid: boolean;
    majorGrid: boolean;
    minorGridColorValue: string;
    majorGridColorValue: string;
    includeNumbers: boolean;
    colorNumberMap: Map<string, number>;
    groupedColorMap: Map<string, string>;
  }
) {
  const safeUnit = Math.max(0.35, options.unitSize);
  const artWidth = source.width * safeUnit;
  const artHeight = source.height * safeUnit;
  const legendWidth = 32 * safeUnit;
  const headerHeight = 3.3 * safeUnit;
  const rowHeight = 1.15 * safeUnit;
  const legendHeight = Math.max(12 * safeUnit, headerHeight + rows.length * rowHeight + 1.2 * safeUnit);
  const padding = 1.2 * safeUnit;
  const pageWidth = artWidth + legendWidth + padding * 3;
  const pageHeight = Math.max(artHeight, legendHeight) + padding * 2;

  const artRectangles = source.pixels
    .map((pixel) => {
      const x = padding + pixel.x * safeUnit;
      const y = padding + pixel.y * safeUnit;
      const stroke =
        options.minorGrid ? options.minorGridColorValue : "transparent";
      const strokeWidth = options.minorGrid ? Math.max(0.02, safeUnit * 0.04) : 0;
      return `<rect x="${x}" y="${y}" width="${safeUnit}" height="${safeUnit}" fill="${pixel.color}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
    })
    .join("");

  const artNumbers = options.includeNumbers
    ? source.pixels
        .map((pixel) => {
          const groupedColor = options.groupedColorMap.get(pixel.color) ?? pixel.color;
          const number = options.colorNumberMap.get(groupedColor);
          if (!number) {
            return "";
          }
          const x = padding + (pixel.x + 0.5) * safeUnit;
          const y = padding + (pixel.y + 0.58) * safeUnit;
          const textSize = Math.max(0.16, safeUnit * 0.45);
          return `<text x="${x}" y="${y}" font-size="${textSize}" text-anchor="middle" dominant-baseline="middle" fill="#f5f5f5" stroke="#101010" stroke-width="${Math.max(0.02, safeUnit * 0.06)}" paint-order="stroke" font-family="Arial, Helvetica, sans-serif" font-weight="700">${number}</text>`;
        })
        .join("")
    : "";

  const majorVertical = options.majorGrid
    ? Array.from({ length: Math.floor(source.width / 7) + 1 }, (_, index) => {
        const x = padding + index * 7 * safeUnit;
        return `<line x1="${x}" y1="${padding}" x2="${x}" y2="${padding + artHeight}" stroke="${options.majorGridColorValue}" stroke-width="${Math.max(0.03, safeUnit * 0.07)}" />`;
      }).join("")
    : "";

  const majorHorizontal = options.majorGrid
    ? Array.from({ length: Math.floor(source.height / 5) + 1 }, (_, index) => {
        const y = padding + index * 5 * safeUnit;
        return `<line x1="${padding}" y1="${y}" x2="${padding + artWidth}" y2="${y}" stroke="${options.majorGridColorValue}" stroke-width="${Math.max(0.03, safeUnit * 0.07)}" />`;
      }).join("")
    : "";

  const legendX = padding * 2 + artWidth;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}cm" height="${pageHeight}cm" viewBox="0 0 ${pageWidth} ${pageHeight}">
  <rect x="0" y="0" width="${pageWidth}" height="${pageHeight}" fill="#ffffff" />
  <g transform="translate(0, 0)">
    ${artRectangles}
    ${artNumbers}
    ${majorVertical}
    ${majorHorizontal}
  </g>
  <g transform="translate(${legendX}, ${padding})" font-family="Arial, Helvetica, sans-serif">
    <text x="0" y="${safeUnit * 0.8}" font-size="${safeUnit * 0.65}" fill="#111" font-weight="700">Tabela de cores - ${source.name}</text>
    <text x="0" y="${safeUnit * 1.55}" font-size="${safeUnit * 0.28}" fill="#555">Arte + tabela no mesmo arquivo</text>
    <line x1="0" y1="${headerHeight - safeUnit * 0.45}" x2="${legendWidth - safeUnit * 2}" y2="${headerHeight - safeUnit * 0.45}" stroke="#d8d8d8" stroke-width="${Math.max(0.02, safeUnit * 0.035)}" />
    <text x="0" y="${headerHeight}" font-size="${safeUnit * 0.3}" fill="#333" font-weight="700">No.</text>
    <text x="${safeUnit * 2.2}" y="${headerHeight}" font-size="${safeUnit * 0.3}" fill="#333" font-weight="700">Cor</text>
    <text x="${safeUnit * 5}" y="${headerHeight}" font-size="${safeUnit * 0.3}" fill="#333" font-weight="700">Nome</text>
    <text x="${safeUnit * 14.6}" y="${headerHeight}" font-size="${safeUnit * 0.3}" fill="#333" font-weight="700">Qtd</text>
    <text x="${safeUnit * 18.2}" y="${headerHeight}" font-size="${safeUnit * 0.3}" fill="#333" font-weight="700">Agrup.</text>
    <text x="${safeUnit * 22.8}" y="${headerHeight}" font-size="${safeUnit * 0.3}" fill="#333" font-weight="700">Folhas</text>
    ${rows
      .map((row, index) => {
        const y = headerHeight + (index + 1) * rowHeight;
        return `
    <line x1="0" y1="${y - safeUnit * 0.55}" x2="${legendWidth - safeUnit * 2}" y2="${y - safeUnit * 0.55}" stroke="#ececec" stroke-width="${Math.max(0.015, safeUnit * 0.025)}" />
    <text x="0" y="${y}" font-size="${safeUnit * 0.28}" fill="#111">${row.index}</text>
    <rect x="${safeUnit * 2.2}" y="${y - safeUnit * 0.42}" width="${safeUnit * 0.8}" height="${safeUnit * 0.8}" fill="${row.key}" stroke="#666" stroke-width="${Math.max(0.01, safeUnit * 0.02)}" />
    <text x="${safeUnit * 3.4}" y="${y}" font-size="${safeUnit * 0.22}" fill="#222">${row.key}</text>
    <text x="${safeUnit * 5}" y="${y}" font-size="${safeUnit * 0.24}" fill="#222">${row.name}</text>
    <text x="${safeUnit * 14.6}" y="${y}" font-size="${safeUnit * 0.28}" fill="#111">${row.count}</text>
    <text x="${safeUnit * 18.2}" y="${y}" font-size="${safeUnit * 0.28}" fill="#111">${groupedCountByFinal[row.key] ?? 1}</text>
    <text x="${safeUnit * 22.8}" y="${y}" font-size="${safeUnit * 0.28}" fill="#111">${row.folhas}</text>`;
      })
      .join("")}
  </g>
</svg>`;
}

function createDivisionGuideSvg(
  source: LoadedPixelArt,
  rows: ColorSummary[],
  groupedCountByFinal: Record<string, number>,
  options: {
    unitSize: number;
    minorGrid: boolean;
    majorGrid: boolean;
    minorGridColorValue: string;
    majorGridColorValue: string;
    includeNumbers: boolean;
    colorNumberMap: Map<string, number>;
    groupedColorMap: Map<string, string>;
    divisionsHorizontal: number;
    divisionsVertical: number;
    paperPreset: PaperPreset;
    customPaperLabel: string;
  }
) {
  const safeUnit = Math.max(0.35, options.unitSize);
  const padding = 1.2 * safeUnit;
  const tileWidth = Math.ceil(source.width / options.divisionsHorizontal);
  const tileHeight = Math.ceil(source.height / options.divisionsVertical);
  const overviewUnit = Math.max(0.2, Math.min(0.45, safeUnit * 0.42));
  const overviewWidth = source.width * overviewUnit;
  const overviewHeight = source.height * overviewUnit;
  const previewTileUnit = Math.max(0.45, Math.min(1.05, safeUnit * 0.72));
  const previewTileWidth = tileWidth * previewTileUnit;
  const previewTileHeight = tileHeight * previewTileUnit;
  const previewColumns = Math.min(3, Math.max(1, options.divisionsHorizontal));
  const previewRows = Math.ceil((options.divisionsHorizontal * options.divisionsVertical) / previewColumns);
  const centerWidth = Math.max(30 * safeUnit, 26 * safeUnit);
  const rightColumnWidth = Math.max(
    32 * safeUnit,
    previewColumns * previewTileWidth + Math.max(0, previewColumns - 1) * padding * 0.7 + padding * 2
  );
  const headerHeight = Math.max(overviewHeight + padding * 2.5, 16 * safeUnit);
  const previewsHeight = previewRows * (previewTileHeight + 2.4 * safeUnit) + padding * 1.6;
  const tableHeaderHeight = 3.5 * safeUnit;
  const tableRowHeight = 1.18 * safeUnit;
  const tableHeight = Math.max(14 * safeUnit, tableHeaderHeight + rows.length * tableRowHeight + safeUnit * 1.2);
  const pageWidth = overviewWidth + centerWidth + rightColumnWidth + padding * 5;
  const pageHeight = headerHeight + previewsHeight + tableHeight + padding * 5;

  const artRectangles = source.pixels
    .map((pixel) => {
      const x = padding + pixel.x * overviewUnit;
      const y = padding * 2.2 + pixel.y * overviewUnit;
      const stroke = options.minorGrid ? options.minorGridColorValue : "transparent";
      const strokeWidth = options.minorGrid ? Math.max(0.01, overviewUnit * 0.05) : 0;
      return `<rect x="${x}" y="${y}" width="${overviewUnit}" height="${overviewUnit}" fill="${pixel.color}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
    })
    .join("");

  const artNumbers = options.includeNumbers
    ? source.pixels
        .map((pixel) => {
          const groupedColor = options.groupedColorMap.get(pixel.color) ?? pixel.color;
          const number = options.colorNumberMap.get(groupedColor);
          if (!number) return "";
          const x = padding + (pixel.x + 0.5) * overviewUnit;
          const y = padding * 2.2 + (pixel.y + 0.56) * overviewUnit;
          const textSize = Math.max(0.1, overviewUnit * 0.55);
          return `<text x="${x}" y="${y}" font-size="${textSize}" text-anchor="middle" dominant-baseline="middle" fill="#f5f5f5" stroke="#101010" stroke-width="${Math.max(0.01, overviewUnit * 0.08)}" paint-order="stroke" font-family="Arial, Helvetica, sans-serif" font-weight="700">${number}</text>`;
        })
        .join("")
    : "";

  const divisionLinesVertical = Array.from({ length: options.divisionsHorizontal + 1 }, (_, index) => {
    const x = padding + index * tileWidth * overviewUnit;
    return `<line x1="${x}" y1="${padding * 2.2}" x2="${x}" y2="${padding * 2.2 + overviewHeight}" stroke="#ff5fe5" stroke-width="${Math.max(0.02, overviewUnit * 0.12)}" />`;
  }).join("");

  const divisionLinesHorizontal = Array.from({ length: options.divisionsVertical + 1 }, (_, index) => {
    const y = padding * 2.2 + index * tileHeight * overviewUnit;
    return `<line x1="${padding}" y1="${y}" x2="${padding + overviewWidth}" y2="${y}" stroke="#ff5fe5" stroke-width="${Math.max(0.02, overviewUnit * 0.12)}" />`;
  }).join("");

  const partsPreviews = Array.from({ length: options.divisionsVertical }, (_, rowIndex) =>
    Array.from({ length: options.divisionsHorizontal }, (_, colIndex) => {
      const startX = colIndex * tileWidth;
      const startY = rowIndex * tileHeight;
      const width = Math.min(tileWidth, source.width - startX);
      const height = Math.min(tileHeight, source.height - startY);
      const label = `Parte ${rowIndex * options.divisionsHorizontal + colIndex + 1}`;
      const previewIndex = rowIndex * options.divisionsHorizontal + colIndex;
      const previewColumn = previewIndex % previewColumns;
      const previewRow = Math.floor(previewIndex / previewColumns);
      const offsetX = padding * 4 + overviewWidth + centerWidth + previewColumn * (previewTileWidth + padding * 0.7);
      const offsetY = headerHeight + padding + previewRow * (previewTileHeight + 2.4 * safeUnit);
      const pixels = source.pixels
        .filter((pixel) => pixel.x >= startX && pixel.x < startX + width && pixel.y >= startY && pixel.y < startY + height)
        .map((pixel) => {
          const x = offsetX + (pixel.x - startX) * previewTileUnit;
          const y = offsetY + safeUnit * 0.92 + (pixel.y - startY) * previewTileUnit;
          const groupedColor = options.groupedColorMap.get(pixel.color) ?? pixel.color;
          const number = options.colorNumberMap.get(groupedColor);
          const rect = `<rect x="${x}" y="${y}" width="${previewTileUnit}" height="${previewTileUnit}" fill="${pixel.color}" stroke="${options.minorGrid ? options.minorGridColorValue : "rgba(255,255,255,0.1)"}" stroke-width="${options.minorGrid ? Math.max(0.01, previewTileUnit * 0.04) : Math.max(0.005, previewTileUnit * 0.02)}" />`;
          const text = options.includeNumbers && number
            ? `<text x="${x + previewTileUnit / 2}" y="${y + previewTileUnit / 2}" font-size="${Math.max(0.12, previewTileUnit * 0.5)}" text-anchor="middle" dominant-baseline="middle" fill="#f5f5f5" stroke="#101010" stroke-width="${Math.max(0.01, previewTileUnit * 0.08)}" paint-order="stroke" font-family="Arial, Helvetica, sans-serif" font-weight="700">${number}</text>`
            : "";
          return `${rect}${text}`;
        })
        .join("");
      return `
  <g>
    <rect x="${offsetX - safeUnit * 0.35}" y="${offsetY - safeUnit * 0.35}" width="${width * previewTileUnit + safeUnit * 0.7}" height="${height * previewTileUnit + safeUnit * 1.7}" fill="#fbfcfb" stroke="#d9e2d7" stroke-width="${Math.max(0.02, safeUnit * 0.03)}" rx="${Math.max(0.12, safeUnit * 0.16)}" />
    <text x="${offsetX}" y="${offsetY}" font-size="${safeUnit * 0.42}" fill="#111" font-weight="700">${label}</text>
    <rect x="${offsetX}" y="${offsetY + safeUnit * 0.4}" width="${width * previewTileUnit}" height="${height * previewTileUnit}" fill="#0a0a0a" stroke="#98ff70" stroke-width="${Math.max(0.03, safeUnit * 0.05)}" rx="${Math.max(0.06, safeUnit * 0.1)}" />
    ${pixels}
    <text x="${offsetX}" y="${offsetY + height * previewTileUnit + safeUnit * 1.32}" font-size="${safeUnit * 0.24}" fill="#666">${width}px x ${height}px</text>
  </g>`;
    }).join("")
  ).join("");

  const centerX = padding * 2.6 + overviewWidth;
  const centerPanelY = padding * 1.3;
  const centerPanelHeight = Math.max(overviewHeight + padding * 1.8, 15 * safeUnit);
  const tableTopY = headerHeight + previewsHeight + padding * 1.6;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}cm" height="${pageHeight}cm" viewBox="0 0 ${pageWidth} ${pageHeight}">
  <rect x="0" y="0" width="${pageWidth}" height="${pageHeight}" fill="#f8f8f4" />
  <rect x="${padding * 0.6}" y="${padding * 0.6}" width="${pageWidth - padding * 1.2}" height="${pageHeight - padding * 1.2}" rx="${safeUnit * 0.45}" fill="#ffffff" stroke="#ece9da" stroke-width="${Math.max(0.02, safeUnit * 0.025)}" />
  <text x="${padding}" y="${padding}" font-size="${safeUnit * 0.72}" fill="#111" font-family="Arial, Helvetica, sans-serif" font-weight="700">Divisao da bandeira - ${source.name}</text>
  <text x="${padding}" y="${padding + safeUnit * 0.7}" font-size="${safeUnit * 0.28}" fill="#555" font-family="Arial, Helvetica, sans-serif">Folha: ${options.paperPreset === "custom" ? options.customPaperLabel || "Personalizada" : options.paperPreset} | Partes: ${options.divisionsHorizontal} x ${options.divisionsVertical}</text>
  <text x="${padding}" y="${padding * 1.75}" font-size="${safeUnit * 0.46}" fill="#111" font-family="Arial, Helvetica, sans-serif" font-weight="700">Visualizacao da imagem</text>
  ${artRectangles}
  ${artNumbers}
  ${divisionLinesVertical}
  ${divisionLinesHorizontal}
  <g transform="translate(${centerX}, ${centerPanelY})" font-family="Arial, Helvetica, sans-serif">
    <rect x="0" y="0" width="${centerWidth}" height="${centerPanelHeight}" rx="${safeUnit * 0.4}" fill="#fbfcfb" stroke="#d9e2d7" stroke-width="${Math.max(0.02, safeUnit * 0.03)}" />
    <text x="${safeUnit}" y="${safeUnit * 1.1}" font-size="${safeUnit * 0.58}" fill="#111" font-weight="700">Opcoes de divisao</text>
    <text x="${safeUnit}" y="${safeUnit * 1.9}" font-size="${safeUnit * 0.28}" fill="#666">Modelo: ${options.paperPreset === "custom" ? options.customPaperLabel || "Personalizada" : options.paperPreset}</text>
    <text x="${safeUnit}" y="${safeUnit * 2.8}" font-size="${safeUnit * 0.34}" fill="#111" font-weight="700">Divisoes horizontais</text>
    <rect x="${safeUnit}" y="${safeUnit * 3.15}" width="${centerWidth - safeUnit * 2}" height="${safeUnit * 1.15}" rx="${safeUnit * 0.22}" fill="#ffffff" stroke="#d5dacd" stroke-width="${Math.max(0.02, safeUnit * 0.025)}" />
    <text x="${safeUnit * 1.35}" y="${safeUnit * 3.92}" font-size="${safeUnit * 0.42}" fill="#222">${options.divisionsHorizontal}</text>
    <text x="${safeUnit}" y="${safeUnit * 5.15}" font-size="${safeUnit * 0.34}" fill="#111" font-weight="700">Divisoes verticais</text>
    <rect x="${safeUnit}" y="${safeUnit * 5.5}" width="${centerWidth - safeUnit * 2}" height="${safeUnit * 1.15}" rx="${safeUnit * 0.22}" fill="#ffffff" stroke="#d5dacd" stroke-width="${Math.max(0.02, safeUnit * 0.025)}" />
    <text x="${safeUnit * 1.35}" y="${safeUnit * 6.27}" font-size="${safeUnit * 0.42}" fill="#222">${options.divisionsVertical}</text>
    <text x="${safeUnit}" y="${safeUnit * 7.65}" font-size="${safeUnit * 0.28}" fill="#666">Tabela de cores e partes individuais organizadas abaixo.</text>
  </g>
  <text x="${padding * 4 + overviewWidth + centerWidth}" y="${padding * 1.75}" font-size="${safeUnit * 0.46}" fill="#111" font-family="Arial, Helvetica, sans-serif" font-weight="700">Partes individuais</text>
  ${partsPreviews}
  <g transform="translate(${padding}, ${tableTopY})" font-family="Arial, Helvetica, sans-serif">
    <rect x="0" y="${-safeUnit * 0.8}" width="${pageWidth - padding * 2}" height="${tableHeight}" rx="${safeUnit * 0.3}" fill="#fbfcfb" stroke="#e6ebde" stroke-width="${Math.max(0.02, safeUnit * 0.025)}" />
    <text x="${safeUnit}" y="${safeUnit * 0.3}" font-size="${safeUnit * 0.56}" fill="#111" font-weight="700">Tabela de cores e quantidades</text>
    <rect x="${safeUnit}" y="${safeUnit * 0.9}" width="${pageWidth - padding * 4}" height="${safeUnit * 1.22}" rx="${safeUnit * 0.22}" fill="#eef5dc" />
    <text x="${safeUnit * 1.35}" y="${safeUnit * 1.72}" font-size="${safeUnit * 0.3}" fill="#333" font-weight="700">No.</text>
    <text x="${safeUnit * 3.4}" y="${safeUnit * 1.72}" font-size="${safeUnit * 0.3}" fill="#333" font-weight="700">Cor</text>
    <text x="${safeUnit * 5.2}" y="${safeUnit * 1.72}" font-size="${safeUnit * 0.3}" fill="#333" font-weight="700">Nome da cor</text>
    <text x="${safeUnit * 15.6}" y="${safeUnit * 1.72}" font-size="${safeUnit * 0.3}" fill="#333" font-weight="700">Qtd</text>
    <text x="${safeUnit * 19.8}" y="${safeUnit * 1.72}" font-size="${safeUnit * 0.3}" fill="#333" font-weight="700">Agrup.</text>
    <text x="${safeUnit * 24.6}" y="${safeUnit * 1.72}" font-size="${safeUnit * 0.3}" fill="#333" font-weight="700">Folhas</text>
    ${rows
      .map((row, index) => {
        const y = safeUnit * 2.85 + index * tableRowHeight;
        return `
    <line x1="${safeUnit}" y1="${y - safeUnit * 0.48}" x2="${pageWidth - padding * 3}" y2="${y - safeUnit * 0.48}" stroke="#ececec" stroke-width="${Math.max(0.015, safeUnit * 0.02)}" />
    <text x="${safeUnit * 1.35}" y="${y}" font-size="${safeUnit * 0.28}" fill="#111">${row.index}</text>
    <rect x="${safeUnit * 3.4}" y="${y - safeUnit * 0.42}" width="${safeUnit * 0.9}" height="${safeUnit * 0.9}" fill="${row.key}" stroke="#666" stroke-width="${Math.max(0.01, safeUnit * 0.02)}" />
    <text x="${safeUnit * 4.8}" y="${y}" font-size="${safeUnit * 0.22}" fill="#222">${row.key}</text>
    <text x="${safeUnit * 6.5}" y="${y}" font-size="${safeUnit * 0.24}" fill="#222">${row.name}</text>
    <text x="${safeUnit * 15.6}" y="${y}" font-size="${safeUnit * 0.28}" fill="#111">${row.count}</text>
    <text x="${safeUnit * 19.8}" y="${y}" font-size="${safeUnit * 0.28}" fill="#111">${groupedCountByFinal[row.key] ?? 1}</text>
    <text x="${safeUnit * 24.6}" y="${y}" font-size="${safeUnit * 0.28}" fill="#111">${row.folhas}</text>`;
      })
      .join("")}
  </g>
</svg>`;
}

export function BandeirasWorkspace() {
  const [pixelArt, setPixelArt] = useState<LoadedPixelArt | null>(null);
  const [originalPixelArt, setOriginalPixelArt] = useState<LoadedPixelArt | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [numberColorsEnabled, setNumberColorsEnabled] = useState(false);
  const [minorGridEnabled, setMinorGridEnabled] = useState(false);
  const [majorGridEnabled, setMajorGridEnabled] = useState(false);
  const [minorGridColor, setMinorGridColor] = useState("#3d4c45");
  const [majorGridColor, setMajorGridColor] = useState("#d7ef38");
  const [scaleZeros, setScaleZeros] = useState(0);
  const [loadMessage, setLoadMessage] = useState("");
  const [previewZoom, setPreviewZoom] = useState(0.6);
  const [colorTolerance, setColorTolerance] = useState(24);
  const [minColorPixels, setMinColorPixels] = useState(3);
  const [groupSimilarForNumbers, setGroupSimilarForNumbers] = useState(true);
  const [colorCorrectionMode, setColorCorrectionMode] = useState<ColorCorrectionMode>("kmeans_palette");
  const [preserveVibrancy, setPreserveVibrancy] = useState(true);
  const [showLostTones, setShowLostTones] = useState(false);
  const [editHistory, setEditHistory] = useState<LoadedPixelArt[]>([]);
  const [maxFinalColors, setMaxFinalColors] = useState(16);
  const [maxFinalColorsDraft, setMaxFinalColorsDraft] = useState("16");
  const [toneCorrectionOptions, setToneCorrectionOptions] = useState<ToneCorrectionOption[]>([]);
  const [selectedToneOptionLabel, setSelectedToneOptionLabel] = useState("");
  const [collapsedSections, setCollapsedSections] = useState({
    grid: false,
    colors: false,
    split: false,
    delivery: false
  });
  const [paperPreset, setPaperPreset] = useState<PaperPreset>("A4");
  const [customPaperLabel, setCustomPaperLabel] = useState("Personalizada");
  const [divisionsHorizontal, setDivisionsHorizontal] = useState(3);
  const [divisionsVertical, setDivisionsVertical] = useState(3);
  const [deliveryActionMode, setDeliveryActionMode] = useState<DeliveryActionMode>("download");
  const [deliveryEmail, setDeliveryEmail] = useState("");
  const [deliveryMode, setDeliveryMode] = useState<BandeiraDeliveryMode>("four_parts_plus_full");
  const [deliveryFileFormat, setDeliveryFileFormat] = useState<DeliveryFileFormat>("all");
  const [deliveryScaleMode, setDeliveryScaleMode] = useState<BandeiraScaleDeliveryMode>("all");
  const [emailState, setEmailState] = useState<EmailState>({ status: "idle", message: "" });
  const [groupedColorCountByFinal, setGroupedColorCountByFinal] = useState<Record<string, number>>({});
  const [folhasDivisor, setFolhasDivisor] = useState<number>(35);
  const [customFolhasDivisorDraft, setCustomFolhasDivisorDraft] = useState("35");
  const [lastReductionSummary, setLastReductionSummary] = useState<{
    originalDistinct: number;
    finalDistinct: number;
    adjustedCount: number;
  } | null>(null);
  const [colorTabsActiveTab, setColorTabsActiveTab] = useState<"removed" | "detected">("removed");
  const [colorTabsCollapsed, setColorTabsCollapsed] = useState(false);
  const previewScrollRef = useRef<HTMLDivElement | null>(null);
  const autoFitKeyRef = useRef<string | null>(null);

  const cellSize = pixelArt ? getPreviewCellSize(pixelArt.width, pixelArt.height) : 18;
  const compareCellSize = pixelArt ? getCompareCellSize(pixelArt.width, pixelArt.height) : 4;
  const previewTooDense = pixelArt ? pixelArt.width * pixelArt.height > MAX_PREVIEW_CELLS : false;

  useEffect(() => {
    setMaxFinalColorsDraft(String(maxFinalColors));
  }, [maxFinalColors]);

  useEffect(() => {
    setCustomFolhasDivisorDraft(String(folhasDivisor));
  }, [folhasDivisor]);

  const groupedColorMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!pixelArt) return map;
    const quantStep = Math.max(1, Math.round(colorTolerance / 2));
    for (const pixel of pixelArt.pixels) {
      const grouped = groupSimilarForNumbers ? quantizeHex(pixel.color, quantStep) : pixel.color;
      map.set(pixel.color, grouped);
    }
    return map;
  }, [pixelArt, colorTolerance, groupSimilarForNumbers]);

  const colorSummaries = useMemo<ColorSummary[]>(() => {
    if (!pixelArt) return [];

    const foundColors = new Map<string, number>();
    for (const pixel of pixelArt.pixels) {
      const colorKey = groupedColorMap.get(pixel.color) ?? pixel.color;
      foundColors.set(colorKey, (foundColors.get(colorKey) ?? 0) + 1);
    }

    return Array.from(foundColors.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
      .map((item, index) => ({
        key: item.key,
        name: getCatalogColorName(item.key),
        count: item.count,
        index: index + 1,
        folhas: Math.ceil(item.count / Math.max(1, folhasDivisor))
      }));
  }, [folhasDivisor, pixelArt, groupedColorMap]);

  const exactColorCounts = useMemo(() => {
    const map = new Map<string, number>();
    if (!pixelArt) {
      return map;
    }
    for (const pixel of pixelArt.pixels) {
      map.set(pixel.color, (map.get(pixel.color) ?? 0) + 1);
    }
    return map;
  }, [pixelArt]);

  const colorDiagnostics = useMemo(() => {
    if (!pixelArt) {
      return {
        totalColors: 0,
        lostToneColors: 0,
        lostTonePixels: 0,
        suggestedEditableColors: 0
      };
    }

    let lostToneColors = 0;
    let lostTonePixels = 0;

    for (const count of exactColorCounts.values()) {
      if (count < minColorPixels) {
        lostToneColors += 1;
        lostTonePixels += count;
      }
    }

    return {
      totalColors: exactColorCounts.size,
      lostToneColors,
      lostTonePixels,
      suggestedEditableColors: computeEditableColorLimit(pixelArt.width, pixelArt.height, exactColorCounts.size)
    };
  }, [exactColorCounts, minColorPixels, pixelArt]);

  const colorNumberMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of colorSummaries) {
      map.set(item.key, item.index);
    }
    return map;
  }, [colorSummaries]);

  const removedOriginalColors = useMemo(() => {
    if (!originalPixelArt || !pixelArt) {
      return [] as Array<{ key: string; count: number }>;
    }

    const originalCounts = new Map<string, number>();
    for (const pixel of originalPixelArt.pixels) {
      originalCounts.set(pixel.color, (originalCounts.get(pixel.color) ?? 0) + 1);
    }

    return Array.from(originalCounts.entries())
      .filter(([color]) => !exactColorCounts.has(color))
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count);
  }, [exactColorCounts, originalPixelArt, pixelArt]);

  const scaledMetrics = useMemo(() => {
    if (!pixelArt) return { width: 0, height: 0 };
    return {
      width: pixelArt.width * Math.pow(10, scaleZeros),
      height: pixelArt.height * Math.pow(10, scaleZeros)
    };
  }, [pixelArt, scaleZeros]);
  const scaleMultiplier = Math.pow(10, scaleZeros);

  const divisionPartsPreview = useMemo(() => {
    if (!pixelArt) return [] as Array<{
      id: string;
      label: string;
      startX: number;
      startY: number;
      width: number;
      height: number;
      pixels: LoadedPixelArt["pixels"];
    }>;

    const tileWidth = Math.ceil(pixelArt.width / divisionsHorizontal);
    const tileHeight = Math.ceil(pixelArt.height / divisionsVertical);

    return Array.from({ length: divisionsVertical }, (_, rowIndex) =>
      Array.from({ length: divisionsHorizontal }, (_, colIndex) => {
        const startX = colIndex * tileWidth;
        const startY = rowIndex * tileHeight;
        const width = Math.min(tileWidth, pixelArt.width - startX);
        const height = Math.min(tileHeight, pixelArt.height - startY);
        return {
          id: `part-${rowIndex}-${colIndex}`,
          label: `Parte ${rowIndex * divisionsHorizontal + colIndex + 1}`,
          startX,
          startY,
          width,
          height,
          pixels: pixelArt.pixels.filter(
            (pixel) =>
              pixel.x >= startX &&
              pixel.x < startX + width &&
              pixel.y >= startY &&
              pixel.y < startY + height
          )
        };
      })
    ).flat();
  }, [divisionsHorizontal, divisionsVertical, pixelArt]);

  const pixelArtFitKey = pixelArt ? `${pixelArt.name}-${pixelArt.width}-${pixelArt.height}` : "empty";

  const fitPreviewZoom = () => {
    if (!pixelArt || !previewScrollRef.current) {
      return;
    }

    const container = previewScrollRef.current;
    const imageWidth = pixelArt.width * cellSize;
    const imageHeight = pixelArt.height * cellSize;
    const fitZoom = Math.min(
      1,
      Math.max(MIN_PREVIEW_ZOOM, Number((Math.min(container.clientWidth / imageWidth, container.clientHeight / imageHeight) * 0.94).toFixed(2)))
    );
    setPreviewZoom(fitZoom);
  };

  const toggleSectionCollapse = (section: "grid" | "colors" | "split" | "delivery") => {
    setCollapsedSections((current) => ({ ...current, [section]: !current[section] }));
  };

  const handleImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = event.target.files?.[0];
    if (!file) return;

    setLoadingImage(true);
    setLoadError("");

    try {
      const loaded = await readPixelArt(file);
      const detectedColors = new Set(loaded.pixels.map((pixel) => pixel.color)).size;
      const suggestedLimit = computeEditableColorLimit(loaded.width, loaded.height, detectedColors);
      const initialAutoLimit = computeInitialAutoColorLimit(loaded.width, loaded.height, detectedColors);
      const initialTolerance =
        detectedColors > 400 ? 10 :
        detectedColors > 220 ? 9 :
        detectedColors > 120 ? 8 :
        6;
      const initialMinPixels =
        loaded.width * loaded.height > 10000 ? 2 : 1;

      setPixelArt(loaded);
      setOriginalPixelArt(loaded);
      setNumberColorsEnabled(false);
      setMinorGridEnabled(false);
      setMajorGridEnabled(false);
      setScaleZeros(0);
      setPreviewZoom(0.6);
      setEditHistory([]);
      setMaxFinalColors(initialAutoLimit);
      setColorTolerance(initialTolerance);
      setMinColorPixels(initialMinPixels);
      setColorCorrectionMode("kmeans_palette");
      setPreserveVibrancy(true);
      setGroupSimilarForNumbers(true);
      setShowLostTones(false);
      setToneCorrectionOptions([]);
      setSelectedToneOptionLabel("");
      setGroupedColorCountByFinal({});
      setLastReductionSummary({
        originalDistinct: detectedColors,
        finalDistinct: detectedColors,
        adjustedCount: 0
      });
      setEmailState({ status: "idle", message: "" });
      autoFitKeyRef.current = null;

      const originalImage =
        typeof createImageBitmap === "function" ? await createImageBitmap(file).catch(() => null) : null;
      const originalWidth = originalImage?.width ?? loaded.width;
      const originalHeight = originalImage?.height ?? loaded.height;
      if (originalImage) originalImage.close();

      if (loaded.width !== originalWidth || loaded.height !== originalHeight) {
        setLoadMessage(`Imagem otimizada para edicao: ${originalWidth}x${originalHeight} -> ${loaded.width}x${loaded.height}. A tonalidade original foi preservada e o sistema ja sugeriu um maximo inicial de ${initialAutoLimit} cores para ajuste depois.`);
      } else {
        setLoadMessage(`Imagem carregada com a tonalidade original preservada. O sistema sugeriu cerca de ${initialAutoLimit} cores maximas para voce ajustar depois, sem mexer na arte agora.`);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Nao foi possivel carregar a imagem.");
      setLoadMessage("");
    } finally {
      setLoadingImage(false);
      input.value = "";
    }
  };

  const runColorNormalization = (options?: {
    tolerance?: number;
    minPixels?: number;
    correctionMode?: ColorCorrectionMode;
    vibrancy?: boolean;
    targetColors?: number;
  }) => {
    if (!pixelArt) return;

    const effectiveTolerance = options?.tolerance ?? colorTolerance;
    const effectiveMinPixels = options?.minPixels ?? minColorPixels;
    const effectiveCorrectionMode = options?.correctionMode ?? colorCorrectionMode;
    const effectiveVibrancy = options?.vibrancy ?? preserveVibrancy;
    const distinctBefore = new Set(pixelArt.pixels.map((pixel) => pixel.color)).size;
    const automaticTargetColors = computeEditableColorLimit(pixelArt.width, pixelArt.height, distinctBefore);
    const effectiveTargetColors = Math.max(2, options?.targetColors ?? maxFinalColors ?? automaticTargetColors);
    const reduced = normalizePixelArtColors(pixelArt, {
      correctionMode: effectiveCorrectionMode,
      vibrancy: effectiveVibrancy,
      tolerance: effectiveTolerance,
      minPixels: effectiveMinPixels,
      targetColors: effectiveTargetColors
    });

    setEditHistory((current) => [...current, pixelArt]);
    setPixelArt(reduced.art);
    setGroupedColorCountByFinal(reduced.groupedCountByColor);
    setToneCorrectionOptions([]);
    setLastReductionSummary({
      originalDistinct: reduced.originalDistinct,
      finalDistinct: reduced.finalDistinct,
      adjustedCount: Math.max(0, reduced.originalDistinct - reduced.finalDistinct)
    });
    setEmailState({ status: "idle", message: "" });
  };

  const runAutomaticColorAdjustment = () => {
    if (!pixelArt) return;

    const distinctColors = new Set(pixelArt.pixels.map((pixel) => pixel.color)).size;
    const totalPixels = pixelArt.width * pixelArt.height;
    const suggestedTargetColors = computeEditableColorLimit(pixelArt.width, pixelArt.height, distinctColors);
    const chosenTargetColors = Math.max(2, Math.min(distinctColors, maxFinalColors || suggestedTargetColors));
    const suggestedTolerance =
      distinctColors > 140 ? 46 :
      distinctColors > 96 ? 40 :
      distinctColors > 64 ? 34 :
      distinctColors > 32 ? 28 :
      22;
    const suggestedMinPixels = Math.max(3, Math.min(12, Math.round(totalPixels / 3200) + 3));

    setColorCorrectionMode("kmeans_palette");
    setPreserveVibrancy(true);
    setGroupSimilarForNumbers(true);
    setColorTolerance(suggestedTolerance);
    setMinColorPixels(suggestedMinPixels);
    runColorNormalization({
      correctionMode: "kmeans_palette",
      vibrancy: true,
      tolerance: suggestedTolerance,
      minPixels: suggestedMinPixels,
      targetColors: chosenTargetColors
    });
    setLoadMessage(
      `Ajuste automatico aplicado: ${distinctColors} cor(es) detectadas, reduzidas para cerca de ${chosenTargetColors} cores, respeitando o maximo escolhido.`
    );
  };

  const applyCatalogToneCorrection = () => {
    if (!pixelArt) return;

    const mapToCatalog = new Map<string, string>();
    for (const pixel of pixelArt.pixels) {
      if (!mapToCatalog.has(pixel.color)) {
        mapToCatalog.set(pixel.color, findClosestCatalogColor(pixel.color).hex);
      }
    }

    const correctedPixels = pixelArt.pixels.map((pixel) => ({
      ...pixel,
      color: mapToCatalog.get(pixel.color) ?? pixel.color
    }));

    const groupedCountByColor: Record<string, number> = {};
    const sourceGroups = new Map<string, Set<string>>();
    for (const [sourceColor, finalColor] of mapToCatalog.entries()) {
      const bucket = sourceGroups.get(finalColor) ?? new Set<string>();
      bucket.add(sourceColor);
      sourceGroups.set(finalColor, bucket);
    }
    for (const [finalColor, bucket] of sourceGroups.entries()) {
      groupedCountByColor[finalColor] = bucket.size;
    }

    const finalDistinct = new Set(correctedPixels.map((pixel) => pixel.color)).size;
    const originalDistinct = new Set(pixelArt.pixels.map((pixel) => pixel.color)).size;

    setEditHistory((current) => [...current, pixelArt]);
    setPixelArt({ ...pixelArt, pixels: correctedPixels });
    setGroupedColorCountByFinal(groupedCountByColor);
    setToneCorrectionOptions([]);
    setLastReductionSummary({
      originalDistinct,
      finalDistinct,
      adjustedCount: Math.max(0, originalDistinct - finalDistinct)
    });
    setEmailState({ status: "idle", message: "" });
    setLoadMessage(`Tons corrigidos pela paleta nomeada. A arte foi aproximada para ${finalDistinct} cor(es) reconhecidas com nome e tabela pronta para contagem.`);
  };

  const generateToneCorrectionOptions = () => {
    if (!originalPixelArt) return;

    const sourceArt = originalPixelArt;
    const distinctColors = new Set(sourceArt.pixels.map((pixel) => pixel.color)).size;
    const targetColors = Math.max(2, Math.min(distinctColors, maxFinalColors || distinctColors));
    const optionPresets: Array<{
      id: string;
      label: string;
      note: string;
      correctionMode: ColorCorrectionMode;
      tolerance: number;
      minPixels: number;
      vibrancy: boolean;
    }> = [
      {
        id: "suave-vibrante",
        label: "Opcao 1",
        note: "Mais fiel e mais vibrante.",
        correctionMode: "kmeans_palette",
        tolerance: Math.max(6, colorTolerance - 6),
        minPixels: Math.max(1, minColorPixels - 1),
        vibrancy: true
      },
      {
        id: "equilibrada",
        label: "Opcao 2",
        note: "Equilibrio entre limpeza e fidelidade.",
        correctionMode: "kmeans_palette",
        tolerance: Math.max(8, colorTolerance),
        minPixels: Math.max(1, minColorPixels),
        vibrancy: true
      },
      {
        id: "limpa",
        label: "Opcao 3",
        note: "Mais limpa, com contornos mais fortes.",
        correctionMode: "nearest_all",
        tolerance: Math.max(8, colorTolerance - 2),
        minPixels: Math.max(1, minColorPixels),
        vibrancy: true
      },
      {
        id: "forte",
        label: "Opcao 4",
        note: "Reducao mais forte mantendo o limite escolhido.",
        correctionMode: "kmeans_palette",
        tolerance: Math.max(10, colorTolerance + 6),
        minPixels: Math.max(1, minColorPixels + 1),
        vibrancy: false
      }
    ];

    const options = optionPresets.map((preset) => {
      const reduced = normalizePixelArtColors(sourceArt, {
        correctionMode: preset.correctionMode,
        tolerance: preset.tolerance,
        minPixels: preset.minPixels,
        vibrancy: preset.vibrancy,
        targetColors
      });

      return {
        id: preset.id,
        label: preset.label,
        note: `${preset.note} ${reduced.finalDistinct} cor(es) finais.`,
        art: reduced.art,
        groupedCountByColor: reduced.groupedCountByColor,
        originalDistinct: reduced.originalDistinct,
        finalDistinct: reduced.finalDistinct
      };
    });

    setToneCorrectionOptions(options);
    setSelectedToneOptionLabel("");
    setLoadMessage(`Foram geradas 4 opcoes de ajuste com base em ${targetColors} cores maximas. Escolha uma para continuar a editar.`);
  };

  const applyToneCorrectionOption = (option: ToneCorrectionOption) => {
    if (!pixelArt) return;

    setEditHistory((current) => [...current, pixelArt]);
    setPixelArt(option.art);
    setGroupedColorCountByFinal(option.groupedCountByColor);
    setLastReductionSummary({
      originalDistinct: option.originalDistinct,
      finalDistinct: option.finalDistinct,
      adjustedCount: Math.max(0, option.originalDistinct - option.finalDistinct)
    });
    setToneCorrectionOptions([]);
    setSelectedToneOptionLabel(option.label);
    setEmailState({ status: "idle", message: "" });
    setLoadMessage(`${option.label} escolhida para continuar a edicao. A imagem principal agora mostra apenas a opcao selecionada.`);
  };

  const commitMaxFinalColorsDraft = () => {
    const detectedColors = Math.max(2, colorDiagnostics.totalColors || 2);
    const parsed = Number(maxFinalColorsDraft);
    const nextValue = Math.max(
      2,
      Math.min(detectedColors, Number.isFinite(parsed) && parsed > 0 ? parsed : maxFinalColors || 2)
    );
    setMaxFinalColors(nextValue);
    setMaxFinalColorsDraft(String(nextValue));
  };

  const commitCustomFolhasDivisorDraft = () => {
    const parsed = Number(customFolhasDivisorDraft.replace(/\D+/g, ""));
    const nextValue = Math.max(1, Number.isFinite(parsed) && parsed > 0 ? parsed : folhasDivisor);
    setFolhasDivisor(nextValue);
    setCustomFolhasDivisorDraft(String(nextValue));
    setLoadMessage(`Contagem atualizada: folhas por cor calculadas dividindo o total de tacos por ${nextValue}.`);
  };

  const undoNormalizeColors = () => {
    setEditHistory((current) => {
      const previousPixelArt = current.length > 0 ? current[current.length - 1] : null;
      if (!previousPixelArt) {
        return current;
      }

      setPixelArt(previousPixelArt);
      setGroupedColorCountByFinal({});
      setToneCorrectionOptions([]);
      setLastReductionSummary(null);
      setEmailState({ status: "idle", message: "" });
      return current.slice(0, -1);
    });
  };

  const restoreRemovedColor = (color: string) => {
    if (!pixelArt || !originalPixelArt || originalPixelArt.pixels.length !== pixelArt.pixels.length) {
      return;
    }

    setEditHistory((current) => [...current, pixelArt]);
    setPixelArt({
      ...pixelArt,
      pixels: pixelArt.pixels.map((pixel, index) =>
        originalPixelArt.pixels[index]?.color === color ? { ...pixel, color } : pixel
      )
    });
    setGroupedColorCountByFinal({});
    setToneCorrectionOptions([]);
    setLastReductionSummary(null);
    setEmailState({ status: "idle", message: "" });
    setLoadMessage(`Cor ${color} adicionada novamente na arte conforme a imagem original.`);
  };

  useLayoutEffect(() => {
    if (!pixelArt || !previewScrollRef.current) {
      return;
    }

    const container = previewScrollRef.current;
    const nextWidth = pixelArt.width * cellSize * previewZoom;
    const nextHeight = pixelArt.height * cellSize * previewZoom;
    container.scrollLeft = Math.max(0, (nextWidth - container.clientWidth) / 2);
    container.scrollTop = Math.max(0, (nextHeight - container.clientHeight) / 2);
  }, [cellSize, pixelArt, previewZoom]);

  useLayoutEffect(() => {
    if (!pixelArt || !previewScrollRef.current) {
      return;
    }

    if (autoFitKeyRef.current === pixelArtFitKey) {
      return;
    }

    autoFitKeyRef.current = pixelArtFitKey;
    fitPreviewZoom();
  }, [cellSize, pixelArt, pixelArtFitKey]);

  const sendBandeiraByEmail = async () => {
    if (!pixelArt) {
      setEmailState({ status: "error", message: "Carregue uma imagem antes de enviar." });
      return;
    }
    if (deliveryEmail.trim() === "") {
      setEmailState({ status: "error", message: "Informe o email do usuario." });
      return;
    }

    try {
      setEmailState({ status: "loading", message: "Enviando arquivos..." });
      const rawFiles: RawDeliveryFile[] = [];
      const appendScaleFiles = async (unitSize: number, suffix: string) => {
        const partSvgs = divisionPartsPreview.map((part) => ({
          filename: `${pixelArt.name}-${part.label.toLowerCase().replace(/\s+/g, "-")}${suffix}.svg`,
          contentType: "image/svg+xml" as const,
          content: createSvgFromBounds(
            pixelArt,
            { x: part.startX, y: part.startY, width: part.width, height: part.height },
            {
              minorGrid: minorGridEnabled,
              majorGrid: majorGridEnabled,
              minorGridColorValue: minorGridColor,
              majorGridColorValue: majorGridColor,
              unitSize,
              includeNumbers: numberColorsEnabled,
              colorNumberMap,
              groupedColorMap
            }
          )
        }));

        const tableSvg = createColorLegendSvg(pixelArt.name, colorSummaries, groupedColorCountByFinal, unitSize);

        if (deliveryFileFormat === "pdf" || deliveryFileFormat === "all") {
          const pdfPages = [...partSvgs.map((item) => item.content), tableSvg];
          rawFiles.push({
            filename: `${pixelArt.name}${suffix}-partes+tabela.pdf`,
            contentType: "application/pdf",
            contentBase64: await svgPagesToPdfBase64(pdfPages)
          });
        }

        if (deliveryFileFormat === "svg" || deliveryFileFormat === "png" || deliveryFileFormat === "all") {
          rawFiles.push(...partSvgs);
          rawFiles.push({
            filename: `${pixelArt.name}${suffix}-tabela-de-cores.svg`,
            contentType: "image/svg+xml",
            content: tableSvg
          });
        }
      };

      if (deliveryScaleMode === "original" || deliveryScaleMode === "all" || scaleMultiplier <= 1) {
        await appendScaleFiles(1, "-tamanho-original");
      }

      if ((deliveryScaleMode === "scaled" || deliveryScaleMode === "all") && scaleMultiplier > 1) {
        await appendScaleFiles(scaleMultiplier, `-escala-${scaleMultiplier}`);
      }

      if (deliveryScaleMode === "scaled" && scaleMultiplier <= 1) {
        await appendScaleFiles(1, "-tamanho-original");
      }

      const csv = buildColorTableCsv(colorSummaries, groupedColorCountByFinal);
      rawFiles.push({
        filename: `${pixelArt.name}-tabela-de-cores.csv`,
        contentType: "text/csv",
        contentBase64: base64FromText(csv)
      });
      const files = await buildAttachmentsFromRawFiles(rawFiles, deliveryFileFormat);

      const response = await apiFetch(`/api/send-mold-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: deliveryEmail,
          projectName: `${pixelArt.name} (bandeiras)`,
          body: [
            `Projeto: ${pixelArt.name}`,
            `Pacote enviado: ${divisionsHorizontal * divisionsVertical} parte(s) + tabela de cores`,
            `Formato do arquivo: ${deliveryFormatLabel(deliveryFileFormat)}`,
            `Escala do envio: ${describeScaleMode(deliveryScaleMode, scaleMultiplier)}`,
            "As partes seguem em folhas separadas no PDF e a tabela de cores vai junto no pacote."
          ].join("\n"),
          files
        })
      });

      const rawResponse = await response.text();
      let payload: { message?: string } = {};
      try {
        payload = rawResponse ? (JSON.parse(rawResponse) as { message?: string }) : {};
      } catch {
        payload = {
          message: rawResponse.includes("<")
            ? "O servidor retornou uma resposta invalida no envio do email. Verifique a configuracao do backend."
            : rawResponse || "Falha ao enviar os arquivos."
        };
      }
      if (!response.ok) {
        throw new Error(payload.message || "Falha ao enviar os arquivos.");
      }
      setEmailState({
        status: "success",
        message:
          `Arquivos enviados em ${divisionsHorizontal * divisionsVertical} parte(s) + tabela de cores no formato ${deliveryFormatLabel(deliveryFileFormat)} e escala ${describeScaleMode(deliveryScaleMode, scaleMultiplier)}.`
      });
    } catch (error) {
      setEmailState({
        status: "error",
        message:
          error instanceof TypeError
            ? "Nao foi possivel conectar ao servidor de email. Ligue o backend com npm run dev:mail."
            : error instanceof Error
              ? error.message
              : "Nao foi possivel enviar os arquivos."
      });
    }
  };

  const downloadBandeiraFiles = async () => {
    if (!pixelArt) {
      setEmailState({ status: "error", message: "Carregue uma imagem antes de baixar." });
      return;
    }

    try {
      setEmailState({ status: "loading", message: "Preparando arquivos para download..." });
      const rawFiles: RawDeliveryFile[] = [];
      const appendScaleFiles = async (unitSize: number, suffix: string) => {
        const partSvgs = divisionPartsPreview.map((part) => ({
          filename: `${pixelArt.name}-${part.label.toLowerCase().replace(/\s+/g, "-")}${suffix}.svg`,
          contentType: "image/svg+xml" as const,
          content: createSvgFromBounds(
            pixelArt,
            { x: part.startX, y: part.startY, width: part.width, height: part.height },
            {
              minorGrid: minorGridEnabled,
              majorGrid: majorGridEnabled,
              minorGridColorValue: minorGridColor,
              majorGridColorValue: majorGridColor,
              unitSize,
              includeNumbers: numberColorsEnabled,
              colorNumberMap,
              groupedColorMap
            }
          )
        }));
        const tableSvg = createColorLegendSvg(pixelArt.name, colorSummaries, groupedColorCountByFinal, unitSize);

        if (deliveryFileFormat === "pdf" || deliveryFileFormat === "all") {
          rawFiles.push({
            filename: `${pixelArt.name}${suffix}-partes+tabela.pdf`,
            contentType: "application/pdf",
            contentBase64: await svgPagesToPdfBase64([...partSvgs.map((item) => item.content), tableSvg])
          });
        }

        if (deliveryFileFormat === "svg" || deliveryFileFormat === "png" || deliveryFileFormat === "all") {
          rawFiles.push(...partSvgs);
          rawFiles.push({
            filename: `${pixelArt.name}${suffix}-tabela-de-cores.svg`,
            contentType: "image/svg+xml",
            content: tableSvg
          });
        }
      };

      if (deliveryScaleMode === "original" || deliveryScaleMode === "all" || scaleMultiplier <= 1) {
        await appendScaleFiles(1, "-tamanho-original");
      }

      if ((deliveryScaleMode === "scaled" || deliveryScaleMode === "all") && scaleMultiplier > 1) {
        await appendScaleFiles(scaleMultiplier, `-escala-${scaleMultiplier}`);
      }

      if (deliveryScaleMode === "scaled" && scaleMultiplier <= 1) {
        await appendScaleFiles(1, "-tamanho-original");
      }

      const files = await buildAttachmentsFromRawFiles(rawFiles, deliveryFileFormat);

      for (const file of files) {
        const byteCharacters = atob(file.contentBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let index = 0; index < byteCharacters.length; index += 1) {
          byteNumbers[index] = byteCharacters.charCodeAt(index);
        }
        const blob = new Blob([new Uint8Array(byteNumbers)], { type: file.contentType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }

      setEmailState({
        status: "success",
        message: `Download iniciado com ${files.length} arquivo(s) no formato ${deliveryFormatLabel(deliveryFileFormat)} e ${divisionsHorizontal * divisionsVertical} parte(s) por divisao.`
      });
    } catch (error) {
      setEmailState({
        status: "error",
        message: error instanceof Error ? error.message : "Nao foi possivel baixar os arquivos."
      });
    }
  };

  return (
    <section className="table-panel workspace-tab-panel bandeiras-panel">
      <div className="panel-head mold-tab-head">
        <div>
          <p className="eyebrow">Area de bandeiras</p>
          <h3>Bandeiras</h3>
          <p className="panel-subcopy bandeiras-hero-copy">
            Transforme uma imagem pixelada em uma grade pronta para leitura, numeracao de cores, ajuste de tons e envio organizado.
          </p>
        </div>
      </div>

      <div className="bandeiras-layout">
        <div className="bandeiras-canvas-panel">
          <div className="panel bandeiras-workbench-card">
            <div className="panel-head">
              <div>
                <h3>Area de trabalho da bandeira</h3>
                <p className="panel-subcopy">Carregue a imagem, ajuste a visualizacao e veja a grade pronta para montagem.</p>
              </div>
            </div>
            <div className="bandeiras-toolbar">
              <label className="upload-button">
                <input type="file" accept="image/*" onChange={handleImageUpload} />
                {loadingImage ? "Carregando..." : "Carregar imagem pixelada"}
              </label>

              <button type="button" onClick={() => setNumberColorsEnabled(true)} disabled={!pixelArt}>
                Numerar cores
              </button>

              <div className="zoom-mini-toolbar">
                <button type="button" onClick={() => setPreviewZoom((current) => Math.max(MIN_PREVIEW_ZOOM, Number((current - 1).toFixed(2))))}>
                  -
                </button>
                <input
                  type="range"
                  min={MIN_PREVIEW_ZOOM}
                  max={MAX_PREVIEW_ZOOM}
                  step="0.1"
                  value={previewZoom}
                  onChange={(event) => setPreviewZoom(Number(event.target.value))}
                />
                <button type="button" onClick={() => setPreviewZoom((current) => Math.min(MAX_PREVIEW_ZOOM, Number((current + 1).toFixed(2))))}>
                  +
                </button>
                <button type="button" className="zoom-fit-button" onClick={fitPreviewZoom} disabled={!pixelArt}>
                  Ver imagem inteira
                </button>
                <span>{Math.round(previewZoom * 100)}%</span>
              </div>

              <label className="toggle compact-toggle">
                <input type="checkbox" checked={minorGridEnabled} onChange={(event) => setMinorGridEnabled(event.target.checked)} />
                <span>Grade dos pixels</span>
              </label>

              <label className="toggle compact-toggle">
                <input type="checkbox" checked={majorGridEnabled} onChange={(event) => setMajorGridEnabled(event.target.checked)} />
                <span>Grade 7x5</span>
              </label>
            </div>
          </div>

          {loadError ? <div className="delivery-status error">{loadError}</div> : null}
          {!loadError && loadMessage ? <div className="delivery-status success">{loadMessage}</div> : null}

          {originalPixelArt && pixelArt && (toneCorrectionOptions.length > 0 || selectedToneOptionLabel === "") ? (
            <div className="panel bandeiras-compare-card">
              <div className="panel-head">
                <div>
                  <h3>Corrigir tons</h3>
                  <p className="panel-subcopy">
                    {toneCorrectionOptions.length > 0
                      ? "Escolha uma das 4 opcoes abaixo para continuar a editar."
                      : "Gere 4 opcoes de ajuste com a mesma quantidade de cores e escolha uma para continuar a editar."}
                  </p>
                </div>
              </div>
              <div className="bandeiras-compare-toolbar">
                <div className="bandeiras-compare-origin">
                  <strong>Imagem antiga</strong>
                  <div className="bandeiras-compare-preview compact">
                    <svg
                      width={originalPixelArt.width * compareCellSize}
                      height={originalPixelArt.height * compareCellSize}
                      viewBox={`0 0 ${originalPixelArt.width * compareCellSize} ${originalPixelArt.height * compareCellSize}`}
                      role="img"
                      aria-label="Imagem original da bandeira"
                    >
                      {originalPixelArt.pixels.map((pixel) => (
                        <rect
                          key={`original-${pixel.x}-${pixel.y}`}
                          x={pixel.x * compareCellSize}
                          y={pixel.y * compareCellSize}
                          width={compareCellSize}
                          height={compareCellSize}
                          fill={pixel.color}
                        />
                      ))}
                    </svg>
                  </div>
                </div>

                <div className="bandeiras-compare-action">
                  <button type="button" onClick={generateToneCorrectionOptions} disabled={!originalPixelArt}>
                    Gerar 4 opcoes
                  </button>
                </div>
              </div>

              {toneCorrectionOptions.length ? (
                <div className="bandeiras-options-grid">
                  {toneCorrectionOptions.map((option) => (
                    <div key={option.id} className="bandeiras-option-card">
                      <div className="bandeiras-option-head">
                        <strong>{option.label}</strong>
                        <span>{option.note}</span>
                      </div>
                      <div className="bandeiras-compare-preview">
                        <svg
                          width={option.art.width * compareCellSize}
                          height={option.art.height * compareCellSize}
                          viewBox={`0 0 ${option.art.width * compareCellSize} ${option.art.height * compareCellSize}`}
                          role="img"
                          aria-label={`${option.label} da bandeira`}
                        >
                          {option.art.pixels.map((pixel) => (
                            <rect
                              key={`${option.id}-${pixel.x}-${pixel.y}`}
                              x={pixel.x * compareCellSize}
                              y={pixel.y * compareCellSize}
                              width={compareCellSize}
                              height={compareCellSize}
                              fill={pixel.color}
                            />
                          ))}
                        </svg>
                      </div>
                      <button type="button" onClick={() => applyToneCorrectionOption(option)}>
                        Continuar com esta opcao
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bandeiras-hints">
                  <span>O sistema vai gerar 4 opcoes diferentes usando o mesmo maximo de cores escolhido.</span>
                  <span>Depois de escolher uma, as outras somem e voce termina a edicao so na opcao selecionada.</span>
                </div>
              )}
            </div>
          ) : null}

          {selectedToneOptionLabel ? (
            <div className="delivery-status success">
              Voce esta editando a {selectedToneOptionLabel}. As outras opcoes foram ocultadas.
            </div>
          ) : null}

          <div className="bandeiras-preview-scroll" ref={previewScrollRef}>
            {pixelArt ? (
              <div className="bandeiras-preview-stage">
                <svg
                  className="bandeiras-preview"
                  width={pixelArt.width * cellSize * previewZoom}
                  height={pixelArt.height * cellSize * previewZoom}
                  viewBox={`0 0 ${pixelArt.width * cellSize} ${pixelArt.height * cellSize}`}
                  role="img"
                  aria-label="Preview da bandeira pixelada"
                >
                  {pixelArt.pixels.map((pixel) => {
                    const x = pixel.x * cellSize;
                    const y = pixel.y * cellSize;
                    const colorKey = groupedColorMap.get(pixel.color) ?? pixel.color;
                    const colorNumber = colorNumberMap.get(colorKey);
                    return (
                      <g key={`${pixel.x}-${pixel.y}`}>
                        <rect
                          x={x}
                          y={y}
                          width={cellSize}
                          height={cellSize}
                          fill={pixel.color}
                          stroke={
                            showLostTones && (exactColorCounts.get(pixel.color) ?? 0) < minColorPixels
                              ? "#ff4f88"
                              : minorGridEnabled
                                ? minorGridColor
                                : "transparent"
                          }
                          strokeWidth={
                            showLostTones && (exactColorCounts.get(pixel.color) ?? 0) < minColorPixels
                              ? Math.max(0.9, cellSize * 0.11)
                              : minorGridEnabled
                                ? Math.max(0.45, cellSize * 0.04)
                                : 0
                          }
                        />
                        {numberColorsEnabled && !previewTooDense && colorNumber ? (
                          <text
                            x={x + cellSize / 2}
                            y={y + cellSize / 2}
                            className="pixel-number"
                            style={{
                              fontSize: `${Math.max(5, cellSize * 0.42)}px`,
                              ...textStyleForBackground(pixel.color)
                            }}
                          >
                            {colorNumber}
                          </text>
                        ) : null}
                      </g>
                    );
                  })}

                  {majorGridEnabled
                    ? Array.from({ length: Math.floor(pixelArt.width / 7) + 1 }, (_, index) => {
                        const x = index * 7 * cellSize;
                        return (
                          <line
                            key={`major-v-${index}`}
                            x1={x}
                            y1={0}
                            x2={x}
                            y2={pixelArt.height * cellSize}
                            stroke={majorGridColor}
                            strokeWidth={Math.max(1.1, cellSize * 0.12)}
                          />
                        );
                      })
                    : null}

                  {majorGridEnabled
                    ? Array.from({ length: Math.floor(pixelArt.height / 5) + 1 }, (_, index) => {
                        const y = index * 5 * cellSize;
                        return (
                          <line
                            key={`major-h-${index}`}
                            x1={0}
                            y1={y}
                            x2={pixelArt.width * cellSize}
                            y2={y}
                            stroke={majorGridColor}
                            strokeWidth={Math.max(1.1, cellSize * 0.12)}
                          />
                        );
                      })
                    : null}
                </svg>
              </div>
            ) : (
              <div className="bandeiras-empty">
                <strong>Carregue uma imagem pixelada</strong>
                <p>Depois disso voce pode numerar as cores, criar grades e calcular folhas por cor.</p>
              </div>
            )}
          </div>

          {numberColorsEnabled && previewTooDense ? (
            <div className="warning">
              A numeracao foi calculada, mas o preview esconde os numeros porque a imagem tem pixels demais para manter a leitura limpa.
            </div>
          ) : null}

          <div className="bandeiras-inline-controls">
            <div className="panel bandeiras-controls-card">
              <div className="panel-head">
                <div>
                  <h3>Configuracoes da grade</h3>
                  <p className="panel-subcopy">Controle como a grade aparece na imagem e deixe a leitura mais clara para montagem.</p>
                </div>
                <button
                  type="button"
                  className={`panel-collapse-button ${collapsedSections.grid ? "collapsed" : ""}`}
                  onClick={() => toggleSectionCollapse("grid")}
                >
                  {collapsedSections.grid ? "Expandir" : "Minimizar"}
                </button>
              </div>
              {!collapsedSections.grid ? (
                <>
                  <div className="grid two bandeiras-grid-controls">
                    <Field label="Cor da grade dos pixels">
                      <input type="color" value={minorGridColor} onChange={(event) => setMinorGridColor(event.target.value)} />
                    </Field>
                    <Field label="Cor da grade 7x5">
                      <input type="color" value={majorGridColor} onChange={(event) => setMajorGridColor(event.target.value)} />
                    </Field>
                  </div>
                  <div className="bandeiras-hints">
                    <span>Grade dos pixels: mostra a divisao individual de cada quadrado.</span>
                    <span>Grade 7x5: cria blocos maiores para facilitar a contagem visual.</span>
                    <span>Folhas: cada cor usa a quantidade de pixels dividida pelo divisor ativo ({folhasDivisor}).</span>
                  </div>
                </>
              ) : null}
            </div>

            <div className="panel bandeiras-controls-card">
              <div className="panel-head">
                <div>
                  <h3>Ajuste de cores</h3>
                  <p className="panel-subcopy">Limpe tons muito parecidos, reduza ruido e organize uma paleta mais funcional para a bandeira.</p>
                </div>
                <button
                  type="button"
                  className={`panel-collapse-button ${collapsedSections.colors ? "collapsed" : ""}`}
                  onClick={() => toggleSectionCollapse("colors")}
                >
                  {collapsedSections.colors ? "Expandir" : "Minimizar"}
                </button>
              </div>
              {!collapsedSections.colors ? (
                <>
                  <div className="grid two bandeiras-grid-controls">
                    <Field label="Minimo de pixels por cor">
                      <input
                        type="number"
                        min="1"
                        max="200"
                        value={minColorPixels}
                        onChange={(event) => setMinColorPixels(Math.max(1, Number(event.target.value) || 1))}
                      />
                    </Field>
                    <Field label="Tolerancia de semelhanca">
                      <input
                        type="number"
                        min="0"
                        max="120"
                        value={colorTolerance}
                        onChange={(event) => setColorTolerance(Math.max(0, Number(event.target.value) || 0))}
                      />
                    </Field>
                  </div>
                  <Field label="Maximo de cores finais">
                    <div className="palette-limit-row">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={maxFinalColorsDraft}
                        onChange={(event) => {
                          const nextValue = event.target.value.replace(/\D+/g, "");
                          setMaxFinalColorsDraft(nextValue);
                        }}
                        onBlur={commitMaxFinalColorsDraft}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            commitMaxFinalColorsDraft();
                          }
                        }}
                      />
                    </div>
                  </Field>
                  <Field label="Modo da correcao">
                    <select value={colorCorrectionMode} onChange={(event) => setColorCorrectionMode(event.target.value as ColorCorrectionMode)}>
                      <option value="rare_only">Corrigir tons perdidos (preserva qualidade)</option>
                      <option value="nearest_all">Corrigir tudo para cor mais proxima (reduzir paleta)</option>
                      <option value="kmeans_palette">Agrupamento inteligente de paleta (K-Means)</option>
                    </select>
                  </Field>
                  <label className="toggle compact-toggle">
                    <input
                      type="checkbox"
                      checked={preserveVibrancy}
                      onChange={(event) => setPreserveVibrancy(event.target.checked)}
                    />
                    <span>Preservar tons vibrantes</span>
                  </label>
                  <div className="bandeiras-action-stack">
                    <button type="button" onClick={applyCatalogToneCorrection} disabled={!pixelArt}>
                      Corrigir tons com paleta nomeada
                    </button>
                    <button type="button" onClick={runAutomaticColorAdjustment} disabled={!pixelArt}>
                      Ajuste automatico inteligente
                    </button>
                    <button type="button" onClick={undoNormalizeColors} disabled={editHistory.length === 0}>
                      Desfazer alteracoes
                    </button>
                  </div>
                  <div className="delivery-mode-panel">
                    <strong>Contagem de tacos por cor</strong>
                    <div className="delivery-mode-options bandeiras-count-options">
                      {([
                        { divisor: 117 as TacoCountPreset, label: "Taco de 5" },
                        { divisor: 60 as TacoCountPreset, label: "Taco de 7" },
                        { divisor: 30 as TacoCountPreset, label: "Taco de 10" },
                        { divisor: 18 as TacoCountPreset, label: "Taco de 12" },
                        { divisor: 10 as TacoCountPreset, label: "Taco de 16" },
                        { divisor: 5 as TacoCountPreset, label: "Taco de 22" }
                      ]).map((preset) => (
                        <button
                          key={preset.divisor}
                          type="button"
                          className={`mini-chip-button ${folhasDivisor === preset.divisor ? "active" : ""}`}
                          onClick={() => {
                            setFolhasDivisor(preset.divisor);
                            setLoadMessage(`Contagem ajustada para ${preset.label}. A coluna de folhas foi recalculada automaticamente.`);
                          }}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <div className="grid two bandeiras-grid-controls">
                      <Field label="Dividir total de tacos por">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={customFolhasDivisorDraft}
                          onChange={(event) => setCustomFolhasDivisorDraft(event.target.value.replace(/\D+/g, ""))}
                          onBlur={commitCustomFolhasDivisorDraft}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              commitCustomFolhasDivisorDraft();
                            }
                          }}
                        />
                      </Field>
                      <div className="bandeiras-count-summary">
                        <span>Divisor ativo</span>
                        <strong>{folhasDivisor}</strong>
                      </div>
                    </div>
                  </div>
                  <label className="toggle compact-toggle">
                    <input
                      type="checkbox"
                      checked={groupSimilarForNumbers}
                      onChange={(event) => setGroupSimilarForNumbers(event.target.checked)}
                    />
                    <span>Agrupar tons parecidos na numeracao</span>
                  </label>
                  {lastReductionSummary ? (
                    <div className="bandeiras-hints">
                      <span>Cores originais: {lastReductionSummary.originalDistinct}</span>
                      <span>Paleta final: {lastReductionSummary.finalDistinct}</span>
                      <span>Cores ajustadas: {lastReductionSummary.adjustedCount}</span>
                    </div>
                  ) : null}
                  <div className="bandeiras-hints">
                    <span>Ajuste automatico: trabalha apenas com as cores encontradas na imagem.</span>
                    <span>O modo "Agrupamento inteligente de paleta (K-Means)" preserva melhor a tonalidade real do projeto.</span>
                    <span>Use "Maximo de cores finais" para limitar mais ou soltar a paleta aos poucos.</span>
                    <span>Se nao gostar do resultado, clique em "Desfazer alteracoes" para voltar uma etapa.</span>
                  </div>
                </>
              ) : null}
            </div>
          </div>

          {pixelArt ? (
            <div className="panel bandeiras-color-tabs-card">
              <div className="panel-head">
                <div>
                  <h3>Analise de cores</h3>
                  <p className="panel-subcopy">Compare as cores removidas e as cores detectadas na sua imagem.</p>
                </div>
                <button
                  type="button"
                  className={`panel-collapse-button ${colorTabsCollapsed ? "collapsed" : ""}`}
                  onClick={() => setColorTabsCollapsed(!colorTabsCollapsed)}
                >
                  {colorTabsCollapsed ? "Expandir" : "Minimizar"}
                </button>
              </div>

              {!colorTabsCollapsed ? (
                <>
                  <div className="bandeiras-color-tabs-header">
                    <button
                      type="button"
                      className={`color-tab ${colorTabsActiveTab === "removed" ? "active" : ""}`}
                      onClick={() => setColorTabsActiveTab("removed")}
                    >
                      Cores removidas pelo ajuste
                      {removedOriginalColors.length > 0 && <span className="badge">{removedOriginalColors.length}</span>}
                    </button>
                    <button
                      type="button"
                      className={`color-tab ${colorTabsActiveTab === "detected" ? "active" : ""}`}
                      onClick={() => setColorTabsActiveTab("detected")}
                    >
                      Cores detectadas
                      {colorSummaries.length > 0 && <span className="badge">{colorSummaries.length}</span>}
                    </button>
                  </div>

                  {colorTabsActiveTab === "removed" ? (
                    <div className="bandeiras-color-tab-content">
                      {removedOriginalColors.length > 0 ? (
                        <div className="editor-table bandeiras-color-table">
                          <table>
                            <thead>
                              <tr>
                                <th>Cor</th>
                                <th>Codigo HEX</th>
                                <th>Pixels</th>
                                <th>Acao</th>
                              </tr>
                            </thead>
                            <tbody>
                              {removedOriginalColors.map((item) => (
                                <tr key={item.key}>
                                  <td>
                                    <span className="color-swatch" style={{ background: item.key }} />
                                  </td>
                                  <td><code>{item.key}</code></td>
                                  <td>{item.count}</td>
                                  <td>
                                    <button type="button" onClick={() => restoreRemovedColor(item.key)} className="mini-button">
                                      Recuperar
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="muted compact-copy">Nenhuma cor foi removida. Todos os tons da imagem foram preservados.</p>
                      )}
                      <div className="bandeiras-hints">
                        <span>Cores removidas: {removedOriginalColors.length}</span>
                        <span>Total de pixels removidos: {removedOriginalColors.reduce((sum, item) => sum + item.count, 0)}</span>
                        <span>Voce pode recuperar qualquer cor clicando em "Recuperar".</span>
                      </div>
                    </div>
                  ) : (
                    <div className="bandeiras-color-tab-content">
                      {colorSummaries.length ? (
                        <div className="editor-table bandeiras-color-table">
                          <table>
                            <thead>
                              <tr>
                                <th>No.</th>
                                <th>Cor</th>
                                <th>Nome da cor</th>
                                <th>Quantidade</th>
                                <th>Cores agrupadas</th>
                                <th>Folhas</th>
                              </tr>
                            </thead>
                            <tbody>
                              {colorSummaries.map((item) => (
                                <tr key={item.key}>
                                  <td>{item.index}</td>
                                  <td>
                                    <div className="color-cell">
                                      <span className="color-swatch" style={{ background: item.key }} />
                                      <code>{item.key}</code>
                                    </div>
                                  </td>
                                  <td>{item.name}</td>
                                  <td>{item.count}</td>
                                  <td>{groupedColorCountByFinal[item.key] ?? 1}</td>
                                  <td>{item.folhas}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="muted compact-copy">Carregue a imagem para listar as cores corretas, com numero e quantidade de cada cor.</p>
                      )}
                    </div>
                  )}
                </>
              ) : null}
            </div>
          ) : null}

          {pixelArt ? (
            <div className="panel bandeiras-division-card">
              <div className="panel-head">
                <div>
                  <h3>Finalizar bandeira</h3>
                  <p className="panel-subcopy">Depois de terminar a edicao acima, escolha como quer dividir, baixar ou enviar.</p>
                </div>
              </div>
              <div className="bandeiras-delivery-layout">
                <section className="bandeiras-delivery-column">
                  <div className="bandeiras-delivery-column-head">
                    <strong>Visualizacao da imagem</strong>
                    <span>Preview com a divisao final aplicada.</span>
                  </div>
                  <div className="bandeiras-division-preview">
                    <svg
                      width={pixelArt.width * compareCellSize}
                      height={pixelArt.height * compareCellSize}
                      viewBox={`0 0 ${pixelArt.width * compareCellSize} ${pixelArt.height * compareCellSize}`}
                      role="img"
                      aria-label="Preview da divisao da bandeira"
                    >
                      {pixelArt.pixels.map((pixel) => (
                        <g key={`division-preview-${pixel.x}-${pixel.y}`}>
                          <rect
                            x={pixel.x * compareCellSize}
                            y={pixel.y * compareCellSize}
                            width={compareCellSize}
                            height={compareCellSize}
                            fill={pixel.color}
                            stroke={minorGridEnabled ? minorGridColor : "transparent"}
                            strokeWidth={minorGridEnabled ? Math.max(0.4, compareCellSize * 0.08) : 0}
                          />
                        </g>
                      ))}
                      {Array.from({ length: divisionsHorizontal + 1 }, (_, index) => {
                        const tileWidth = Math.ceil(pixelArt.width / divisionsHorizontal);
                        const x = index * tileWidth * compareCellSize;
                        return (
                          <line
                            key={`division-v-${index}`}
                            x1={x}
                            y1={0}
                            x2={x}
                            y2={pixelArt.height * compareCellSize}
                            stroke="#ff5fe5"
                            strokeWidth={Math.max(1, compareCellSize * 0.28)}
                          />
                        );
                      })}
                      {Array.from({ length: divisionsVertical + 1 }, (_, index) => {
                        const tileHeight = Math.ceil(pixelArt.height / divisionsVertical);
                        const y = index * tileHeight * compareCellSize;
                        return (
                          <line
                            key={`division-h-${index}`}
                            x1={0}
                            y1={y}
                            x2={pixelArt.width * compareCellSize}
                            y2={y}
                            stroke="#ff5fe5"
                            strokeWidth={Math.max(1, compareCellSize * 0.28)}
                          />
                        );
                      })}
                    </svg>
                  </div>
                </section>

                <section className="bandeiras-delivery-column bandeiras-delivery-center">
                  <div className="bandeiras-delivery-column-head">
                    <strong>Opcoes de divisao</strong>
                    <span>Defina folha, partes, formato e a acao final.</span>
                  </div>

                  <div className="delivery-mode-panel">
                    <strong>Tipo de divisao</strong>
                    <div className="delivery-mode-options">
                      {(["custom", "A4", "A3"] as PaperPreset[]).map((preset) => (
                        <label key={preset} className={`delivery-mode-card ${paperPreset === preset ? "active" : ""}`}>
                          <input
                            type="radio"
                            name="bandeiraPaperPresetMain"
                            checked={paperPreset === preset}
                            onChange={() => setPaperPreset(preset)}
                          />
                          <span>{preset === "custom" ? "Personalizado" : `Dividir para ${preset}`}</span>
                          <em>Modelo ativo</em>
                          <small>{preset === "custom" ? "Voce define a folha e as partes." : "Usa esse padrao como referencia visual."}</small>
                        </label>
                      ))}
                    </div>
                  </div>

                  {paperPreset === "custom" ? (
                    <Field label="Nome da folha personalizada">
                      <input value={customPaperLabel} onChange={(event) => setCustomPaperLabel(event.target.value)} placeholder="Ex.: Folha 60x90" />
                    </Field>
                  ) : null}

                  <div className="grid two bandeiras-grid-controls">
                    <Field label="Divisoes horizontais">
                      <input
                        type="number"
                        min="1"
                        max="12"
                        value={divisionsHorizontal}
                        onChange={(event) => setDivisionsHorizontal(Math.max(1, Math.min(12, Number(event.target.value) || 1)))}
                      />
                    </Field>
                    <Field label="Divisoes verticais">
                      <input
                        type="number"
                        min="1"
                        max="12"
                        value={divisionsVertical}
                        onChange={(event) => setDivisionsVertical(Math.max(1, Math.min(12, Number(event.target.value) || 1)))}
                      />
                    </Field>
                  </div>

                  <div className="delivery-mode-panel">
                    <strong>O que deseja fazer</strong>
                    <div className="delivery-mode-options">
                      {([
                        {
                          id: "download",
                          label: "Baixar no PC",
                          note: "Gera um arquivo final unico para salvar no computador."
                        },
                        {
                          id: "email",
                          label: "Enviar por email",
                          note: "Envia o arquivo final para o email do usuario."
                        }
                      ] as Array<{ id: DeliveryActionMode; label: string; note: string }>).map((option) => (
                        <label key={option.id} className={`delivery-mode-card ${deliveryActionMode === option.id ? "active" : ""}`}>
                          <input
                            type="radio"
                            name="bandeiraDeliveryActionModeMain"
                            checked={deliveryActionMode === option.id}
                            onChange={() => setDeliveryActionMode(option.id)}
                          />
                          <span>{option.label}</span>
                          <em>Acao ativa</em>
                          <small>{option.note}</small>
                        </label>
                      ))}
                    </div>
                  </div>

                  {deliveryActionMode === "email" ? (
                    <Field label="Email do usuario">
                      <input value={deliveryEmail} onChange={(event) => setDeliveryEmail(event.target.value)} placeholder="usuario@email.com" />
                    </Field>
                  ) : null}

                  <div className="delivery-mode-panel">
                    <strong>Formato do arquivo</strong>
                    <div className="delivery-mode-options">
                      {(["pdf", "svg", "png", "all"] as DeliveryFileFormat[]).map((format) => (
                        <label key={format} className={`delivery-mode-card ${deliveryFileFormat === format ? "active" : ""}`}>
                          <input
                            type="radio"
                            name="bandeiraDeliveryFileFormatMain"
                            checked={deliveryFileFormat === format}
                            onChange={() => setDeliveryFileFormat(format)}
                          />
                          <span>{deliveryFormatLabel(format)}</span>
                          <em>Formato ativo</em>
                          <small>{deliveryFormatDescription(format)}</small>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="delivery-mode-panel">
                    <strong>Tamanho do arquivo final</strong>
                    <div className="delivery-mode-options">
                      {([
                        { id: "original", label: "Tamanho original", note: "Usa o mesmo tamanho da imagem que entrou no sistema." },
                        { id: "scaled", label: "Com 0 adicionado", note: scaleMultiplier > 1 ? `Gera ampliado em ${scaleMultiplier}x.` : "Adicione pelo menos um 0 para ampliar." },
                        { id: "all", label: "Tudo junto", note: "Inclui original e ampliado no mesmo pacote." }
                      ] as Array<{ id: BandeiraScaleDeliveryMode; label: string; note: string }>).map((option) => (
                        <label key={option.id} className={`delivery-mode-card ${deliveryScaleMode === option.id ? "active" : ""}`}>
                          <input
                            type="radio"
                            name="bandeiraScaleDeliveryModeMain"
                            checked={deliveryScaleMode === option.id}
                            onChange={() => setDeliveryScaleMode(option.id)}
                          />
                          <span>{option.label}</span>
                          <em>Tamanho ativo</em>
                          <small>{option.note}</small>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="tutorial-form-actions">
                    {deliveryActionMode === "email" ? (
                      <button type="button" onClick={sendBandeiraByEmail} disabled={emailState.status === "loading" || !pixelArt}>
                        {emailState.status === "loading" ? "Enviando..." : "Enviar arquivo final por email"}
                      </button>
                    ) : (
                      <button type="button" onClick={downloadBandeiraFiles} disabled={emailState.status === "loading" || !pixelArt}>
                        {emailState.status === "loading" ? "Preparando download..." : "Baixar arquivo final"}
                      </button>
                    )}
                  </div>

                  <div className="bandeiras-hints">
                    <span>Folha selecionada: {paperPreset === "custom" ? customPaperLabel || "Personalizada" : paperPreset}</span>
                    <span>Divisao final: {divisionsHorizontal} x {divisionsVertical}</span>
                    <span>Total de partes: {divisionsHorizontal * divisionsVertical}</span>
                    <span>O download sai em um arquivo unico com divisao e tabela de cores organizada.</span>
                  </div>

                  {emailState.message ? <div className={`delivery-status ${emailState.status}`}>{emailState.message}</div> : null}
                </section>

                <section className="bandeiras-delivery-column">
                  <div className="bandeiras-delivery-column-head">
                    <strong>Partes individuais</strong>
                    <span>Preview de cada parte antes de baixar ou enviar.</span>
                  </div>
                  <div className="bandeiras-part-grid">
                    {divisionPartsPreview.map((part) => {
                      const partPreviewCell = Math.max(2, Math.min(6, Math.floor(140 / Math.max(part.width, part.height || 1))));
                      return (
                        <article key={part.id} className="bandeiras-part-card">
                          <strong>{part.label}</strong>
                          <div className="bandeiras-part-preview">
                            <svg
                              width={part.width * partPreviewCell}
                              height={part.height * partPreviewCell}
                              viewBox={`0 0 ${part.width * partPreviewCell} ${part.height * partPreviewCell}`}
                              role="img"
                              aria-label={part.label}
                            >
                              {part.pixels.map((pixel) => {
                                const localX = pixel.x - part.startX;
                                const localY = pixel.y - part.startY;
                                return (
                                  <g key={`${part.id}-${pixel.x}-${pixel.y}`}>
                                    <rect
                                      x={localX * partPreviewCell}
                                      y={localY * partPreviewCell}
                                      width={partPreviewCell}
                                      height={partPreviewCell}
                                      fill={pixel.color}
                                      stroke={minorGridEnabled ? minorGridColor : "transparent"}
                                      strokeWidth={minorGridEnabled ? Math.max(0.3, partPreviewCell * 0.08) : 0}
                                    />
                                  </g>
                                );
                              })}
                            </svg>
                          </div>
                          <span>{part.width}px x {part.height}px</span>
                        </article>
                      );
                    })}
                  </div>
                </section>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="bandeiras-side-panel" aria-hidden="true" />
      </div>

      <div className="panel bandeiras-table-card bandeiras-bottom-table" style={{ display: "none" }}>
        <div className="panel-head">
          <div>
            <h3>Cores detectadas</h3>
            <p className="panel-subcopy">Tabela final das cores usadas, com numeracao, quantidade total e previsao de folhas por cor.</p>
          </div>
        </div>

        {colorSummaries.length ? (
          <div className="editor-table bandeiras-color-table">
            <table>
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Cor</th>
                  <th>Nome da cor</th>
                  <th>Quantidade</th>
                  <th>Cores agrupadas</th>
                  <th>Folhas</th>
                </tr>
              </thead>
              <tbody>
                {colorSummaries.map((item) => (
                  <tr key={item.key}>
                    <td>{item.index}</td>
                    <td>
                      <div className="color-cell">
                        <span className="color-swatch" style={{ background: item.key }} />
                        <code>{item.key}</code>
                      </div>
                    </td>
                    <td>{item.name}</td>
                    <td>{item.count}</td>
                    <td>{groupedColorCountByFinal[item.key] ?? 1}</td>
                    <td>{item.folhas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted compact-copy">Carregue a imagem para listar as cores corretas, com numero e quantidade de cada cor.</p>
        )}
      </div>

      <div className="panel bandeiras-table-card bandeiras-tutorial">
        <div className="panel-head">
          <div>
            <h3>Tutorial rapido - Bandeiras</h3>
            <p className="panel-subcopy">Fluxo recomendado para carregar, limpar, numerar e enviar a bandeira sem perder organizacao.</p>
          </div>
        </div>
        <div className="tutorial-steps">
          <div className="tutorial-step">
            <strong>1. Carregar imagem</strong>
            <p>Use "Carregar imagem pixelada". O sistema converte para grade editavel sem perder proporcao.</p>
          </div>
          <div className="tutorial-step">
            <strong>2. Numerar as cores</strong>
            <p>Clique em "Numerar cor". Cores iguais recebem o mesmo numero; com "Agrupar tons parecidos" ligado, tons muito proximos tambem unificam.</p>
          </div>
          <div className="tutorial-step">
            <strong>3. Corrigir tons</strong>
            <p>Use "Corrigir tons com paleta nomeada" para aproximar a arte das cores catalogadas e gerar uma tabela com nome de cor reconhecido.</p>
          </div>
          <div className="tutorial-step">
            <strong>4. Ajustar contagem</strong>
            <p>Escolha um preset de taco ou digite o divisor manualmente. O total de folhas por cor recalcula sozinho.</p>
          </div>
          <div className="tutorial-step">
            <strong>5. Escalar para envio</strong>
            <p>Use "Adicionar 0" e "Remover 0". Exemplo: 80x120 com escala 100 vira 8000x12000 no arquivo enviado.</p>
          </div>
            <div className="tutorial-step">
              <strong>6. Escolha o pacote de envio</strong>
              <p>Voce pode enviar em 4 partes + inteira + tabela de cores separada, ou em 2 partes + inteira + tabela de cores separada.</p>
            </div>
        </div>
      </div>
    </section>
  );
}

function describeScaleMode(mode: BandeiraScaleDeliveryMode, multiplier: number) {
  if (mode === "original") {
    return "tamanho original";
  }
  if (mode === "scaled") {
    return multiplier > 1 ? `escala ampliada ${multiplier}x` : "tamanho original";
  }
  return multiplier > 1 ? `tamanho original + escala ${multiplier}x` : "tamanho original";
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
