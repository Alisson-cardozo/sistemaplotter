<?php

declare(strict_types=1);

require __DIR__ . '/../bootstrap/app.php';

use App\Core\Request;

$app = app();
$response = $app->handle(Request::capture());
$response->send();
