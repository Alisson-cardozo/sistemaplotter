<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Core\Request;
use App\Services\UserService;
use App\Support\Db;
use App\Support\Json;
use App\Support\Uploads;

final class MarketplaceController extends BaseController
{
    public function index(Request $request, array $params)
    {
        unset($request, $params);
        $rows = Db::pdo()->query('SELECT p.*, u.name AS seller_name, u.role AS seller_role, u.access_status AS seller_access_status, u.plan_expires_at AS seller_plan_expires_at, u.manual_access_expires_at AS seller_manual_access_expires_at, u.manual_access_storefront AS seller_manual_access_storefront FROM marketplace_products p INNER JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC')->fetchAll();
        $users = new UserService();
        $items = array_map(function (array $row) use ($users): array {
            $seller = [
                'role' => $row['seller_role'] ?? 'user',
                'access_status' => $row['seller_access_status'] ?? 'active',
                'plan_expires_at' => $row['seller_plan_expires_at'] ?? null,
                'manual_access_expires_at' => $row['seller_manual_access_expires_at'] ?? null,
                'manual_access_storefront' => $row['seller_manual_access_storefront'] ?? 0,
            ];
            $storefrontActive = $users->storefrontActive($seller);
            $isSold = $row['status'] === 'sold';

            return [
                'images' => array_map(
                    fn ($image): string => Uploads::ensurePublicUrl((string) $image),
                    json_decode($row['images_json'] ?: '[]', true) ?: array_values(array_filter([$row['image_url'] ?? null]))
                ),
                'id' => (int) $row['id'],
                'userId' => (int) $row['user_id'],
                'sellerName' => $row['seller_name'],
                'name' => $row['name'],
                'description' => $row['description'],
                'price' => (float) $row['price'],
                'whatsapp' => $row['whatsapp_number'],
                'sold' => $isSold,
                'inactive' => !$isSold && !$storefrontActive,
                'contactEnabled' => !$isSold && $storefrontActive,
                'createdAt' => $row['created_at'],
                'updatedAt' => $row['updated_at'],
            ];
        }, $rows);

        return $this->ok(['items' => $items]);
    }

    public function upload(Request $request, array $params)
    {
        unset($params);
        $path = Uploads::persistBase64Image((string) $request->input('imageDataUrl', ''), 'marketplace', 'product');
        return $this->ok(['imagePath' => $path]);
    }

    public function store(Request $request, array $params)
    {
        unset($params);
        $authUser = $this->user($request);
        if (($authUser['role'] ?? 'user') !== 'admin' && !(new UserService())->storefrontActive($authUser)) {
            return $this->fail('Usuario sem permissao para publicar no marketplace.', 403);
        }

        $images = $request->input('images', []);
        $primary = is_array($images) && isset($images[0]) ? (string) $images[0] : '';
        Db::pdo()->prepare('INSERT INTO marketplace_products (user_id, name, description, price, image_url, images_json, whatsapp_number, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')->execute([
            (int) $authUser['id'],
            trim((string) $request->input('name', '')),
            trim((string) $request->input('description', '')),
            (float) $request->input('price', 0),
            $primary,
            json_encode($images, JSON_UNESCAPED_UNICODE),
            trim((string) $request->input('whatsapp', '')),
            'active',
        ]);
        return $this->ok(['message' => 'Produto publicado com sucesso.'], 201);
    }

    public function update(Request $request, array $params)
    {
        $authUser = $this->user($request);
        $users = new UserService();
        $stmt = Db::pdo()->prepare('SELECT * FROM marketplace_products WHERE id = ? LIMIT 1');
        $stmt->execute([(int) ($params['id'] ?? 0)]);
        $item = $stmt->fetch();
        if (!is_array($item)) {
            return $this->fail('Produto nao encontrado.', 404);
        }
        if (($authUser['role'] ?? 'user') !== 'admin' && (int) $item['user_id'] !== (int) $authUser['id']) {
            return $this->fail('Voce nao pode editar este produto.', 403);
        }
        if (($authUser['role'] ?? 'user') !== 'admin' && !$users->storefrontActive($authUser)) {
            return $this->fail('Seu acesso ao marketplace esta inativo. Renove para editar seus produtos.', 403);
        }

        $images = $request->input('images', []);
        $primary = is_array($images) && isset($images[0]) ? (string) $images[0] : '';
        Db::pdo()->prepare('UPDATE marketplace_products SET name = ?, description = ?, price = ?, image_url = ?, images_json = ?, whatsapp_number = ? WHERE id = ?')->execute([
            trim((string) $request->input('name', '')),
            trim((string) $request->input('description', '')),
            (float) $request->input('price', 0),
            $primary,
            json_encode($images, JSON_UNESCAPED_UNICODE),
            trim((string) $request->input('whatsapp', '')),
            (int) $item['id'],
        ]);
        return $this->ok(['message' => 'Produto atualizado com sucesso.']);
    }

    public function status(Request $request, array $params)
    {
        $authUser = $this->user($request);
        $users = new UserService();
        $stmt = Db::pdo()->prepare('SELECT * FROM marketplace_products WHERE id = ? LIMIT 1');
        $stmt->execute([(int) ($params['id'] ?? 0)]);
        $item = $stmt->fetch();
        if (!is_array($item)) {
            return $this->fail('Produto nao encontrado.', 404);
        }
        if (($authUser['role'] ?? 'user') !== 'admin' && (int) $item['user_id'] !== (int) $authUser['id']) {
            return $this->fail('Voce nao pode alterar este produto.', 403);
        }
        if (($authUser['role'] ?? 'user') !== 'admin' && !$users->storefrontActive($authUser)) {
            return $this->fail('Seu acesso ao marketplace esta inativo. Renove para reativar seus produtos.', 403);
        }

        Db::pdo()->prepare('UPDATE marketplace_products SET status = ? WHERE id = ?')->execute([
            Json::boolish($request->input('sold', false)) ? 'sold' : 'active',
            (int) $item['id'],
        ]);
        return $this->ok(['message' => 'Status atualizado.']);
    }

    public function destroy(Request $request, array $params)
    {
        $authUser = $this->user($request);
        if (($authUser['role'] ?? 'user') !== 'admin') {
            return $this->fail('Apenas o administrador pode excluir produtos.', 403);
        }

        $stmt = Db::pdo()->prepare('DELETE FROM marketplace_products WHERE id = ?');
        $stmt->execute([(int) ($params['id'] ?? 0)]);

        if ($stmt->rowCount() < 1) {
            return $this->fail('Produto nao encontrado.', 404);
        }

        return $this->ok(['message' => 'Produto excluido com sucesso.']);
    }
}
