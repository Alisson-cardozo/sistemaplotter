import { InputPoint } from "./types";

export interface ImportedPdfData {
  projeto?: string;
  modelo?: string;
  quantidadeGomos?: number;
  bainhaCm?: number;
  comprimentoGomoCm?: number;
  diametroBocaCm?: number;
  metricas?: {
    alturaCheioCm?: number;
    larguraCheioCm?: number;
    diametroBocaCm?: number;
    comprimentoArameBocaCm?: number;
    larguraMaximaGomoCm?: number;
    superficie?: number;
    volume?: number;
  };
  pontos: InputPoint[];
  textoExtraido: string;
  pdfTipo: "texto" | "imagem";
}

export async function importPdfTemplate(file: File): Promise<ImportedPdfData> {
  const buffer = await file.arrayBuffer();
  const text = await extractPdfText(buffer);
  return parseImportedText(text);
}

async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  const source = latin1Decode(bytes);
  const chunks: string[] = [];

  const streamRegex = /stream\r?\n/g;
  let match: RegExpExecArray | null;

  while ((match = streamRegex.exec(source)) !== null) {
    const streamStart = match.index + match[0].length;
    const endMarker = source.indexOf("endstream", streamStart);
    if (endMarker === -1) {
      continue;
    }

    let streamEnd = endMarker;
    while (streamEnd > streamStart && (bytes[streamEnd - 1] === 0x0d || bytes[streamEnd - 1] === 0x0a)) {
      streamEnd -= 1;
    }

    const chunk = bytes.slice(streamStart, streamEnd);
    const decoded = await tryDecodePdfStream(chunk);
    if (decoded.length > 0) {
      chunks.push(decoded);
    }
  }

  const joined = chunks.join("\n");
  return normalizeExtractedText(extractStringsFromPdfContent(joined));
}

async function tryDecodePdfStream(chunk: Uint8Array): Promise<string> {
  const asText = latin1Decode(chunk);
  if (/[A-Za-z]{3,}/.test(asText)) {
    return asText;
  }

  for (const format of ["deflate-raw", "deflate"] as const) {
    try {
      const safeChunk = chunk.slice();
      const stream = new Blob([safeChunk.buffer]).stream().pipeThrough(new DecompressionStream(format));
      const response = new Response(stream);
      const text = await response.text();
      if (text.length > 0) {
        return text;
      }
    } catch {
    }
  }

  return "";
}

function extractStringsFromPdfContent(content: string): string {
  const parts: string[] = [];
  const literalRegex = /\((?:\\.|[^\\)])*\)/g;
  let match: RegExpExecArray | null;

  while ((match = literalRegex.exec(content)) !== null) {
    parts.push(unescapePdfString(match[0].slice(1, -1)));
  }

  return parts.join("\n");
}

function unescapePdfString(value: string): string {
  return value
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\");
}

function normalizeExtractedText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function parseImportedText(text: string): ImportedPdfData {
  const normalized = text
    .replace(/,/g, ".")
    .replace(/\u00a0/g, " ")
    .replace(/[ ]{2,}/g, " ");

  return {
    projeto: captureText(normalized, /Nome[: ]+([^\n]+)/i),
    modelo: captureText(normalized, /Modelo[: ]+([^\n]+)/i),
    quantidadeGomos: captureNumber(normalized, /Quantidade de Gomos[: ]+(\d+(?:\.\d+)?)/i),
    bainhaCm: captureNumber(normalized, /Bainha[: ]+(\d+(?:\.\d+)?)/i),
    comprimentoGomoCm: captureNumber(normalized, /(?:Comprimento do gomo|Tamanho)[: ]+(\d+(?:\.\d+)?)/i),
    diametroBocaCm: captureNumber(normalized, /Di[aâ]metro da Boca[: ]+(\d+(?:\.\d+)?)/i),
    metricas: {
      alturaCheioCm: captureNumber(normalized, /Altura Cheio[: ]+(\d+(?:\.\d+)?)/i),
      larguraCheioCm: captureNumber(normalized, /Largura Cheio[: ]+(\d+(?:\.\d+)?)/i),
      diametroBocaCm: captureNumber(normalized, /Di[aâ]metro da Boca[: ]+(\d+(?:\.\d+)?)/i),
      comprimentoArameBocaCm: captureNumber(normalized, /(?:Compri\. do arame da boca|Compri do arame da boca)[: ]+(\d+(?:\.\d+)?)/i),
      larguraMaximaGomoCm: captureNumber(normalized, /Largura m[aá]x\.? do Gomo[: ]+(\d+(?:\.\d+)?)/i),
      superficie: captureNumber(normalized, /superf[ií]cie[: ]+(\d+(?:\.\d+)?)/i),
      volume: captureNumber(normalized, /Volume[: ]+(\d+(?:\.\d+)?)/i)
    },
    pontos: parsePoints(normalized),
    textoExtraido: normalized,
    pdfTipo: normalized.length > 80 ? "texto" : "imagem"
  };
}

function parsePoints(text: string): InputPoint[] {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const points: InputPoint[] = [];
  for (const line of lines) {
    const match = line.match(/^(\d+)\s+(\d+(?:\.\d+)?)\s+(?:\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/);
    if (!match) {
      continue;
    }
    points.push({
      ponto: Number(match[1]),
      alturaCm: Number(match[2]),
      alturaAcumuladaCm: 0,
      larguraMeiaCm: Number(match[3])
    });
  }

  return points;
}

function captureText(text: string, regex: RegExp): string | undefined {
  return text.match(regex)?.[1]?.trim();
}

function captureNumber(text: string, regex: RegExp): number | undefined {
  const raw = text.match(regex)?.[1];
  if (raw == null) {
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function latin1Decode(bytes: Uint8Array): string {
  let result = "";
  for (let index = 0; index < bytes.length; index += 1) {
    result += String.fromCharCode(bytes[index]);
  }
  return result;
}
