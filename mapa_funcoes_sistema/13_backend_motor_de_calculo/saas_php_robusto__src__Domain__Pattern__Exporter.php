<?php

declare(strict_types=1);

namespace App\Domain\Pattern;

final class Exporter
{
    private const PLOT_HEM_CM = 0.5;
    private const PLOT_LEFT_CLOSURE_CM = 1.0;
    private const PLOT_UNION_SIDE_CM = 0.5;

    private function divisionAllowance(): array
    {
        return [
            'left' => self::PLOT_LEFT_CLOSURE_CM + self::PLOT_UNION_SIDE_CM,
            'right' => self::PLOT_UNION_SIDE_CM,
            'top' => self::PLOT_HEM_CM,
            'bottom' => self::PLOT_HEM_CM,
        ];
    }

    public function buildExportFiles(array $result): array
    {
        $projectBase = trim((string) ($result['input']['modelo'] ?? ''))
            ?: trim((string) ($result['input']['projeto'] ?? 'molde'))
            ?: 'molde';

        return array_merge([
            [
                'region' => 'inteiro',
                'filename' => $projectBase . '-relatorio-tecnico.pdf',
                'content' => $this->buildTechnicalPdf($result),
                'contentType' => 'application/pdf',
            ],
            [
                'region' => 'inteiro',
                'filename' => $projectBase . '-inteiro.svg',
                'content' => $this->buildWholeMoldSvg($result),
                'contentType' => 'image/svg+xml',
            ],
            [
                'region' => 'boca',
                'filename' => $projectBase . '-boca.svg',
                'content' => $this->buildRegionSvg($result, 'boca'),
                'contentType' => 'image/svg+xml',
            ],
            [
                'region' => 'bojo',
                'filename' => $projectBase . '-bojo.svg',
                'content' => $this->buildRegionSvg($result, 'bojo'),
                'contentType' => 'image/svg+xml',
            ],
            [
                'region' => 'bico',
                'filename' => $projectBase . '-bico.svg',
                'content' => $this->buildRegionSvg($result, 'bico'),
                'contentType' => 'image/svg+xml',
            ],
        ], array_map(function (array $band) use ($projectBase, $result): array {
            return [
                'region' => 'divisao',
                'divisionId' => (string) ($band['id'] ?? ''),
                'divisionName' => (string) ($band['nome'] ?? 'divisao'),
                'filename' => $projectBase . '-' . $this->slug((string) ($band['nome'] ?? 'divisao')) . '.svg',
                'content' => $this->buildBandSvg($result, $band),
                'contentType' => 'image/svg+xml',
            ];
        }, $result['faixasTacos'] ?? []));
    }

    private function slug(string $value): string
    {
        $normalized = strtolower(trim($value));
        $normalized = preg_replace('/[^a-z0-9]+/', '-', $normalized) ?? 'divisao';
        return trim($normalized, '-') ?: 'divisao';
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

    private function buildBandProfile(float $startY, float $endY, array $table): array
    {
        $rows = array_values(array_filter($table, fn (array $point): bool => $point['coordenadaY'] > $startY && $point['coordenadaY'] < $endY));
        return array_merge(
            [['y' => $startY, 'half' => $this->interpolateHalfWidth($startY, $table)]],
            array_map(fn (array $point): array => ['y' => (float) $point['coordenadaY'], 'half' => (float) $point['larguraMeiaCm']], $rows),
            [['y' => $endY, 'half' => $this->interpolateHalfWidth($endY, $table)]]
        );
    }

    private function buildClosedPathFromProfile(
        array $profile,
        float $centerX,
        float $topMargin,
        float $baseY,
        float $drawingHeight,
        array $allowance = ['left' => 0.0, 'right' => 0.0, 'top' => 0.0, 'bottom' => 0.0]
    ): string
    {
        $commands = [];
        $lastY = empty($profile) ? $baseY : (float) $profile[count($profile) - 1]['y'];
        foreach ($profile as $index => $point) {
            $x = $centerX - $point['half'] - (float) ($allowance['left'] ?? 0);
            $yOffset = (float) $point['y'] === $baseY ? (float) ($allowance['top'] ?? 0) : ((float) $point['y'] === $lastY ? -((float) ($allowance['bottom'] ?? 0)) : 0.0);
            $y = $topMargin + $drawingHeight - ($point['y'] - $baseY) + $yOffset;
            $commands[] = sprintf('%s %.3f %.3f', $index === 0 ? 'M' : 'L', $x, $y);
        }
        for ($i = count($profile) - 1; $i >= 0; $i--) {
            $point = $profile[$i];
            $x = $centerX + $point['half'] + (float) ($allowance['right'] ?? 0);
            $yOffset = (float) $point['y'] === $baseY ? (float) ($allowance['top'] ?? 0) : ((float) $point['y'] === $lastY ? -((float) ($allowance['bottom'] ?? 0)) : 0.0);
            $y = $topMargin + $drawingHeight - ($point['y'] - $baseY) + $yOffset;
            $commands[] = sprintf('L %.3f %.3f', $x, $y);
        }
        $commands[] = 'Z';
        return implode(' ', $commands);
    }

    private function buildContourPath(array $result, float $centerX, float $topMargin, float $drawingHeight): string
    {
        $points = !empty($result['geometria']['seamContour'] ?? null)
            ? $result['geometria']['seamContour']
            : array_merge($result['geometria']['leftSide'], $result['geometria']['rightSide']);
        $commands = [];
        foreach ($points as $index => $point) {
            $x = $centerX + $point['x'];
            $y = $topMargin + $drawingHeight - $point['y'];
            $commands[] = sprintf('%s %.3f %.3f', $index === 0 ? 'M' : 'L', $x, $y);
        }
        $commands[] = 'Z';
        return implode(' ', $commands);
    }

    private function buildLeftClosureGuidePath(array $result, float $centerX, float $topMargin, float $drawingHeight): string
    {
        $commands = [];
        foreach ($result['geometria']['leftSide'] as $index => $point) {
            $x = $centerX + (float) $point['x'] - self::PLOT_UNION_SIDE_CM;
            $y = $topMargin + $drawingHeight - (float) $point['y'];
            $commands[] = sprintf('%s %.3f %.3f', $index === 0 ? 'M' : 'L', $x, $y);
        }
        return implode(' ', $commands);
    }

    private function buildBandLeftClosureGuidePath(array $profile, float $centerX, float $topMargin, float $baseY, float $drawingHeight): string
    {
        $commands = [];
        foreach ($profile as $index => $point) {
            $x = $centerX - (float) $point['half'] - self::PLOT_UNION_SIDE_CM;
            $y = $topMargin + $drawingHeight - ((float) $point['y'] - $baseY);
            $commands[] = sprintf('%s %.3f %.3f', $index === 0 ? 'M' : 'L', $x, $y);
        }
        return implode(' ', $commands);
    }

    private function buildBandTopUnionLine(array $profile, float $centerX, float $topMargin, float $baseY, float $drawingHeight): string
    {
        if (empty($profile)) {
            return '';
        }

        $allowance = $this->divisionAllowance();
        $topHalf = (float) $profile[0]['half'];
        $y = $topMargin + $drawingHeight - (((float) $profile[0]['y']) - $baseY) - (float) ($allowance['top'] ?? 0);

        return sprintf(
            '<line x1="%.3f" y1="%.3f" x2="%.3f" y2="%.3f" stroke="#111111" stroke-width="0.16" stroke-opacity="0.95" />',
            $centerX - $topHalf - (float) ($allowance['left'] ?? 0),
            $y,
            $centerX + $topHalf + (float) ($allowance['right'] ?? 0),
            $y
        );
    }

    private function buildRegionContourPath(array $result, string $region, float $centerX, float $topMargin, float $regionStart, float $drawingHeight): string
    {
        $bands = array_values(array_filter($result['faixasTacos'], fn (array $band): bool => $band['regiao'] === $region));
        if (empty($bands)) {
            return '';
        }

        $start = (float) $bands[0]['inicioCm'];
        $end = (float) $bands[count($bands) - 1]['fimCm'];
        $profile = $this->buildBandProfile($start, $end, $result['tabelaTecnica']);
        return $this->buildClosedPathFromProfile($profile, $centerX, $topMargin, $regionStart, $drawingHeight, $this->divisionAllowance());
    }

    private function buildBandGroup(
        array $result,
        array $band,
        float $centerX,
        float $topMargin,
        float $baseY,
        float $drawingHeight,
        string $clipId
    ): string {
        $profile = $this->buildBandProfile((float) $band['inicioCm'], (float) $band['fimCm'], $result['tabelaTecnica']);
        $path = $this->buildClosedPathFromProfile($profile, $centerX, $topMargin, $baseY, $drawingHeight, $this->divisionAllowance());
        $hemOffset = self::PLOT_HEM_CM;

        $cellPaths = [];
        $verticalLines = [];
        $verticalHems = [];
        $horizontalLines = [];
        $horizontalHems = [];

        for ($row = 0; $row < (int) ($band['quantidadeVertical'] ?? 0); $row++) {
            $rowTopY = (float) $band['inicioCm'] + ($row * (float) $band['alturaTacoCm']);
            $rowBottomY = min((float) $band['fimCm'], $rowTopY + (float) $band['alturaTacoCm']);
            $topHalf = $this->interpolateHalfWidth($rowTopY, $result['tabelaTecnica']);
            $bottomHalf = $this->interpolateHalfWidth($rowBottomY, $result['tabelaTecnica']);
            $topCanvasY = $topMargin + $drawingHeight - ($rowTopY - $baseY);
            $bottomCanvasY = $topMargin + $drawingHeight - ($rowBottomY - $baseY);

            for ($col = 0; $col < (int) ($band['tacosPorGomo'] ?? 0); $col++) {
                $leftRatio = $col / max((int) $band['tacosPorGomo'], 1);
                $rightRatio = ($col + 1) / max((int) $band['tacosPorGomo'], 1);
                $topLeftX = $centerX + (-$topHalf + $topHalf * 2 * $leftRatio);
                $topRightX = $centerX + (-$topHalf + $topHalf * 2 * $rightRatio);
                $bottomRightX = $centerX + (-$bottomHalf + $bottomHalf * 2 * $rightRatio);
                $bottomLeftX = $centerX + (-$bottomHalf + $bottomHalf * 2 * $leftRatio);

                $cellPaths[] = sprintf(
                    '<path d="M %.3f %.3f L %.3f %.3f L %.3f %.3f L %.3f %.3f Z" fill="#ffffff" />',
                    $topLeftX,
                    $topCanvasY,
                    $topRightX,
                    $topCanvasY,
                    $bottomRightX,
                    $bottomCanvasY,
                    $bottomLeftX,
                    $bottomCanvasY
                );
            }
        }

        for ($i = 1; $i < (int) ($band['tacosPorGomo'] ?? 0); $i++) {
            $ratio = $i / max((int) $band['tacosPorGomo'], 1);
            $topHalf = $this->interpolateHalfWidth((float) $band['inicioCm'], $result['tabelaTecnica']);
            $bottomHalf = $this->interpolateHalfWidth((float) $band['fimCm'], $result['tabelaTecnica']);
            $topX = $centerX + (-$topHalf + $topHalf * 2 * $ratio);
            $bottomX = $centerX + (-$bottomHalf + $bottomHalf * 2 * $ratio);
            $topY = $topMargin + $drawingHeight - ((float) $band['inicioCm'] - $baseY);
            $bottomY = $topMargin + $drawingHeight - ((float) $band['fimCm'] - $baseY);

            $verticalLines[] = sprintf(
                '<line x1="%.3f" y1="%.3f" x2="%.3f" y2="%.3f" stroke="#111111" stroke-width="0.11" />',
                $topX,
                $topY,
                $bottomX,
                $bottomY
            );

            $dx = $bottomX - $topX;
            $dy = $bottomY - $topY;
            $length = hypot($dx, $dy) ?: 1.0;
            $nx = $dy / $length;
            $ny = -$dx / $length;
            $verticalHems[] = sprintf(
                '<line x1="%.3f" y1="%.3f" x2="%.3f" y2="%.3f" stroke="#111111" stroke-width="0.05" stroke-opacity="0.7" />',
                $topX + ($nx * $hemOffset),
                $topY + ($ny * $hemOffset),
                $bottomX + ($nx * $hemOffset),
                $bottomY + ($ny * $hemOffset)
            );
        }

        for ($step = (float) $band['alturaTacoCm']; $step < (float) $band['alturaCm']; $step += (float) $band['alturaTacoCm']) {
            $yValue = (float) $band['inicioCm'] + $step;
            $half = $this->interpolateHalfWidth($yValue, $result['tabelaTecnica']);
            $y = $topMargin + $drawingHeight - ($yValue - $baseY);
            $horizontalLines[] = sprintf(
                '<line x1="%.3f" y1="%.3f" x2="%.3f" y2="%.3f" stroke="#111111" stroke-width="0.11" />',
                $centerX - $half,
                $y,
                $centerX + $half,
                $y
            );
            $horizontalHems[] = sprintf(
                '<line x1="%.3f" y1="%.3f" x2="%.3f" y2="%.3f" stroke="#111111" stroke-width="0.05" stroke-opacity="0.7" />',
                $centerX - $half,
                $y - $hemOffset,
                $centerX + $half,
                $y - $hemOffset
            );
        }

        return trim(
            '<g>' .
            '<defs><clipPath id="' . $clipId . '"><path d="' . $path . '" /></clipPath></defs>' .
            '<path d="' . $path . '" fill="#ffffff" stroke="none" />' .
            '<g clip-path="url(#' . $clipId . ')">' .
            implode("\n", $cellPaths) . "\n" .
            implode("\n", $verticalHems) . "\n" .
            implode("\n", $horizontalHems) . "\n" .
            implode("\n", $verticalLines) . "\n" .
            implode("\n", $horizontalLines) .
            '</g></g>'
        );
    }

    private function buildDivisionLines(array $result, array $bands, float $centerX, float $topMargin, float $baseY, float $drawingHeight): string
    {
        $lines = [];
        foreach ($bands as $band) {
            $yValue = (float) $band['fimCm'];
            $half = $this->interpolateHalfWidth($yValue, $result['tabelaTecnica']);
            $y = $topMargin + $drawingHeight - ($yValue - $baseY);
            $extension = 2.8;
            $lines[] = sprintf(
                '<line x1="%.3f" y1="%.3f" x2="%.3f" y2="%.3f" stroke="#1696e8" stroke-width="0.09" />',
                $centerX - $half - $extension,
                $y,
                $centerX + $half + $extension,
                $y
            );
        }

        return implode("\n", $lines);
    }

    private function buildWholeMoldSvg(array $result): string
    {
        $margin = max(self::PLOT_LEFT_CLOSURE_CM + (self::PLOT_UNION_SIDE_CM * 2), 2);
        $width = (float) ($result['metricas']['larguraMaximaGomoCm'] ?? 0) + self::PLOT_LEFT_CLOSURE_CM + (self::PLOT_UNION_SIDE_CM * 2) + ($margin * 2);
        $height = (float) ($result['metricas']['alturaCheioCm'] ?? 0) + (self::PLOT_HEM_CM * 2) + ($margin * 2);
        $drawingHeight = (float) ($result['metricas']['alturaCheioCm'] ?? 0);
        $centerX = $width / 2;
        $topMargin = $margin + self::PLOT_HEM_CM;
        $contourPath = $this->buildContourPath($result, $centerX, $topMargin, $drawingHeight);
        $leftClosureGuidePath = $this->buildLeftClosureGuidePath($result, $centerX, $topMargin, $drawingHeight);
        $divisionLines = $this->buildDivisionLines($result, $result['faixasTacos'] ?? [], $centerX, $topMargin, 0, $drawingHeight);
        $bandGroups = implode("\n", array_map(
            fn (array $band): string => $this->buildBandGroup($result, $band, $centerX, $topMargin, 0, $drawingHeight, 'clip-whole-' . $band['id']),
            $result['faixasTacos'] ?? []
        ));

        return trim(sprintf(
            '<svg xmlns="http://www.w3.org/2000/svg" width="%1$.2fcm" height="%2$.2fcm" viewBox="0 0 %1$.2f %2$.2f" fill="none"><rect width="%1$.2f" height="%2$.2f" fill="#ffffff" />%3$s%4$s<path d="%5$s" fill="none" stroke="#000000" stroke-width="0.18" stroke-linecap="round" stroke-linejoin="round" /><path d="%6$s" fill="none" stroke="#10233a" stroke-width="0.26" /></svg>',
            $width,
            $height,
            $bandGroups,
            $divisionLines,
            $leftClosureGuidePath,
            $contourPath
        ));
    }

    private function buildRegionSvg(array $result, string $region): string
    {
        $bands = array_values(array_filter($result['faixasTacos'], fn (array $band): bool => $band['regiao'] === $region));
        if (empty($bands)) {
            return '';
        }

        $regionStart = (float) $bands[0]['inicioCm'];
        $regionEnd = (float) $bands[count($bands) - 1]['fimCm'];
        $regionHeight = $regionEnd - $regionStart;
        $maxHalf = 1.0;
        foreach ($bands as $band) {
            $maxHalf = max($maxHalf, $this->interpolateHalfWidth((float) $band['inicioCm'], $result['tabelaTecnica']), $this->interpolateHalfWidth((float) $band['fimCm'], $result['tabelaTecnica']));
        }
        $margin = max(self::PLOT_LEFT_CLOSURE_CM + (self::PLOT_UNION_SIDE_CM * 2), 2);
        $width = ($maxHalf * 2) + self::PLOT_LEFT_CLOSURE_CM + (self::PLOT_UNION_SIDE_CM * 2) + ($margin * 2);
        $height = $regionHeight + (self::PLOT_HEM_CM * 2) + ($margin * 2);
        $drawingHeight = $regionHeight;
        $centerX = $width / 2;
        $topMargin = $margin + self::PLOT_HEM_CM;
        $contourPath = $this->buildRegionContourPath($result, $region, $centerX, $topMargin, $regionStart, $drawingHeight);
        $regionProfile = $this->buildBandProfile($regionStart, $regionEnd, $result['tabelaTecnica']);
        $leftClosureGuidePath = $this->buildBandLeftClosureGuidePath($regionProfile, $centerX, $topMargin, $regionStart, $drawingHeight);
        $divisionLines = $this->buildDivisionLines($result, $bands, $centerX, $topMargin, $regionStart, $drawingHeight);
        $bandGroups = implode("\n", array_map(
            fn (array $band): string => $this->buildBandGroup($result, $band, $centerX, $topMargin, $regionStart, $drawingHeight, 'clip-' . $region . '-' . $band['id']),
            $bands
        ));

        return trim(sprintf(
            '<svg xmlns="http://www.w3.org/2000/svg" width="%1$.2fcm" height="%2$.2fcm" viewBox="0 0 %1$.2f %2$.2f" fill="none"><rect width="%1$.2f" height="%2$.2f" fill="#ffffff" />%3$s%4$s<path d="%5$s" fill="none" stroke="#000000" stroke-width="0.18" stroke-linecap="round" stroke-linejoin="round" /><path d="%6$s" fill="none" stroke="#10233a" stroke-width="0.26" /></svg>',
            $width,
            $height,
            $bandGroups,
            $divisionLines,
            $leftClosureGuidePath,
            $contourPath
        ));
    }

    private function buildBandSvg(array $result, array $band): string
    {
        $bandStart = (float) ($band['inicioCm'] ?? 0);
        $bandEnd = (float) ($band['fimCm'] ?? 0);
        $bandHeight = max($bandEnd - $bandStart, 1);
        $maxHalf = max(
            1.0,
            $this->interpolateHalfWidth($bandStart, $result['tabelaTecnica']),
            $this->interpolateHalfWidth($bandEnd, $result['tabelaTecnica'])
        );
        $margin = max(self::PLOT_LEFT_CLOSURE_CM + (self::PLOT_UNION_SIDE_CM * 2), 2);
        $width = ($maxHalf * 2) + self::PLOT_LEFT_CLOSURE_CM + (self::PLOT_UNION_SIDE_CM * 2) + ($margin * 2);
        $height = $bandHeight + (self::PLOT_HEM_CM * 2) + ($margin * 2);
        $drawingHeight = $bandHeight;
        $centerX = $width / 2;
        $topMargin = $margin + self::PLOT_HEM_CM;
        $bandGroup = $this->buildBandGroup($result, $band, $centerX, $topMargin, $bandStart, $drawingHeight, 'clip-band-' . ($band['id'] ?? 'division'));
        $profile = $this->buildBandProfile($bandStart, $bandEnd, $result['tabelaTecnica']);
        $contourPath = $this->buildClosedPathFromProfile($profile, $centerX, $topMargin, $bandStart, $drawingHeight, $this->divisionAllowance());
        $leftClosureGuidePath = $this->buildBandLeftClosureGuidePath($profile, $centerX, $topMargin, $bandStart, $drawingHeight);
        $topUnionLine = $this->buildBandTopUnionLine($profile, $centerX, $topMargin, $bandStart, $drawingHeight);

        return trim(sprintf(
            '<svg xmlns="http://www.w3.org/2000/svg" width="%1$.2fcm" height="%2$.2fcm" viewBox="0 0 %1$.2f %2$.2f" fill="none"><rect width="%1$.2f" height="%2$.2f" fill="#ffffff" />%3$s%4$s<path d="%5$s" fill="none" stroke="#000000" stroke-width="0.18" stroke-linecap="round" stroke-linejoin="round" /><path d="%6$s" fill="none" stroke="#10233a" stroke-width="0.26" /></svg>',
            $width,
            $height,
            $bandGroup,
            $topUnionLine,
            $leftClosureGuidePath,
            $contourPath
        ));
    }

    private function buildTechnicalPdf(array $result): string
    {
        $projectName = (string) ($result['input']['projeto'] ?? 'Sem nome');
        $modelName = (string) ($result['input']['modelo'] ?? 'nao-informado');
        $quantityGomos = (int) ($result['input']['quantidadeGomos'] ?? 0);
        $bainha = $this->formatMeasure(self::PLOT_HEM_CM);
        $comprimento = $this->formatMeasure((float) ($result['input']['comprimentoGomoCm'] ?? 0));
        $diametroBoca = $this->formatMeasure((float) ($result['input']['diametroBocaCm'] ?? 0));
        $larguraMaxima = $this->formatMeasure((float) ($result['metricas']['larguraMaximaGomoCm'] ?? 0));
        $alturaCheio = $this->formatMeasure((float) ($result['metricas']['alturaCheioCm'] ?? 0));
        $larguraCheio = $this->formatMeasure((float) ($result['metricas']['larguraCheioCm'] ?? 0));
        $comprimentoArame = $this->formatMeasure((float) ($result['metricas']['comprimentoArameBocaCm'] ?? 0));
        $totalTacos = array_reduce(
            $result['faixasTacos'] ?? [],
            fn (int $carry, array $band): int => $carry + (int) ($band['totalTacos'] ?? 0),
            0
        );

        $lines = [
            'MOLDE TAQUEADO - RELATORIO TECNICO',
            '',
            'RESUMO DO MOLDE',
            'Projeto: ' . $projectName,
            'Modelo: ' . $modelName,
            'Quantidade de gomos: ' . $quantityGomos,
            'Bainha padrao da plotagem: ' . $bainha . ' cm',
            'Bainha de uniao: ' . $this->formatMeasure(self::PLOT_HEM_CM) . ' cm',
            'Bainha de fechamento no lado esquerdo (A1): ' . $this->formatMeasure(self::PLOT_LEFT_CLOSURE_CM) . ' cm',
            'Altura final do molde: ' . $comprimento . ' cm',
            'Diametro da boca: ' . $diametroBoca . ' cm',
            'Largura maxima do gomo: ' . $larguraMaxima . ' cm',
            'Total geral de tacos: ' . $totalTacos,
            '',
            'METRICAS GERAIS',
            'Altura do projeto cheio: ' . $alturaCheio . ' cm',
            'Largura do projeto cheio: ' . $larguraCheio . ' cm',
            'Comprimento do arame da boca: ' . $comprimentoArame . ' cm',
            '',
            'DIVISOES, ALTURA DOS TACOS E QUANTIDADE POR GOMO',
        ];

        foreach (($result['faixasTacos'] ?? []) as $band) {
            $sectionName = strtoupper((string) ($band['secao'] ?? 'DIVISAO'));
            $regionName = ucfirst((string) ($band['regiao'] ?? 'regiao'));
            $inicio = $this->formatMeasure((float) ($band['inicioCm'] ?? 0));
            $fim = $this->formatMeasure((float) ($band['fimCm'] ?? 0));
            $altura = $this->formatMeasure((float) ($band['alturaCm'] ?? 0));
            $alturaTaco = $this->formatMeasure((float) ($band['alturaTacoCm'] ?? 0));
            $tacosPorGomo = (int) ($band['tacosPorGomo'] ?? 0);
            $subindo = (int) ($band['quantidadeVertical'] ?? 0);
            $total = (int) ($band['totalTacos'] ?? 0);

            $lines[] = $sectionName . ' - ' . $regionName;
            $lines[] = 'Faixa da divisao: de ' . $inicio . ' cm ate ' . $fim . ' cm';
            $lines[] = 'Altura desta parte: ' . $altura . ' cm';
            $lines[] = 'Altura de cada taco: ' . $alturaTaco . ' cm';
            $lines[] = 'Quantidade de tacos por gomo: ' . $tacosPorGomo;
            $lines[] = 'Quantidade subindo nesta divisao: ' . $subindo;
            $lines[] = 'Total de tacos nesta divisao: ' . $total;
            $lines[] = '';
        }

        $lines[] = 'TABELA DE PONTOS';
        foreach (($result['tabelaTecnica'] ?? []) as $point) {
            $altura = $this->formatMeasure((float) ($point['alturaCm'] ?? 0));
            $larguraMeia = $this->formatMeasure((float) ($point['larguraMeiaCm'] ?? 0));
            $lines[] = sprintf(
                'P%s | altura=%s cm | largura/2=%s cm',
                $point['ponto'],
                $altura,
                $larguraMeia
            );
        }

        return $this->buildSimplePdf($lines);
    }

    private function formatMeasure(float $value): string
    {
        $formatted = number_format($value, 2, '.', '');
        $formatted = rtrim(rtrim($formatted, '0'), '.');
        return $formatted === '-0' ? '0' : $formatted;
    }

    private function buildSimplePdf(array $lines): string
    {
        $content = "BT\n/F1 10 Tf\n42 800 Td\n";
        foreach ($lines as $index => $line) {
            $escaped = str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $line);
            $content .= ($index === 0 ? '' : "0 -14 Td\n") . '(' . $escaped . ") Tj\n";
        }
        $content .= "ET";

        $objects = [];
        $objects[] = '<< /Type /Catalog /Pages 2 0 R >>';
        $objects[] = '<< /Type /Pages /Count 1 /Kids [ 4 0 R ] >>';
        $objects[] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
        $objects[] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>';
        $objects[] = '<< /Length ' . strlen($content) . " >>\nstream\n" . $content . "\nendstream";

        $pdf = "%PDF-1.4\n";
        $offsets = [0];
        foreach ($objects as $index => $object) {
            $offsets[] = strlen($pdf);
            $pdf .= ($index + 1) . " 0 obj\n" . $object . "\nendobj\n";
        }
        $xref = strlen($pdf);
        $pdf .= 'xref' . "\n0 6\n0000000000 65535 f \n";
        for ($i = 1; $i <= 5; $i++) {
            $pdf .= str_pad((string) $offsets[$i], 10, '0', STR_PAD_LEFT) . " 00000 n \n";
        }
        $pdf .= 'trailer' . "\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" . $xref . "\n%%EOF";

        return $pdf;
    }
}
