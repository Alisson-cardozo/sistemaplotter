export type BandeiraCatalogColor = {
  name: string;
  hex: string;
};

export const BANDEIRA_COLOR_CATALOG: BandeiraCatalogColor[] = [
  { name: "BRANCO", hex: "#ffffff" },
  { name: "BRANCO NEVE", hex: "#fffafa" },
  { name: "BRANCO FANTASMA", hex: "#f8f8ff" },
  { name: "GELO", hex: "#f0ffff" },
  { name: "PRETO", hex: "#000000" },
  { name: "PRETO SUAVE", hex: "#0a0a0a" },
  { name: "PRETO GRAFITE", hex: "#1c1c1c" },
  { name: "PRETO CARVAO", hex: "#111111" },
  { name: "CINZA CLARO", hex: "#d3d3d3" },
  { name: "CINZA", hex: "#808080" },
  { name: "CINZA ESCURO", hex: "#505050" },
  { name: "CINZA CHUMBO", hex: "#2f4f4f" },
  { name: "CINZA PRATA", hex: "#c0c0c0" },
  { name: "CINZA AZULADO", hex: "#454a5b" },
  { name: "CINZA CLARISSIMO", hex: "#dadada" },
  { name: "VERMELHO", hex: "#ff0000" },
  { name: "VERMELHO ESCURO", hex: "#8b0000" },
  { name: "VERMELHO VINHO", hex: "#800000" },
  { name: "VERMELHO CEREJA", hex: "#de3163" },
  { name: "VERMELHO SANGUE", hex: "#7f0000" },
  { name: "VERMELHO ROSA", hex: "#ff4d6d" },
  { name: "VERMELHO TOMATE", hex: "#ff6347" },
  { name: "VERMELHO RUBI", hex: "#e0115f" },
  { name: "ROSA", hex: "#ff69b4" },
  { name: "ROSA CLARO", hex: "#ffb6c1" },
  { name: "ROSA PINK", hex: "#ff1493" },
  { name: "ROSA BEBE", hex: "#ffc0cb" },
  { name: "ROSA CHOQUE", hex: "#ff007f" },
  { name: "ROSA SALMAO", hex: "#ff8c69" },
  { name: "ROSA GOIABA", hex: "#ff7e7e" },
  { name: "ROSA MAGENTA", hex: "#ff00ff" },
  { name: "MAGENTA ESCURO", hex: "#8b008b" },
  { name: "ROXO", hex: "#800080" },
  { name: "ROXO CLARO", hex: "#9370db" },
  { name: "ROXO ESCURO", hex: "#4b0082" },
  { name: "ROXO VIOLETA", hex: "#8a2be2" },
  { name: "ROXO LAVANDA", hex: "#e6e6fa" },
  { name: "ROXO AMETISTA", hex: "#9966cc" },
  { name: "AZUL", hex: "#0000ff" },
  { name: "AZUL CLARO", hex: "#87cefa" },
  { name: "AZUL BEBE", hex: "#bfefff" },
  { name: "AZUL CEU", hex: "#00bfff" },
  { name: "AZUL TURQUESA", hex: "#40e0d0" },
  { name: "AZUL MARINHO", hex: "#000080" },
  { name: "AZUL PETROLEO", hex: "#003f5c" },
  { name: "AZUL ROYAL", hex: "#4169e1" },
  { name: "AZUL ESCURO", hex: "#00008b" },
  { name: "AZUL ELETRICO", hex: "#7df9ff" },
  { name: "AZUL ANIL", hex: "#1f75fe" },
  { name: "AZUL PASTEL", hex: "#aec6cf" },
  { name: "VERDE", hex: "#008000" },
  { name: "VERDE CLARO", hex: "#90ee90" },
  { name: "VERDE LIMAO", hex: "#32cd32" },
  { name: "VERDE FLUORESCENTE", hex: "#39ff14" },
  { name: "VERDE MUSGO", hex: "#556b2f" },
  { name: "VERDE OLIVA", hex: "#6b8e23" },
  { name: "VERDE ESMERALDA", hex: "#50c878" },
  { name: "VERDE AGUA", hex: "#00fa9a" },
  { name: "VERDE BANDEIRA", hex: "#009b3a" },
  { name: "VERDE ESCURO", hex: "#006400" },
  { name: "VERDE TIFFANY", hex: "#0abab5" },
  { name: "VERDE NEON", hex: "#66ff00" },
  { name: "AMARELO", hex: "#ffff00" },
  { name: "AMARELO CLARO", hex: "#ffffe0" },
  { name: "AMARELO OURO", hex: "#ffd700" },
  { name: "AMARELO MOSTARDA", hex: "#ffdb58" },
  { name: "AMARELO GEMA", hex: "#ffcc00" },
  { name: "AMARELO CANARIO", hex: "#ffff99" },
  { name: "AMARELO NEON", hex: "#fff700" },
  { name: "LARANJA", hex: "#ffa500" },
  { name: "LARANJA ESCURO", hex: "#ff8c00" },
  { name: "LARANJA QUEIMADO", hex: "#cc5500" },
  { name: "LARANJA CLARO", hex: "#ffb347" },
  { name: "LARANJA NEON", hex: "#ff5f1f" },
  { name: "LARANJA SALMAO", hex: "#fa8072" },
  { name: "MARROM", hex: "#8b4513" },
  { name: "MARROM CLARO", hex: "#a0522d" },
  { name: "MARROM ESCURO", hex: "#5c4033" },
  { name: "MARROM CAFE", hex: "#4b3621" },
  { name: "MARROM CHOCOLATE", hex: "#7b3f00" },
  { name: "MARROM CARAMELO", hex: "#af6e4d" },
  { name: "MARROM AREIA", hex: "#c2b280" },
  { name: "BEGE", hex: "#f5f5dc" },
  { name: "CREME", hex: "#fffdd0" },
  { name: "PALHA", hex: "#f0e68c" },
  { name: "AREIA", hex: "#c2b280" },
  { name: "BEGE AMARELADO", hex: "#fcce9e" },
  { name: "DOCE DE LEITE", hex: "#edad75" },
  { name: "VINHO", hex: "#722f37" },
  { name: "MARSALA", hex: "#964f4c" },
  { name: "MARSALA ESCURO", hex: "#7b3f3f" },
  { name: "TURQUESA", hex: "#40e0d0" },
  { name: "CIANO", hex: "#00ffff" },
  { name: "AQUA", hex: "#00ffff" },
  { name: "DOURADO", hex: "#ffd700" },
  { name: "OURO VELHO", hex: "#cfb53b" },
  { name: "BRONZE", hex: "#cd7f32" }
];

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  return {
    r: Number.parseInt(value.slice(0, 2), 16) || 0,
    g: Number.parseInt(value.slice(2, 4), 16) || 0,
    b: Number.parseInt(value.slice(4, 6), 16) || 0
  };
}

function colorDistance(a: string, b: string) {
  const colorA = hexToRgb(a);
  const colorB = hexToRgb(b);
  return Math.sqrt((colorA.r - colorB.r) ** 2 + (colorA.g - colorB.g) ** 2 + (colorA.b - colorB.b) ** 2);
}

export function findClosestCatalogColor(hex: string) {
  let best = BANDEIRA_COLOR_CATALOG[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const entry of BANDEIRA_COLOR_CATALOG) {
    const distance = colorDistance(hex, entry.hex);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entry;
    }
  }

  return best;
}

export function getCatalogColorName(hex: string) {
  const normalized = hex.toLowerCase();
  return BANDEIRA_COLOR_CATALOG.find((entry) => entry.hex.toLowerCase() === normalized)?.name ?? normalized.toUpperCase();
}
