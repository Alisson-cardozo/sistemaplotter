<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Core\Request;
use App\Services\NotificationService;
use App\Support\Db;

final class SuggestionController extends BaseController
{
    public function store(Request $request, array $params)
    {
        unset($params);
        $user = $this->user($request);
        $rating = (int) $request->input('rating', 0);
        $subject = trim((string) $request->input('subject', ''));
        $suggestion = trim((string) $request->input('suggestion', ''));

        if ($rating < 1 || $rating > 5) {
            return $this->fail('Escolha uma avaliacao entre 1 e 5.', 422);
        }
        if ($subject === '') {
            return $this->fail('Informe um assunto para a sugestao.', 422);
        }
        if ($suggestion === '') {
            return $this->fail('Descreva a melhoria ou sugestao.', 422);
        }

        Db::pdo()->prepare('INSERT INTO user_suggestions (user_id, rating, subject, suggestion) VALUES (?, ?, ?, ?)')->execute([
            (int) $user['id'],
            $rating,
            $subject,
            $suggestion,
        ]);

        $createdId = (int) Db::pdo()->lastInsertId();
        (new NotificationService())->notifyAdmins(
            'new_suggestion',
            'Nova sugestao recebida',
            sprintf('%s enviou uma sugestao com nota %d/5: %s', (string) ($user['name'] ?? 'Usuario'), $rating, $subject)
        );
        return $this->ok([
            'message' => 'Sugestao enviada com sucesso. Obrigado pela avaliacao.',
            'thread' => $this->findSuggestionThread($createdId),
        ], 201);
    }

    public function userList(Request $request, array $params)
    {
        unset($params);
        $user = $this->user($request);
        return $this->ok(['items' => $this->loadSuggestions((int) $user['id'])]);
    }

    public function userReply(Request $request, array $params)
    {
        $user = $this->user($request);
        $suggestionId = (int) ($params['id'] ?? 0);
        $thread = $this->findSuggestionThread($suggestionId);

        if ($thread === null || (int) ($thread['userId'] ?? 0) !== (int) $user['id']) {
            return $this->fail('Conversa de sugestao nao encontrada.', 404);
        }

        $message = trim((string) $request->input('message', ''));
        if ($message === '') {
            return $this->fail('Digite sua mensagem para responder.', 422);
        }

        Db::pdo()->prepare('INSERT INTO user_suggestion_messages (suggestion_id, sender_role, message) VALUES (?, ?, ?)')->execute([
            $suggestionId,
            'user',
            $message,
        ]);
        (new NotificationService())->notifyAdmins(
            'suggestion_reply_user',
            'Usuario respondeu uma sugestao',
            sprintf('%s respondeu na conversa: %s', (string) ($thread['userName'] ?? 'Usuario'), (string) ($thread['subject'] ?? 'Sugestao'))
        );

        return $this->ok([
            'message' => 'Resposta enviada com sucesso.',
            'thread' => $this->findSuggestionThread($suggestionId),
        ]);
    }

    public function hideForUser(Request $request, array $params)
    {
        $user = $this->user($request);
        $suggestionId = (int) ($params['id'] ?? 0);
        $thread = $this->findSuggestionThread($suggestionId);

        if ($thread === null || (int) ($thread['userId'] ?? 0) !== (int) $user['id']) {
            return $this->fail('Conversa de sugestao nao encontrada.', 404);
        }

        Db::pdo()->prepare('INSERT INTO user_suggestion_hidden_threads (user_id, suggestion_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE hidden_at = CURRENT_TIMESTAMP')
            ->execute([
                (int) $user['id'],
                $suggestionId,
            ]);

        return $this->ok([
            'message' => 'Conversa removida da sua aba de sugestoes.',
        ]);
    }

    public function adminList(Request $request, array $params)
    {
        unset($request, $params);
        return $this->ok(['items' => $this->loadSuggestions()]);
    }

    public function adminReply(Request $request, array $params)
    {
        $suggestionId = (int) ($params['id'] ?? 0);
        $thread = $this->findSuggestionThread($suggestionId);

        if ($thread === null) {
            return $this->fail('Conversa de sugestao nao encontrada.', 404);
        }

        $message = trim((string) $request->input('message', ''));
        if ($message === '') {
            return $this->fail('Digite a resposta do administrador.', 422);
        }

        Db::pdo()->prepare('INSERT INTO user_suggestion_messages (suggestion_id, sender_role, message) VALUES (?, ?, ?)')->execute([
            $suggestionId,
            'admin',
            $message,
        ]);
        (new NotificationService())->notifyUser(
            (int) ($thread['userId'] ?? 0),
            'suggestion_reply_admin',
            'Nova resposta do administrador',
            sprintf('O administrador respondeu sua sugestao: %s', (string) ($thread['subject'] ?? 'Sugestao'))
        );

        return $this->ok([
            'message' => 'Resposta enviada ao usuario com sucesso.',
            'thread' => $this->findSuggestionThread($suggestionId),
        ]);
    }

    public function adminDelete(Request $request, array $params)
    {
        unset($request);
        $suggestionId = (int) ($params['id'] ?? 0);
        $thread = $this->findSuggestionThread($suggestionId);

        if ($thread === null) {
            return $this->fail('Conversa de sugestao nao encontrada.', 404);
        }

        Db::pdo()->prepare('DELETE FROM user_suggestions WHERE id = ?')->execute([$suggestionId]);

        return $this->ok([
            'message' => 'Conversa de sugestao excluida com sucesso.',
        ]);
    }

    private function loadSuggestions(?int $userId = null): array
    {
        $sql = 'SELECT s.id, s.user_id AS userId, u.name AS userName, u.email AS userEmail, s.rating, s.subject, s.suggestion, s.created_at AS createdAt FROM user_suggestions s INNER JOIN users u ON u.id = s.user_id';
        $params = [];

        if ($userId !== null) {
            $sql .= ' LEFT JOIN user_suggestion_hidden_threads h ON h.suggestion_id = s.id AND h.user_id = ? WHERE s.user_id = ? AND h.id IS NULL';
            $params[] = $userId;
            $params[] = $userId;
        }

        $sql .= ' ORDER BY s.created_at DESC';
        $stmt = Db::pdo()->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();
        if (!is_array($rows) || $rows === []) {
            return [];
        }

        $ids = array_map(static fn (array $row): int => (int) $row['id'], $rows);
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $messageStmt = Db::pdo()->prepare("SELECT id, suggestion_id AS suggestionId, sender_role AS senderRole, message, created_at AS createdAt FROM user_suggestion_messages WHERE suggestion_id IN ($placeholders) ORDER BY created_at ASC, id ASC");
        $messageStmt->execute($ids);
        $messages = $messageStmt->fetchAll();

        $messagesBySuggestion = [];
        foreach ($messages ?: [] as $message) {
            $suggestionId = (int) ($message['suggestionId'] ?? 0);
            $messagesBySuggestion[$suggestionId] ??= [];
            $messagesBySuggestion[$suggestionId][] = $message;
        }

        return array_map(function (array $row) use ($messagesBySuggestion): array {
            $suggestionId = (int) $row['id'];
            return [
                'id' => $suggestionId,
                'userId' => (int) $row['userId'],
                'userName' => $row['userName'],
                'userEmail' => $row['userEmail'],
                'rating' => (int) $row['rating'],
                'subject' => $row['subject'],
                'suggestion' => $row['suggestion'],
                'createdAt' => $row['createdAt'],
                'messages' => array_map(static fn (array $message): array => [
                    'id' => (int) $message['id'],
                    'senderRole' => $message['senderRole'],
                    'message' => $message['message'],
                    'createdAt' => $message['createdAt'],
                ], $messagesBySuggestion[$suggestionId] ?? []),
            ];
        }, $rows);
    }

    private function findSuggestionThread(int $suggestionId): ?array
    {
        $threads = $this->loadSuggestions();
        foreach ($threads as $thread) {
            if ((int) ($thread['id'] ?? 0) === $suggestionId) {
                return $thread;
            }
        }

        return null;
    }
}
