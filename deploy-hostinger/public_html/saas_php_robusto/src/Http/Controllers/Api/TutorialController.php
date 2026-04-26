<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Core\Request;
use App\Support\Db;

final class TutorialController extends BaseController
{
    public function show(Request $request, array $params)
    {
        unset($request, $params);
        return $this->ok(['items' => $this->loadTutorialItems()]);
    }

    public function adminShow(Request $request, array $params)
    {
        unset($request, $params);
        return $this->ok(['items' => $this->loadTutorialItems()]);
    }

    public function adminStore(Request $request, array $params)
    {
        unset($params);
        $payload = $this->validateTutorialPayload($request);
        if (isset($payload['error'])) {
            return $this->fail((string) $payload['error'], 422);
        }

        Db::pdo()->prepare('INSERT INTO tutorial_library (title, description, youtube_url) VALUES (?, ?, ?)')->execute([
            $payload['title'],
            $payload['description'],
            $payload['youtubeUrl'],
        ]);

        return $this->ok([
            'message' => 'Tutorial criado com sucesso.',
            'items' => $this->loadTutorialItems(),
        ], 201);
    }

    public function adminUpdate(Request $request, array $params)
    {
        $tutorialId = (int) ($params['id'] ?? 0);
        if ($tutorialId <= 0) {
            return $this->fail('Tutorial invalido.', 422);
        }

        $payload = $this->validateTutorialPayload($request);
        if (isset($payload['error'])) {
            return $this->fail((string) $payload['error'], 422);
        }

        $stmt = Db::pdo()->prepare('UPDATE tutorial_library SET title = ?, description = ?, youtube_url = ? WHERE id = ?');
        $stmt->execute([
            $payload['title'],
            $payload['description'],
            $payload['youtubeUrl'],
            $tutorialId,
        ]);

        if ($stmt->rowCount() === 0 && $this->findTutorialById($tutorialId) === null) {
            return $this->fail('Tutorial nao encontrado.', 404);
        }

        return $this->ok([
            'message' => 'Tutorial atualizado com sucesso.',
            'items' => $this->loadTutorialItems(),
        ]);
    }

    public function adminDelete(Request $request, array $params)
    {
        unset($request);
        $tutorialId = (int) ($params['id'] ?? 0);
        if ($tutorialId <= 0) {
            return $this->fail('Tutorial invalido.', 422);
        }

        $stmt = Db::pdo()->prepare('DELETE FROM tutorial_library WHERE id = ?');
        $stmt->execute([$tutorialId]);

        if ($stmt->rowCount() === 0) {
            return $this->fail('Tutorial nao encontrado.', 404);
        }

        return $this->ok([
            'message' => 'Tutorial excluido com sucesso.',
            'items' => $this->loadTutorialItems(),
        ]);
    }

    private function validateTutorialPayload(Request $request): array
    {
        $title = trim((string) $request->input('title', ''));
        $description = trim((string) $request->input('description', ''));
        $youtubeUrl = trim((string) $request->input('youtubeUrl', ''));

        if ($title === '') {
            return ['error' => 'Informe o nome do tutorial.'];
        }
        if ($description === '') {
            return ['error' => 'Informe a descricao do tutorial.'];
        }
        if ($youtubeUrl === '') {
            return ['error' => 'Informe o link do YouTube.'];
        }
        if (filter_var($youtubeUrl, FILTER_VALIDATE_URL) === false) {
            return ['error' => 'Informe um link valido para o YouTube.'];
        }

        return [
            'title' => $title,
            'description' => $description,
            'youtubeUrl' => $youtubeUrl,
        ];
    }

    private function loadTutorialItems(): array
    {
        $this->migrateLegacyTutorialIfNeeded();

        $rows = Db::pdo()->query('SELECT id, title, description, youtube_url AS youtubeUrl, created_at AS createdAt, updated_at AS updatedAt FROM tutorial_library ORDER BY updated_at DESC, id DESC')->fetchAll();

        if (!is_array($rows) || $rows === []) {
            return [];
        }

        return array_map(static fn (array $row): array => [
            'id' => (int) ($row['id'] ?? 0),
            'title' => (string) ($row['title'] ?? ''),
            'description' => (string) ($row['description'] ?? ''),
            'youtubeUrl' => (string) ($row['youtubeUrl'] ?? ''),
            'createdAt' => $row['createdAt'] ?? null,
            'updatedAt' => $row['updatedAt'] ?? null,
        ], $rows);
    }

    private function migrateLegacyTutorialIfNeeded(): void
    {
        $count = (int) Db::pdo()->query('SELECT COUNT(*) FROM tutorial_library')->fetchColumn();
        if ($count > 0) {
            return;
        }

        $legacy = Db::pdo()->query('SELECT description, youtube_url AS youtubeUrl FROM tutorial_settings WHERE id = 1 LIMIT 1')->fetch();
        if (!is_array($legacy)) {
            return;
        }

        $description = trim((string) ($legacy['description'] ?? ''));
        $youtubeUrl = trim((string) ($legacy['youtubeUrl'] ?? ''));
        if ($description === '' && $youtubeUrl === '') {
            return;
        }

        Db::pdo()->prepare('INSERT INTO tutorial_library (title, description, youtube_url) VALUES (?, ?, ?)')->execute([
            'Tutorial principal',
            $description,
            $youtubeUrl,
        ]);
    }

    private function findTutorialById(int $tutorialId): ?array
    {
        $stmt = Db::pdo()->prepare('SELECT id FROM tutorial_library WHERE id = ? LIMIT 1');
        $stmt->execute([$tutorialId]);
        $row = $stmt->fetch();

        return is_array($row) ? $row : null;
    }
}
