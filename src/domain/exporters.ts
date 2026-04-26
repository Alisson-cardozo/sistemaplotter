import { BalloonRegionName, CalculationResult, TechnicalPoint } from "./types";
import {
  getDivisionPatternAllowanceCm,
  getPatternExtraHeightCm,
  getPatternExtraWidthCm,
  getWholePatternAllowanceCm,
  PLOT_HEM_CM,
  PLOT_UNION_SIDE_CM
} from "./patternAllowances";

export function exportProjectJson(result: CalculationResult): string {
  return JSON.stringify(result, null, 2);
}

export function exportTechnicalCsv(result: CalculationResult): string {
  const header = [
    "ponto",
    "altura_cm",
    "altura_acumulada_cm",
    "largura_meia_cm",
    "largura_total_cm",
    "secao",
    "coordenada_x_esquerda",
    "coordenada_x_direita",
    "coordenada_y"
  ];

  const rows = result.tabelaTecnica.map((row) =>
    [
      row.ponto,
      row.alturaCm,
      row.alturaAcumuladaCm,
      row.larguraMeiaCm,
      row.larguraTotalCm,
      row.secao ?? "",
      row.coordenadaXEsquerda,
      row.coordenadaXDireita,
      row.coordenadaY
    ].join(",")
  );

  return [header.join(","), ...rows].join("\n");
}

interface ExportFile {
  region: BalloonRegionName | "inteiro";
  filename: string;
  content: string;
  contentType?: string;
}

function interpolateHalfWidth(y: number, table: TechnicalPoint[]): number {
  if (y <= table[0].coordenadaY) {
    return table[0].larguraMeiaCm;
  }

  for (let i = 1; i < table.length; i += 1) {
    const prev = table[i - 1];
    const next = table[i];
    if (y <= next.coordenadaY) {
      const span = next.coordenadaY - prev.coordenadaY;
      if (span === 0) {
        return next.larguraMeiaCm;
      }
      const t = (y - prev.coordenadaY) / span;
      return prev.larguraMeiaCm + (next.larguraMeiaCm - prev.larguraMeiaCm) * t;
    }
  }

  return table[table.length - 1].larguraMeiaCm;
}

function buildBandProfile(startY: number, endY: number, table: TechnicalPoint[]) {
  const rows = table.filter((point) => point.coordenadaY > startY && point.coordenadaY < endY);
  return [
    { y: startY, half: interpolateHalfWidth(startY, table) },
    ...rows.map((point) => ({ y: point.coordenadaY, half: point.larguraMeiaCm })),
    { y: endY, half: interpolateHalfWidth(endY, table) }
  ];
}

function buildClosedPathFromProfile(
  profile: Array<{ y: number; half: number }>,
  centerX: number,
  topMargin: number,
  baseY: number,
  drawingHeight: number,
  allowance = { left: 0, right: 0, top: 0, bottom: 0 }
) {
  const lastY = profile[profile.length - 1]?.y ?? baseY;
  const left = profile.map((point, index) => {
    const x = centerX - point.half - allowance.left;
    const yOffset = point.y === baseY ? allowance.top : point.y === lastY ? -allowance.bottom : 0;
    const y = topMargin + drawingHeight - (point.y - baseY) + yOffset;
    return `${index === 0 ? "M" : "L"} ${x.toFixed(3)} ${y.toFixed(3)}`;
  });
  const right = [...profile]
    .reverse()
    .map((point) => {
      const x = centerX + point.half + allowance.right;
      const yOffset = point.y === baseY ? allowance.top : point.y === lastY ? -allowance.bottom : 0;
      const y = topMargin + drawingHeight - (point.y - baseY) + yOffset;
      return `L ${x.toFixed(3)} ${y.toFixed(3)}`;
    });

  return [...left, ...right, "Z"].join(" ");
}

function buildContourPath(result: CalculationResult, centerX: number, topMargin: number, drawingHeight: number) {
  const points = result.geometria.seamContour?.length ? result.geometria.seamContour : [...result.geometria.leftSide, ...result.geometria.rightSide];
  return points
    .map((point, index) => {
      const x = centerX + point.x;
      const y = topMargin + drawingHeight - point.y;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(3)} ${y.toFixed(3)}`;
    })
    .join(" ")
    .concat(" Z");
}

function buildLeftClosureGuidePath(result: CalculationResult, centerX: number, topMargin: number, drawingHeight: number) {
  return result.geometria.leftSide
    .map((point, index) => {
      const x = centerX + point.x - PLOT_UNION_SIDE_CM;
      const y = topMargin + drawingHeight - point.y;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(3)} ${y.toFixed(3)}`;
    })
    .join(" ");
}

function buildRegionContourPath(
  result: CalculationResult,
  region: BalloonRegionName,
  centerX: number,
  topMargin: number,
  regionStart: number,
  drawingHeight: number
) {
  const bands = result.faixasTacos.filter((faixa) => faixa.regiao === region);
  if (bands.length === 0) {
    return "";
  }

  const start = bands[0].inicioCm;
  const end = bands[bands.length - 1].fimCm;
  const profile = buildBandProfile(start, end, result.tabelaTecnica);
  return buildClosedPathFromProfile(profile, centerX, topMargin, regionStart, drawingHeight, getDivisionPatternAllowanceCm());
}

function buildBandGroup(
  result: CalculationResult,
  faixa: CalculationResult["faixasTacos"][number],
  centerX: number,
  topMargin: number,
  baseY: number,
  drawingHeight: number,
  clipId: string
) {
  const profile = buildBandProfile(faixa.inicioCm, faixa.fimCm, result.tabelaTecnica);
  const path = buildClosedPathFromProfile(
    profile,
    centerX,
    topMargin,
    baseY,
    drawingHeight,
    getDivisionPatternAllowanceCm()
  );
  const hemOffset = PLOT_HEM_CM;

  const cellPaths: string[] = [];
  const verticalLines: string[] = [];
  const verticalHems: string[] = [];
  const horizontalLines: string[] = [];
  const horizontalHems: string[] = [];

  for (let row = 0; row < faixa.quantidadeVertical; row += 1) {
    const rowTopY = faixa.inicioCm + row * faixa.alturaTacoCm;
    const rowBottomY = Math.min(faixa.fimCm, rowTopY + faixa.alturaTacoCm);
    const topHalf = interpolateHalfWidth(rowTopY, result.tabelaTecnica);
    const bottomHalf = interpolateHalfWidth(rowBottomY, result.tabelaTecnica);
      const topCanvasY = topMargin + drawingHeight - (rowTopY - baseY);
      const bottomCanvasY = topMargin + drawingHeight - (rowBottomY - baseY);

    for (let col = 0; col < faixa.tacosPorGomo; col += 1) {
      const leftRatio = col / faixa.tacosPorGomo;
      const rightRatio = (col + 1) / faixa.tacosPorGomo;
      const topLeftX = centerX + (-topHalf + topHalf * 2 * leftRatio);
      const topRightX = centerX + (-topHalf + topHalf * 2 * rightRatio);
      const bottomRightX = centerX + (-bottomHalf + bottomHalf * 2 * rightRatio);
      const bottomLeftX = centerX + (-bottomHalf + bottomHalf * 2 * leftRatio);

      cellPaths.push(
        `<path d="M ${topLeftX.toFixed(3)} ${topCanvasY.toFixed(3)} L ${topRightX.toFixed(3)} ${topCanvasY.toFixed(3)} L ${bottomRightX.toFixed(3)} ${bottomCanvasY.toFixed(3)} L ${bottomLeftX.toFixed(3)} ${bottomCanvasY.toFixed(3)} Z" fill="#ffffff" />`
      );
    }
  }

  for (let i = 1; i < faixa.tacosPorGomo; i += 1) {
    const ratio = i / faixa.tacosPorGomo;
    const topHalf = interpolateHalfWidth(faixa.inicioCm, result.tabelaTecnica);
    const bottomHalf = interpolateHalfWidth(faixa.fimCm, result.tabelaTecnica);
    const topX = centerX + (-topHalf + topHalf * 2 * ratio);
    const bottomX = centerX + (-bottomHalf + bottomHalf * 2 * ratio);
    const topY = topMargin + drawingHeight - (faixa.inicioCm - baseY);
    const bottomY = topMargin + drawingHeight - (faixa.fimCm - baseY);

    verticalLines.push(
      `<line x1="${topX.toFixed(3)}" y1="${topY.toFixed(3)}" x2="${bottomX.toFixed(3)}" y2="${bottomY.toFixed(3)}" stroke="#111111" stroke-width="0.11" />`
    );

    const dx = bottomX - topX;
    const dy = bottomY - topY;
    const length = Math.hypot(dx, dy) || 1;
    const nx = dy / length;
    const ny = -dx / length;
    verticalHems.push(
      `<line x1="${(topX + nx * hemOffset).toFixed(3)}" y1="${(topY + ny * hemOffset).toFixed(3)}" x2="${(bottomX + nx * hemOffset).toFixed(3)}" y2="${(bottomY + ny * hemOffset).toFixed(3)}" stroke="#111111" stroke-width="0.05" stroke-opacity="0.7" />`
    );
  }

  for (let step = faixa.alturaTacoCm; step < faixa.alturaCm; step += faixa.alturaTacoCm) {
    const yValue = faixa.inicioCm + step;
    const half = interpolateHalfWidth(yValue, result.tabelaTecnica);
    const y = topMargin + drawingHeight - (yValue - baseY);
    horizontalLines.push(
      `<line x1="${(centerX - half).toFixed(3)}" y1="${y.toFixed(3)}" x2="${(centerX + half).toFixed(3)}" y2="${y.toFixed(3)}" stroke="#111111" stroke-width="0.11" />`
    );
    horizontalHems.push(
      `<line x1="${(centerX - half).toFixed(3)}" y1="${(y - hemOffset).toFixed(3)}" x2="${(centerX + half).toFixed(3)}" y2="${(y - hemOffset).toFixed(3)}" stroke="#111111" stroke-width="0.05" stroke-opacity="0.7" />`
    );
  }

  return `
    <g>
      <clipPath id="${clipId}">
        <path d="${path}" />
      </clipPath>
      <path d="${path}" fill="#ffffff" stroke="none" />
      <g clip-path="url(#${clipId})">
        ${cellPaths.join("\n")}
        ${verticalHems.join("\n")}
        ${horizontalHems.join("\n")}
        ${verticalLines.join("\n")}
        ${horizontalLines.join("\n")}
      </g>
    </g>
  `.trim();
}

function buildDivisionLines(
  result: CalculationResult,
  bands: CalculationResult["faixasTacos"],
  centerX: number,
  topMargin: number,
  baseY: number,
  drawingHeight: number
) {
  return bands
    .map((faixa) => {
      const yValue = faixa.fimCm;
      const half = interpolateHalfWidth(yValue, result.tabelaTecnica);
      const y = topMargin + drawingHeight - (yValue - baseY);
      const extension = 2.8;
      return `<line x1="${(centerX - half - extension).toFixed(3)}" y1="${y.toFixed(3)}" x2="${(centerX + half + extension).toFixed(3)}" y2="${y.toFixed(3)}" stroke="#1696e8" stroke-width="0.09" />`;
    })
    .join("\n");
}

function buildWholeMoldSvg(result: CalculationResult): string {
  const allowance = getWholePatternAllowanceCm();
  const margin = Math.max(getPatternExtraWidthCm(allowance), 2);
  const width = result.metricas.larguraMaximaGomoCm + getPatternExtraWidthCm(allowance) + margin * 2;
  const height = result.metricas.alturaCheioCm + getPatternExtraHeightCm(allowance) + margin * 2;
  const drawingHeight = result.metricas.alturaCheioCm;
  const centerX = width / 2;
  const topMargin = margin + allowance.bottom;
  const contourPath = buildContourPath(result, centerX, topMargin, drawingHeight);
  const leftClosureGuidePath = buildLeftClosureGuidePath(result, centerX, topMargin, drawingHeight);
  const divisionLines = buildDivisionLines(result, result.faixasTacos, centerX, topMargin, 0, drawingHeight);

  const bandGroups = result.faixasTacos
    .map((faixa) => buildBandGroup(result, faixa, centerX, topMargin, 0, drawingHeight, `clip-whole-${faixa.id}`))
    .join("\n");

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}cm" height="${height}cm" viewBox="0 0 ${width} ${height}" fill="none">
  <rect width="${width}" height="${height}" fill="#ffffff" />
  ${bandGroups}
  ${divisionLines}
  <path d="${leftClosureGuidePath}" fill="none" stroke="#000000" stroke-width="0.18" stroke-linecap="round" stroke-linejoin="round" />
  <path d="${contourPath}" fill="none" stroke="#10233a" stroke-width="0.26" />
</svg>`.trim();
}

function buildRegionSvg(result: CalculationResult, region: BalloonRegionName): string {
  const bands = result.faixasTacos.filter((faixa) => faixa.regiao === region);
  if (bands.length === 0) {
    return "";
  }

  const regionStart = bands[0].inicioCm;
  const regionEnd = bands[bands.length - 1].fimCm;
  const regionHeight = regionEnd - regionStart;
  const maxHalf = Math.max(
    ...bands.flatMap((faixa) => [
      interpolateHalfWidth(faixa.inicioCm, result.tabelaTecnica),
      interpolateHalfWidth(faixa.fimCm, result.tabelaTecnica)
    ]),
    1
  );
  const allowance = getDivisionPatternAllowanceCm();
  const margin = Math.max(getPatternExtraWidthCm(allowance), 2);
  const width = maxHalf * 2 + getPatternExtraWidthCm(allowance) + margin * 2;
  const height = regionHeight + getPatternExtraHeightCm(allowance) + margin * 2;
  const drawingHeight = regionHeight;
  const centerX = width / 2;
  const topMargin = margin + allowance.bottom;
  const contourPath = buildRegionContourPath(result, region, centerX, topMargin, regionStart, drawingHeight);
  const leftClosureGuidePath = buildLeftClosureGuidePath(result, centerX, topMargin, drawingHeight);
  const divisionLines = buildDivisionLines(result, bands, centerX, topMargin, regionStart, drawingHeight);

  const bandGroups = bands
    .map((faixa) => buildBandGroup(result, faixa, centerX, topMargin, regionStart, drawingHeight, `clip-${region}-${faixa.id}`))
    .join("\n");

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}cm" height="${height}cm" viewBox="0 0 ${width} ${height}" fill="none">
  <rect width="${width}" height="${height}" fill="#ffffff" />
  ${bandGroups}
  ${divisionLines}
  <path d="${leftClosureGuidePath}" fill="none" stroke="#000000" stroke-width="0.18" stroke-linecap="round" stroke-linejoin="round" />
  <path d="${contourPath}" fill="none" stroke="#10233a" stroke-width="0.26" />
</svg>`.trim();
}

export function buildPatternSvg(result: CalculationResult): string {
  return buildWholeMoldSvg(result);
}

function pdfEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildSimplePdf(pages: string[][]) {
  const objects: string[] = [];
  const pageIds: number[] = [];
  const fontObjectId = 3;
  let nextObjectId = 4;

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";

  const pageObjectIds: number[] = [];
  const contentObjectIds: number[] = [];

  pages.forEach((lines) => {
    const pageObjectId = nextObjectId++;
    const contentObjectId = nextObjectId++;
    pageObjectIds.push(pageObjectId);
    contentObjectIds.push(contentObjectId);
  });

  const kids = pageObjectIds.map((id) => `${id} 0 R`).join(" ");
  objects[2] = `<< /Type /Pages /Count ${pageObjectIds.length} /Kids [ ${kids} ] >>`;
  objects[fontObjectId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  pages.forEach((lines, index) => {
    const pageObjectId = pageObjectIds[index];
    const contentObjectId = contentObjectIds[index];
    const lineHeight = 14;
    const startX = 42;
    const startY = 800;
    const commands = [
      "BT",
      "/F1 10 Tf",
      `${startX} ${startY} Td`,
      ...lines.flatMap((line, lineIndex) =>
        lineIndex === 0 ? [`(${pdfEscape(line)}) Tj`] : [`0 -${lineHeight} Td`, `(${pdfEscape(line)}) Tj`]
      ),
      "ET"
    ].join("\n");

    objects[pageObjectId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
    objects[contentObjectId] = `<< /Length ${commands.length} >>\nstream\n${commands}\nendstream`;
    pageIds.push(pageObjectId);
  });

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];

  for (let i = 1; i < objects.length; i += 1) {
    if (!objects[i]) {
      continue;
    }
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < objects.length; i += 1) {
    const offset = offsets[i] ?? 0;
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
}

function buildTechnicalPdf(result: CalculationResult) {
  const lines: string[] = [
    "MOLDE TAQUEADO - RELATORIO TECNICO",
    "",
    `Projeto: ${result.input.projeto}`,
    `Modelo: ${result.input.modelo}`,
    `Quantidade de gomos: ${result.input.quantidadeGomos}`,
    `Tamanho da banhinha: ${result.input.bainhaCm} cm`,
    `Tamanho do molde: ${result.input.comprimentoGomoCm} cm`,
    `Diametro da boca: ${result.input.diametroBocaCm} cm`,
    `Largura maxima do gomo: ${result.metricas.larguraMaximaGomoCm} cm`,
    "",
    "METRICAS GERAIS",
    `Altura cheio: ${result.metricas.alturaCheioCm} cm`,
    `Largura cheio: ${result.metricas.larguraCheioCm} cm`,
    `Comprimento do arame da boca: ${result.metricas.comprimentoArameBocaCm} cm`,
    "",
    "REGIOES E TACOS"
  ];

  result.faixasTacos.forEach((faixa) => {
    lines.push(
      `${faixa.secao} | regiao=${faixa.regiao} | inicio=${faixa.inicioCm} | fim=${faixa.fimCm} | altura=${faixa.alturaCm} | taco=${faixa.alturaTacoCm} | por gomo=${faixa.tacosPorGomo} | subindo=${faixa.quantidadeVertical} | total=${faixa.totalTacos}`
    );
  });

  lines.push("", "TABELA DE PONTOS");
  result.tabelaTecnica.forEach((point) => {
    lines.push(`P${point.ponto} | altura=${point.alturaCm} | largura/2=${point.larguraMeiaCm}`);
  });

  const linesPerPage = 48;
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += linesPerPage) {
    pages.push(lines.slice(i, i + linesPerPage));
  }

  return buildSimplePdf(pages);
}

export function buildRegionExportFiles(result: CalculationResult): ExportFile[] {
  const projectBase = result.input.projeto || "molde";
  return [
    {
      region: "inteiro",
      filename: `${projectBase}-relatorio-tecnico.pdf`,
      content: buildTechnicalPdf(result),
      contentType: "application/pdf"
    },
    {
      region: "inteiro",
      filename: `${projectBase}-inteiro.svg`,
      content: buildWholeMoldSvg(result)
    },
    ...(["boca", "bojo", "bico"] as BalloonRegionName[]).map((region) => ({
      region,
      filename: `${projectBase}-${region}.svg`,
      content: buildRegionSvg(result, region)
    }))
  ];
}
