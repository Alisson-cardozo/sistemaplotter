<?php

declare(strict_types=1);

namespace App\Services;

use App\Support\Db;

final class NotificationService
{
    public function notifyAdmins(string $type, string $title, string $body): void
    {
        Db::pdo()->prepare('INSERT INTO notifications (user_id, audience, type, title, body) VALUES (NULL, ?, ?, ?, ?)')->execute([
            'admin',
            $type,
            $title,
            $body,
        ]);
    }

    public function notifyUser(int $userId, string $type, string $title, string $body): void
    {
        Db::pdo()->prepare('INSERT INTO notifications (user_id, audience, type, title, body) VALUES (?, ?, ?, ?, ?)')->execute([
            $userId,
            'user',
            $type,
            $title,
            $body,
        ]);
    }

    public function listForAdmin(): array
    {
        $stmt = Db::pdo()->prepare('SELECT id, user_id AS userId, audience, type, title, body, is_read AS isRead, created_at AS createdAt FROM notifications WHERE audience = ? ORDER BY created_at DESC, id DESC LIMIT 100');
        $stmt->execute(['admin']);
        return $stmt->fetchAll() ?: [];
    }

    public function listForUser(int $userId): array
    {
        $stmt = Db::pdo()->prepare('SELECT id, user_id AS userId, audience, type, title, body, is_read AS isRead, created_at AS createdAt FROM notifications WHERE audience = ? AND user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100');
        $stmt->execute(['user', $userId]);
        return $stmt->fetchAll() ?: [];
    }

    public function markAsRead(int $notificationId, string $audience, ?int $userId = null): void
    {
        if ($audience === 'admin') {
            Db::pdo()->prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND audience = ?')->execute([$notificationId, 'admin']);
            return;
        }

        Db::pdo()->prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND audience = ? AND user_id = ?')->execute([
            $notificationId,
            'user',
            $userId,
        ]);
    }
}
