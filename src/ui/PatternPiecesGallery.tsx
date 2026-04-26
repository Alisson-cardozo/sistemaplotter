import { CalculationResult } from "../domain/types";
import { getDivisionPatternAllowanceCm, PLOT_HEM_CM, PLOT_UNION_SIDE_CM } from "../domain/patternAllowances";

export function PatternPiecesGallery({
  result,
  lineColors,
  sectionColors
}: {
  result: CalculationResult;
  lineColors: {
    divisao: string;
    bainha: string;
  };
  sectionColors: Record<string, string>;
}) {
  return (
    <div className="taco-gallery">
      {result.moldesTacos.map((taco) => {
        const faixa = result.faixasTacos.find((item) => item.id === taco.id);
        const localWidth = 180;
        const localHeight = 240;
        const localScale = Math.min(
          (localWidth * 0.36) / Math.max(taco.larguraMaximaCm / 2, 1),
          (localHeight * 0.72) / Math.max(taco.alturaCm, 1)
        );
        const path = buildMiniClosedPath(taco.contourComBainha, localWidth / 2, localHeight - 26, localScale);
        const leftClosureGuide = buildMiniLeftClosureGuide(taco, localWidth / 2, localHeight - 26, localScale);
        const topUnionLine = buildMiniTopUnionLine(taco, localWidth / 2, localHeight - 26, localScale);
        const previewBottomY = localHeight - 26;
        const gridLines =
          faixa == null
            ? {
                horizontal: [] as Array<{ x1: number; x2: number; y1: number; y2: number }>,
                horizontalHems: [] as Array<{ x1: number; x2: number; y1: number; y2: number }>,
                vertical: [] as Array<{ x1: number; y1: number; x2: number; y2: number }>,
                hems: [] as Array<{ x1: number; y1: number; x2: number; y2: number }>
                }
            : buildMiniGrid(taco, faixa, PLOT_HEM_CM, localWidth / 2, previewBottomY, localScale);

        return (
          <div key={taco.id} className="taco-card">
            <svg viewBox={`0 0 ${localWidth} ${localHeight}`} className="taco-svg">
              <rect width={localWidth} height={localHeight} rx="18" fill="rgba(255,255,255,0.72)" />
              <path
                d={path}
                fill="#ffffff"
                stroke="#10233a"
                strokeWidth="2"
              />
              <path d={leftClosureGuide} fill="none" stroke="#000000" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              <line x1={topUnionLine.x1} y1={topUnionLine.y} x2={topUnionLine.x2} y2={topUnionLine.y} stroke="#111111" strokeWidth="1.2" />
              {gridLines.vertical.map((line, index) => (
                <line
                  key={`mv-${taco.id}-${index}`}
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke={lineColors.divisao}
                  strokeWidth="0.55"
                />
              ))}
              {gridLines.horizontal.map((line, index) => (
                <line
                  key={`mh-${taco.id}-${index}`}
                  x1={line.x1}
                  x2={line.x2}
                  y1={line.y1}
                  y2={line.y2}
                  stroke={lineColors.divisao}
                  strokeWidth="0.48"
                />
              ))}
              {gridLines.hems.map((line, index) => (
                <line
                  key={`mhem-${taco.id}-${index}`}
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke={lineColors.bainha}
                  strokeWidth="0.16"
                  strokeOpacity="0.42"
                />
              ))}
              {gridLines.horizontalHems.map((line, index) => (
                <line
                  key={`mhhem-${taco.id}-${index}`}
                  x1={line.x1}
                  x2={line.x2}
                  y1={line.y1}
                  y2={line.y2}
                  stroke={lineColors.bainha}
                  strokeWidth="0.16"
                  strokeOpacity="0.42"
                />
              ))}
            </svg>
            <div className="taco-meta">
              <strong>{taco.nome}</strong>
              <span>Ordem {taco.ordem}</span>
              <span>{taco.alturaCm} cm</span>
              {faixa ? <span>{faixa.quantidadeVertical} subindo | {faixa.tacosPorGomo} por gomo</span> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function buildMiniClosedPath(points: { x: number; y: number }[], xOffset: number, height: number, scale: number) {
  return points
    .map((point, index) => {
      const x = xOffset + point.x * scale;
      const y = height - point.y * scale;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ")
    .concat(" Z");
}

function buildMiniGrid(
  taco: CalculationResult["moldesTacos"][number],
  faixa: CalculationResult["faixasTacos"][number],
  hemSizeCm: number,
  centerX: number,
  bottomY: number,
  scale: number
) {
  const horizontal = [];
  const horizontalHems = [];
  const hemOffset = hemSizeCm * scale;
  for (let step = faixa.alturaTacoCm; step < taco.alturaCm; step += faixa.alturaTacoCm) {
    const y = bottomY - step * scale;
    const half = interpolateLocalHalfWidth(step, taco);
    horizontal.push({
      x1: centerX - half * scale,
      x2: centerX + half * scale,
      y1: y,
      y2: y
    });
    horizontalHems.push({
      x1: centerX - half * scale,
      x2: centerX + half * scale,
      y1: y - hemOffset,
      y2: y - hemOffset
    });
  }
  const vertical = [];
  const hems = [];
  const topHalf = interpolateLocalHalfWidth(0, taco);
  const bottomHalf = interpolateLocalHalfWidth(taco.alturaCm, taco);
  for (let i = 1; i < faixa.tacosPorGomo; i += 1) {
    const ratio = i / faixa.tacosPorGomo;
    const topX = centerX + (-topHalf + topHalf * 2 * ratio) * scale;
    const bottomX = centerX + (-bottomHalf + bottomHalf * 2 * ratio) * scale;
    vertical.push({
      x1: topX,
      y1: bottomY - taco.alturaCm * scale,
      x2: bottomX,
      y2: bottomY
    });
    const perpendicular = buildParallelOffset(topX, bottomY - taco.alturaCm * scale, bottomX, bottomY, hemOffset);
    hems.push({
      x1: perpendicular.x1,
      y1: perpendicular.y1,
      x2: perpendicular.x2,
      y2: perpendicular.y2
    });
  }

  return { horizontal, horizontalHems, vertical, hems };
}

function buildMiniLeftClosureGuide(
  taco: CalculationResult["moldesTacos"][number],
  centerX: number,
  bottomY: number,
  scale: number
) {
  const left = taco.contour
    .slice(0, taco.contour.length / 2)
    .map((point) => ({ x: point.x - PLOT_UNION_SIDE_CM, y: point.y }));

  return left
    .map((point, index) => {
      const x = centerX + point.x * scale;
      const y = bottomY - point.y * scale;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildMiniTopUnionLine(
  taco: CalculationResult["moldesTacos"][number],
  centerX: number,
  bottomY: number,
  scale: number
) {
  const allowance = getDivisionPatternAllowanceCm();
  const topHalf = interpolateLocalHalfWidth(0, taco);
  const y = bottomY - allowance.top * scale;

  return {
    x1: centerX - (topHalf + allowance.left) * scale,
    x2: centerX + (topHalf + allowance.right) * scale,
    y
  };
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

function interpolateLocalHalfWidth(localY: number, taco: CalculationResult["moldesTacos"][number]) {
  const left = taco.contourComBainha
    .slice(0, taco.contourComBainha.length / 2)
    .map((point) => ({ y: point.y, half: Math.abs(point.x) }));
  if (localY <= left[0].y) {
    return left[0].half;
  }
  for (let i = 1; i < left.length; i += 1) {
    const prev = left[i - 1];
    const next = left[i];
    if (localY <= next.y) {
      const span = next.y - prev.y;
      const t = span === 0 ? 0 : (localY - prev.y) / span;
      return prev.half + (next.half - prev.half) * t;
    }
  }
  return left[left.length - 1].half;
}
