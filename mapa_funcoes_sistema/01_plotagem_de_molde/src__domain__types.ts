export type MoldCategory =
  | "lapidado"
  | "bagda"
  | "careca"
  | "barrica"
  | "tangerina"
  | "magico"
  | "liso"
  | "bojudo"
  | "outros";

export type PlotMode =
  | "visual-simples"
  | "tecnico"
  | "grade-interna"
  | "sequencia-gomos"
  | "prancha-impressao"
  | "secao-cores";

export interface SectionBand {
  nome: string;
  inicioCm: number;
  fimCm: number;
  cor: string;
}

export interface TacoConfig {
  id: string;
  nome: string;
  alturaCm: number;
  cor: string;
}

export type BalloonRegionName = "boca" | "bojo" | "bico";

export interface TacoSectionConfig {
  id: string;
  nome: string;
  alturaSecaoCm: number;
  alturaTacoCm: number;
  tacosPorGomo: number;
}

export interface RegionTackingConfig {
  regiao: BalloonRegionName;
  alturaCm: number;
  percentualPadrao: number;
  modo: "unico" | "secoes";
  tacosPorGomo: number;
  alturaTacoCm: number;
  secoes: TacoSectionConfig[];
}

export type TackingMode = "por-quantidade" | "por-alturas" | "por-zonas";

export interface TackingZone {
  nome: string;
  subdivisoes: number;
  alturaCm: number;
}

export interface TackingPlan {
  modo: TackingMode;
  quantidadeTacos?: number;
  cortesCm?: number[];
  zonas?: TackingZone[];
}

export interface SeamConfig {
  esquerda: boolean;
  direita: boolean;
  topo: boolean;
  base: boolean;
  valorCm: number;
}

export interface InputPoint {
  ponto: number;
  alturaCm: number;
  alturaAcumuladaCm: number;
  larguraMeiaCm: number;
  observacao?: string;
}

export interface PrintConfig {
  formatoPapel: "A4" | "A3" | "A2" | "A1" | "A0" | "CUSTOM";
  orientacao: "retrato" | "paisagem";
  margemMm: number;
  escala: number;
  dividirEmPaginas: boolean;
  sobreposicaoMm: number;
  larguraCustomMm?: number;
  alturaCustomMm?: number;
}

export interface ProjectInput {
  projeto: string;
  modelo: MoldCategory;
  comprimentoGomoCm: number;
  quantidadeGomos: number;
  bainhaCm: number;
  diametroBocaCm: number;
  larguraMaximaManualCm?: number;
  casasDecimais: number;
  modoPlotagem: PlotMode;
  mostrarGrade: boolean;
  mostrarLinhaCentral: boolean;
  mostrarCotas: boolean;
  mostrarPontos: boolean;
  colorirSecoes: boolean;
  secoes: SectionBand[];
  tacos: TacoConfig[];
  regioes: RegionTackingConfig[];
  taqueamento: TackingPlan;
  bainhaConfig: SeamConfig;
  tabelaPontos: InputPoint[];
  impressao: PrintConfig;
}

export interface TechnicalPoint extends InputPoint {
  larguraTotalCm: number;
  coordenadaY: number;
  coordenadaXEsquerda: number;
  coordenadaXDireita: number;
  secao?: string;
}

export interface PlotPoint {
  x: number;
  y: number;
}

export interface PolygonGeometry {
  leftSide: PlotPoint[];
  rightSide: PlotPoint[];
  contour: PlotPoint[];
  seamContour: PlotPoint[];
  centerLine: [PlotPoint, PlotPoint];
}

export interface DerivedMetrics {
  alturaCheioCm: number;
  larguraCheioCm: number;
  diametroBocaCm: number;
  comprimentoArameBocaCm: number;
  larguraMaximaGomoCm: number;
  superficieTotalCm2: number;
  volumeTotalCm3: number;
  perimetroTecnicoMoldeCm: number;
  areaUtilMoldeCm2: number;
  materialEstimadoCm2: number;
}

export interface PageTile {
  coluna: number;
  linha: number;
  origemX: number;
  origemY: number;
  larguraUtilMm: number;
  alturaUtilMm: number;
}

export interface TacoBand {
  id: string;
  nome: string;
  regiao: BalloonRegionName;
  secao: string;
  inicioCm: number;
  fimCm: number;
  alturaCm: number;
  cor: string;
  alturaTacoCm: number;
  tacosPorGomo: number;
  quantidadeVertical: number;
  totalTacos: number;
  larguraFaixaCm: number;
}

export interface TacoPiece {
  id: string;
  nome: string;
  inicioCm: number;
  fimCm: number;
  alturaCm: number;
  cor: string;
  contour: PlotPoint[];
  contourComBainha: PlotPoint[];
  larguraTopoCm: number;
  larguraBaseCm: number;
  larguraMaximaCm: number;
  areaCm2: number;
  ordem: number;
}

export interface PrintLayout {
  paginasX: number;
  paginasY: number;
  totalPaginas: number;
  larguraArteMm: number;
  alturaArteMm: number;
  tiles: PageTile[];
}

export interface CalculationWarning {
  tipo: "warning" | "error";
  mensagem: string;
}

export interface CalculationResult {
  input: ProjectInput;
  tabelaTecnica: TechnicalPoint[];
  faixasTacos: TacoBand[];
  moldesTacos: TacoPiece[];
  geometria: PolygonGeometry;
  metricas: DerivedMetrics;
  layoutImpressao: PrintLayout;
  warnings: CalculationWarning[];
}
