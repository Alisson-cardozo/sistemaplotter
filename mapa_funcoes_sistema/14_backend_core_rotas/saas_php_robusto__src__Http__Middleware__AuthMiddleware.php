<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Core\Request;
use App\Core\Response;
use App\Services\AuthTokenService;

final class AuthMiddleware
{
    public function handle(Request $request, array $params): ?Response
    {
        unset($params);
        $user = (new AuthTokenService())->resolveUser($request->bearerToken());
        if ($user === null) {
            return Response::json(['ok' => false, 'message' => 'Token de acesso invalido ou ausente.'], 401);
        }

        if (($user['access_status'] ?? 'active') === 'blocked') {
            return Response::json(['ok' => false, 'message' => 'Usuario bloqueado.'], 403);
        }

        $request->setAttribute('auth_user', $user);
        return null;
    }
}
