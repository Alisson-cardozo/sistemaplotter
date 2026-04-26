import { InputPoint, ProjectInput } from "./types";

export interface CwbImportedData {
  projeto?: string;
  modelo?: string;
  comprimentoGomoCm?: number;
  quantidadeGomos?: number;
  bainhaCm?: number;
  diametroBocaCm?: number;
  alturaCheioCm?: number;
  larguraCheioCm?: number;
  comprimentoArameBocaCm?: number;
  larguraMaximaGomoCm?: number;
  superficieM2?: number;
  volumeM3?: number;
  tabelaPontos: InputPoint[];
}

export function parseCwbPayload(raw: string): CwbImportedData {
  const payload = parseFlexibleObject(raw);
  const tabelaPontos = Array.isArray(payload.tabela_pontos)
    ? payload.tabela_pontos
        .map((point: any, index: number) => ({
          ponto: index + 1,
          alturaCm: toFiniteNumber(point.altura_cm ?? point.alturaCm, 0),
          alturaAcumuladaCm: toFiniteNumber(point.altura_acumulada_cm ?? point.alturaAcumuladaCm, 0),
          larguraMeiaCm: toFiniteNumber(point.largura_meia_cm ?? point.larguraMeiaCm, 0)
        }))
        .filter((point: InputPoint) => Number.isFinite(point.alturaCm) && Number.isFinite(point.larguraMeiaCm))
    : [];

  return {
    projeto: payload.projeto,
    modelo: payload.modelo,
    comprimentoGomoCm: toOptionalNumber(payload.comprimento_gomo_cm),
    quantidadeGomos: toOptionalNumber(payload.quantidade_gomos),
    bainhaCm: toOptionalNumber(payload.bainha_cm),
    diametroBocaCm: toOptionalNumber(payload.diametro_boca_cm),
    alturaCheioCm: toOptionalNumber(payload.altura_cheio_cm),
    larguraCheioCm: toOptionalNumber(payload.largura_cheio_cm),
    comprimentoArameBocaCm: toOptionalNumber(payload.comprimento_arame_boca_cm),
    larguraMaximaGomoCm: toOptionalNumber(payload.largura_maxima_gomo_cm),
    superficieM2: toOptionalNumber(payload.superficie_m2),
    volumeM3: toOptionalNumber(payload.volume_m3),
    tabelaPontos
  };
}

export function normalizeModelName(modelo: string | undefined): ProjectInput["modelo"] | undefined {
  if (modelo == null) {
    return undefined;
  }

  const normalized = modelo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  if (normalized.includes("lapid")) return "lapidado";
  if (normalized.includes("bagda")) return "bagda";
  if (normalized.includes("careca")) return "careca";
  if (normalized.includes("barrica")) return "barrica";
  if (normalized.includes("tangerina")) return "tangerina";
  if (normalized.includes("magico")) return "magico";
  if (normalized.includes("liso")) return "liso";
  if (normalized.includes("bojudo")) return "bojudo";
  return "outros";
}

function parseFlexibleObject(raw: string) {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error("empty payload");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const evaluator = new Function(`return (${trimmed});`);
    return evaluator();
  }
}

function toOptionalNumber(value: unknown): number | undefined {
  const next = Number(value);
  return Number.isFinite(next) ? next : undefined;
}

function toFiniteNumber(value: unknown, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}
