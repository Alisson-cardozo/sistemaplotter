<?php

declare(strict_types=1);

namespace App\Services;

use App\Support\Db;
use App\Support\Json;

final class CheckoutService
{
    public function activateOrder(int $orderId): void
    {
        $stmt = Db::pdo()->prepare('SELECT o.*, p.access_bandeiras, p.access_painel, p.access_plotagem_gomo, p.access_tabela_molde, p.access_moldes_salvos, p.access_storefront FROM plan_orders o INNER JOIN subscription_plans p ON p.id = o.plan_id WHERE o.id = ? LIMIT 1');
        $stmt->execute([$orderId]);
        $order = $stmt->fetch();
        if (!is_array($order)) {
            throw new \RuntimeException('Pedido nao encontrado para ativacao.');
        }

        Db::pdo()->prepare("UPDATE plan_orders SET payment_status = 'approved', approved_at = NOW() WHERE id = ?")->execute([$orderId]);
        Db::pdo()->prepare('UPDATE users SET is_paid = 1, active_plan_id = ?, plan_expires_at = DATE_ADD(NOW(), INTERVAL ? DAY), manual_access_bandeiras = ?, manual_access_painel = ?, manual_access_plotagem_gomo = ?, manual_access_tabela_molde = ?, manual_access_moldes_salvos = ?, manual_access_storefront = ? WHERE id = ?')->execute([
            (int) $order['plan_id'],
            (int) $order['duration_days'],
            (int) $order['access_bandeiras'],
            (int) $order['access_painel'],
            (int) $order['access_plotagem_gomo'],
            (int) $order['access_tabela_molde'],
            (int) $order['access_moldes_salvos'],
            (int) $order['access_storefront'],
            (int) $order['user_id'],
        ]);
    }
}
