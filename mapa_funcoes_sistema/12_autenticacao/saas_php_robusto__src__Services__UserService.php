<?php

declare(strict_types=1);

namespace App\Services;

use App\Support\Db;
use App\Support\Passwords;

final class UserService
{
    public function createUser(string $name, string $email, string $password, string $role = 'user'): array
    {
        Db::pdo()->prepare('INSERT INTO users (name, email, password_hash, role, access_status) VALUES (?, ?, ?, ?, ?)')->execute([
            trim($name),
            trim(strtolower($email)),
            Passwords::hash($password),
            $role === 'admin' ? 'admin' : 'user',
            'active',
        ]);

        return $this->findUserById((int) Db::pdo()->lastInsertId()) ?? [];
    }

    public function findUserByEmail(string $email): ?array
    {
        $stmt = Db::pdo()->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
        $stmt->execute([trim(strtolower($email))]);
        $user = $stmt->fetch();
        return is_array($user) ? $user : null;
    }

    public function findUserById(int $id): ?array
    {
        $stmt = Db::pdo()->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $user = $stmt->fetch();
        return is_array($user) ? $user : null;
    }

    public function mapUser(array $user): array
    {
        $effective = $this->effectiveAccess($user);

        return [
            'id' => (int) $user['id'],
            'name' => $user['name'],
            'email' => $user['email'],
            'role' => $user['role'] === 'admin' ? 'admin' : 'user',
            'isPaid' => $effective['isPaid'],
            'accessStatus' => $user['access_status'],
            'accessExpiresAt' => $effective['accessExpiresAt'],
            'accessBandeiras' => $effective['permissions']['accessBandeiras'],
            'accessPainel' => $effective['permissions']['accessPainel'],
            'accessPlotagemGomo' => $effective['permissions']['accessPlotagemGomo'],
            'accessTabelaMolde' => $effective['permissions']['accessTabelaMolde'],
            'accessMoldesSalvos' => $effective['permissions']['accessMoldesSalvos'],
            'accessStorefront' => $effective['permissions']['accessStorefront'],
            'permissions' => $effective['permissions'],
            'storefrontActive' => $effective['storefrontActive'],
            'createdAt' => $user['created_at'] ?? null,
        ];
    }

    public function permissions(array $user): array
    {
        return $this->effectiveAccess($user)['permissions'];
    }

    public function storefrontActive(array $user): bool
    {
        return $this->effectiveAccess($user)['storefrontActive'];
    }

    public function effectiveAccess(array $user): array
    {
        if (($user['role'] ?? 'user') === 'admin') {
            return [
                'isPaid' => true,
                'accessExpiresAt' => null,
                'permissions' => [
                    'accessBandeiras' => true,
                    'accessPainel' => true,
                    'accessPlotagemGomo' => true,
                    'accessTabelaMolde' => true,
                    'accessMoldesSalvos' => true,
                    'accessStorefront' => true,
                ],
                'storefrontActive' => true,
            ];
        }

        $isBlocked = ($user['access_status'] ?? 'active') === 'blocked';
        $planExpiresAt = $this->normalizeFutureDate($user['plan_expires_at'] ?? null);
        $manualExpiresAt = $this->normalizeFutureDate($user['manual_access_expires_at'] ?? null);
        $hasActiveEntitlement = !$isBlocked && ($planExpiresAt !== null || $manualExpiresAt !== null);
        $permissions = [
            'accessBandeiras' => $hasActiveEntitlement && (bool) ($user['manual_access_bandeiras'] ?? 0),
            'accessPainel' => $hasActiveEntitlement && (bool) ($user['manual_access_painel'] ?? 0),
            'accessPlotagemGomo' => $hasActiveEntitlement && (bool) ($user['manual_access_plotagem_gomo'] ?? 0),
            'accessTabelaMolde' => $hasActiveEntitlement && (bool) ($user['manual_access_tabela_molde'] ?? 0),
            'accessMoldesSalvos' => $hasActiveEntitlement && (bool) ($user['manual_access_moldes_salvos'] ?? 0),
            'accessStorefront' => $hasActiveEntitlement && (bool) ($user['manual_access_storefront'] ?? 0),
        ];

        return [
            'isPaid' => $hasActiveEntitlement,
            'accessExpiresAt' => $planExpiresAt ?? $manualExpiresAt,
            'permissions' => $permissions,
            'storefrontActive' => $permissions['accessStorefront'],
        ];
    }

    public function assertFeature(array $user, string $permission): void
    {
        if (($user['role'] ?? 'user') === 'admin') {
            return;
        }

        $permissionMap = [
            'bandeiras' => 'manual_access_bandeiras',
            'painel' => 'manual_access_painel',
            'plotagem' => 'manual_access_plotagem_gomo',
            'tabela_molde' => 'manual_access_tabela_molde',
            'moldes_salvos' => 'manual_access_moldes_salvos',
            'storefront' => 'manual_access_storefront',
        ];

        $effectivePermissionMap = [
            'manual_access_bandeiras' => 'accessBandeiras',
            'manual_access_painel' => 'accessPainel',
            'manual_access_plotagem_gomo' => 'accessPlotagemGomo',
            'manual_access_tabela_molde' => 'accessTabelaMolde',
            'manual_access_moldes_salvos' => 'accessMoldesSalvos',
            'manual_access_storefront' => 'accessStorefront',
        ];

        $column = $permissionMap[$permission] ?? null;
        $effectivePermission = $column !== null ? ($effectivePermissionMap[$column] ?? null) : null;
        $permissions = $this->permissions($user);
        if ($effectivePermission === null || empty($permissions[$effectivePermission])) {
            throw new \RuntimeException('Usuario sem permissao para este recurso.');
        }
    }

    private function normalizeFutureDate(mixed $value): ?string
    {
        $date = is_string($value) ? trim($value) : '';
        if ($date === '') {
            return null;
        }

        $timestamp = strtotime($date);
        if ($timestamp === false || $timestamp <= time()) {
            return null;
        }

        return $date;
    }
}
