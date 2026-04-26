<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Core\Request;
use App\Core\Response;

final class AdminMiddleware
{
    public function handle(Request $request, array $params): ?Response
    {
        unset($params);
        $user = $request->attribute('auth_user');
        if (!is_array($user) || ($user['role'] ?? 'user') !== 'admin') {
            return Response::json(['ok' => false, 'message' => 'Acesso restrito ao administrador.'], 403);
        }

        return null;
    }
}
