import { ProjectInput } from "./types";

export const sampleProject: ProjectInput = {
  projeto: "Molde Icaro 4",
  modelo: "lapidado",
  comprimentoGomoCm: 1000,
  quantidadeGomos: 32,
  bainhaCm: 1,
  diametroBocaCm: 101.8,
  casasDecimais: 1,
  modoPlotagem: "tecnico",
  mostrarGrade: true,
  mostrarLinhaCentral: true,
  mostrarCotas: true,
  mostrarPontos: true,
  colorirSecoes: true,
  secoes: [
    { nome: "boca", inicioCm: 0, fimCm: 250, cor: "#f4e64a" },
    { nome: "bojo", inicioCm: 250, fimCm: 700, cor: "#77e6f2" },
    { nome: "bico", inicioCm: 700, fimCm: 1000, cor: "#f062b8" }
  ],
  tacos: [
    { id: "t1", nome: "Taco 1", alturaCm: 200, cor: "#f4e64a" },
    { id: "t2", nome: "Taco 2", alturaCm: 200, cor: "#77e6f2" },
    { id: "t3", nome: "Taco 3", alturaCm: 200, cor: "#f8b26a" },
    { id: "t4", nome: "Taco 4", alturaCm: 200, cor: "#b7e36f" },
    { id: "t5", nome: "Taco 5", alturaCm: 200, cor: "#f062b8" }
  ],
  regioes: [
    {
      regiao: "boca",
      alturaCm: 250,
      percentualPadrao: 0.25,
      modo: "unico",
      tacosPorGomo: 4,
      alturaTacoCm: 5,
      secoes: []
    },
    {
      regiao: "bojo",
      alturaCm: 450,
      percentualPadrao: 0.45,
      modo: "unico",
      tacosPorGomo: 8,
      alturaTacoCm: 5,
      secoes: []
    },
    {
      regiao: "bico",
      alturaCm: 300,
      percentualPadrao: 0.3,
      modo: "unico",
      tacosPorGomo: 4,
      alturaTacoCm: 5,
      secoes: []
    }
  ],
  taqueamento: {
    modo: "por-alturas",
    cortesCm: [0, 200, 400, 600, 800, 1000]
  },
  bainhaConfig: {
    esquerda: true,
    direita: true,
    topo: false,
    base: false,
    valorCm: 1
  },
  tabelaPontos: [
    { ponto: 1, alturaCm: 0, alturaAcumuladaCm: 0, larguraMeiaCm: 5.5 },
    { ponto: 2, alturaCm: 390.8, alturaAcumuladaCm: 390.8, larguraMeiaCm: 29.6 },
    { ponto: 3, alturaCm: 29.8, alturaAcumuladaCm: 420.6, larguraMeiaCm: 31.2 },
    { ponto: 4, alturaCm: 29.8, alturaAcumuladaCm: 450.4, larguraMeiaCm: 32.3 },
    { ponto: 5, alturaCm: 49.6, alturaAcumuladaCm: 500, larguraMeiaCm: 33.7 },
    { ponto: 6, alturaCm: 100, alturaAcumuladaCm: 600, larguraMeiaCm: 35.2 },
    { ponto: 7, alturaCm: 100, alturaAcumuladaCm: 700, larguraMeiaCm: 34.3 },
    { ponto: 8, alturaCm: 150, alturaAcumuladaCm: 850, larguraMeiaCm: 23.1 },
    { ponto: 9, alturaCm: 150, alturaAcumuladaCm: 1000, larguraMeiaCm: 8.2 }
  ],
  impressao: {
    formatoPapel: "A4",
    orientacao: "retrato",
    margemMm: 10,
    escala: 1,
    dividirEmPaginas: true,
    sobreposicaoMm: 5
  }
};
