<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Core\Request;
use App\Services\CheckoutService;
use App\Services\NotificationService;
use App\Services\UserService;
use App\Support\Db;
use App\Support\Json;
use App\Support\Payments;
use App\Support\Uploads;

final class PlanController extends BaseController
{
    public function adminOrders(Request $request, array $params)
    {
        unset($request, $params);
        $items = Db::pdo()->query("SELECT o.id, o.user_id AS userId, u.name AS userName, u.email AS userEmail, o.plan_id AS planId, p.name AS planName, o.payment_status AS paymentStatus, o.amount, o.duration_days AS durationDays, o.created_at AS createdAt, o.expires_at AS expiresAt, o.approved_at AS approvedAt, o.cancelled_at AS cancelledAt FROM plan_orders o INNER JOIN users u ON u.id = o.user_id INNER JOIN subscription_plans p ON p.id = o.plan_id ORDER BY o.created_at DESC")->fetchAll();
        return $this->ok(['items' => $items]);
    }

    public function publicList(Request $request, array $params)
    {
        unset($request, $params);
        $items = Db::pdo()->query("SELECT id, name, description, price, duration_days AS durationDays, image_path AS imageDataUrl, is_promo AS isPromo, is_most_popular AS isMostPopular, access_bandeiras AS accessBandeiras, access_painel AS accessPainel, access_plotagem_gomo AS accessPlotagemGomo, access_tabela_molde AS accessTabelaMolde, access_moldes_salvos AS accessMoldesSalvos, access_storefront AS accessStorefront, status FROM subscription_plans WHERE status = 'active' ORDER BY price ASC")->fetchAll();
        foreach ($items as &$item) {
            $item['imageDataUrl'] = Uploads::ensurePublicUrl((string) ($item['imageDataUrl'] ?? ''));
        }
        unset($item);
        return $this->ok(['items' => $items]);
    }

    public function checkout(Request $request, array $params)
    {
        unset($params);
        $user = $this->user($request);
        $stmt = Db::pdo()->prepare('SELECT * FROM subscription_plans WHERE id = ? LIMIT 1');
        $stmt->execute([(int) $request->input('planId', 0)]);
        $plan = $stmt->fetch();
        if (!is_array($plan)) {
            return $this->fail('Plano nao encontrado.', 404);
        }

        $checkout = Payments::createCheckout(
            (int) $plan['id'],
            (int) $user['id'],
            (float) $plan['price'],
            (int) $plan['duration_days'],
            (string) $plan['name'],
            (string) ($user['email'] ?? '')
        );
        Db::pdo()->prepare('INSERT INTO plan_orders (user_id, plan_id, mercadopago_payment_id, external_reference, payment_status, amount, duration_days, pix_code, qr_code_base64, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')->execute([
            $checkout['user_id'],
            $checkout['plan_id'],
            $checkout['mercadopago_payment_id'] !== '' ? $checkout['mercadopago_payment_id'] : null,
            $checkout['external_reference'],
            $checkout['payment_status'],
            $checkout['amount'],
            $checkout['duration_days'],
            $checkout['pix_code'],
            $checkout['qr_code_base64'],
            $checkout['expires_at'],
        ]);
        $orderId = (int) Db::pdo()->lastInsertId();
        (new NotificationService())->notifyAdmins(
            'new_plan_order',
            'Nova compra de plano',
            sprintf('%s abriu uma nova compra do plano %s no valor de R$ %.2f.', (string) ($user['name'] ?? 'Usuario'), (string) ($plan['name'] ?? 'Plano'), (float) ($checkout['amount'] ?? 0))
        );
        return $this->ok(['checkout' => [
            'orderId' => $orderId,
            'paymentStatus' => $checkout['payment_status'],
            'qrCodeBase64' => $checkout['qr_code_base64'],
            'pixCode' => $checkout['pix_code'],
            'expiresAt' => date(DATE_ATOM, strtotime((string) $checkout['expires_at'])),
            'planName' => $checkout['plan_name'],
            'amount' => $checkout['amount'],
            'durationDays' => $checkout['duration_days'],
        ]]);
    }

    public function showCheckout(Request $request, array $params)
    {
        $user = $this->user($request);
        $stmt = Db::pdo()->prepare('SELECT o.*, p.name AS plan_name FROM plan_orders o INNER JOIN subscription_plans p ON p.id = o.plan_id WHERE o.id = ? AND o.user_id = ? LIMIT 1');
        $stmt->execute([(int) ($params['id'] ?? 0), (int) $user['id']]);
        $order = $stmt->fetch();
        if (!is_array($order)) {
            return $this->fail('Checkout nao encontrado.', 404);
        }

        if ((string) ($order['mercadopago_payment_id'] ?? '') !== '' && (string) ($order['payment_status'] ?? 'pending') === 'pending') {
            try {
                $latestCheckout = Payments::refreshCheckoutStatus((string) $order['mercadopago_payment_id']);
                if (is_array($latestCheckout)) {
                    $nextStatus = (string) ($latestCheckout['payment_status'] ?? $order['payment_status']);
                    $nextPixCode = (string) ($latestCheckout['pix_code'] ?? $order['pix_code'] ?? '');
                    $nextQrCodeBase64 = (string) ($latestCheckout['qr_code_base64'] ?? $order['qr_code_base64'] ?? '');
                    $nextExpiresAt = (string) ($latestCheckout['expires_at'] ?? $order['expires_at'] ?? '');

                    Db::pdo()->prepare('UPDATE plan_orders SET payment_status = ?, pix_code = ?, qr_code_base64 = ?, expires_at = ? WHERE id = ?')->execute([
                        $nextStatus,
                        $nextPixCode,
                        $nextQrCodeBase64,
                        $nextExpiresAt !== '' ? $nextExpiresAt : null,
                        (int) $order['id'],
                    ]);

                    if ($nextStatus === 'approved') {
                        (new CheckoutService())->activateOrder((int) $order['id']);
                    }

                    $stmt = Db::pdo()->prepare('SELECT o.*, p.name AS plan_name FROM plan_orders o INNER JOIN subscription_plans p ON p.id = o.plan_id WHERE o.id = ? AND o.user_id = ? LIMIT 1');
                    $stmt->execute([(int) $order['id'], (int) $user['id']]);
                    $order = $stmt->fetch() ?: $order;
                }
            } catch (\Throwable $exception) {
            }
        }

        $freshUser = (new UserService())->findUserById((int) $user['id']) ?? $user;
        return $this->ok(['checkout' => [
            'orderId' => (int) $order['id'],
            'paymentStatus' => $order['payment_status'],
            'qrCodeBase64' => $order['qr_code_base64'] ?? '',
            'pixCode' => $order['pix_code'] ?? '',
            'expiresAt' => $order['expires_at'] ? date(DATE_ATOM, strtotime((string) $order['expires_at'])) : null,
            'planName' => $order['plan_name'],
            'amount' => (float) $order['amount'],
            'durationDays' => (int) $order['duration_days'],
        ], 'user' => (new UserService())->mapUser($freshUser)]);
    }

    public function cancelCheckout(Request $request, array $params)
    {
        $user = $this->user($request);
        Db::pdo()->prepare("UPDATE plan_orders SET payment_status = 'cancelled', cancelled_at = NOW() WHERE id = ? AND user_id = ?")->execute([(int) ($params['id'] ?? 0), (int) $user['id']]);
        return $this->ok(['message' => 'Compra cancelada com sucesso.']);
    }

    public function adminList(Request $request, array $params)
    {
        unset($request, $params);
        $items = Db::pdo()->query('SELECT id, name, description, price, duration_days AS durationDays, image_path AS imageDataUrl, is_promo AS isPromo, is_most_popular AS isMostPopular, access_bandeiras AS accessBandeiras, access_painel AS accessPainel, access_plotagem_gomo AS accessPlotagemGomo, access_tabela_molde AS accessTabelaMolde, access_moldes_salvos AS accessMoldesSalvos, access_storefront AS accessStorefront, status, created_at AS createdAt FROM subscription_plans ORDER BY created_at DESC')->fetchAll();
        foreach ($items as &$item) {
            $item['imageDataUrl'] = Uploads::ensurePublicUrl((string) ($item['imageDataUrl'] ?? ''));
        }
        unset($item);
        return $this->ok(['items' => $items]);
    }

    public function uploadImage(Request $request, array $params)
    {
        unset($params);
        $path = Uploads::persistBase64Image((string) $request->input('imageDataUrl', ''), 'plans', 'plan');
        return $this->ok(['imagePath' => Uploads::ensurePublicUrl($path)]);
    }

    public function store(Request $request, array $params)
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
        return $this->ok(['message' => 'Plano criado com sucesso.'], 201);
    }

    public function update(Request $request, array $params)
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
        return $this->ok(['message' => 'Plano atualizado com sucesso.']);
    }

    public function destroy(Request $request, array $params)
    {
        unset($request);
        Db::pdo()->prepare('DELETE FROM subscription_plans WHERE id = ?')->execute([(int) ($params['id'] ?? 0)]);
        return $this->ok(['message' => 'Plano excluido com sucesso.']);
    }

    public function simulateApprove(Request $request, array $params)
    {
        unset($request);
        (new CheckoutService())->activateOrder((int) ($params['id'] ?? 0));
        return $this->ok(['message' => 'Pedido aprovado e acesso liberado.']);
    }
}
