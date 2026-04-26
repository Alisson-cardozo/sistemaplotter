import { ProjectInput, CalculationWarning } from "./types";

export function validateInput(input: ProjectInput): CalculationWarning[] {
  const warnings: CalculationWarning[] = [];

  if (input.comprimentoGomoCm <= 0) {
    warnings.push({ tipo: "error", mensagem: "O comprimento total do gomo deve ser maior que zero." });
  }

  if (input.quantidadeGomos < 4) {
    warnings.push({ tipo: "error", mensagem: "A quantidade de gomos nao pode ser menor que 4." });
  }

  if (input.bainhaCm < 0) {
    warnings.push({ tipo: "error", mensagem: "A bainha nao pode ser negativa." });
  }

  if (input.diametroBocaCm <= 0) {
    warnings.push({ tipo: "error", mensagem: "O diametro da boca deve ser maior que zero." });
  }

  if (input.tabelaPontos.length < 2) {
    warnings.push({ tipo: "error", mensagem: "A tabela de pontos precisa ter pelo menos 2 pontos." });
  }

  const inconsistent = input.tabelaPontos.some((point, index, list) => {
    if (index === 0) {
      return point.alturaCm !== 0;
    }

    return point.alturaCm < 0;
  });

  if (inconsistent) {
    warnings.push({
      tipo: "error",
      mensagem: "O primeiro ponto deve ter altura 0 e os demais pontos nao podem ter altura negativa."
    });
  }

  const maxHalf = Math.max(...input.tabelaPontos.map((point) => point.larguraMeiaCm), 0);
  if (input.diametroBocaCm > maxHalf * 4) {
    warnings.push({
      tipo: "warning",
      mensagem: "A boca informada parece grande demais em relacao a largura maxima do gomo."
    });
  }

  if (input.impressao.escala <= 0) {
    warnings.push({ tipo: "error", mensagem: "A escala de impressao deve ser maior que zero." });
  }

  const alturaTacos = input.tacos.reduce((acc, taco) => acc + taco.alturaCm, 0);
  if (Math.abs(alturaTacos - input.comprimentoGomoCm) > 0.001) {
    warnings.push({
      tipo: "error",
      mensagem: "A soma das alturas dos tacos deve ser igual a altura total do gomo."
    });
  }

  const tacosInvalidos = input.tacos.some((taco) => taco.alturaCm <= 0);
  if (tacosInvalidos) {
    warnings.push({
      tipo: "error",
      mensagem: "Todos os tacos precisam ter altura maior que zero."
    });
  }

  if (input.bainhaConfig.valorCm < 0) {
    warnings.push({
      tipo: "error",
      mensagem: "A bainha por borda nao pode ser negativa."
    });
  }

  if (input.taqueamento.modo === "por-quantidade") {
    if (!input.taqueamento.quantidadeTacos || input.taqueamento.quantidadeTacos < 1) {
      warnings.push({
        tipo: "error",
        mensagem: "No modo por quantidade, informe uma quantidade valida de tacos."
      });
    }
  }

  if (input.taqueamento.modo === "por-alturas") {
    const cortes = input.taqueamento.cortesCm ?? [];
    if (cortes.length < 2 || cortes[0] !== 0 || cortes[cortes.length - 1] !== input.comprimentoGomoCm) {
      warnings.push({
        tipo: "error",
        mensagem: "No modo por alturas, os cortes devem iniciar em 0 e terminar na altura total do gomo."
      });
    }
  }

  if (input.taqueamento.modo === "por-zonas") {
    const zonas = input.taqueamento.zonas ?? [];
    const totalZonas = zonas.reduce((acc, zona) => acc + zona.alturaCm, 0);
    if (zonas.length === 0 || Math.abs(totalZonas - input.comprimentoGomoCm) > 0.001) {
      warnings.push({
        tipo: "error",
        mensagem: "No modo por zonas, a soma das alturas das zonas deve fechar a altura total do gomo."
      });
    }
  }

  const totalRegioes = input.regioes.reduce((acc, regiao) => acc + regiao.alturaCm, 0);
  if (Math.abs(totalRegioes - input.comprimentoGomoCm) > 0.001) {
    warnings.push({
      tipo: "error",
      mensagem: "A soma das alturas de boca, bojo e bico deve fechar exatamente a altura do molde."
    });
  }

  input.regioes.forEach((regiao) => {
    if (regiao.modo === "unico") {
      if (regiao.alturaTacoCm <= 0 || regiao.tacosPorGomo <= 0) {
        warnings.push({
          tipo: "error",
          mensagem: `A regiao ${regiao.regiao} precisa de altura do taco e tacos por gomo validos.`
        });
      }
      return;
    }

    const totalSecoes = regiao.secoes.reduce((acc, secao) => acc + secao.alturaSecaoCm, 0);
    if (Math.abs(totalSecoes - regiao.alturaCm) > 0.001) {
      warnings.push({
        tipo: "error",
        mensagem: `A soma das secoes da regiao ${regiao.regiao} precisa ser igual a altura da regiao.`
      });
    }

    const secaoInvalida = regiao.secoes.some((secao) => secao.alturaSecaoCm <= 0 || secao.alturaTacoCm <= 0 || secao.tacosPorGomo <= 0);
    if (secaoInvalida) {
      warnings.push({
        tipo: "error",
        mensagem: `Todas as secoes da regiao ${regiao.regiao} precisam ter altura, altura do taco e tacos por gomo validos.`
      });
    }
  });

  return warnings;
}
