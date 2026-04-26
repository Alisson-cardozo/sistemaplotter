<?php

declare(strict_types=1);

spl_autoload_register(function (string $class): void {
    $prefix = 'App\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }

    $relative = substr($class, strlen($prefix));
    $file = __DIR__ . '/../src/' . str_replace('\\', DIRECTORY_SEPARATOR, $relative) . '.php';
    if (is_file($file)) {
        require $file;
    }
});

use App\Core\Application;
use App\Core\Database;
use App\Support\Env;

Env::load(__DIR__ . '/../.env');

$app = new Application(new Database([
    'driver' => Env::get('DB_DRIVER', 'mysql'),
    'host' => Env::get('DB_HOST', '127.0.0.1'),
    'port' => (int) Env::get('DB_PORT', '3306'),
    'database' => Env::get('DB_DATABASE', ''),
    'username' => Env::get('DB_USERNAME', ''),
    'password' => Env::get('DB_PASSWORD', ''),
]));

require __DIR__ . '/../routes/api.php';

function app(): Application
{
    global $app;
    return $app;
}
