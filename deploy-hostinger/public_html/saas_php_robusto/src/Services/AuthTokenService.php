<?php

declare(strict_types=1);

namespace App\Services;

use App\Support\Db;

final class AuthTokenService
{
    public function createToken(array $user): string
    {
        $plain = bin2hex(random_bytes(32));
        $hash = hash('sha256', $plain);
        Db::pdo()->prepare('INSERT INTO api_tokens (user_id, token_hash, last_used_at, expires_at) VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 30 DAY))')->execute([
            (int) $user['id'],
            $hash,
        ]);
        return $plain;
    }

    public function resolveUser(?string $plainToken): ?array
    {
        if ($plainToken === null || $plainToken === '') {
            return null;
        }

        $stmt = Db::pdo()->prepare('SELECT u.*, t.id AS token_id FROM api_tokens t INNER JOIN users u ON u.id = t.user_id WHERE t.token_hash = ? AND (t.expires_at IS NULL OR t.expires_at > NOW()) LIMIT 1');
        $stmt->execute([hash('sha256', $plainToken)]);
        $user = $stmt->fetch();
        if (!is_array($user)) {
            return null;
        }

        Db::pdo()->prepare('UPDATE api_tokens SET last_used_at = NOW() WHERE id = ?')->execute([(int) $user['token_id']]);
        return $user;
    }

    public function revokeToken(?string $plainToken): void
    {
        if ($plainToken === null || $plainToken === '') {
            return;
        }

        Db::pdo()->prepare('DELETE FROM api_tokens WHERE token_hash = ?')->execute([hash('sha256', $plainToken)]);
    }
}
