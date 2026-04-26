<?php

declare(strict_types=1);

namespace App\Domain\Pattern;

final class Calculator
{
    private const PLOT_HEM_CM = 0.5;
    private const PLOT_LEFT_CLOSURE_CM = 1.0;
    private const PLOT_UNION_SIDE_CM = 0.5;

    public function __construct(private readonly Validator $validator = new Validator()) {}

    public function calculate(array $input): array
    {
        $precision = (int) ($input['casasDecimais'] ?? 1);
        $warnings = $this->validator->validate($input);
        $table = $this->buildTechnicalTable($input, $precision);
        $bands = $this->buildTacoBands($input, $table, $precision);
        $pieces = $this->buildTacoPieces($bands, $table, $input, $precision);
        $geometry = $this->buildGeometry($table);
        $metrics = $this->deriveMetrics($input, $table, $geometry['contour'], $precision);
        $layout = $this->buildPrintLayout($input, $table);

        if (($layout['totalPaginas'] ?? 0) > 24) {
            $warnings[] = ['tipo' => 'warning', 'mensagem' => 'A impressao vai exigir muitas paginas; considere outro formato de papel ou reduzir a escala.'];
        }

        return [
            'input' => $input,
            'tabelaTecnica' => $table,
            'faixasTacos' => $bands,
            'moldesTacos' => $pieces,
            'geometria' => $geometry,
            'metricas' => $metrics,
            'layoutImpressao' => $layout,
            'warnings' => $warnings,
        ];
    }

    private function buildTechnicalTable(array $input, int $precision): array
    {
        $acc = 0.0;
        $rows = [];
        foreach (($input['tabelaPontos'] ?? []) as $index => $point) {
            $acc = $index === 0 ? 0.0 : $acc + (float) ($point['alturaCm'] ?? 0);
            $rows[] = [
                'ponto' => (int) ($point['ponto'] ?? ($index + 1)),
                'alturaCm' => (float) ($point['alturaCm'] ?? 0),
                'alturaAcumuladaCm' => Math::roundTo($acc, $precision),
                'larguraMeiaCm' => (float) ($point['larguraMeiaCm'] ?? 0),
                'observacao' => $point['observacao'] ?? null,
                'larguraTotalCm' => ((float) ($point['larguraMeiaCm'] ?? 0)) * 2,
                'coordenadaY' => Math::roundTo($acc, $precision),
                'coordenadaXEsquerda' => -((float) ($point['larguraMeiaCm'] ?? 0)),
                'coordenadaXDireita' => (float) ($point['larguraMeiaCm'] ?? 0),
                'secao' => $this->resolveSectionName($acc, $input),
            ];
        }

        return $rows;
    }

    private function resolveSectionName(float $y, array $input): ?string
    {
        foreach (($input['secoes'] ?? []) as $section) {
            if ($y >= (float) ($section['inicioCm'] ?? 0) && $y <= (float) ($section['fimCm'] ?? 0)) {
                return (string) ($section['nome'] ?? '');
            }
        }

        return null;
    }

    private function buildTacoBands(array $input, array $table, int $precision): array
    {
        $bands = [];
        $cursor = 0.0;

        foreach (($input['regioes'] ?? []) as $region) {
            $regionName = (string) ($region['regiao'] ?? 'bojo');
            $regionHeight = (float) ($region['alturaCm'] ?? 0);
            $regionEnd = $cursor + $regionHeight;

            if (($region['modo'] ?? 'unico') === 'unico') {
                $verticalCount = (int) floor($regionHeight / max((float) ($region['alturaTacoCm'] ?? 1), 0.0001));
                $band = [
                    'id' => 'faixa-' . $regionName,
                    'nome' => strtoupper($regionName),
                    'regiao' => $regionName,
                    'secao' => strtoupper($regionName),
                    'inicioCm' => Math::roundTo($cursor, $precision),
                    'fimCm' => Math::roundTo($regionEnd, $precision),
                    'alturaCm' => Math::roundTo($regionHeight, $precision),
                    'cor' => $this->regionColor($regionName),
                    'alturaTacoCm' => (float) ($region['alturaTacoCm'] ?? 0),
                    'tacosPorGomo' => (int) ($region['tacosPorGomo'] ?? 0),
                    'quantidadeVertical' => $verticalCount,
                    'totalTacos' => $verticalCount * (int) ($region['tacosPorGomo'] ?? 0),
                ];
                $band['larguraFaixaCm'] = Math::roundTo(($this->interpolateHalfWidth(($band['inicioCm'] + $band['fimCm']) / 2, $table) * 2) / max((int) $band['tacosPorGomo'], 1), $precision);
                $bands[] = $band;
                $cursor = $regionEnd;
                continue;
            }

            $sectionCursor = $cursor;
            foreach (($region['secoes'] ?? []) as $index => $section) {
                $sectionHeight = (float) ($section['alturaSecaoCm'] ?? 0);
                $sectionEnd = $sectionCursor + $sectionHeight;
                $verticalCount = (int) floor($sectionHeight / max((float) ($section['alturaTacoCm'] ?? 1), 0.0001));
                $band = [
                    'id' => (string) ($section['id'] ?? ($regionName . '-' . ($index + 1))),
                    'nome' => strtoupper($regionName) . ' PARTE ' . ($index + 1),
                    'regiao' => $regionName,
                    'secao' => strtoupper($regionName) . ' PARTE ' . ($index + 1),
                    'inicioCm' => Math::roundTo($sectionCursor, $precision),
                    'fimCm' => Math::roundTo($sectionEnd, $precision),
                    'alturaCm' => Math::roundTo($sectionHeight, $precision),
                    'cor' => $this->regionColor($regionName),
                    'alturaTacoCm' => (float) ($section['alturaTacoCm'] ?? 0),
                    'tacosPorGomo' => (int) ($section['tacosPorGomo'] ?? 0),
                    'quantidadeVertical' => $verticalCount,
                    'totalTacos' => $verticalCount * (int) ($section['tacosPorGomo'] ?? 0),
                ];
                $band['larguraFaixaCm'] = Math::roundTo(($this->interpolateHalfWidth(($band['inicioCm'] + $band['fimCm']) / 2, $table) * 2) / max((int) $band['tacosPorGomo'], 1), $precision);
                $bands[] = $band;
                $sectionCursor = $sectionEnd;
            }

            $cursor = $regionEnd;
        }

        return $bands;
    }

    private function interpolateHalfWidth(float $y, array $table): float
    {
        if (empty($table)) {
            return 0.0;
        }
        if ($y <= (float) $table[0]['coordenadaY']) {
            return (float) $table[0]['larguraMeiaCm'];
        }

        for ($i = 1; $i < count($table); $i++) {
            $prev = $table[$i - 1];
            $next = $table[$i];
            if ($y <= (float) $next['coordenadaY']) {
                $span = (float) $next['coordenadaY'] - (float) $prev['coordenadaY'];
                if ($span == 0.0) {
                    return (float) $next['larguraMeiaCm'];
                }
                $t = ($y - (float) $prev['coordenadaY']) / $span;
                return (float) $prev['larguraMeiaCm'] + (((float) $next['larguraMeiaCm'] - (float) $prev['larguraMeiaCm']) * $t);
            }
        }

        return (float) $table[count($table) - 1]['larguraMeiaCm'];
    }

    private function buildTacoPieces(array $bands, array $table, array $input, int $precision): array
    {
        $pieces = [];
        foreach ($bands as $index => $band) {
            $profileRows = array_values(array_filter($table, fn (array $point): bool => $point['coordenadaY'] > $band['inicioCm'] && $point['coordenadaY'] < $band['fimCm']));
            $topHalf = $this->interpolateHalfWidth((float) $band['inicioCm'], $table);
            $bottomHalf = $this->interpolateHalfWidth((float) $band['fimCm'], $table);
            $profile = array_merge(
                [['y' => (float) $band['inicioCm'], 'half' => $topHalf]],
                array_map(fn (array $row): array => ['y' => (float) $row['coordenadaY'], 'half' => (float) $row['larguraMeiaCm']], $profileRows),
                [['y' => (float) $band['fimCm'], 'half' => $bottomHalf]]
            );

            $contour = [];
            foreach ($profile as $point) {
                $contour[] = ['x' => -$point['half'], 'y' => $point['y'] - $band['inicioCm']];
            }
            for ($i = count($profile) - 1; $i >= 0; $i--) {
                $point = $profile[$i];
                $contour[] = ['x' => $point['half'], 'y' => $point['y'] - $band['inicioCm']];
            }

            $withSeam = $this->applySeamToTaco($contour, $input);
            $maxWidth = 0.0;
            foreach ($profile as $point) {
                $maxWidth = max($maxWidth, $point['half'] * 2);
            }

            $pieces[] = [
                'id' => $band['id'],
                'nome' => $band['nome'],
                'inicioCm' => $band['inicioCm'],
                'fimCm' => $band['fimCm'],
                'alturaCm' => $band['alturaCm'],
                'cor' => $band['cor'],
                'contour' => $contour,
                'contourComBainha' => $withSeam,
                'larguraTopoCm' => Math::roundTo($topHalf * 2, $precision),
                'larguraBaseCm' => Math::roundTo($bottomHalf * 2, $precision),
                'larguraMaximaCm' => Math::roundTo($maxWidth, $precision),
                'areaCm2' => Math::roundTo(Math::polygonArea($contour), $precision),
                'ordem' => $index + 1,
            ];
        }

        return $pieces;
    }

    private function applySeamToTaco(array $contour, array $input): array
    {
        $maxY = 0.0;
        foreach ($contour as $point) {
            $maxY = max($maxY, (float) $point['y']);
        }

        return array_map(function (array $point) use ($maxY): array {
            $x = (float) $point['x'];
            $y = (float) $point['y'];
            return [
                'x' => $x < 0 ? $x - (self::PLOT_LEFT_CLOSURE_CM + self::PLOT_UNION_SIDE_CM) : $x + self::PLOT_UNION_SIDE_CM,
                'y' => $y === 0.0
                    ? $y - self::PLOT_HEM_CM
                    : ($y === $maxY ? $y + self::PLOT_HEM_CM : $y),
            ];
        }, $contour);
    }

    private function buildGeometry(array $table): array
    {
        $leftSide = array_map(fn (array $row): array => ['x' => (float) $row['coordenadaXEsquerda'], 'y' => (float) $row['coordenadaY']], $table);
        $rightSource = array_reverse($table);
        $rightSide = array_map(fn (array $row): array => ['x' => (float) $row['coordenadaXDireita'], 'y' => (float) $row['coordenadaY']], $rightSource);
        $contour = array_merge($leftSide, $rightSide);
        $maxY = 0.0;
        foreach ($contour as $point) {
            $maxY = max($maxY, (float) $point['y']);
        }
        $seamContour = array_map(
            fn (array $point): array => [
                'x' => $point['x'] < 0 ? $point['x'] - (self::PLOT_LEFT_CLOSURE_CM + self::PLOT_UNION_SIDE_CM) : $point['x'] + self::PLOT_UNION_SIDE_CM,
                'y' => $point['y'] === 0.0
                    ? $point['y'] - self::PLOT_HEM_CM
                    : ((float) $point['y'] === $maxY ? $point['y'] + self::PLOT_HEM_CM : $point['y']),
            ],
            $contour
        );
        $lastY = empty($table) ? 0.0 : (float) $table[count($table) - 1]['coordenadaY'];

        return [
            'leftSide' => $leftSide,
            'rightSide' => $rightSide,
            'contour' => $contour,
            'seamContour' => $seamContour,
            'centerLine' => [['x' => 0, 'y' => 0], ['x' => 0, 'y' => $lastY]],
        ];
    }

    private function deriveMetrics(array $input, array $table, array $contour, int $precision): array
    {
        $height = empty($table) ? 0.0 : (float) $table[count($table) - 1]['coordenadaY'];
        $maxWidth = 0.0;
        foreach ($table as $row) {
            $maxWidth = max($maxWidth, (float) $row['larguraTotalCm']);
        }
        $goreWidth = $maxWidth;
        $fullWidth = Math::roundTo(($goreWidth * (float) ($input['quantidadeGomos'] ?? 0)) / M_PI, $precision);
        $wire = Math::roundTo(M_PI * (float) ($input['diametroBocaCm'] ?? 0), $precision);
        $area = Math::roundTo(Math::polygonArea($contour), $precision);
        $surface = Math::roundTo($area * (float) ($input['quantidadeGomos'] ?? 0), $precision);
        $perimeter = Math::roundTo(Math::polylineLength(array_merge($contour, [$contour[0] ?? ['x' => 0, 'y' => 0]])), $precision);
        $material = Math::roundTo(($area + ($perimeter * (float) ($input['bainhaCm'] ?? 0))) * (float) ($input['quantidadeGomos'] ?? 0), $precision);

        $volume = 0.0;
        for ($i = 1; $i < count($table); $i++) {
            $prevRadius = ((float) $table[$i - 1]['larguraTotalCm'] * (float) ($input['quantidadeGomos'] ?? 0)) / (2 * M_PI);
            $nextRadius = ((float) $table[$i]['larguraTotalCm'] * (float) ($input['quantidadeGomos'] ?? 0)) / (2 * M_PI);
            $segmentHeight = (float) $table[$i]['coordenadaY'] - (float) $table[$i - 1]['coordenadaY'];
            $volume += Math::frustumVolume($segmentHeight, $prevRadius, $nextRadius);
        }

        return [
            'alturaCheioCm' => $height,
            'larguraCheioCm' => $fullWidth,
            'diametroBocaCm' => Math::roundTo((float) ($input['diametroBocaCm'] ?? 0), $precision),
            'comprimentoArameBocaCm' => $wire,
            'larguraMaximaGomoCm' => Math::roundTo($goreWidth, $precision),
            'superficieTotalCm2' => $surface,
            'volumeTotalCm3' => Math::roundTo($volume, $precision),
            'perimetroTecnicoMoldeCm' => $perimeter,
            'areaUtilMoldeCm2' => $area,
            'materialEstimadoCm2' => $material,
        ];
    }

    private function buildPrintLayout(array $input, array $table): array
    {
        $paper = $this->resolvePaperSizeMm($input);
        $scale = (float) (($input['impressao']['escala'] ?? 1));
        $maxWidth = 0.0;
        foreach ($table as $row) {
            $maxWidth = max($maxWidth, (float) $row['larguraTotalCm']);
        }
        $artWidth = ($maxWidth + self::PLOT_LEFT_CLOSURE_CM + (self::PLOT_UNION_SIDE_CM * 2)) * 10 * $scale;
        $artHeight = (((empty($table) ? 0.0 : (float) $table[count($table) - 1]['coordenadaY']) + (self::PLOT_HEM_CM * 2)) * 10 * $scale);
        $margin = (float) (($input['impressao']['margemMm'] ?? 0));
        $overlap = (float) (($input['impressao']['sobreposicaoMm'] ?? 0));
        $usableWidth = $paper['width'] - ($margin * 2);
        $usableHeight = $paper['height'] - ($margin * 2);
        $stepX = max($usableWidth - $overlap, 1);
        $stepY = max($usableHeight - $overlap, 1);
        $pagesX = max(1, (int) ceil(($artWidth - $overlap) / $stepX));
        $pagesY = max(1, (int) ceil(($artHeight - $overlap) / $stepY));

        $tiles = [];
        for ($line = 0; $line < $pagesY; $line++) {
            for ($column = 0; $column < $pagesX; $column++) {
                $tiles[] = [
                    'coluna' => $column,
                    'linha' => $line,
                    'origemX' => $column * $stepX,
                    'origemY' => $line * $stepY,
                    'larguraUtilMm' => $usableWidth,
                    'alturaUtilMm' => $usableHeight,
                ];
            }
        }

        return [
            'paginasX' => $pagesX,
            'paginasY' => $pagesY,
            'totalPaginas' => $pagesX * $pagesY,
            'larguraArteMm' => Math::roundTo($artWidth, 1),
            'alturaArteMm' => Math::roundTo($artHeight, 1),
            'tiles' => $tiles,
        ];
    }

    private function resolvePaperSizeMm(array $input): array
    {
        $print = $input['impressao'] ?? [];
        $sizes = [
            'A4' => ['width' => 210, 'height' => 297],
            'A3' => ['width' => 297, 'height' => 420],
            'A2' => ['width' => 420, 'height' => 594],
            'A1' => ['width' => 594, 'height' => 841],
            'A0' => ['width' => 841, 'height' => 1189],
            'CUSTOM' => ['width' => (float) ($print['larguraCustomMm'] ?? 210), 'height' => (float) ($print['alturaCustomMm'] ?? 297)],
        ];
        $size = $sizes[$print['formatoPapel'] ?? 'A4'] ?? $sizes['A4'];
        if (($print['orientacao'] ?? 'retrato') === 'paisagem') {
            return ['width' => $size['height'], 'height' => $size['width']];
        }
        return $size;
    }

    private function regionColor(string $region): string
    {
        return [
            'boca' => '#f4e64a',
            'bojo' => '#77e6f2',
            'bico' => '#f062b8',
        ][$region] ?? '#77e6f2';
    }
}
