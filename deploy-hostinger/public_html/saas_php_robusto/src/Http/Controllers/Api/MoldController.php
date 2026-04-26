<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Core\Request;
use App\Support\Db;

final class MoldController extends BaseController
{
    public function index(Request $request, array $params)
    {
        unset($params);
        $user = $this->user($request);
        $sql = ($user['role'] ?? 'user') === 'admin'
            ? "SELECT moldes.id, moldes.nome_projeto AS nomeProjeto, moldes.modelo, moldes.quantidade_gomos AS quantidadeGomos, moldes.comprimento_gomo_cm AS comprimentoGomoCm, moldes.created_at AS createdAt, COALESCE(users.name, 'Usuario removido') AS feitoPor FROM moldes LEFT JOIN users ON users.id = moldes.user_id ORDER BY moldes.created_at DESC"
            : "SELECT moldes.id, moldes.nome_projeto AS nomeProjeto, moldes.modelo, moldes.quantidade_gomos AS quantidadeGomos, moldes.comprimento_gomo_cm AS comprimentoGomoCm, moldes.created_at AS createdAt, COALESCE(users.name, 'Usuario removido') AS feitoPor FROM moldes LEFT JOIN users ON users.id = moldes.user_id WHERE moldes.user_id = ? ORDER BY moldes.created_at DESC";
        $stmt = Db::pdo()->prepare($sql);
        $stmt->execute(($user['role'] ?? 'user') === 'admin' ? [] : [(int) $user['id']]);
        return $this->ok(['items' => $stmt->fetchAll()]);
    }

    public function show(Request $request, array $params)
    {
        $user = $this->user($request);
        $stmt = Db::pdo()->prepare('SELECT * FROM moldes WHERE id = ? LIMIT 1');
        $stmt->execute([(int) ($params['id'] ?? 0)]);
        $item = $stmt->fetch();
        if (!is_array($item)) {
            return $this->fail('Molde nao encontrado.', 404);
        }
        if (($user['role'] ?? 'user') !== 'admin' && (int) ($item['user_id'] ?? 0) !== (int) $user['id']) {
            return $this->fail('Voce nao pode acessar este molde.', 403);
        }

        return $this->ok(['id' => (int) $item['id'], 'payload' => json_decode((string) $item['payload_json'], true)]);
    }

    public function store(Request $request, array $params)
    {
        unset($params);
        $user = $this->user($request);
        $input = $request->input('input', []);
        $moldName = trim((string) ($input['modelo'] ?? '')) !== ''
            ? trim((string) ($input['modelo'] ?? ''))
            : (trim((string) ($input['projeto'] ?? '')) !== '' ? trim((string) ($input['projeto'] ?? '')) : 'Sem nome');
        Db::pdo()->prepare('INSERT INTO moldes (user_id, nome_projeto, modelo, quantidade_gomos, comprimento_gomo_cm, diametro_boca_cm, bainha_cm, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')->execute([
            (int) $user['id'],
            $moldName,
            $input['modelo'] ?? 'nao-informado',
            (int) ($input['quantidadeGomos'] ?? 0),
            (float) ($input['comprimentoGomoCm'] ?? 0),
            (float) ($input['diametroBocaCm'] ?? 0),
            (float) ($input['bainhaCm'] ?? 0),
            json_encode($request->body, JSON_UNESCAPED_UNICODE),
        ]);
        return $this->ok(['message' => 'Molde salvo com sucesso.'], 201);
    }

    public function destroy(Request $request, array $params)
    {
        $user = $this->user($request);
        if (($user['role'] ?? 'user') !== 'admin') {
            return $this->fail('Apenas o administrador pode excluir moldes.', 403);
        }

        $stmt = Db::pdo()->prepare('DELETE FROM moldes WHERE id = ?');
        $stmt->execute([(int) ($params['id'] ?? 0)]);

        if ($stmt->rowCount() < 1) {
            return $this->fail('Molde nao encontrado.', 404);
        }

        return $this->ok(['message' => 'Molde excluido com sucesso.']);
    }
}
