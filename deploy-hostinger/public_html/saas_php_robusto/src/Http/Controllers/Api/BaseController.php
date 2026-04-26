<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Core\Request;
use App\Core\Response;

abstract class BaseController
{
    protected function ok(array $payload = [], int $status = 200): Response
    {
        return Response::json(array_merge(['ok' => true], $payload), $status);
    }

    protected function fail(string $message, int $status = 400, array $extra = []): Response
    {
        return Response::json(array_merge(['ok' => false, 'message' => $message], $extra), $status);
    }

    protected function user(Request $request): array
    {
        $user = $request->attribute('auth_user');
        if (!is_array($user)) {
            throw new \RuntimeException('Usuario autenticado nao encontrado.');
        }

        return $user;
    }
}
