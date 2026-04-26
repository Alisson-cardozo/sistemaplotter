<?php

declare(strict_types=1);

namespace App\Domain\Pattern;

final class Validator
{
    public function validate(array $input): array
    {
        $warnings = [];
        $points = $input['tabelaPontos'] ?? [];
        $regions = $input['regioes'] ?? [];
        $tacos = $input['tacos'] ?? [];
        $print = $input['impressao'] ?? [];
        $seam = $input['bainhaConfig'] ?? [];
        $tacking = $input['taqueamento'] ?? [];

        if (($input['comprimentoGomoCm'] ?? 0) <= 0) {
            $warnings[] = ['tipo' => 'error', 'mensagem' => 'O comprimento total do gomo deve ser maior que zero.'];
        }
        if (($input['quantidadeGomos'] ?? 0) < 4) {
            $warnings[] = ['tipo' => 'error', 'mensagem' => 'A quantidade de gomos nao pode ser menor que 4.'];
        }
        if (($input['bainhaCm'] ?? 0) < 0) {
            $warnings[] = ['tipo' => 'error', 'mensagem' => 'A bainha nao pode ser negativa.'];
        }
        if (($input['diametroBocaCm'] ?? 0) <= 0) {
            $warnings[] = ['tipo' => 'error', 'mensagem' => 'O diametro da boca deve ser maior que zero.'];
        }
        if (count($points) < 2) {
            $warnings[] = ['tipo' => 'error', 'mensagem' => 'A tabela de pontos precisa ter pelo menos 2 pontos.'];
        }

        foreach ($points as $index => $point) {
            if ($index === 0 && (($point['alturaCm'] ?? 0) != 0)) {
                $warnings[] = ['tipo' => 'error', 'mensagem' => 'O primeiro ponto deve ter altura 0.'];
                break;
            }
            if ($index > 0 && (($point['alturaCm'] ?? 0) < 0)) {
                $warnings[] = ['tipo' => 'error', 'mensagem' => 'Nao pode haver altura negativa na tabela de pontos.'];
                break;
            }
        }

        $maxHalf = 0.0;
        foreach ($points as $point) {
            $maxHalf = max($maxHalf, (float) ($point['larguraMeiaCm'] ?? 0));
        }
        if (($input['diametroBocaCm'] ?? 0) > ($maxHalf * 4)) {
            $warnings[] = ['tipo' => 'warning', 'mensagem' => 'A boca informada parece grande demais em relacao a largura maxima do gomo.'];
        }
        if (($print['escala'] ?? 0) <= 0) {
            $warnings[] = ['tipo' => 'error', 'mensagem' => 'A escala de impressao deve ser maior que zero.'];
        }

        $heightTacos = 0.0;
        foreach ($tacos as $taco) {
            $heightTacos += (float) ($taco['alturaCm'] ?? 0);
            if (($taco['alturaCm'] ?? 0) <= 0) {
                $warnings[] = ['tipo' => 'error', 'mensagem' => 'Todos os tacos precisam ter altura maior que zero.'];
                break;
            }
        }
        if (!empty($tacos) && abs($heightTacos - (float) ($input['comprimentoGomoCm'] ?? 0)) > 0.001) {
            $warnings[] = ['tipo' => 'error', 'mensagem' => 'A soma das alturas dos tacos deve ser igual a altura total do gomo.'];
        }

        if (($seam['valorCm'] ?? 0) < 0) {
            $warnings[] = ['tipo' => 'error', 'mensagem' => 'A bainha por borda nao pode ser negativa.'];
        }

        $tackingMode = $tacking['modo'] ?? null;
        if ($tackingMode === 'por-quantidade' && (($tacking['quantidadeTacos'] ?? 0) < 1)) {
            $warnings[] = ['tipo' => 'error', 'mensagem' => 'No modo por quantidade, informe uma quantidade valida de tacos.'];
        }
        if ($tackingMode === 'por-alturas') {
            $cuts = $tacking['cortesCm'] ?? [];
            if (count($cuts) < 2 || ($cuts[0] ?? null) != 0 || end($cuts) != ($input['comprimentoGomoCm'] ?? 0)) {
                $warnings[] = ['tipo' => 'error', 'mensagem' => 'No modo por alturas, os cortes devem iniciar em 0 e terminar na altura total do gomo.'];
            }
        }
        if ($tackingMode === 'por-zonas') {
            $zones = $tacking['zonas'] ?? [];
            $totalZones = 0.0;
            foreach ($zones as $zone) {
                $totalZones += (float) ($zone['alturaCm'] ?? 0);
            }
            if (empty($zones) || abs($totalZones - (float) ($input['comprimentoGomoCm'] ?? 0)) > 0.001) {
                $warnings[] = ['tipo' => 'error', 'mensagem' => 'No modo por zonas, a soma das alturas das zonas deve fechar a altura total do gomo.'];
            }
        }

        $regionsTotal = 0.0;
        foreach ($regions as $region) {
            $regionsTotal += (float) ($region['alturaCm'] ?? 0);
            if (($region['modo'] ?? 'unico') === 'unico') {
                if (($region['alturaTacoCm'] ?? 0) <= 0 || ($region['tacosPorGomo'] ?? 0) <= 0) {
                    $warnings[] = ['tipo' => 'error', 'mensagem' => 'Cada regiao precisa de altura do taco e tacos por gomo validos.'];
                }
                continue;
            }

            $sectionsTotal = 0.0;
            foreach (($region['secoes'] ?? []) as $section) {
                $sectionsTotal += (float) ($section['alturaSecaoCm'] ?? 0);
                if (($section['alturaSecaoCm'] ?? 0) <= 0 || ($section['alturaTacoCm'] ?? 0) <= 0 || ($section['tacosPorGomo'] ?? 0) <= 0) {
                    $warnings[] = ['tipo' => 'error', 'mensagem' => 'Todas as secoes precisam ter altura, altura do taco e tacos por gomo validos.'];
                    break;
                }
            }
            if (abs($sectionsTotal - (float) ($region['alturaCm'] ?? 0)) > 0.001) {
                $warnings[] = ['tipo' => 'error', 'mensagem' => 'A soma das secoes precisa ser igual a altura da regiao.'];
            }
        }

        if (!empty($regions) && abs($regionsTotal - (float) ($input['comprimentoGomoCm'] ?? 0)) > 0.001) {
            $warnings[] = ['tipo' => 'error', 'mensagem' => 'A soma das alturas de boca, bojo e bico deve fechar exatamente a altura do molde.'];
        }

        return $warnings;
    }
}
