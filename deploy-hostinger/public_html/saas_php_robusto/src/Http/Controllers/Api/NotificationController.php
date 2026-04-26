<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Core\Request;
use App\Services\NotificationService;

final class NotificationController extends BaseController
{
    public function userIndex(Request $request, array $params)
    {
        unset($params);
        $user = $this->user($request);
        $items = (new NotificationService())->listForUser((int) $user['id']);
        return $this->ok(['items' => $items]);
    }

    public function userRead(Request $request, array $params)
    {
        $user = $this->user($request);
        (new NotificationService())->markAsRead((int) ($params['id'] ?? 0), 'user', (int) $user['id']);
        return $this->ok(['message' => 'Notificacao marcada como lida.']);
    }

    public function adminIndex(Request $request, array $params)
    {
        unset($request, $params);
        $items = (new NotificationService())->listForAdmin();
        return $this->ok(['items' => $items]);
    }

    public function adminRead(Request $request, array $params)
    {
        unset($request);
        (new NotificationService())->markAsRead((int) ($params['id'] ?? 0), 'admin');
        return $this->ok(['message' => 'Notificacao marcada como lida.']);
    }
}
