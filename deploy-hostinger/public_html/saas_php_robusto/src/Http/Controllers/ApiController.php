<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Core\Request;
use App\Core\Response;
use App\Support\Db;
use App\Support\Json;
use App\Support\Mailer;
use App\Support\Passwords;
use App\Support\Payments;
use App\Support\Uploads;

final class ApiController
{
    public function health(Request $request, array $params): Response
    {
        unset($request, $params);
        return Response::json(['ok' => true, 'status' => 'online', 'app' => 'saas_php_robusto']);
    }

    public function register(Request $request, array $params): Response
    {
        unset($params);
        $name = trim((string) $request->input('name', ''));
        $email = trim((string) $request->input('email', ''));
        $password = (string) $request->input('password', '');
        if ($name === '' || $email === '' || $password === '') {
            return Response::json(['ok' => false, 'message' => 'Informe nome, email e senha.'], 422);
        }

        Db::pdo()->prepare('INSERT INTO users (name, email, password_hash, role, access_status) VALUES (?, ?, ?, ?, ?)')->execute([
            $name,
            $email,
            Passwords::hash($password),
            'user',
            'active',
        ]);

        return $this->login(new Request('POST', '/api/auth/login', [], ['email' => $email, 'password' => $password], []), []);
    }

    public function login(Request $request, array $params): Response
    {
        unset($params);
        $stmt = Db::pdo()->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
        $stmt->execute([trim((string) $request->input('email', ''))]);
        $user = $stmt->fetch();

        if (!$user || !Passwords::verify((string) $request->input('password', ''), $user['password_hash'])) {
            return Response::json(['ok' => false, 'message' => 'Credenciais invalidas.'], 401);
        }

        return Response::json(['ok' => true, 'user' => $this->mapUser($user)]);
    }

    public function validate(Request $request, array $params): Response
    {
        unset($params);
        $stmt = Db::pdo()->prepare('SELECT * FROM users WHERE id = ? AND email = ? LIMIT 1');
        $stmt->execute([(int) $request->input('id', 0), trim((string) $request->input('email', ''))]);
        $user = $stmt->fetch();
        if (!$user) {
            return Response::json(['ok' => false, 'message' => 'Sessao invalida.'], 401);
        }
        return Response::json(['ok' => true, 'user' => $this->mapUser($user)]);
    }

    public function updateProfile(Request $request, array $params): Response
    {
        unset($params);
        Db::pdo()->prepare('UPDATE users SET name = ?, phone_whatsapp = ? WHERE id = ?')->execute([
            trim((string) $request->input('name', '')),
            trim((string) $request->input('phoneWhatsapp', '')),
            (int) $request->input('userId', 0),
        ]);

        $stmt = Db::pdo()->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([(int) $request->input('userId', 0)]);
        return Response::json(['ok' => true, 'user' => $this->mapUser($stmt->fetch())]);
    }

    public function listMarketplaceProducts(Request $request, array $params): Response
    {
        unset($request, $params);
        $rows = Db::pdo()->query('SELECT p.*, u.name AS seller_name FROM marketplace_products p INNER JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC')->fetchAll();
        $items = array_map(fn (array $row) => [
            'id' => (int) $row['id'],
            'userId' => (int) $row['user_id'],
            'sellerName' => $row['seller_name'],
            'name' => $row['name'],
            'description' => $row['description'],
            'price' => (float) $row['price'],
            'images' => json_decode($row['images_json'] ?: '[]', true) ?: array_values(array_filter([$row['image_url'] ?? null])),
            'whatsapp' => $row['whatsapp_number'],
            'sold' => $row['status'] === 'sold',
            'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at'],
        ], $rows);
        return Response::json(['ok' => true, 'items' => $items]);
    }

    public function uploadPlanImage(Request $request, array $params): Response
    {
        unset($params);
        return Response::json(['ok' => true, 'imagePath' => Uploads::persistBase64Image((string) $request->input('imageDataUrl', ''), 'plans', 'plan')]);
    }

    public function uploadMarketplaceImage(Request $request, array $params): Response
    {
        unset($params);
        return Response::json(['ok' => true, 'imagePath' => Uploads::persistBase64Image((string) $request->input('imageDataUrl', ''), 'marketplace', 'product')]);
    }

    public function createMarketplaceProduct(Request $request, array $params): Response
    {
        unset($params);
        $images = $request->input('images', []);
        $primary = is_array($images) && isset($images[0]) ? (string) $images[0] : '';
        Db::pdo()->prepare('INSERT INTO marketplace_products (user_id, name, description, price, image_url, images_json, whatsapp_number, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')->execute([
            (int) $request->input('userId', 0),
            trim((string) $request->input('name', '')),
            trim((string) $request->input('description', '')),
            (float) $request->input('price', 0),
            $primary,
            json_encode($images, JSON_UNESCAPED_UNICODE),
            trim((string) $request->input('whatsapp', '')),
            'active',
        ]);
        return Response::json(['ok' => true, 'message' => 'Produto publicado com sucesso.'], 201);
    }

    public function updateMarketplaceProduct(Request $request, array $params): Response
    {
        $images = $request->input('images', []);
        $primary = is_array($images) && isset($images[0]) ? (string) $images[0] : '';
        Db::pdo()->prepare('UPDATE marketplace_products SET name = ?, description = ?, price = ?, image_url = ?, images_json = ?, whatsapp_number = ? WHERE id = ?')->execute([
            trim((string) $request->input('name', '')),
            trim((string) $request->input('description', '')),
            (float) $request->input('price', 0),
            $primary,
            json_encode($images, JSON_UNESCAPED_UNICODE),
            trim((string) $request->input('whatsapp', '')),
            (int) ($params['id'] ?? 0),
        ]);
        return Response::json(['ok' => true, 'message' => 'Produto atualizado com sucesso.']);
    }

    public function updateMarketplaceStatus(Request $request, array $params): Response
    {
        Db::pdo()->prepare('UPDATE marketplace_products SET status = ? WHERE id = ?')->execute([
            Json::boolish($request->input('sold', false)) ? 'sold' : 'active',
            (int) ($params['id'] ?? 0),
        ]);
        return Response::json(['ok' => true, 'message' => 'Status atualizado.']);
    }

    public function listMolds(Request $request, array $params): Response
    {
        unset($request, $params);
        $items = Db::pdo()->query('SELECT id, nome_projeto AS nomeProjeto, modelo, quantidade_gomos AS quantidadeGomos, comprimento_gomo_cm AS comprimentoGomoCm, created_at AS createdAt FROM moldes ORDER BY created_at DESC')->fetchAll();
        return Response::json(['ok' => true, 'items' => $items]);
    }

    public function showMold(Request $request, array $params): Response
    {
        unset($request);
        $stmt = Db::pdo()->prepare('SELECT id, payload_json FROM moldes WHERE id = ? LIMIT 1');
        $stmt->execute([(int) ($params['id'] ?? 0)]);
        $item = $stmt->fetch();
        if (!$item) {
            return Response::json(['ok' => false, 'message' => 'Molde nao encontrado.'], 404);
        }
        return Response::json(['ok' => true, 'id' => (int) $item['id'], 'payload' => json_decode($item['payload_json'], true)]);
    }

    public function createMold(Request $request, array $params): Response
    {
        unset($params);
        $input = $request->input('input', []);
        $moldName = trim((string) ($input['modelo'] ?? '')) !== ''
            ? trim((string) ($input['modelo'] ?? ''))
            : (trim((string) ($input['projeto'] ?? '')) !== '' ? trim((string) ($input['projeto'] ?? '')) : 'Sem nome');
        Db::pdo()->prepare('INSERT INTO moldes (user_id, nome_projeto, modelo, quantidade_gomos, comprimento_gomo_cm, diametro_boca_cm, bainha_cm, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')->execute([
            isset($request->body['userId']) ? (int) $request->input('userId', 0) : null,
            $moldName,
            $input['modelo'] ?? 'nao-informado',
            (int) ($input['quantidadeGomos'] ?? 0),
            (float) ($input['comprimentoGomoCm'] ?? 0),
            (float) ($input['diametroBocaCm'] ?? 0),
            (float) ($input['bainhaCm'] ?? 0),
            json_encode($request->body, JSON_UNESCAPED_UNICODE),
        ]);
        return Response::json(['ok' => true, 'message' => 'Molde salvo com sucesso.'], 201);
    }

    public function listUsers(Request $request, array $params): Response
    {
        unset($request, $params);
        $rows = Db::pdo()->query('SELECT * FROM users ORDER BY created_at DESC')->fetchAll();
        return Response::json(['ok' => true, 'items' => array_map(fn (array $row) => $this->mapAdminUser($row), $rows)]);
    }

    public function updateUserAccess(Request $request, array $params): Response
    {
        Db::pdo()->prepare('UPDATE users SET access_status = ? WHERE id = ?')->execute([
            trim((string) $request->input('accessStatus', 'active')) === 'blocked' ? 'blocked' : 'active',
            (int) ($params['id'] ?? 0),
        ]);
        return Response::json(['ok' => true, 'message' => 'Acesso atualizado com sucesso.']);
    }

    public function grantUserAccess(Request $request, array $params): Response
    {
        Db::pdo()->prepare('UPDATE users SET is_paid = 1, manual_access_expires_at = DATE_ADD(NOW(), INTERVAL ? DAY), manual_access_bandeiras = ?, manual_access_painel = ?, manual_access_plotagem_gomo = ?, manual_access_tabela_molde = ?, manual_access_moldes_salvos = ?, manual_access_storefront = ? WHERE id = ?')->execute([
            max(1, (int) $request->input('days', 30)),
            Json::boolish($request->input('accessBandeiras', false)) ? 1 : 0,
            Json::boolish($request->input('accessPainel', false)) ? 1 : 0,
            Json::boolish($request->input('accessPlotagemGomo', true)) ? 1 : 0,
            Json::boolish($request->input('accessTabelaMolde', true)) ? 1 : 0,
            Json::boolish($request->input('accessMoldesSalvos', true)) ? 1 : 0,
            Json::boolish($request->input('accessStorefront', false)) ? 1 : 0,
            (int) ($params['id'] ?? 0),
        ]);
        return Response::json(['ok' => true, 'message' => 'Acesso manual liberado.']);
    }

    public function revokeUserGrant(Request $request, array $params): Response
    {
        unset($request);
        Db::pdo()->prepare('UPDATE users SET manual_access_expires_at = NULL, manual_access_bandeiras = 0, manual_access_painel = 0, manual_access_plotagem_gomo = 0, manual_access_tabela_molde = 0, manual_access_moldes_salvos = 0, manual_access_storefront = 0 WHERE id = ?')->execute([(int) ($params['id'] ?? 0)]);
        return Response::json(['ok' => true, 'message' => 'Permissao manual revogada.']);
    }

    public function updateUserPassword(Request $request, array $params): Response
    {
        Db::pdo()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([
            Passwords::hash((string) $request->input('password', '')),
            (int) ($params['id'] ?? 0),
        ]);
        return Response::json(['ok' => true, 'message' => 'Senha atualizada com sucesso.']);
    }

    public function listAdminPlans(Request $request, array $params): Response
    {
        unset($request, $params);
        $items = Db::pdo()->query('SELECT id, name, description, price, duration_days AS durationDays, image_path AS imageDataUrl, is_promo AS isPromo, is_most_popular AS isMostPopular, access_bandeiras AS accessBandeiras, access_painel AS accessPainel, access_plotagem_gomo AS accessPlotagemGomo, access_tabela_molde AS accessTabelaMolde, access_moldes_salvos AS accessMoldesSalvos, access_storefront AS accessStorefront, status, created_at AS createdAt FROM subscription_plans ORDER BY created_at DESC')->fetchAll();
        foreach ($items as &$item) {
            $item['imageDataUrl'] = Uploads::ensurePublicUrl((string) ($item['imageDataUrl'] ?? ''));
        }
        unset($item);
        return Response::json(['ok' => true, 'items' => $items]);
    }

    public function listPublicPlans(Request $request, array $params): Response
    {
        unset($request, $params);
        $items = Db::pdo()->query("SELECT id, name, description, price, duration_days AS durationDays, image_path AS imageDataUrl, is_promo AS isPromo, is_most_popular AS isMostPopular, access_bandeiras AS accessBandeiras, access_painel AS accessPainel, access_plotagem_gomo AS accessPlotagemGomo, access_tabela_molde AS accessTabelaMolde, access_moldes_salvos AS accessMoldesSalvos, access_storefront AS accessStorefront, status FROM subscription_plans WHERE status = 'active' ORDER BY price ASC")->fetchAll();
        foreach ($items as &$item) {
            $item['imageDataUrl'] = Uploads::ensurePublicUrl((string) ($item['imageDataUrl'] ?? ''));
        }
        unset($item);
        return Response::json(['ok' => true, 'items' => $items]);
    }

    public function createPlan(Request $request, array $params): Response
    {
        unset($params);
        Db::pdo()->prepare('INSERT INTO subscription_plans (name, description, price, duration_days, image_path, is_promo, is_most_popular, access_bandeiras, access_painel, access_plotagem_gomo, access_tabela_molde, access_moldes_salvos, access_storefront, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')->execute([
            trim((string) $request->input('name', '')),
            trim((string) $request->input('description', '')),
            (float) $request->input('price', 0),
            max(1, (int) $request->input('durationDays', 30)),
            trim((string) $request->input('imageDataUrl', '')),
            Json::boolish($request->input('isPromo', false)) ? 1 : 0,
            Json::boolish($request->input('isMostPopular', false)) ? 1 : 0,
            Json::boolish($request->input('accessBandeiras', false)) ? 1 : 0,
            Json::boolish($request->input('accessPainel', false)) ? 1 : 0,
            Json::boolish($request->input('accessPlotagemGomo', true)) ? 1 : 0,
            Json::boolish($request->input('accessTabelaMolde', true)) ? 1 : 0,
            Json::boolish($request->input('accessMoldesSalvos', true)) ? 1 : 0,
            Json::boolish($request->input('accessStorefront', false)) ? 1 : 0,
            trim((string) $request->input('status', 'active')) === 'inactive' ? 'inactive' : 'active',
        ]);
        return Response::json(['ok' => true, 'message' => 'Plano criado com sucesso.'], 201);
    }

    public function updatePlan(Request $request, array $params): Response
    {
        Db::pdo()->prepare('UPDATE subscription_plans SET name = ?, description = ?, price = ?, duration_days = ?, image_path = ?, is_promo = ?, is_most_popular = ?, access_bandeiras = ?, access_painel = ?, access_plotagem_gomo = ?, access_tabela_molde = ?, access_moldes_salvos = ?, access_storefront = ?, status = ? WHERE id = ?')->execute([
            trim((string) $request->input('name', '')),
            trim((string) $request->input('description', '')),
            (float) $request->input('price', 0),
            max(1, (int) $request->input('durationDays', 30)),
            trim((string) $request->input('imageDataUrl', '')),
            Json::boolish($request->input('isPromo', false)) ? 1 : 0,
            Json::boolish($request->input('isMostPopular', false)) ? 1 : 0,
            Json::boolish($request->input('accessBandeiras', false)) ? 1 : 0,
            Json::boolish($request->input('accessPainel', false)) ? 1 : 0,
            Json::boolish($request->input('accessPlotagemGomo', true)) ? 1 : 0,
            Json::boolish($request->input('accessTabelaMolde', true)) ? 1 : 0,
            Json::boolish($request->input('accessMoldesSalvos', true)) ? 1 : 0,
            Json::boolish($request->input('accessStorefront', false)) ? 1 : 0,
            trim((string) $request->input('status', 'active')) === 'inactive' ? 'inactive' : 'active',
            (int) ($params['id'] ?? 0),
        ]);
        return Response::json(['ok' => true, 'message' => 'Plano atualizado com sucesso.']);
    }

    public function deletePlan(Request $request, array $params): Response
    {
        unset($request);
        Db::pdo()->prepare('DELETE FROM subscription_plans WHERE id = ?')->execute([(int) ($params['id'] ?? 0)]);
        return Response::json(['ok' => true, 'message' => 'Plano excluido com sucesso.']);
    }

    public function getPaymentSettings(Request $request, array $params): Response
    {
        unset($request, $params);
        $row = Db::pdo()->query('SELECT public_key AS publicKey, access_token AS accessToken, webhook_secret AS webhookSecret, updated_at AS updatedAt FROM payment_settings WHERE id = 1 LIMIT 1')->fetch();
        return Response::json(['ok' => true, 'settings' => $row ?: new \stdClass()]);
    }

    public function savePaymentSettings(Request $request, array $params): Response
    {
        unset($params);
        Db::pdo()->prepare('INSERT INTO payment_settings (id, public_key, access_token, webhook_secret) VALUES (1, ?, ?, ?) ON DUPLICATE KEY UPDATE public_key = VALUES(public_key), access_token = VALUES(access_token), webhook_secret = VALUES(webhook_secret)')->execute([
            trim((string) $request->input('publicKey', '')),
            trim((string) $request->input('accessToken', '')),
            trim((string) $request->input('webhookSecret', '')),
        ]);
        return Response::json(['ok' => true, 'message' => 'Credenciais salvas com sucesso.']);
    }

    public function createCheckout(Request $request, array $params): Response
    {
        unset($params);
        $stmt = Db::pdo()->prepare('SELECT * FROM subscription_plans WHERE id = ? LIMIT 1');
        $stmt->execute([(int) $request->input('planId', 0)]);
        $plan = $stmt->fetch();
        if (!$plan) {
            return Response::json(['ok' => false, 'message' => 'Plano nao encontrado.'], 404);
        }

        $checkout = Payments::createCheckout((int) $plan['id'], (int) $request->input('userId', 0), (float) $plan['price'], (int) $plan['duration_days'], $plan['name']);
        Db::pdo()->prepare('INSERT INTO plan_orders (user_id, plan_id, external_reference, payment_status, amount, duration_days, pix_code, qr_code_base64, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')->execute([
            $checkout['user_id'],
            $checkout['plan_id'],
            $checkout['external_reference'],
            $checkout['payment_status'],
            $checkout['amount'],
            $checkout['duration_days'],
            $checkout['pix_code'],
            $checkout['qr_code_base64'],
            $checkout['expires_at'],
        ]);
        $orderId = (int) Db::pdo()->lastInsertId();

        return Response::json(['ok' => true, 'checkout' => [
            'orderId' => $orderId,
            'paymentStatus' => $checkout['payment_status'],
            'qrCodeBase64' => $checkout['qr_code_base64'],
            'pixCode' => $checkout['pix_code'],
            'expiresAt' => date(DATE_ATOM, strtotime($checkout['expires_at'])),
            'planName' => $checkout['plan_name'],
            'amount' => $checkout['amount'],
            'durationDays' => $checkout['duration_days'],
        ]]);
    }

    public function showCheckout(Request $request, array $params): Response
    {
        $stmt = Db::pdo()->prepare('SELECT o.*, p.name AS plan_name FROM plan_orders o INNER JOIN subscription_plans p ON p.id = o.plan_id WHERE o.id = ? AND o.user_id = ? LIMIT 1');
        $stmt->execute([(int) ($params['id'] ?? 0), (int) ($request->query['userId'] ?? 0)]);
        $order = $stmt->fetch();
        if (!$order) {
            return Response::json(['ok' => false, 'message' => 'Checkout nao encontrado.'], 404);
        }

        $userStmt = Db::pdo()->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
        $userStmt->execute([(int) $order['user_id']]);
        return Response::json(['ok' => true, 'checkout' => [
            'orderId' => (int) $order['id'],
            'paymentStatus' => $order['payment_status'],
            'qrCodeBase64' => $order['qr_code_base64'] ?? '',
            'pixCode' => $order['pix_code'] ?? '',
            'expiresAt' => $order['expires_at'] ? date(DATE_ATOM, strtotime($order['expires_at'])) : null,
            'planName' => $order['plan_name'],
            'amount' => (float) $order['amount'],
            'durationDays' => (int) $order['duration_days'],
        ], 'user' => $this->mapUser($userStmt->fetch())]);
    }

    public function cancelCheckout(Request $request, array $params): Response
    {
        Db::pdo()->prepare("UPDATE plan_orders SET payment_status = 'cancelled', cancelled_at = NOW() WHERE id = ? AND user_id = ?")->execute([
            (int) ($params['id'] ?? 0),
            (int) $request->input('userId', 0),
        ]);
        return Response::json(['ok' => true, 'message' => 'Compra cancelada com sucesso.']);
    }

    public function createAdminMessage(Request $request, array $params): Response
    {
        unset($params);
        Db::pdo()->prepare('INSERT INTO admin_messages (user_id, subject, message) VALUES (?, ?, ?)')->execute([
            (int) $request->input('userId', 0),
            trim((string) $request->input('subject', '')),
            trim((string) $request->input('message', '')),
        ]);
        return Response::json(['ok' => true, 'message' => 'Mensagem registrada com sucesso.'], 201);
    }

    public function sendMoldEmail(Request $request, array $params): Response
    {
        unset($params);
        Mailer::send(
            trim((string) $request->input('email', '')),
            'Molde taqueado - ' . trim((string) $request->input('projectName', 'Projeto')),
            ['files' => $request->input('files', [])]
        );
        return Response::json(['ok' => true, 'message' => 'Arquivos enviados com sucesso.']);
    }

    private function mapUser(array|false $user): array
    {
        if (!$user) {
            return [];
        }

        return [
            'id' => (int) $user['id'],
            'name' => $user['name'],
            'email' => $user['email'],
            'role' => $user['role'] === 'admin' ? 'admin' : 'user',
            'isPaid' => (bool) $user['is_paid'],
            'accessExpiresAt' => $user['plan_expires_at'] ?? $user['manual_access_expires_at'] ?? null,
            'permissions' => [
                'accessBandeiras' => (bool) ($user['manual_access_bandeiras'] ?? 0),
                'accessPainel' => (bool) ($user['manual_access_painel'] ?? 0),
                'accessPlotagemGomo' => (bool) ($user['manual_access_plotagem_gomo'] ?? 0),
                'accessTabelaMolde' => (bool) ($user['manual_access_tabela_molde'] ?? 0),
                'accessMoldesSalvos' => (bool) ($user['manual_access_moldes_salvos'] ?? 0),
                'accessStorefront' => (bool) ($user['manual_access_storefront'] ?? 0),
            ],
        ];
    }

    private function mapAdminUser(array $row): array
    {
        $mapped = $this->mapUser($row);
        $mapped['accessStatus'] = $row['access_status'];
        $mapped['createdAt'] = $row['created_at'];
        $mapped['accessBandeiras'] = (bool) $row['manual_access_bandeiras'];
        $mapped['accessPainel'] = (bool) $row['manual_access_painel'];
        $mapped['accessPlotagemGomo'] = (bool) $row['manual_access_plotagem_gomo'];
        $mapped['accessTabelaMolde'] = (bool) $row['manual_access_tabela_molde'];
        $mapped['accessMoldesSalvos'] = (bool) $row['manual_access_moldes_salvos'];
        $mapped['accessStorefront'] = (bool) $row['manual_access_storefront'];
        return $mapped;
    }
}
