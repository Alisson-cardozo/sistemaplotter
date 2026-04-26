<?php

declare(strict_types=1);

namespace App\Support;

final class Json
{
    public static function boolish(mixed $value): bool
    {
        return in_array($value, [true, 1, '1', 'true'], true);
    }
}
