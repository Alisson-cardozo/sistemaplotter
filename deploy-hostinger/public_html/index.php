<?php

declare(strict_types=1);

require __DIR__ . '/saas_php_robusto/bootstrap/app.php';

use App\Core\Request;

$app = app();
$response = $app->handle(Request::capture());
$response->send();
