import { FormEvent, useEffect, useState } from "react";
import type { AuthUser } from "./AuthPanel";
import { apiFetch } from "../lib/api";

type SuggestionMessage = {
  id: number;
  senderRole: "user" | "admin";
  message: string;
  createdAt: string;
};

type SuggestionThread = {
  id: number;
  rating: number;
  subject: string;
  suggestion: string;
  createdAt: string;
  messages: SuggestionMessage[];
};

type NotificationItem = {
  id: number;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
};

type Props = {
  authUser: AuthUser;
  onNotificationsChanged?: () => void;
};

export function SuggestionsWorkspace({ authUser, onNotificationsChanged }: Props) {
  const [rating, setRating] = useState("5");
  const [subject, setSubject] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [threads, setThreads] = useState<SuggestionThread[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});
  const [status, setStatus] = useState<{ type: "idle" | "success" | "error"; message?: string }>({ type: "idle" });
  const [loading, setLoading] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [replyingThreadId, setReplyingThreadId] = useState<number | null>(null);
  const [hidingThreadId, setHidingThreadId] = useState<number | null>(null);

  const loadThreads = async () => {
    try {
      setLoadingThreads(true);
      const response = await apiFetch("/api/suggestions");
      const payload = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Nao foi possivel carregar suas conversas.");
      }
      setThreads(Array.isArray(payload.items) ? payload.items.map(normalizeThread) : []);
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Nao foi possivel carregar suas conversas." });
    } finally {
      setLoadingThreads(false);
    }
  };

  const loadNotifications = async () => {
    try {
      const response = await apiFetch("/api/notifications");
      const payload = await parseApiResponse(response);
      if (!response.ok) {
        return;
      }
      const items = Array.isArray(payload.items) ? payload.items.map(normalizeNotification) : [];
      setNotifications(items);
      if (items.every((item: NotificationItem) => item.isRead) && onNotificationsChanged) {
        onNotificationsChanged();
      }
    } catch {
    }
  };

  useEffect(() => {
    void loadThreads();
    void loadNotifications();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (!subject.trim()) {
      setStatus({ type: "error", message: "Informe um assunto para sua sugestao." });
      return;
    }
    if (!suggestion.trim()) {
      setStatus({ type: "error", message: "Descreva a melhoria que voce gostaria de ver no sistema." });
      return;
    }

    setLoading(true);
    setStatus({ type: "idle" });

    try {
      const response = await apiFetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: Number(rating),
          subject,
          suggestion
        })
      });

      const payload = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Nao foi possivel enviar sua sugestao.");
      }

      setSubject("");
      setSuggestion("");
      setRating("5");
      setStatus({ type: "success", message: "Sugestao enviada com sucesso. Agora acompanhe a conversa logo abaixo." });
      await loadThreads();
      await loadNotifications();
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Nao foi possivel enviar sua sugestao." });
    } finally {
      setLoading(false);
    }
  };

  const replyToThread = async (threadId: number) => {
    const message = (replyDrafts[threadId] || "").trim();
    if (!message) {
      setStatus({ type: "error", message: "Digite sua resposta antes de enviar." });
      return;
    }

    setReplyingThreadId(threadId);
    setStatus({ type: "idle" });
    try {
      const response = await apiFetch(`/api/suggestions/${threadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message })
      });
      const payload = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Nao foi possivel enviar sua resposta.");
      }
      setReplyDrafts((current) => ({ ...current, [threadId]: "" }));
      setStatus({ type: "success", message: "Resposta enviada com sucesso." });
      await loadThreads();
      await loadNotifications();
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Nao foi possivel enviar sua resposta." });
    } finally {
      setReplyingThreadId(null);
    }
  };

  const markNotificationAsRead = async (notificationId: number) => {
    try {
      const response = await apiFetch(`/api/notifications/${notificationId}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const payload = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Nao foi possivel marcar a notificacao como lida.");
      }
      await loadNotifications();
      onNotificationsChanged?.();
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Nao foi possivel marcar a notificacao como lida." });
    }
  };

  const hideThreadForMe = async (threadId: number) => {
    setHidingThreadId(threadId);
    setStatus({ type: "idle" });

    try {
      const response = await apiFetch(`/api/suggestions/${threadId}/hide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const payload = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Nao foi possivel excluir a conversa.");
      }
      setReplyDrafts((current) => {
        const next = { ...current };
        delete next[threadId];
        return next;
      });
      setThreads((current) => current.filter((thread) => thread.id !== threadId));
      setStatus({ type: "success", message: "Conversa removida apenas da sua aba de sugestoes." });
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Nao foi possivel excluir a conversa." });
    } finally {
      setHidingThreadId(null);
    }
  };

  const unreadNotifications = notifications.filter((item) => !item.isRead);

  return (
    <section className="table-panel workspace-tab-panel suggestions-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Sugestoes</p>
          <h3>Avaliar sistema e conversar com o administrador</h3>
          <p className="muted compact-copy">
            Envie ideias de melhoria, acompanhe as respostas e continue a conversa sem sair desta aba.
          </p>
        </div>
      </div>

      <div className="suggestions-top-grid">
        <div className="panel suggestions-user-card">
          <h3>Seu perfil</h3>
          <div className="suggestions-user-grid">
            <div>
              <span>Nome</span>
              <strong>{authUser.name}</strong>
            </div>
            <div>
              <span>Email</span>
              <strong>{authUser.email}</strong>
            </div>
            <div>
              <span>Perfil</span>
              <strong>{authUser.role === "admin" ? "Administrador" : "Usuario"}</strong>
            </div>
          </div>
          <div className="suggestions-user-meta">
            <span>{threads.length} conversa(s) aberta(s)</span>
            <span>{unreadNotifications.length} notificacao(oes) nova(s)</span>
          </div>
        </div>

        <form className="panel suggestions-compose-card" onSubmit={submit}>
          <div className="panel-head small">
            <div>
              <p className="eyebrow">Nova sugestao</p>
              <h3>Enviar avaliacao</h3>
            </div>
          </div>

          <div className="grid two">
            <label className="field">
              <span>Avaliacao</span>
              <select value={rating} onChange={(event) => setRating(event.target.value)}>
                <option value="5">5 - Excelente</option>
                <option value="4">4 - Muito bom</option>
                <option value="3">3 - Bom</option>
                <option value="2">2 - Precisa melhorar</option>
                <option value="1">1 - Ruim</option>
              </select>
            </label>
            <label className="field">
              <span>Assunto</span>
              <input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Ex.: melhoria na plotagem, ideia para marketplace..." />
            </label>
          </div>

          <label className="field">
            <span>Mensagem</span>
            <textarea
              rows={5}
              value={suggestion}
              onChange={(event) => setSuggestion(event.target.value)}
              placeholder="Explique o que voce gostaria de melhorar, adicionar ou mudar no sistema."
            />
          </label>

          <button type="submit" disabled={loading}>
            {loading ? "Enviando sugestao..." : "Enviar avaliacao e sugestao"}
          </button>

          {status.message ? <div className={`delivery-status ${status.type === "success" ? "success" : "error"}`}>{status.message}</div> : null}
        </form>
      </div>

      <div className="panel suggestions-notifications-card">
        <div className="panel-head small">
          <div>
            <p className="eyebrow">Notificacoes</p>
            <h3>Novidades da conversa</h3>
          </div>
        </div>

        {notifications.length === 0 ? (
          <p className="muted compact-copy">Nenhuma notificacao por enquanto.</p>
        ) : (
          <div className="suggestions-notification-list">
            {notifications.map((notification) => (
              <article key={notification.id} className={`suggestions-notification-item ${notification.isRead ? "read" : "unread"}`}>
                <div>
                  <strong>{notification.title}</strong>
                  <p>{notification.body}</p>
                  <small>{notification.createdAt ? new Date(notification.createdAt).toLocaleString("pt-BR") : "-"}</small>
                </div>
                {!notification.isRead ? (
                  <button type="button" onClick={() => void markNotificationAsRead(notification.id)}>
                    Marcar como lida
                  </button>
                ) : (
                  <span className="marketplace-action-disabled">Lida</span>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="panel suggestions-chat-card">
        <div className="panel-head small">
          <div>
            <p className="eyebrow">Conversas</p>
            <h3>Historico de sugestoes</h3>
            <p className="muted compact-copy">Cada card abaixo funciona como um chat com o administrador.</p>
          </div>
        </div>

        {loadingThreads ? (
          <p className="muted compact-copy">Carregando conversas...</p>
        ) : threads.length === 0 ? (
          <p className="muted compact-copy">Voce ainda nao abriu nenhuma conversa de sugestao.</p>
        ) : (
          <div className="suggestions-thread-list">
            {threads.map((thread) => (
              <article key={thread.id} className="suggestions-thread-card">
                <div className="suggestions-thread-head">
                  <div>
                    <strong>{thread.subject}</strong>
                    <span>{thread.createdAt ? new Date(thread.createdAt).toLocaleString("pt-BR") : "-"}</span>
                  </div>
                  <div className="suggestions-thread-rating">Nota {thread.rating}/5</div>
                </div>

                <div className="suggestions-messages">
                  <div className="suggestions-bubble user">
                    <strong>Voce</strong>
                    <p>{thread.suggestion}</p>
                  </div>
                  {thread.messages.map((message) => (
                    <div key={message.id} className={`suggestions-bubble ${message.senderRole === "admin" ? "admin" : "user"}`}>
                      <strong>{message.senderRole === "admin" ? "Administrador" : "Voce"}</strong>
                      <p>{message.message}</p>
                      <small>{message.createdAt ? new Date(message.createdAt).toLocaleString("pt-BR") : "-"}</small>
                    </div>
                  ))}
                </div>

                <label className="field">
                  <span>Responder nessa conversa</span>
                  <textarea
                    rows={3}
                    value={replyDrafts[thread.id] ?? ""}
                    onChange={(event) => setReplyDrafts((current) => ({ ...current, [thread.id]: event.target.value }))}
                    placeholder="Digite aqui sua resposta para continuar a conversa."
                  />
                </label>

                <div className="suggestions-thread-actions">
                  <button type="button" onClick={() => void replyToThread(thread.id)} disabled={replyingThreadId === thread.id}>
                    {replyingThreadId === thread.id ? "Enviando resposta..." : "Enviar resposta"}
                  </button>
                  <button
                    type="button"
                    className="secondary danger"
                    onClick={() => void hideThreadForMe(thread.id)}
                    disabled={hidingThreadId === thread.id}
                  >
                    {hidingThreadId === thread.id ? "Excluindo..." : "Excluir para mim"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function normalizeThread(raw: any): SuggestionThread {
  return {
    id: Number(raw?.id || 0),
    rating: Number(raw?.rating || 0),
    subject: String(raw?.subject || ""),
    suggestion: String(raw?.suggestion || ""),
    createdAt: String(raw?.createdAt || ""),
    messages: Array.isArray(raw?.messages)
      ? raw.messages.map((message: any) => ({
          id: Number(message?.id || 0),
          senderRole: message?.senderRole === "admin" ? "admin" : "user",
          message: String(message?.message || ""),
          createdAt: String(message?.createdAt || "")
        }))
      : []
  };
}

function normalizeNotification(raw: any): NotificationItem {
  return {
    id: Number(raw?.id || 0),
    title: String(raw?.title || ""),
    body: String(raw?.body || ""),
    isRead: raw?.isRead === true || raw?.isRead === 1 || raw?.isRead === "1",
    createdAt: String(raw?.createdAt || "")
  };
}

async function parseApiResponse(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("A API de sugestoes nao respondeu corretamente.");
  }
}
