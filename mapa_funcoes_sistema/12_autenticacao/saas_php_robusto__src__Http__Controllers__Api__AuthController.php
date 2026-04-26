<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Core\Request;
use App\Services\AuthTokenService;
use App\Services\NotificationService;
use App\Services\UserService;
use App\Support\Passwords;

final class AuthController extends BaseController
{
    public function register(Request $request, array $params)
    {
        unset($params);
        $name = trim((string) $request->input('name', ''));
        $email = trim((string) $request->input('email', ''));
        $password = (string) $request->input('password', '');
        if ($name === '' || $email === '' || $password === '') {
            return $this->fail('Informe nome, email e senha.', 422);
        }

        $users = new UserService();
        if ($users->findUserByEmail($email) !== null) {
            return $this->fail('Este email ja esta cadastrado.', 409);
        }

        $user = $users->createUser($name, $email, $password);
        (new NotificationService())->notifyAdmins(
            'new_user',
            'Novo usuario cadastrado',
            sprintf('%s (%s) acabou de criar uma conta na plataforma.', $user['name'] ?? $name, $user['email'] ?? $email)
        );
        $token = (new AuthTokenService())->createToken($user);
        return $this->ok(['user' => $users->mapUser($user), 'token' => $token], 201);
    }

    public function login(Request $request, array $params)
    {
        unset($params);
        $users = new UserService();
        $user = $users->findUserByEmail((string) $request->input('email', ''));
        if ($user === null || !Passwords::verify((string) $request->input('password', ''), (string) $user['password_hash'])) {
            return $this->fail('Credenciais invalidas.', 401);
        }

        if (($user['access_status'] ?? 'active') === 'blocked') {
            return $this->fail('Usuario bloqueado.', 403);
        }

        $token = (new AuthTokenService())->createToken($user);
        return $this->ok(['user' => $users->mapUser($user), 'token' => $token]);
    }

    public function validate(Request $request, array $params)
    {
        unset($params);
        $users = new UserService();
        $user = null;

        if ($request->bearerToken()) {
            $user = (new AuthTokenService())->resolveUser($request->bearerToken());
        }
        if ($user === null && (int) $request->input('id', 0) > 0) {
            $candidate = $users->findUserById((int) $request->input('id', 0));
            if ($candidate !== null && strcasecmp((string) $candidate['email'], (string) $request->input('email', '')) === 0) {
                $user = $candidate;
            }
        }

        if ($user === null) {
            return $this->fail('Sessao invalida.', 401);
        }

        return $this->ok(['user' => $users->mapUser($user)]);
    }

    public function logout(Request $request, array $params)
    {
        unset($params);
        (new AuthTokenService())->revokeToken($request->bearerToken());
        return $this->ok(['message' => 'Sessao encerrada com sucesso.']);
    }
}
