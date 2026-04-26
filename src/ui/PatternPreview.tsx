import { useLayoutEffect, useMemo, useRef } from "react";
import { CalculationResult } from "../domain/types";
import { getWholePatternAllowanceCm, PLOT_HEM_CM, PLOT_UNION_SIDE_CM } from "../domain/patternAllowances";

type SectionSlice = {
  faixa: CalculationResult["faixasTacos"][number];
  path: string;
  horizontalLines: Array<{ x1: number; x2: number; y: number }>;
  horizontalHemLines: Array<{ x1: number; x2: number; y: number }>;
  verticalLines: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  hemLines: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  clipId: string;
  labelX: number;
  labelY: number;
  centerY: number;
  rightEdgeX: number;
  cardX: number;
  cardY: number;
};

function buildPath(points: { x: number; y: number }[], mapX: (x: number) => number, mapY: (y: number) => number, closed = false) {
  const segments = points.map((point, index) => `${index === 0 ? "M" : "L"} ${mapX(point.x).toFixed(2)} ${mapY(point.y).toFixed(2)}`);
  if (closed) {
    segments.push("Z");
  }
  return segments.join(" ");
}

export function PatternPreview({
  result,
  zoom,
  onZoomChange,
  lineColors,
  sectionColors,
  showPoints,
  onShowPointsChange,
  onLineColorChange
}: {
  result: CalculationResult;
  zoom: number;
  onZoomChange: (zoom: number | ((current: number) => number)) => void;
  lineColors: {
    divisao: string;
    bainha: string;
  };
  sectionColors: Record<string, string>;
  showPoints: boolean;
  onShowPointsChange: (checked: boolean) => void;
  onLineColorChange: (key: "divisao" | "bainha", value: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const previousZoomRef = useRef(zoom);
  const autoFitKeyRef = useRef<string | null>(null);

  const preview = useMemo(() => {
    const shapeHeightCm = Math.max(result.metricas.alturaCheioCm || result.input.comprimentoGomoCm, 1);
    const shapeWidthCm = Math.max(result.metricas.larguraMaximaGomoCm, result.metricas.larguraCheioCm / 2, 1);
    const pixelsPerCm = Math.min(3.1, Math.max(1.55, 1750 / shapeHeightCm));
    const topPadding = 70;
    const bottomPadding = 70;
    const leftPadding = 96;
    const shapeCenterX = 170;
    const calloutWidth = 246;
    const calloutHeight = 98;
    const calloutGap = 34;
    const rightRailStart = 390;
    const rightRailExtra = 280;
    const px = (cm: number) => cm * pixelsPerCm;
    const canvasWidth = Math.max(1180, rightRailStart + calloutWidth + rightRailExtra);
    const canvasHeight = px(shapeHeightCm) + topPadding + bottomPadding;
    const artTopPx = topPadding;
    const artLeftPx = leftPadding;
    const artCenterPx = shapeCenterX;
    const mapX = (valueCm: number) => artCenterPx + px(valueCm);
    const mapY = (valueCm: number) => artTopPx + px(shapeHeightCm - valueCm);
    const contourPath = buildPath(result.geometria.contour, mapX, mapY, true);
    const seamContourPath = buildPath(result.geometria.seamContour, mapX, mapY, true);
    const wholeAllowance = getWholePatternAllowanceCm();
    const seamLeftPoints = result.geometria.leftSide.map((point) => ({
      x: point.x - PLOT_UNION_SIDE_CM,
      y: point.y
    }));
    const seamLeftPath = buildPath(seamLeftPoints, mapX, mapY, false);
    const topHalfWidth = result.tabelaTecnica[0]?.larguraMeiaCm ?? 0;
    const topUnionLine = {
      x1: mapX(-topHalfWidth - wholeAllowance.left),
      x2: mapX(topHalfWidth + wholeAllowance.right),
      y: mapY(0)
    };
    const leftClosureGuideX = mapX(Math.min(...result.geometria.leftSide.map((point) => point.x)) - wholeAllowance.left);
    const guideTopY = mapY(result.geometria.centerLine[0].y);
    const guideBottomY = mapY(result.geometria.centerLine[1].y);
    const contourXValues = result.geometria.contour.map((point) => mapX(point.x));
    const contourYValues = result.geometria.contour.map((point) => mapY(point.y));
    const contourMinX = Math.min(...contourXValues);
    const contourMaxX = Math.max(...contourXValues);
    const contourMinY = Math.min(...contourYValues);
    const contourMaxY = Math.max(...contourYValues);
    const centerLine = {
      x1: mapX(result.geometria.centerLine[0].x),
      y1: mapY(result.geometria.centerLine[0].y),
      x2: mapX(result.geometria.centerLine[1].x),
      y2: mapY(result.geometria.centerLine[1].y)
    };

    const sectionsBase = result.faixasTacos.map((faixa) => {
      const topY = faixa.inicioCm;
      const bottomY = faixa.fimCm;
      const topHalf = interpolateWidth(topY, result.tabelaTecnica);
      const bottomHalf = interpolateWidth(bottomY, result.tabelaTecnica);
      const profile = result.tabelaTecnica
        .filter((point) => point.coordenadaY > topY && point.coordenadaY < bottomY)
        .map((point) => ({ y: point.coordenadaY, half: point.larguraMeiaCm }));
      const polygon = [
        { y: topY, half: topHalf },
        ...profile,
        { y: bottomY, half: bottomHalf }
      ];
      const path = [
        ...polygon.map((point, index) => `${index === 0 ? "M" : "L"} ${mapX(-point.half).toFixed(2)} ${mapY(point.y).toFixed(2)}`),
        ...[...polygon].reverse().map((point) => `L ${mapX(point.half).toFixed(2)} ${mapY(point.y).toFixed(2)}`),
        "Z"
      ].join(" ");
      const hemOffset = px(PLOT_HEM_CM);
      const horizontalLines: Array<{ x1: number; x2: number; y: number }> = [];
      const horizontalHemLines: Array<{ x1: number; x2: number; y: number }> = [];

      for (let step = faixa.alturaTacoCm; step < faixa.alturaCm; step += faixa.alturaTacoCm) {
        const localY = faixa.inicioCm + step;
        const half = interpolateWidth(localY, result.tabelaTecnica);
        const y = mapY(localY);
        horizontalLines.push({ x1: mapX(-half), x2: mapX(half), y });
        horizontalHemLines.push({ x1: mapX(-half), x2: mapX(half), y: y - hemOffset });
      }

      const verticalLines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
      const hemLines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
      const divisionRatios = Array.from({ length: faixa.tacosPorGomo + 1 }, (_, index) => index / faixa.tacosPorGomo);

      for (let i = 1; i < faixa.tacosPorGomo; i += 1) {
        const ratio = i / faixa.tacosPorGomo;
        const topX = -topHalf + topHalf * 2 * ratio;
        const bottomX = -bottomHalf + bottomHalf * 2 * ratio;
        const startX = mapX(topX);
        const startY = mapY(topY);
        const endX = mapX(bottomX);
        const endY = mapY(bottomY);
        verticalLines.push({ x1: startX, y1: startY, x2: endX, y2: endY });
        const parallel = buildParallelOffset(startX, startY, endX, endY, hemOffset);
        hemLines.push(parallel);
      }

      return {
        faixa,
        path,
        horizontalLines,
        horizontalHemLines,
        verticalLines,
        hemLines,
        clipId: `clip-${faixa.id}`,
        labelX: mapX(Math.max(topHalf, bottomHalf)) + 18,
        labelY: mapY((faixa.inicioCm + faixa.fimCm) / 2),
        centerY: mapY((faixa.inicioCm + faixa.fimCm) / 2),
        rightEdgeX: mapX(Math.max(topHalf, bottomHalf)),
        cardX: 0,
        cardY: 0
      };
    });

    const sections: SectionSlice[] = sectionsBase.map((section, index) => {
      const staggerOffsets = [0, 80, 170, 36, 120, 210];
      const minCardY = 28;
      const maxCardY = canvasHeight - calloutHeight - 24;
      const desiredCardY = section.centerY - calloutHeight / 2;

      return {
        ...section,
        cardX: rightRailStart + staggerOffsets[index % staggerOffsets.length],
        cardY: Math.max(minCardY, Math.min(maxCardY, desiredCardY))
      };
    });

    const divisionBoundaries = Array.from(
      new Set(
        result.faixasTacos
          .flatMap((faixa) => [faixa.inicioCm, faixa.fimCm])
          .filter((value) => value > 0 && value < shapeHeightCm)
          .map((value) => Number(value.toFixed(4)))
      )
    ).map((boundaryY) => {
      const half = interpolateWidth(boundaryY, result.tabelaTecnica);
      const y = mapY(boundaryY);
      return {
        x1: mapX(-half),
        x2: mapX(half),
        y
      };
    });

    return {
      canvasWidth,
      canvasHeight,
      artTopPx,
      artLeftPx,
      artCenterPx,
      artWidthPx: px(shapeWidthCm * 2),
      artHeightPx: px(shapeHeightCm),
      contourMinX,
      contourMaxX,
      contourMinY,
      contourMaxY,
      px,
      mapX,
      mapY,
      calloutWidth,
      calloutHeight,
      calloutGap,
      contourPath,
      seamContourPath,
      seamLeftPath,
      topUnionLine,
      leftClosureGuideX,
      guideTopY,
      guideBottomY,
      centerLine,
      sections,
      divisionBoundaries,
      hasOddTacoSections: result.faixasTacos.some((faixa) => faixa.tacosPorGomo % 2 === 1)
    };
  }, [lineColors.bainha, result, sectionColors]);

  const scaledWidth = preview.canvasWidth * zoom;
  const scaledHeight = preview.canvasHeight * zoom;
  const resultKey = `${result.input.projeto}|${result.metricas.alturaCheioCm}|${result.metricas.larguraMaximaGomoCm}|${result.faixasTacos.length}`;

  const calculateFitZoom = () => {
    const container = scrollRef.current;
    if (container == null) {
      return null;
    }

    return Math.min(
      1,
      Math.max(
        0.08,
        Number((Math.min(container.clientWidth / preview.canvasWidth, container.clientHeight / preview.canvasHeight) * 0.94).toFixed(2))
      )
    );
  };

  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (container == null) {
      previousZoomRef.current = zoom;
      return;
    }

    const previousZoom = previousZoomRef.current;
    const focusX = ((preview.contourMinX + preview.contourMaxX) / 2) * zoom;
    const focusY = ((preview.contourMinY + preview.contourMaxY) / 2) * zoom;

    if (previousZoom === zoom && (container.scrollLeft !== 0 || container.scrollTop !== 0)) {
      return;
    }

    container.scrollLeft = Math.max(0, focusX - container.clientWidth / 2);
    container.scrollTop = Math.max(0, focusY - container.clientHeight / 2);
    previousZoomRef.current = zoom;
  }, [preview.artHeightPx, preview.artLeftPx, preview.artTopPx, preview.artWidthPx, zoom]);

  useLayoutEffect(() => {
    if (autoFitKeyRef.current === resultKey) {
      return;
    }

    const fitZoom = calculateFitZoom();
    if (fitZoom == null) {
      return;
    }

    autoFitKeyRef.current = resultKey;
    if (Math.abs(zoom - fitZoom) > 0.02) {
      onZoomChange(fitZoom);
    }
  }, [onZoomChange, preview.canvasHeight, preview.canvasWidth, resultKey, zoom]);

  return (
    <section className="preview-panel">
      <div className="preview-toolbar">
        <div className="preview-toolbar-shell">
          <div className="preview-controls preview-controls-primary">
            <button type="button" onClick={() => onZoomChange((value) => Math.max(0.05, Number((value - 0.1).toFixed(2))))}>
              -
            </button>
            <input
              type="range"
              min="0.05"
              max="5"
              step="0.05"
              value={zoom}
              onChange={(event) => onZoomChange(Number(event.target.value))}
            />
            <button type="button" onClick={() => onZoomChange((value) => Math.min(5, Number((value + 0.25).toFixed(2))))}>
              +
            </button>
            <button
              type="button"
              className="preview-fit-button"
              onClick={() => {
                const fitZoom = calculateFitZoom();
                if (fitZoom == null) {
                  return;
                }
                onZoomChange(fitZoom);
              }}
            >
              Ver projeto inteiro
            </button>
            <span className="preview-zoom-readout">{Math.round(zoom * 100)}%</span>
          </div>

          <div className="preview-controls preview-controls-secondary">
            <label className="preview-toggle">
              <input type="checkbox" checked={showPoints} onChange={(event) => onShowPointsChange(event.target.checked)} />
              <span>Mostrar pontos no molde</span>
            </label>
            <label className="preview-swatch">
              <span>Cor da divisao</span>
              <input type="color" value={lineColors.divisao} onChange={(event) => onLineColorChange("divisao", event.target.value)} />
            </label>
            <label className="preview-swatch">
              <span>Cor da bainha</span>
              <input type="color" value={lineColors.bainha} onChange={(event) => onLineColorChange("bainha", event.target.value)} />
            </label>
          </div>
        </div>
      </div>

      <div className="preview-scroll" ref={scrollRef}>
        <div className="preview-canvas full-page-canvas">
          <svg
            viewBox={`0 0 ${preview.canvasWidth} ${preview.canvasHeight}`}
            className="preview-svg"
            role="img"
            aria-label="Preview tecnico completo do molde"
            style={{ width: `${scaledWidth}px`, height: `${scaledHeight}px` }}
          >
            <rect width={preview.canvasWidth} height={preview.canvasHeight} fill="#ffffff" />

            {preview.sections.map(({ faixa, path, horizontalLines, horizontalHemLines, verticalLines, hemLines, clipId, labelX, labelY, centerY, rightEdgeX, cardX, cardY }) => (
              <g key={faixa.id}>
                <clipPath id={clipId}>
                  <path d={path} />
                </clipPath>
                <path d={path} fill="#ffffff" stroke="none" />
                <g clipPath={`url(#${clipId})`}>
                  {verticalLines.map((line, index) => (
                    <line
                      key={`v-${faixa.id}-${index}`}
                      x1={line.x1}
                      y1={line.y1}
                      x2={line.x2}
                      y2={line.y2}
                      stroke={lineColors.divisao}
                      strokeWidth="1.25"
                    />
                  ))}
                  {horizontalLines.map((line, index) => (
                    <line
                      key={`h-${faixa.id}-${index}`}
                      x1={line.x1}
                      x2={line.x2}
                      y1={line.y}
                      y2={line.y}
                      stroke={lineColors.divisao}
                      strokeWidth="1.1"
                    />
                  ))}
                  {hemLines.map((line, index) => (
                    <line
                      key={`hem-${faixa.id}-${index}`}
                      x1={line.x1}
                      y1={line.y1}
                      x2={line.x2}
                      y2={line.y2}
                      stroke="#1a1a1a"
                      strokeWidth="0.6"
                      strokeOpacity="0.62"
                    />
                  ))}
                  {horizontalHemLines.map((line, index) => (
                    <line
                      key={`hhem-${faixa.id}-${index}`}
                      x1={line.x1}
                      x2={line.x2}
                      y1={line.y}
                      y2={line.y}
                      stroke="#1a1a1a"
                      strokeWidth="0.6"
                      strokeOpacity="0.62"
                    />
                  ))}
                </g>
                <text x={labelX} y={labelY} className="section-page-label" textAnchor="start">
                  {faixa.nome}
                </text>
                <path
                  d={`M ${rightEdgeX + 4} ${centerY} L ${cardX - preview.calloutGap} ${centerY} L ${cardX - preview.calloutGap} ${cardY + preview.calloutHeight / 2} L ${cardX} ${cardY + preview.calloutHeight / 2}`}
                  className="callout-connector"
                  stroke="#13283f"
                  fill="none"
                />
                <rect
                  x={cardX}
                  y={cardY}
                  width={preview.calloutWidth}
                  height={preview.calloutHeight}
                  rx="18"
                  className="callout-card"
                  stroke="#13283f"
                />
                <rect
                  x={cardX}
                  y={cardY}
                  width="6"
                  height={preview.calloutHeight}
                  rx="6"
                  fill="#13283f"
                />
                <text x={cardX + 22} y={cardY + 28} className="callout-title">
                  {faixa.nome.toUpperCase()}
                </text>
                <text x={cardX + 22} y={cardY + 58} className="callout-label">
                  Subindo
                </text>
                <text x={cardX + 150} y={cardY + 58} className="callout-value">
                  {faixa.quantidadeVertical}
                </text>
                <text x={cardX + 22} y={cardY + 78} className="callout-label">
                  Por gomo
                </text>
                <text x={cardX + 150} y={cardY + 78} className="callout-value">
                  {faixa.tacosPorGomo}
                </text>
                <text x={cardX + 22} y={cardY + 96} className="callout-label">
                  Total
                </text>
                <text x={cardX + 150} y={cardY + 96} className="callout-value">
                  {faixa.totalTacos}
                </text>
              </g>
            ))}

            {preview.divisionBoundaries.map((line, index) => (
              <line
                key={`division-boundary-${index}`}
                x1={line.x1}
                x2={line.x2}
                y1={line.y}
                y2={line.y}
                className="section-boundary-line"
              />
            ))}

            <path d={preview.contourPath} fill="none" stroke="#13283f" strokeWidth="2.4" />
            <path
              d={preview.seamContourPath}
              fill="none"
              stroke="#1a1a1a"
              strokeWidth="1.3"
              strokeOpacity="0.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={preview.seamLeftPath}
              fill="none"
              stroke="#000000"
              strokeWidth="2"
              strokeOpacity="1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <line
              x1={preview.topUnionLine.x1}
              y1={preview.topUnionLine.y}
              x2={preview.topUnionLine.x2}
              y2={preview.topUnionLine.y}
              stroke="#1a1a1a"
              strokeWidth="1.6"
              strokeOpacity="0.9"
            />
            <text x={preview.leftClosureGuideX - 12} y={preview.guideTopY + 22} className="print-point-label" textAnchor="end">
              A1
            </text>
            {!preview.hasOddTacoSections ? (
              <line
                x1={preview.centerLine.x1}
                y1={preview.centerLine.y1}
                x2={preview.centerLine.x2}
                y2={preview.centerLine.y2}
                stroke="rgba(19, 40, 63, 0.28)"
                strokeDasharray="10 8"
              />
            ) : null}

            {showPoints
              ? result.tabelaTecnica.map((point) => {
                  const y = preview.mapY(point.coordenadaY);
                  const leftX = preview.mapX(-point.larguraMeiaCm);
                  const rightX = preview.mapX(point.larguraMeiaCm);
                  return (
                    <g key={point.ponto}>
                      <circle cx={leftX} cy={y} r="4.6" fill="#13283f" />
                      <circle cx={rightX} cy={y} r="4.6" fill="#13283f" />
                      <text x={leftX - 14} y={y - 10} className="print-point-label" textAnchor="end">
                        P{point.ponto}
                      </text>
                    </g>
                  );
                })
              : null}
          </svg>
        </div>
      </div>
    </section>
  );
}

function interpolateWidth(y: number, table: CalculationResult["tabelaTecnica"]) {
  if (y <= table[0].coordenadaY) {
    return table[0].larguraMeiaCm;
  }

  for (let i = 1; i < table.length; i += 1) {
    const prev = table[i - 1];
    const next = table[i];
    if (y <= next.coordenadaY) {
      const span = next.coordenadaY - prev.coordenadaY;
      const t = span === 0 ? 0 : (y - prev.coordenadaY) / span;
      return prev.larguraMeiaCm + (next.larguraMeiaCm - prev.larguraMeiaCm) * t;
    }
  }

  return table[table.length - 1].larguraMeiaCm;
}

function buildParallelOffset(x1: number, y1: number, x2: number, y2: number, offset: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const nx = dy / length;
  const ny = -dx / length;

  return {
    x1: x1 + nx * offset,
    y1: y1 + ny * offset,
    x2: x2 + nx * offset,
    y2: y2 + ny * offset
  };
}
