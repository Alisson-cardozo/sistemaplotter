<?php

declare(strict_types=1);

namespace App\Support;

use PDO;

final class Db
{
    public static function pdo(): PDO
    {
        return app()->db->connection();
    }
}
