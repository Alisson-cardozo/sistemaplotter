<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Core\Request;
use App\Services\UserService;
use App\Support\Db;
use App\Support\Mailer;
use App\Support\Passwords;

final class AdminController extends BaseController
{
    public function users(Request $request, array $params)
    {
        unset($request, $params);
        $rows = Db::pdo()->query('SELECT * FROM users ORDER BY created_at DESC')->fetchAll();
        $service = new UserService();
        return $this->ok(['items' => array_map(fn (array $row): array => $service->mapUser($row), $rows)]);
    }

    public function updateAccess(Request $request, array $params)
    {
        Db::pdo()->prepare('UPDATE users SET access_status = ? WHERE id = ?')->execute([
            trim((string) $request->input('accessStatus', 'active')) === 'blocked' ? 'blocked' : 'active',
            (int) ($params['id'] ?? 0),
        ]);
        return $this->ok(['message' => 'Acesso atualizado com sucesso.']);
    }

    public function profile(Request $request, array $params)
    {
        $targetId = (int) ($params['id'] ?? 0);
        $name = trim((string) $request->input('name', ''));
        $email = trim(strtolower((string) $request->input('email', '')));

        if ($targetId <= 0) {
            return $this->fail('Usuario invalido.', 422);
        }
        if ($name === '') {
            return $this->fail('Informe um nome valido.', 422);
        }
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return $this->fail('Informe um email valido.', 422);
        }

        $users = new UserService();
        $existing = $users->findUserByEmail($email);
        if ($existing !== null && (int) $existing['id'] !== $targetId) {
            return $this->fail('Este email ja esta cadastrado em outra conta.', 409);
        }

        Db::pdo()->prepare('UPDATE users SET name = ?, email = ? WHERE id = ?')->execute([
            $name,
            $email,
            $targetId,
        ]);

        $fresh = $users->findUserById($targetId);
        return $this->ok([
            'message' => 'Perfil do usuario atualizado com sucesso.',
            'user' => $fresh !== null ? $users->mapUser($fresh) : null,
        ]);
    }

    public function grant(Request $request, array $params)
    {
        Db::pdo()->prepare('UPDATE users SET is_paid = 1, manual_access_expires_at = DATE_ADD(NOW(), INTERVAL ? DAY), manual_access_bandeiras = ?, manual_access_painel = ?, manual_access_plotagem_gomo = ?, manual_access_tabela_molde = ?, manual_access_moldes_salvos = ?, manual_access_storefront = ? WHERE id = ?')->execute([
            max(1, (int) $request->input('days', 30)),
            $request->input('accessBandeiras', false) ? 1 : 0,
            $request->input('accessPainel', false) ? 1 : 0,
            $request->input('accessPlotagemGomo', true) ? 1 : 0,
            $request->input('accessTabelaMolde', true) ? 1 : 0,
            $request->input('accessMoldesSalvos', true) ? 1 : 0,
            $request->input('accessStorefront', false) ? 1 : 0,
            (int) ($params['id'] ?? 0),
        ]);
        return $this->ok(['message' => 'Acesso manual liberado.']);
    }

    public function revokeGrant(Request $request, array $params)
    {
        unset($request);
        Db::pdo()->prepare('UPDATE users SET manual_access_expires_at = NULL, manual_access_bandeiras = 0, manual_access_painel = 0, manual_access_plotagem_gomo = 0, manual_access_tabela_molde = 0, manual_access_moldes_salvos = 0, manual_access_storefront = 0 WHERE id = ?')->execute([(int) ($params['id'] ?? 0)]);
        return $this->ok(['message' => 'Permissao manual revogada.']);
    }

    public function password(Request $request, array $params)
    {
        Db::pdo()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([
            Passwords::hash((string) $request->input('password', '')),
            (int) ($params['id'] ?? 0),
        ]);
        return $this->ok(['message' => 'Senha atualizada com sucesso.']);
    }

    public function paymentSettings(Request $request, array $params)
    {
        unset($request, $params);
        $row = Db::pdo()->query('SELECT public_key AS publicKey, access_token AS accessToken, webhook_secret AS webhookSecret, updated_at AS updatedAt FROM payment_settings WHERE id = 1 LIMIT 1')->fetch();
        return $this->ok(['settings' => $row ?: new \stdClass()]);
    }

    public function savePaymentSettings(Request $request, array $params)
    {
        unset($params);
        Db::pdo()->prepare('INSERT INTO payment_settings (id, public_key, access_token, webhook_secret) VALUES (1, ?, ?, ?) ON DUPLICATE KEY UPDATE public_key = VALUES(public_key), access_token = VALUES(access_token), webhook_secret = VALUES(webhook_secret)')->execute([
            trim((string) $request->input('publicKey', '')),
            trim((string) $request->input('accessToken', '')),
            trim((string) $request->input('webhookSecret', '')),
        ]);
        return $this->ok(['message' => 'Credenciais salvas com sucesso.']);
    }

    public function message(Request $request, array $params)
    {
        unset($params);
        Db::pdo()->prepare('INSERT INTO admin_messages (user_id, subject, message) VALUES (?, ?, ?)')->execute([
            (int) $request->input('userId', 0),
            trim((string) $request->input('subject', '')),
            trim((string) $request->input('message', '')),
        ]);
        return $this->ok(['message' => 'Mensagem registrada com sucesso.'], 201);
    }

    public function sendMoldEmail(Request $request, array $params)
    {
        unset($params);
        try {
            Mailer::send(
                trim((string) $request->input('email', '')),
                'Molde taqueado - ' . trim((string) $request->input('projectName', 'Projeto')),
                [
                    'body' => (string) $request->input('body', ''),
                    'summary' => $request->input('summary', []),
                    'parts' => $request->input('parts', []),
                    'deliveryMode' => (string) $request->input('deliveryMode', ''),
                    'files' => $request->input('files', []),
                ]
            );
            return $this->ok(['message' => 'Arquivos enviados com sucesso.']);
        } catch (\Throwable $exception) {
            return $this->fail('Falha ao enviar o email: ' . $exception->getMessage(), 500);
        }
    }
}
