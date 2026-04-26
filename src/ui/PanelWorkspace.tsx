import { ChangeEvent, useMemo, useState } from "react";
import { findClosestCatalogColor, getCatalogColorName } from "../domain/bandeiraColorCatalog";
import { apiFetch } from "../lib/api";
import {
  base64FromText,
  buildAttachmentsFromRawFiles,
  deliveryFormatDescription,
  deliveryFormatLabel,
  DeliveryFileFormat,
  RawDeliveryFile,
  svgPagesToPdfBase64
} from "../lib/deliveryFormats";

type PixelCell = {
  x: number;
  y: number;
  color: string;
};

type LoadedPanelArt = {
  name: string;
  width: number;
  height: number;
  pixels: PixelCell[];
};

type DisplayMode = "quadrado" | "bolinha";
type MeshSize = 20 | 25 | 30;
type DeliveryMode = "download" | "email";
type PanelScaleDeliveryMode = "original" | "scaled" | "all";
type PanelPaperPreset = "A4" | "A3" | "custom";

type EmailState = {
  status: "idle" | "loading" | "success" | "error";
  message: string;
};

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16)
  };
}

function colorDistance(left: string, right: string) {
  const a = hexToRgb(left);
  const b = hexToRgb(right);
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

function normalizePanelColor(hex: string) {
  const value = hex.replace("#", "").toLowerCase();
  if (value.length !== 6) {
    return "#000000";
  }

  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  if (max <= 24) {
    return "#000000";
  }

  if (min >= 236) {
    return "#ffffff";
  }

  return `#${value}`;
}

function readImageFile(file: File) {
  return new Promise<LoadedPanelArt>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Nao foi possivel ler a imagem enviada."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("A imagem enviada nao pode ser processada."));
      image.onload = () => {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("O navegador nao liberou o canvas para leitura da arte."));
          return;
        }

        canvas.width = image.width;
        canvas.height = image.height;
        context.drawImage(image, 0, 0);

        const imageData = context.getImageData(0, 0, image.width, image.height);
        const pixels: PixelCell[] = [];

        for (let y = 0; y < image.height; y += 1) {
          for (let x = 0; x < image.width; x += 1) {
            const index = (y * image.width + x) * 4;
            if (imageData.data[index + 3] === 0) {
              continue;
            }

            pixels.push({
              x,
              y,
              color: normalizePanelColor(
                rgbToHex(imageData.data[index], imageData.data[index + 1], imageData.data[index + 2])
              )
            });
          }
        }

        resolve({
          name: file.name.replace(/\.[^.]+$/, "") || "painel",
          width: image.width,
          height: image.height,
          pixels
        });
      };

      image.src = String(reader.result || "");
    };

    reader.readAsDataURL(file);
  });
}

function colorTextStyle(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 150 ? "#0f1411" : "#f8f7ef";
}

function buildColorTableCsv(rows: Array<{ index: number; color: string; name: string; count: number }>) {
  const lines = ["No.,Cor,Nome,Quantidade"];
  for (const row of rows) {
    lines.push([row.index, row.color, `"${row.name}"`, row.count].join(","));
  }
  return lines.join("\n");
}

function buildPanelSvg(
  art: LoadedPanelArt,
  options: {
    cellSize: number;
    displayMode: DisplayMode;
    minorGridEnabled: boolean;
    majorGridEnabled: boolean;
    minorGridColor: string;
    majorGridColor: string;
    horizontalStep: number;
    verticalStep: number;
    lineWeight: number;
    bounds?: { startX: number; startY: number; width: number; height: number };
  }
) {
  const bounds = options.bounds ?? { startX: 0, startY: 0, width: art.width, height: art.height };
  const filteredPixels = art.pixels.filter(
    (pixel) =>
      pixel.x >= bounds.startX &&
      pixel.x < bounds.startX + bounds.width &&
      pixel.y >= bounds.startY &&
      pixel.y < bounds.startY + bounds.height
  );
  const width = bounds.width * options.cellSize;
  const height = bounds.height * options.cellSize;

  const pixels = filteredPixels
    .map((pixel) => {
      const localX = pixel.x - bounds.startX;
      const localY = pixel.y - bounds.startY;
      const x = localX * options.cellSize;
      const y = localY * options.cellSize;

      if (options.displayMode === "bolinha") {
        return [
          `<rect x="${x}" y="${y}" width="${options.cellSize}" height="${options.cellSize}" fill="#040605" />`,
          `<circle cx="${x + options.cellSize / 2}" cy="${y + options.cellSize / 2}" r="${Math.max(1.5, options.cellSize * 0.28)}" fill="${pixel.color}" />`
        ].join("");
      }

      return `<rect x="${x}" y="${y}" width="${options.cellSize}" height="${options.cellSize}" fill="${pixel.color}" />`;
    })
    .join("");

  const minorLines = options.minorGridEnabled
    ? filteredPixels
        .map((pixel) => {
          const localX = pixel.x - bounds.startX;
          const localY = pixel.y - bounds.startY;
          return `<rect x="${localX * options.cellSize}" y="${localY * options.cellSize}" width="${options.cellSize}" height="${options.cellSize}" fill="none" stroke="${options.minorGridColor}" stroke-width="${Math.max(0.4, options.lineWeight * 0.16)}" />`;
        })
        .join("")
    : "";

  const verticalLines = options.majorGridEnabled
    ? Array.from({ length: Math.floor(bounds.width / options.horizontalStep) + 1 }, (_, index) => {
        const x = index * options.horizontalStep * options.cellSize;
        return `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="${options.majorGridColor}" stroke-width="${options.lineWeight}" />`;
      }).join("")
    : "";

  const horizontalLines = options.majorGridEnabled
    ? Array.from({ length: Math.floor(bounds.height / options.verticalStep) + 1 }, (_, index) => {
        const y = index * options.verticalStep * options.cellSize;
        return `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${options.majorGridColor}" stroke-width="${options.lineWeight}" />`;
      }).join("")
    : "";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="#08100b" />`,
    pixels,
    minorLines,
    verticalLines,
    horizontalLines,
    "</svg>"
  ].join("");
}

function buildLegendSvg(name: string, rows: Array<{ index: number; color: string; name: string; count: number }>) {
  const rowHeight = 34;
  const width = 980;
  const height = Math.max(220, 90 + rows.length * rowHeight);
  const body = rows
    .map(
      (row, index) => `
        <rect x="32" y="${88 + index * rowHeight}" width="18" height="18" rx="4" fill="${row.color}" stroke="#d7d7d7" stroke-width="0.8" />
        <text x="70" y="${102 + index * rowHeight}" font-size="13" fill="#20241f">${row.index}</text>
        <text x="140" y="${102 + index * rowHeight}" font-size="13" fill="#20241f">${row.color}</text>
        <text x="360" y="${102 + index * rowHeight}" font-size="13" fill="#20241f">${row.name}</text>
        <text x="690" y="${102 + index * rowHeight}" font-size="13" fill="#20241f">${row.count}</text>
      `
    )
    .join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="${width}" height="${height}" fill="#fcfcf8" />
      <text x="32" y="42" font-size="28" font-weight="700" fill="#161b17">Tabela de cores - ${name}</text>
      <text x="32" y="68" font-size="14" fill="#586158">Folha separada para conferencia do painel.</text>
      <line x1="32" y1="80" x2="${width - 32}" y2="80" stroke="#ccd3ca" />
      <text x="70" y="102" font-size="13" font-weight="700" fill="#20241f">No.</text>
      <text x="140" y="102" font-size="13" font-weight="700" fill="#20241f">Cor</text>
      <text x="360" y="102" font-size="13" font-weight="700" fill="#20241f">Nome</text>
      <text x="690" y="102" font-size="13" font-weight="700" fill="#20241f">Quantidade</text>
      ${body}
    </svg>
  `;
}

export function PanelWorkspace() {
  const [originalArt, setOriginalArt] = useState<LoadedPanelArt | null>(null);
  const [art, setArt] = useState<LoadedPanelArt | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: "idle" | "error" | "success"; message?: string }>({ type: "idle" });
  const [zoom, setZoom] = useState(10);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("quadrado");
  const [meshSize, setMeshSize] = useState<MeshSize>(20);
  const [minorGridEnabled, setMinorGridEnabled] = useState(true);
  const [majorGridEnabled, setMajorGridEnabled] = useState(true);
  const [minorGridColor, setMinorGridColor] = useState("#ffffff");
  const [majorGridColor, setMajorGridColor] = useState("#d9b252");
  const [horizontalStep, setHorizontalStep] = useState(4);
  const [verticalStep, setVerticalStep] = useState(4);
  const [lineWeight, setLineWeight] = useState(1.6);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("download");
  const [deliveryFileFormat, setDeliveryFileFormat] = useState<DeliveryFileFormat>("all");
  const [paperPreset, setPaperPreset] = useState<PanelPaperPreset>("A4");
  const [customPaperLabel, setCustomPaperLabel] = useState("Personalizada");
  const [scaleZeros, setScaleZeros] = useState(0);
  const [deliveryScaleMode, setDeliveryScaleMode] = useState<PanelScaleDeliveryMode>("all");
  const [deliveryEmail, setDeliveryEmail] = useState("");
  const [partsHorizontal, setPartsHorizontal] = useState(2);
  const [partsVertical, setPartsVertical] = useState(2);
  const [maxColors, setMaxColors] = useState(24);
  const [sourceColor, setSourceColor] = useState("");
  const [targetColor, setTargetColor] = useState("");
  const [emailState, setEmailState] = useState<EmailState>({ status: "idle", message: "" });

  const colorRows = useMemo(() => {
    if (art == null) {
      return [];
    }

    const counts = new Map<string, number>();
    for (const pixel of art.pixels) {
      if (pixel.color === "#000000") {
        continue;
      }
      counts.set(pixel.color, (counts.get(pixel.color) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .sort((left, right) => right[1] - left[1])
      .map(([color, count], index) => ({
        color,
        count,
        index: index + 1,
        name: getCatalogColorName(color)
      }));
  }, [art]);

  const totalCount = useMemo(() => colorRows.reduce((sum, row) => sum + row.count, 0), [colorRows]);

  const divisionParts = useMemo(() => {
    if (!art) {
      return [];
    }

    const tileWidth = Math.ceil(art.width / partsHorizontal);
    const tileHeight = Math.ceil(art.height / partsVertical);
    const parts: Array<{ id: string; label: string; startX: number; startY: number; width: number; height: number }> = [];

    for (let row = 0; row < partsVertical; row += 1) {
      for (let column = 0; column < partsHorizontal; column += 1) {
        const startX = column * tileWidth;
        const startY = row * tileHeight;
        parts.push({
          id: `parte-${row + 1}-${column + 1}`,
          label: `Parte ${parts.length + 1}`,
          startX,
          startY,
          width: Math.max(0, Math.min(tileWidth, art.width - startX)),
          height: Math.max(0, Math.min(tileHeight, art.height - startY))
        });
      }
    }

    return parts.filter((part) => part.width > 0 && part.height > 0);
  }, [art, partsHorizontal, partsVertical]);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setLoading(true);
    setStatus({ type: "idle" });

    try {
      const nextArt = await readImageFile(file);
      setOriginalArt(nextArt);
      setArt(nextArt);
      setEmailState({ status: "idle", message: "" });
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Nao foi possivel carregar a arte do painel."
      });
    } finally {
      setLoading(false);
      event.target.value = "";
    }
  };

  const widthMeters = art ? ((art.width * meshSize) / 100).toFixed(2) : "0.00";
  const heightMeters = art ? ((art.height * meshSize) / 100).toFixed(2) : "0.00";
  const scaleMultiplier = Math.pow(10, scaleZeros);

  const applyMergeColor = () => {
    if (!art || !sourceColor || !targetColor || sourceColor === targetColor) {
      return;
    }

    setArt({
      ...art,
      pixels: art.pixels.map((pixel) => ({
        ...pixel,
        color: pixel.color === sourceColor ? targetColor : pixel.color
      }))
    });
    setStatus({ type: "success", message: `Cor ${sourceColor} agrupada em ${targetColor}.` });
  };

  const applyMaxColors = () => {
    if (!art || colorRows.length <= maxColors) {
      return;
    }

    const keep = colorRows.slice(0, maxColors).map((row) => row.color);
    setArt({
      ...art,
      pixels: art.pixels.map((pixel) => {
        if (keep.includes(pixel.color)) {
          return pixel;
        }

        const replacement = keep.reduce((closest, current) =>
          colorDistance(pixel.color, current) < colorDistance(pixel.color, closest) ? current : closest
        );

        return { ...pixel, color: replacement };
      })
    });
    setStatus({ type: "success", message: `Paleta reduzida para ${maxColors} cores finais.` });
  };

  const applyCatalogToneCorrection = () => {
    if (!art) {
      return;
    }

    setArt({
      ...art,
      pixels: art.pixels.map((pixel) => {
        if (pixel.color === "#000000") {
          return pixel;
        }
        return {
          ...pixel,
          color: findClosestCatalogColor(pixel.color).hex.toLowerCase()
        };
      })
    });
    setStatus({ type: "success", message: "Tons ajustados para a paleta nomeada do sistema." });
  };

  const resetPalette = () => {
    if (!originalArt) {
      return;
    }

    setArt(originalArt);
    setStatus({ type: "success", message: "A arte voltou para as cores originais carregadas." });
  };

  const buildDeliveryRawFiles = async () => {
    if (!art) {
      return [];
    }

    const rawFiles: RawDeliveryFile[] = [];
    const appendScaleFiles = async (sizeMultiplier: number, suffix: string) => {
      const baseCellSize = meshSize === 20 ? 10 : meshSize === 25 ? 12 : 14;
      const cellSize = baseCellSize * sizeMultiplier;
      const fullSvg = buildPanelSvg(art, {
        cellSize,
        displayMode,
        minorGridEnabled,
        majorGridEnabled,
        minorGridColor,
        majorGridColor,
        horizontalStep,
        verticalStep,
        lineWeight
      });
      const legendSvg = buildLegendSvg(art.name, colorRows);
      const partSvgs = divisionParts.map((part) => ({
        filename: `${art.name}-${part.label.toLowerCase().replace(/\s+/g, "-")}${suffix}.svg`,
        contentType: "image/svg+xml" as const,
        content: buildPanelSvg(art, {
          cellSize,
          displayMode,
          minorGridEnabled,
          majorGridEnabled,
          minorGridColor,
          majorGridColor,
          horizontalStep,
          verticalStep,
          lineWeight,
          bounds: { startX: part.startX, startY: part.startY, width: part.width, height: part.height }
        }),
        divisionId: part.id,
        divisionName: part.label
      }));

      if (deliveryFileFormat === "pdf" || deliveryFileFormat === "all") {
        rawFiles.push({
          filename: `${art.name}${suffix}-partes+tabela.pdf`,
          contentType: "application/pdf",
          contentBase64: await svgPagesToPdfBase64([fullSvg, ...partSvgs.map((item) => item.content), legendSvg])
        });
      }

      if (deliveryFileFormat === "svg" || deliveryFileFormat === "png" || deliveryFileFormat === "all") {
        rawFiles.push({
          filename: `${art.name}${suffix}-mapa-principal.svg`,
          contentType: "image/svg+xml",
          content: fullSvg
        });
        rawFiles.push(...partSvgs);
        rawFiles.push({
          filename: `${art.name}${suffix}-tabela-de-cores.svg`,
          contentType: "image/svg+xml",
          content: legendSvg
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

    rawFiles.push({
      filename: `${art.name}-tabela-de-cores.csv`,
      contentType: "text/csv",
      contentBase64: base64FromText(buildColorTableCsv(colorRows))
    });

    return rawFiles;
  };

  const downloadFiles = async () => {
    if (!art) {
      setEmailState({ status: "error", message: "Carregue uma arte antes de baixar." });
      return;
    }

    setEmailState({ status: "loading", message: "Preparando os arquivos do painel..." });
    try {
      const rawFiles = await buildDeliveryRawFiles();
      const files = await buildAttachmentsFromRawFiles(rawFiles, deliveryFileFormat);

      for (const file of files) {
        const blob = new Blob([Uint8Array.from(atob(file.contentBase64), (value) => value.charCodeAt(0))], { type: file.contentType });
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
        message: `Download iniciado com ${files.length} arquivo(s) em ${deliveryFormatLabel(deliveryFileFormat)} e escala ${deliveryScaleMode === "all" ? "Tudo junto" : deliveryScaleMode === "scaled" && scaleMultiplier > 1 ? `${scaleMultiplier}x` : "Tamanho original"}.`
      });
    } catch (error) {
      setEmailState({
        status: "error",
        message: error instanceof Error ? error.message : "Nao foi possivel preparar os arquivos."
      });
    }
  };

  const sendByEmail = async () => {
    if (!art) {
      setEmailState({ status: "error", message: "Carregue uma arte antes de enviar." });
      return;
    }
    if (deliveryEmail.trim() === "") {
      setEmailState({ status: "error", message: "Informe o email para envio." });
      return;
    }

    setEmailState({ status: "loading", message: "Enviando pacote do painel..." });
    try {
      const rawFiles = await buildDeliveryRawFiles();
      const files = await buildAttachmentsFromRawFiles(rawFiles, deliveryFileFormat);

      const response = await apiFetch("/api/send-mold-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
          email: deliveryEmail.trim(),
          projectName: `${art.name} (painel)`,
          body: [
            `Projeto: ${art.name}`,
            `Visualizacao ativa: ${displayMode}`,
            `Malha usada: ${meshSize} cm`,
            `Folha selecionada: ${paperPreset === "custom" ? customPaperLabel || "Personalizada" : paperPreset}`,
            `Partes configuradas: ${partsHorizontal} x ${partsVertical}`,
            `Formato do arquivo: ${deliveryFormatLabel(deliveryFileFormat)}`,
            `Escala do envio: ${deliveryScaleMode === "all" ? "Tudo junto" : deliveryScaleMode === "scaled" && scaleMultiplier > 1 ? `${scaleMultiplier}x` : "Tamanho original"}`,
            "Segue o material do painel com tabela de cores conforme a configuracao escolhida."
          ].join("\n"),
          files
        })
      });

      const raw = await response.text();
      if (!response.ok) {
        throw new Error(raw || "Nao foi possivel enviar o email.");
      }

      setEmailState({
        status: "success",
        message: `Pacote enviado para ${deliveryEmail} com ${files.length} arquivo(s) em ${deliveryFormatLabel(deliveryFileFormat)}.`
      });
    } catch (error) {
      setEmailState({
        status: "error",
        message: error instanceof Error ? error.message : "Nao foi possivel enviar o pacote."
      });
    }
  };

  return (
    <section className="table-panel workspace-tab-panel panel-workspace">
      <div className="panel-head mold-tab-head">
        <div>
          <p className="eyebrow">Area de painel</p>
          <h3>Painel e letreiros</h3>
          <p className="panel-subcopy">
            Monte a arte em blocos, ajuste a paleta, escolha o visual quadrado ou bolinha e prepare o envio dividido com tabela de cores.
          </p>
        </div>
      </div>

      <div className="panel-workspace-layout">
        <section className="panel panel-upload-card">
          <div className="panel-head">
            <div>
              <h3>Entrada da arte</h3>
              <p className="panel-subcopy">Use uma imagem simples e pequena para transformar em blocos contaveis.</p>
            </div>
            <div className="panel-workspace-badge">{totalCount} lanternas / blocos</div>
          </div>

          <div className="panel-upload-bar">
            <label className="upload-button">
              <input type="file" accept="image/*" onChange={handleUpload} />
              {loading ? "Carregando imagem..." : "Carregar imagem"}
            </label>
          </div>

          <div className="grid two panel-workspace-controls">
            <div className="field">
              <label>Modelo de leitura</label>
              <div className="panel-mode-switch">
                <button type="button" className={displayMode === "quadrado" ? "active" : ""} onClick={() => setDisplayMode("quadrado")}>
                  Quadrado
                </button>
                <button type="button" className={displayMode === "bolinha" ? "active" : ""} onClick={() => setDisplayMode("bolinha")}>
                  Bolinha
                </button>
              </div>
            </div>

            <div className="field">
              <label>Zoom da grade</label>
              <div className="panel-zoom-row">
                <input type="range" min="4" max="24" step="1" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
                <strong>{zoom}x</strong>
              </div>
            </div>
          </div>

          <div className="panel-workspace-stats">
            <article>
              <span>Tamanho em blocos</span>
              <strong>{art ? `${art.width} x ${art.height}` : "--"}</strong>
            </article>
            <article>
              <span>Cores detectadas</span>
              <strong>{colorRows.length}</strong>
            </article>
            <article>
              <span>Total contado</span>
              <strong>{totalCount}</strong>
            </article>
          </div>

          <div className="field">
            <label>Contagem com malha</label>
            <div className="panel-mesh-switch">
              {[20, 25, 30].map((value) => (
                <button key={value} type="button" className={meshSize === value ? "active" : ""} onClick={() => setMeshSize(value as MeshSize)}>
                  {value}
                </button>
              ))}
            </div>
          </div>

          <div className="panel-size-note">
            {art ? <>Na malha {meshSize} cm: {widthMeters}m x {heightMeters}m</> : <>Carregue a arte para calcular o tamanho real.</>}
          </div>

          {status.message ? <div className={`delivery-status ${status.type === "error" ? "error" : "success"}`}>{status.message}</div> : null}
        </section>

        <section className="panel panel-preview-card">
          <div className="panel-head">
            <div>
              <h3>Preview da montagem</h3>
              <p className="panel-subcopy">Cada pixel da arte vira um bloco ampliado para leitura e montagem.</p>
            </div>
          </div>

          <div className="panel-preview-scroll">
            {art ? (
              <svg
                className="panel-preview-svg"
                width={art.width * zoom}
                height={art.height * zoom}
                viewBox={`0 0 ${art.width * zoom} ${art.height * zoom}`}
                role="img"
                aria-label="Preview do painel em blocos"
              >
                {art.pixels.map((pixel) => {
                  const x = pixel.x * zoom;
                  const y = pixel.y * zoom;
                  const size = zoom;
                  return (
                    <g key={`${pixel.x}-${pixel.y}`}>
                      {displayMode === "quadrado" ? (
                        <rect
                          x={x}
                          y={y}
                          width={size}
                          height={size}
                          fill={pixel.color}
                          stroke={minorGridEnabled ? minorGridColor : "transparent"}
                          strokeWidth={minorGridEnabled ? Math.max(0.3, lineWeight * 0.16) : 0}
                        />
                      ) : (
                        <>
                          <rect x={x} y={y} width={size} height={size} fill="#040605" />
                          <circle cx={x + size / 2} cy={y + size / 2} r={Math.max(1.5, size * 0.28)} fill={pixel.color} />
                        </>
                      )}
                    </g>
                  );
                })}

                {majorGridEnabled
                  ? Array.from({ length: Math.floor((art.width - 1) / horizontalStep) + 1 }, (_, index) => (
                      <line
                        key={`panel-major-v-${index}`}
                        x1={index * horizontalStep * zoom}
                        y1={0}
                        x2={index * horizontalStep * zoom}
                        y2={art.height * zoom}
                        stroke={majorGridColor}
                        strokeWidth={lineWeight}
                      />
                    ))
                  : null}

                {majorGridEnabled
                  ? Array.from({ length: Math.floor((art.height - 1) / verticalStep) + 1 }, (_, index) => (
                      <line
                        key={`panel-major-h-${index}`}
                        x1={0}
                        y1={index * verticalStep * zoom}
                        x2={art.width * zoom}
                        y2={index * verticalStep * zoom}
                        stroke={majorGridColor}
                        strokeWidth={lineWeight}
                      />
                    ))
                  : null}
              </svg>
            ) : (
              <div className="panel-preview-empty">
                <strong>Carregue uma imagem</strong>
                <p>Quando a arte entrar, o painel mostra a leitura em blocos com controle de zoom e modo visual.</p>
              </div>
            )}
          </div>
        </section>

        <section className="panel panel-grid-card">
          <div className="panel-head">
            <div>
              <h3>Painel de malha</h3>
              <p className="panel-subcopy">Deixe a configuracao aberta e ajuste a leitura sem repetir o modelo da bandeira.</p>
            </div>
          </div>

          <div className="grid two bandeiras-grid-controls">
            <label className="field">
              <span>Passo lateral</span>
              <input type="number" min="1" max="24" value={horizontalStep} onChange={(event) => setHorizontalStep(Math.max(1, Number(event.target.value) || 1))} />
            </label>
            <label className="field">
              <span>Passo vertical</span>
              <input type="number" min="1" max="24" value={verticalStep} onChange={(event) => setVerticalStep(Math.max(1, Number(event.target.value) || 1))} />
            </label>
            <label className="field">
              <span>Espessura da linha</span>
              <input type="number" min="0.5" max="6" step="0.1" value={lineWeight} onChange={(event) => setLineWeight(Math.max(0.5, Number(event.target.value) || 0.5))} />
            </label>
            <label className="field">
              <span>Cor da linha principal</span>
              <input type="color" value={majorGridColor} onChange={(event) => setMajorGridColor(event.target.value)} />
            </label>
            <label className="field">
              <span>Cor da linha base</span>
              <input type="color" value={minorGridColor} onChange={(event) => setMinorGridColor(event.target.value)} />
            </label>
          </div>

          <div className="panel-mode-switch">
            <button type="button" className={minorGridEnabled ? "active" : ""} onClick={() => setMinorGridEnabled((current) => !current)}>
              {minorGridEnabled ? "Ocultar grade base" : "Mostrar grade base"}
            </button>
            <button type="button" className={majorGridEnabled ? "active" : ""} onClick={() => setMajorGridEnabled((current) => !current)}>
              {majorGridEnabled ? "Ocultar linhas guia" : "Mostrar linhas guia"}
            </button>
          </div>
        </section>

        <section className="panel panel-palette-card">
          <div className="panel-head">
            <div>
              <h3>Editor de paleta</h3>
              <p className="panel-subcopy">Troque uma cor pela outra e controle quantas cores finais o painel deve manter.</p>
            </div>
          </div>

          <div className="grid two bandeiras-grid-controls">
            <label className="field">
              <span>Cor de origem</span>
              <select value={sourceColor} onChange={(event) => setSourceColor(event.target.value)}>
                <option value="">Escolha uma cor</option>
                {colorRows.map((row) => (
                  <option key={`source-${row.color}`} value={row.color}>
                    {row.color} - {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Trocar por</span>
              <select value={targetColor} onChange={(event) => setTargetColor(event.target.value)}>
                <option value="">Escolha uma cor</option>
                {colorRows.map((row) => (
                  <option key={`target-${row.color}`} value={row.color}>
                    {row.color} - {row.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span>Maximo de cores finais</span>
            <input type="number" min="2" max="128" value={maxColors} onChange={(event) => setMaxColors(Math.max(2, Number(event.target.value) || 2))} />
          </label>

          <div className="panel-action-row">
            <button type="button" onClick={applyCatalogToneCorrection} disabled={!art}>
              Ajustar tons com paleta nomeada
            </button>
            <button type="button" onClick={applyMergeColor} disabled={!art || !sourceColor || !targetColor || sourceColor === targetColor}>
              Juntar uma cor na outra
            </button>
            <button type="button" onClick={applyMaxColors} disabled={!art || colorRows.length <= maxColors}>
              Reduzir paleta
            </button>
            <button type="button" onClick={resetPalette} disabled={!originalArt}>
              Voltar para original
            </button>
          </div>
        </section>

        <section className="panel panel-delivery-card">
          <div className="panel-head">
            <div>
              <h3>Finalizar painel</h3>
              <p className="panel-subcopy">Depois de terminar a edicao acima, escolha como quer dividir, baixar ou enviar.</p>
            </div>
          </div>
          <div className="bandeiras-delivery-layout">
            <section className="bandeiras-delivery-column">
              <div className="bandeiras-delivery-column-head">
                <strong>Visualizacao da imagem</strong>
                <span>Preview com a divisao final aplicada.</span>
              </div>
              <div className="bandeiras-part-preview panel-final-preview">
                {art ? (
                  <svg
                    width={art.width * 4}
                    height={art.height * 4}
                    viewBox={`0 0 ${art.width * 4} ${art.height * 4}`}
                    role="img"
                    aria-label="Preview final do painel"
                  >
                    {art.pixels.map((pixel) =>
                      displayMode === "quadrado" ? (
                        <rect
                          key={`panel-final-${pixel.x}-${pixel.y}`}
                          x={pixel.x * 4}
                          y={pixel.y * 4}
                          width={4}
                          height={4}
                          fill={pixel.color}
                          stroke={minorGridEnabled ? minorGridColor : "transparent"}
                          strokeWidth={minorGridEnabled ? 0.25 : 0}
                        />
                      ) : (
                        <g key={`panel-final-${pixel.x}-${pixel.y}`}>
                          <rect x={pixel.x * 4} y={pixel.y * 4} width={4} height={4} fill="#040605" />
                          <circle cx={pixel.x * 4 + 2} cy={pixel.y * 4 + 2} r={1.2} fill={pixel.color} />
                        </g>
                      )
                    )}
                    {Array.from({ length: partsHorizontal + 1 }, (_, index) => {
                      const tileWidth = Math.ceil(art.width / partsHorizontal);
                      const x = index * tileWidth * 4;
                      return <line key={`panel-division-v-${index}`} x1={x} y1={0} x2={x} y2={art.height * 4} stroke="#ff5fe5" strokeWidth={1.2} />;
                    })}
                    {Array.from({ length: partsVertical + 1 }, (_, index) => {
                      const tileHeight = Math.ceil(art.height / partsVertical);
                      const y = index * tileHeight * 4;
                      return <line key={`panel-division-h-${index}`} x1={0} y1={y} x2={art.width * 4} y2={y} stroke="#ff5fe5" strokeWidth={1.2} />;
                    })}
                  </svg>
                ) : null}
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
                  {(["custom", "A4", "A3"] as PanelPaperPreset[]).map((preset) => (
                    <label key={preset} className={`delivery-mode-card ${paperPreset === preset ? "active" : ""}`}>
                      <input type="radio" checked={paperPreset === preset} onChange={() => setPaperPreset(preset)} />
                      <span>{preset === "custom" ? "Personalizado" : `Dividir para ${preset}`}</span>
                      <em>{paperPreset === preset ? "MODELO ATIVO" : "Tipo de divisao"}</em>
                      <small>{preset === "custom" ? "Voce define a folha e as partes." : "Usa esse padrao como referencia visual."}</small>
                    </label>
                  ))}
                </div>
              </div>

              {paperPreset === "custom" ? (
                <label className="field">
                  <span>Nome da folha personalizada</span>
                  <input value={customPaperLabel} onChange={(event) => setCustomPaperLabel(event.target.value)} placeholder="Ex.: Folha 60x90" />
                </label>
              ) : null}

              <div className="grid two bandeiras-grid-controls">
                <label className="field">
                  <span>Divisoes horizontais</span>
                  <input type="number" min="1" max="12" value={partsHorizontal} onChange={(event) => setPartsHorizontal(Math.max(1, Number(event.target.value) || 1))} />
                </label>
                <label className="field">
                  <span>Divisoes verticais</span>
                  <input type="number" min="1" max="12" value={partsVertical} onChange={(event) => setPartsVertical(Math.max(1, Number(event.target.value) || 1))} />
                </label>
              </div>

              <div className="delivery-mode-panel">
                <strong>O que deseja fazer</strong>
                <div className="delivery-mode-options">
                  <label className={`delivery-mode-card ${deliveryMode === "download" ? "active" : ""}`}>
                    <input type="radio" checked={deliveryMode === "download"} onChange={() => setDeliveryMode("download")} />
                    <span>Baixar no PC</span>
                    <em>{deliveryMode === "download" ? "ACAO ATIVA" : "Acao final"}</em>
                    <small>Gera um arquivo final unico para salvar no computador.</small>
                  </label>
                  <label className={`delivery-mode-card ${deliveryMode === "email" ? "active" : ""}`}>
                    <input type="radio" checked={deliveryMode === "email"} onChange={() => setDeliveryMode("email")} />
                    <span>Enviar por email</span>
                    <em>{deliveryMode === "email" ? "ACAO ATIVA" : "Entrega remota"}</em>
                    <small>Envia o arquivo final para o email do usuario.</small>
                  </label>
                </div>
              </div>

              {deliveryMode === "email" ? (
                <label className="field">
                  <span>Email do usuario</span>
                  <input value={deliveryEmail} onChange={(event) => setDeliveryEmail(event.target.value)} placeholder="usuario@email.com" />
                </label>
              ) : null}

              <div className="delivery-mode-panel">
                <strong>Formato do arquivo</strong>
                <div className="delivery-mode-options">
                  {(["pdf", "svg", "png", "all"] as DeliveryFileFormat[]).map((format) => (
                    <label key={format} className={`delivery-mode-card ${deliveryFileFormat === format ? "active" : ""}`}>
                      <input type="radio" checked={deliveryFileFormat === format} onChange={() => setDeliveryFileFormat(format)} />
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
                  ] as Array<{ id: PanelScaleDeliveryMode; label: string; note: string }>).map((option) => (
                    <label key={option.id} className={`delivery-mode-card ${deliveryScaleMode === option.id ? "active" : ""}`}>
                      <input type="radio" checked={deliveryScaleMode === option.id} onChange={() => setDeliveryScaleMode(option.id)} />
                      <span>{option.label}</span>
                      <em>{deliveryScaleMode === option.id ? "TAMANHO ATIVO" : "Tamanho final"}</em>
                      <small>{option.note}</small>
                    </label>
                  ))}
                </div>
              </div>

              <div className="tutorial-form-actions">
                {deliveryMode === "email" ? (
                  <button type="button" onClick={sendByEmail} disabled={!art || emailState.status === "loading"}>
                    {emailState.status === "loading" ? "Enviando..." : "Enviar arquivo final por email"}
                  </button>
                ) : (
                  <button type="button" onClick={downloadFiles} disabled={!art || emailState.status === "loading"}>
                    {emailState.status === "loading" ? "Preparando download..." : "Baixar arquivo final"}
                  </button>
                )}
              </div>

              <div className="bandeiras-hints">
                <span>Folha selecionada: {paperPreset === "custom" ? customPaperLabel || "Personalizada" : paperPreset}</span>
                <span>Divisao final: {partsHorizontal} x {partsVertical}</span>
                <span>Total de partes: {divisionParts.length}</span>
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
                {divisionParts.map((part) => {
                  const previewCell = Math.max(2, Math.min(7, Math.floor(150 / Math.max(part.width, part.height || 1))));
                  return (
                    <article key={part.id} className="bandeiras-part-card">
                      <strong>{part.label}</strong>
                      <div className="bandeiras-part-preview">
                        {art ? (
                          <svg width={part.width * previewCell} height={part.height * previewCell} viewBox={`0 0 ${part.width * previewCell} ${part.height * previewCell}`}>
                            {art.pixels
                              .filter(
                                (pixel) =>
                                  pixel.x >= part.startX &&
                                  pixel.x < part.startX + part.width &&
                                  pixel.y >= part.startY &&
                                  pixel.y < part.startY + part.height
                              )
                              .map((pixel) => {
                                const localX = pixel.x - part.startX;
                                const localY = pixel.y - part.startY;
                                return displayMode === "quadrado" ? (
                                  <rect
                                    key={`${part.id}-${pixel.x}-${pixel.y}`}
                                    x={localX * previewCell}
                                    y={localY * previewCell}
                                    width={previewCell}
                                    height={previewCell}
                                    fill={pixel.color}
                                    stroke={minorGridEnabled ? minorGridColor : "transparent"}
                                    strokeWidth={minorGridEnabled ? 0.25 : 0}
                                  />
                                ) : (
                                  <g key={`${part.id}-${pixel.x}-${pixel.y}`}>
                                    <rect x={localX * previewCell} y={localY * previewCell} width={previewCell} height={previewCell} fill="#040605" />
                                    <circle
                                      cx={localX * previewCell + previewCell / 2}
                                      cy={localY * previewCell + previewCell / 2}
                                      r={Math.max(1, previewCell * 0.28)}
                                      fill={pixel.color}
                                    />
                                  </g>
                                );
                              })}
                          </svg>
                        ) : null}
                      </div>
                      <span>{part.width}px x {part.height}px</span>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>
        </section>

        <section className="panel panel-color-card">
          <div className="panel-head">
            <div>
              <h3>Tabela de cores</h3>
              <p className="panel-subcopy">Resumo final das cores detectadas para conferencia da arte do painel.</p>
            </div>
          </div>

          <div className="editor-table">
            <table>
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Cor</th>
                  <th>Nome</th>
                  <th>Quantidade</th>
                </tr>
              </thead>
              <tbody>
                {colorRows.length === 0 ? (
                  <tr>
                    <td colSpan={4}>Carregue uma arte para ver a tabela de cores do painel.</td>
                  </tr>
                ) : (
                  colorRows.map((row) => (
                    <tr key={row.color}>
                      <td>{row.index}</td>
                      <td>
                        <div className="panel-color-swatch panel-color-swatch-cell">
                          <span className="panel-color-box" style={{ backgroundColor: row.color }} />
                          <div className="panel-color-meta">
                            <code>{row.color}</code>
                            <small>{row.name}</small>
                          </div>
                        </div>
                      </td>
                      <td><strong>{row.name}</strong></td>
                      <td>
                        <span className="panel-color-count" style={{ backgroundColor: row.color, color: colorTextStyle(row.color) }}>
                          {row.count}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  );
}
