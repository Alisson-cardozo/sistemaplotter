<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Core\Request;
use App\Services\UserService;
use App\Support\Db;

final class AccountController extends BaseController
{
    public function profile(Request $request, array $params)
    {
        unset($params);
        $user = $this->user($request);
        $users = new UserService();
        $name = trim((string) $request->input('name', $user['name'] ?? ''));
        $email = trim(strtolower((string) $request->input('email', $user['email'] ?? '')));
        $phoneWhatsapp = trim((string) $request->input('phoneWhatsapp', $user['phone_whatsapp'] ?? ''));
        $newPassword = trim((string) $request->input('newPassword', ''));

        if ($name === '') {
            return $this->fail('Informe um nome valido.', 422);
        }
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return $this->fail('Informe um email valido.', 422);
        }

        $existing = $users->findUserByEmail($email);
        if ($existing !== null && (int) $existing['id'] !== (int) $user['id']) {
            return $this->fail('Este email ja esta cadastrado em outra conta.', 409);
        }

        if ($newPassword !== '') {
            Db::pdo()->prepare('UPDATE users SET name = ?, email = ?, phone_whatsapp = ?, password_hash = ? WHERE id = ?')->execute([
                $name,
                $email,
                $phoneWhatsapp,
                password_hash($newPassword, PASSWORD_DEFAULT),
                (int) $user['id'],
            ]);
        } else {
            Db::pdo()->prepare('UPDATE users SET name = ?, email = ?, phone_whatsapp = ? WHERE id = ?')->execute([
                $name,
                $email,
                $phoneWhatsapp,
                (int) $user['id'],
            ]);
        }

        $fresh = $users->findUserById((int) $user['id']);
        return $this->ok(['user' => $users->mapUser($fresh ?? $user)]);
    }
}
