<?php

declare(strict_types=1);

namespace App\Domain\Pattern;

final class Math
{
    public static function roundTo(float $value, int $precision = 1): float
    {
        return round($value, $precision);
    }

    public static function polygonArea(array $points): float
    {
        $count = count($points);
        if ($count < 3) {
            return 0.0;
        }

        $sum = 0.0;
        for ($i = 0; $i < $count; $i++) {
            $next = ($i + 1) % $count;
            $sum += ($points[$i]['x'] * $points[$next]['y']) - ($points[$next]['x'] * $points[$i]['y']);
        }

        return abs($sum) / 2;
    }

    public static function polylineLength(array $points): float
    {
        if (count($points) < 2) {
            return 0.0;
        }

        $length = 0.0;
        for ($i = 1; $i < count($points); $i++) {
            $dx = $points[$i]['x'] - $points[$i - 1]['x'];
            $dy = $points[$i]['y'] - $points[$i - 1]['y'];
            $length += sqrt(($dx * $dx) + ($dy * $dy));
        }

        return $length;
    }

    public static function frustumVolume(float $height, float $radiusA, float $radiusB): float
    {
        return (M_PI * $height * (($radiusA * $radiusA) + ($radiusA * $radiusB) + ($radiusB * $radiusB))) / 3;
    }
}
