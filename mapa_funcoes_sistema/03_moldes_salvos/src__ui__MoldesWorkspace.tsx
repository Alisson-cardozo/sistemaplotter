import { useEffect, useState } from "react";
import { ProjectInput } from "../domain/types";
import { apiFetch } from "../lib/api";
import { AuthUser } from "./AuthPanel";

type MoldSnapshot = {
  input: ProjectInput;
  lineColors: {
    divisao: string;
    bainha: string;
  };
  sectionColors: Record<string, string>;
  draftPoints: ProjectInput["tabelaPontos"];
};

type MoldListItem = {
  id: number;
  nomeProjeto: string;
  modelo: string;
  quantidadeGomos: number;
  comprimentoGomoCm: number;
  createdAt: string;
  feitoPor: string;
};

type MoldDetailsResponse = {
  id: number;
  payload: MoldSnapshot;
  error?: string;
  message?: string;
};

type Props = {
  authUser: AuthUser | null;
  buildSnapshot: () => MoldSnapshot;
  onLoadToPlot: (snapshot: MoldSnapshot) => void;
  onLoadToEdit: (snapshot: MoldSnapshot) => void;
};

export function MoldesWorkspace({ authUser, buildSnapshot, onLoadToPlot, onLoadToEdit }: Props) {
  const [items, setItems] = useState<MoldListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "idle" | "success" | "error"; message?: string }>({ type: "idle" });
  const isAdmin = authUser?.role === "admin";

  const loadList = async () => {
    setLoading(true);
    setStatus({ type: "idle" });
    try {
      const response = await apiFetch("/api/molds");
      const payload = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Nao foi possivel listar os moldes.");
      }
      setItems(Array.isArray(payload.items) ? payload.items : []);
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao carregar os moldes."
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadList();
  }, []);

  const saveCurrentMold = async () => {
    setSaving(true);
    setStatus({ type: "idle" });
    try {
      const snapshot = buildSnapshot();
      const response = await apiFetch("/api/molds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot)
      });
      const payload = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Nao foi possivel salvar o molde.");
      }
      setStatus({ type: "success", message: "Molde salvo com sucesso." });
      await loadList();
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao salvar o molde."
      });
    } finally {
      setSaving(false);
    }
  };

  const fetchMoldSnapshot = async (id: number) => {
    setStatus({ type: "idle" });
    const response = await apiFetch(`/api/molds/${id}`);
    const payload = (await parseApiResponse(response)) as MoldDetailsResponse;
    if (!response.ok) {
      throw new Error(payload.error || payload.message || "Nao foi possivel carregar este molde.");
    }
    return payload.payload;
  };

  const loadMoldToPlot = async (id: number) => {
    try {
      const snapshot = await fetchMoldSnapshot(id);
      onLoadToPlot(snapshot);
      setStatus({ type: "success", message: "Molde carregado na plotagem." });
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao carregar molde."
      });
    }
  };

  const editMoldBase = async (id: number) => {
    try {
      const snapshot = await fetchMoldSnapshot(id);
      onLoadToEdit(snapshot);
      setStatus({ type: "success", message: "Molde aberto na aba de cadastro para edicao." });
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao abrir molde."
      });
    }
  };

  const deleteMold = async (id: number) => {
    try {
      setStatus({ type: "idle" });
      const response = await apiFetch(`/api/molds/${id}`, { method: "DELETE" });
      const payload = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Nao foi possivel excluir este molde.");
      }
      setStatus({ type: "success", message: "Molde excluido com sucesso." });
      await loadList();
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao excluir molde."
      });
    }
  };

  return (
    <section className="table-panel moldes-panel workspace-tab-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Biblioteca de moldes</p>
          <h3>Moldes cadastrados</h3>
          <p className="muted compact-copy">
            Salve o molde atual no banco e reutilize depois com um clique. Ao carregar, todos os campos voltam para a plotagem.
          </p>
        </div>
        <div className="moldes-actions">
          <button onClick={saveCurrentMold} disabled={saving}>
            {saving ? "Salvando..." : "Salvar molde atual"}
          </button>
          <button onClick={() => void loadList()} disabled={loading}>
            {loading ? "Atualizando..." : "Atualizar lista"}
          </button>
        </div>
      </div>

      {status.message ? <div className={`delivery-status ${status.type === "success" ? "success" : "error"}`}>{status.message}</div> : null}

      <div className="editor-table moldes-table">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Nome</th>
              <th>Modelo</th>
              <th>Gomos</th>
              <th>Tamanho (cm)</th>
              <th>Feito</th>
              <th>Criado em</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={8} className="muted">
                  Nenhum molde cadastrado ainda.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>{item.nomeProjeto}</td>
                  <td>{item.modelo}</td>
                  <td>{item.quantidadeGomos}</td>
                  <td>{item.comprimentoGomoCm}</td>
                  <td>{item.feitoPor}</td>
                  <td>{new Date(item.createdAt).toLocaleString("pt-BR")}</td>
                  <td className="moldes-actions-cell">
                    <button onClick={() => void loadMoldToPlot(item.id)}>Usar na plotagem</button>
                    <button onClick={() => void editMoldBase(item.id)}>Editar</button>
                    {isAdmin ? <button className="danger-button" onClick={() => void deleteMold(item.id)}>Excluir</button> : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

async function parseApiResponse(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
      throw new Error("A API de moldes nao respondeu JSON. Reinicie o backend com npm run dev.");
    }
    throw new Error("Resposta invalida da API de moldes.");
  }
}
