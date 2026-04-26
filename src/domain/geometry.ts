import {
  BalloonRegionName,
  CalculationResult,
  PlotPoint,
  ProjectInput,
  TacoBand,
  TacoPiece,
  TechnicalPoint
} from "./types";
import { frustumVolume, polygonArea, polylineLength, round } from "./math";
import {
  getDivisionPatternAllowanceCm,
  getPatternExtraHeightCm,
  getPatternExtraWidthCm,
  getWholePatternAllowanceCm
} from "./patternAllowances";
import { validateInput } from "./validation";

function resolveSectionName(y: number, input: ProjectInput): string | undefined {
  return input.secoes.find((secao) => y >= secao.inicioCm && y <= secao.fimCm)?.nome;
}

function regionColor(regiao: BalloonRegionName) {
  return {
    boca: "#f4e64a",
    bojo: "#77e6f2",
    bico: "#f062b8"
  }[regiao];
}

function formatRegionLabel(regiao: BalloonRegionName) {
  return regiao.toUpperCase();
}

function formatSectionLabel(regiao: BalloonRegionName, index: number) {
  return `${regiao.toUpperCase()} PARTE ${index + 1}`;
}

function buildTacoBands(input: ProjectInput): TacoBand[] {
  const bands: TacoBand[] = [];
  let cursor = 0;
  let order = 1;

  input.regioes.forEach((regiao) => {
    const inicioRegiao = cursor;
    const fimRegiao = cursor + regiao.alturaCm;

    if (regiao.modo === "unico") {
      const quantidadeVertical = Math.floor(regiao.alturaCm / regiao.alturaTacoCm);
      bands.push({
        id: `faixa-${regiao.regiao}`,
        nome: formatRegionLabel(regiao.regiao),
        regiao: regiao.regiao,
        secao: formatRegionLabel(regiao.regiao),
        inicioCm: round(inicioRegiao, input.casasDecimais),
        fimCm: round(fimRegiao, input.casasDecimais),
        alturaCm: round(regiao.alturaCm, input.casasDecimais),
        cor: regionColor(regiao.regiao),
        alturaTacoCm: regiao.alturaTacoCm,
        tacosPorGomo: regiao.tacosPorGomo,
        quantidadeVertical,
        totalTacos: quantidadeVertical * regiao.tacosPorGomo,
        larguraFaixaCm: 0
      });
      cursor = fimRegiao;
      order += 1;
      return;
    }

    let cursorSecao = inicioRegiao;
    regiao.secoes.forEach((secao, index) => {
      const inicioSecao = cursorSecao;
      const fimSecao = cursorSecao + secao.alturaSecaoCm;
      const quantidadeVertical = Math.floor(secao.alturaSecaoCm / secao.alturaTacoCm);
      bands.push({
        id: secao.id,
        nome: formatSectionLabel(regiao.regiao, index),
        regiao: regiao.regiao,
        secao: formatSectionLabel(regiao.regiao, index),
        inicioCm: round(inicioSecao, input.casasDecimais),
        fimCm: round(fimSecao, input.casasDecimais),
        alturaCm: round(secao.alturaSecaoCm, input.casasDecimais),
        cor: regionColor(regiao.regiao),
        alturaTacoCm: secao.alturaTacoCm,
        tacosPorGomo: secao.tacosPorGomo,
        quantidadeVertical,
        totalTacos: quantidadeVertical * secao.tacosPorGomo,
        larguraFaixaCm: 0
      });
      cursorSecao = fimSecao;
      order += 1;
    });

    cursor = fimRegiao;
  });

  return bands;
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

function applySeamToTaco(contour: PlotPoint[], input: ProjectInput): PlotPoint[] {
  const allowance = getDivisionPatternAllowanceCm();
  const maxY = Math.max(...contour.map((item) => item.y));
  return contour.map((point) => ({
    x: point.x < 0 ? point.x - allowance.left : point.x + allowance.right,
    y:
      point.y === 0
        ? point.y - allowance.top
        : point.y === maxY
          ? point.y + allowance.bottom
          : point.y
  }));
}

function buildTacoPieces(bands: TacoBand[], table: TechnicalPoint[], input: ProjectInput): TacoPiece[] {
  return bands.map((band) => {
    const rows = table.filter((point) => point.coordenadaY > band.inicioCm && point.coordenadaY < band.fimCm);
    const topHalf = interpolateHalfWidth(band.inicioCm, table);
    const bottomHalf = interpolateHalfWidth(band.fimCm, table);
    const profile = [
      { y: band.inicioCm, half: topHalf },
      ...rows.map((point) => ({ y: point.coordenadaY, half: point.larguraMeiaCm })),
      { y: band.fimCm, half: bottomHalf }
    ];

    const contour = [
      ...profile.map((point) => ({ x: -point.half, y: point.y - band.inicioCm })),
      ...[...profile].reverse().map((point) => ({ x: point.half, y: point.y - band.inicioCm }))
    ];
    const contourComBainha = applySeamToTaco(contour, input);
    const areaCm2 = round(polygonArea(contour), input.casasDecimais);

    return {
      id: band.id,
      nome: band.nome,
      inicioCm: band.inicioCm,
      fimCm: band.fimCm,
      alturaCm: band.alturaCm,
      cor: band.cor,
      contour,
      contourComBainha,
      larguraTopoCm: round(topHalf * 2, input.casasDecimais),
      larguraBaseCm: round(bottomHalf * 2, input.casasDecimais),
      larguraMaximaCm: round(Math.max(...profile.map((point) => point.half * 2)), input.casasDecimais),
      areaCm2,
      ordem: bands.findIndex((item) => item.id === band.id) + 1
    };
  });
}

function buildTechnicalTable(input: ProjectInput): TechnicalPoint[] {
  let acumulada = 0;
  return input.tabelaPontos.map((point, index) => {
    acumulada = index === 0 ? 0 : acumulada + point.alturaCm;
    return {
      ...point,
      alturaAcumuladaCm: round(acumulada, input.casasDecimais),
      larguraTotalCm: point.larguraMeiaCm * 2,
      coordenadaY: round(acumulada, input.casasDecimais),
      coordenadaXEsquerda: -point.larguraMeiaCm,
      coordenadaXDireita: point.larguraMeiaCm,
      secao: resolveSectionName(acumulada, input)
    };
  });
}

function offsetContour(points: PlotPoint[], allowance: { left: number; right: number; top: number; bottom: number }): PlotPoint[] {
  const maxY = Math.max(...points.map((point) => point.y));
  return points.map((point) => ({
    x: point.x < 0 ? point.x - allowance.left : point.x + allowance.right,
    y: point.y === 0 ? point.y - allowance.top : point.y === maxY ? point.y + allowance.bottom : point.y
  }));
}

function buildGeometry(table: TechnicalPoint[]) {
  const leftSide = table.map((point) => ({ x: point.coordenadaXEsquerda, y: point.coordenadaY }));
  const rightSide = [...table]
    .reverse()
    .map((point) => ({ x: point.coordenadaXDireita, y: point.coordenadaY }));
  const contour = [...leftSide, ...rightSide];
  const seamContour = offsetContour(contour, getWholePatternAllowanceCm());
  const centerLine: [PlotPoint, PlotPoint] = [
    { x: 0, y: 0 },
    { x: 0, y: table[table.length - 1]?.coordenadaY ?? 0 }
  ];

  return {
    leftSide,
    rightSide,
    contour,
    seamContour,
    centerLine
  };
}

function deriveMetrics(input: ProjectInput, table: TechnicalPoint[], contour: PlotPoint[]) {
  const alturaCheioCm = table[table.length - 1]?.coordenadaY ?? 0;
  const larguraMaximaGomoCm = Math.max(...table.map((point) => point.larguraTotalCm), 0);
  const larguraCheioCm = round((larguraMaximaGomoCm * input.quantidadeGomos) / Math.PI, input.casasDecimais);
  const comprimentoArameBocaCm = round(Math.PI * input.diametroBocaCm, input.casasDecimais);
  const areaUtilMoldeCm2 = round(polygonArea(contour), input.casasDecimais);
  const superficieTotalCm2 = round(areaUtilMoldeCm2 * input.quantidadeGomos, input.casasDecimais);
  const perimetroTecnicoMoldeCm = round(polylineLength([...contour, contour[0]]), input.casasDecimais);
  const materialEstimadoCm2 = round(
    (areaUtilMoldeCm2 + perimetroTecnicoMoldeCm * input.bainhaCm) * input.quantidadeGomos,
    input.casasDecimais
  );

  let volumeTotalCm3 = 0;
  for (let i = 1; i < table.length; i += 1) {
    const prevRadius = (table[i - 1].larguraTotalCm * input.quantidadeGomos) / (2 * Math.PI);
    const nextRadius = (table[i].larguraTotalCm * input.quantidadeGomos) / (2 * Math.PI);
    const height = table[i].coordenadaY - table[i - 1].coordenadaY;
    volumeTotalCm3 += frustumVolume(height, prevRadius, nextRadius);
  }

  return {
    alturaCheioCm,
    larguraCheioCm,
    diametroBocaCm: round(input.diametroBocaCm, input.casasDecimais),
    comprimentoArameBocaCm,
    larguraMaximaGomoCm: round(larguraMaximaGomoCm, input.casasDecimais),
    superficieTotalCm2,
    volumeTotalCm3: round(volumeTotalCm3, input.casasDecimais),
    perimetroTecnicoMoldeCm,
    areaUtilMoldeCm2,
    materialEstimadoCm2
  };
}

function resolvePaperSizeMm(input: ProjectInput) {
  const config = input.impressao;
  const size = {
    A4: { width: 210, height: 297 },
    A3: { width: 297, height: 420 },
    A2: { width: 420, height: 594 },
    A1: { width: 594, height: 841 },
    A0: { width: 841, height: 1189 },
    CUSTOM: {
      width: config.larguraCustomMm ?? 210,
      height: config.alturaCustomMm ?? 297
    }
  }[config.formatoPapel];

  return config.orientacao === "paisagem"
    ? { width: size.height, height: size.width }
    : size;
}

function buildPrintLayout(input: ProjectInput, table: TechnicalPoint[]) {
  const paper = resolvePaperSizeMm(input);
  const scale = input.impressao.escala;
  const wholeAllowance = getWholePatternAllowanceCm();
  const arteWidthMm =
    (Math.max(...table.map((point) => point.larguraTotalCm), 0) + getPatternExtraWidthCm(wholeAllowance)) * 10 * scale;
  const arteHeightMm =
    ((table[table.length - 1]?.coordenadaY ?? 0) + getPatternExtraHeightCm(wholeAllowance)) * 10 * scale;
  const usableWidth = paper.width - input.impressao.margemMm * 2;
  const usableHeight = paper.height - input.impressao.margemMm * 2;
  const overlap = input.impressao.sobreposicaoMm;
  const stepX = Math.max(usableWidth - overlap, 1);
  const stepY = Math.max(usableHeight - overlap, 1);
  const paginasX = Math.max(1, Math.ceil((arteWidthMm - overlap) / stepX));
  const paginasY = Math.max(1, Math.ceil((arteHeightMm - overlap) / stepY));

  const tiles = [];
  for (let linha = 0; linha < paginasY; linha += 1) {
    for (let coluna = 0; coluna < paginasX; coluna += 1) {
      tiles.push({
        coluna,
        linha,
        origemX: coluna * stepX,
        origemY: linha * stepY,
        larguraUtilMm: usableWidth,
        alturaUtilMm: usableHeight
      });
    }
  }

  return {
    paginasX,
    paginasY,
    totalPaginas: paginasX * paginasY,
    larguraArteMm: round(arteWidthMm, 1),
    alturaArteMm: round(arteHeightMm, 1),
    tiles
  };
}

export function calculatePattern(input: ProjectInput): CalculationResult {
  const warnings = validateInput(input);
  const table = buildTechnicalTable(input);
  const faixasTacos = buildTacoBands(input).map((band) => {
    const largura = interpolateHalfWidth((band.inicioCm + band.fimCm) / 2, table) * 2;
    return {
      ...band,
      larguraFaixaCm: round(largura / Math.max(band.tacosPorGomo, 1), input.casasDecimais)
    };
  });
  const moldesTacos = buildTacoPieces(faixasTacos, table, input);
  const geometry = buildGeometry(table);
  const metrics = deriveMetrics(input, table, geometry.contour);
  const layoutImpressao = buildPrintLayout(input, table);

  if (layoutImpressao.totalPaginas > 24) {
    warnings.push({
      tipo: "warning",
      mensagem: "A impressao vai exigir muitas paginas; considere outro formato de papel ou reduzir a escala."
    });
  }

  return {
    input,
    tabelaTecnica: table,
    faixasTacos,
    moldesTacos,
    geometria: geometry,
    metricas: metrics,
    layoutImpressao,
    warnings
  };
}
