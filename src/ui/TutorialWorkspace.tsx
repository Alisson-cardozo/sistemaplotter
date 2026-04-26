import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";

type TutorialItem = {
  id: number;
  title: string;
  description: string;
  youtubeUrl: string;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export function TutorialWorkspace() {
  const [tutorials, setTutorials] = useState<TutorialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        const response = await apiFetch("/api/tutorial");
        const payload = await parseApiResponse(response);
        if (!response.ok) {
          throw new Error(payload.error || payload.message || "Nao foi possivel carregar os tutoriais.");
        }
        setTutorials(Array.isArray(payload.items) ? payload.items.map(normalizeTutorialItem) : []);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Nao foi possivel carregar os tutoriais.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const latestUpdate = useMemo(() => {
    const dates = tutorials
      .map((tutorial) => tutorial.updatedAt || tutorial.createdAt)
      .filter(Boolean)
      .map((value) => new Date(String(value)).getTime())
      .filter((value) => Number.isFinite(value));
    if (dates.length === 0) {
      return null;
    }
    return new Date(Math.max(...dates)).toLocaleString("pt-BR");
  }, [tutorials]);

  return (
    <section className="table-panel workspace-tab-panel tutorial-marketplace-panel">
      <div className="panel-head mold-tab-head">
        <div>
          <p className="eyebrow">Tutoriais</p>
          <h3>Biblioteca de aulas</h3>
          <p className="muted compact-copy">
            Entre nos tutoriais publicados pelo administrador e abra direto a aula no YouTube para aprender cada modulo do sistema.
          </p>
        </div>
      </div>

      {status ? <div className="delivery-status error">{status}</div> : null}

      <div className="tutorial-marketplace-layout">
        <aside className="panel tutorial-marketplace-info">
          <div className="panel-head">
            <h3>Como funciona</h3>
          </div>

          <div className="tutorial-marketplace-copy">
            <div className="tutorial-marketplace-hero">
              <strong>Tudo organizado como uma vitrine de aprendizado.</strong>
              <p>Escolha um tema, leia o resumo do conteudo e use o botao para ir direto para a aula correspondente.</p>
            </div>

            <div className="tutorial-marketplace-points">
              <article>
                <span>Tutoriais por assunto</span>
                <p>Cada card representa uma aula ou conjunto de aulas separadas por tema.</p>
              </article>
              <article>
                <span>Acesso rapido</span>
                <p>O botao abre o conteudo direto no YouTube, sem precisar copiar link.</p>
              </article>
              <article>
                <span>Atualizacao centralizada</span>
                <p>Quando o administrador publicar novos conteudos, eles aparecem aqui automaticamente.</p>
              </article>
            </div>
          </div>
        </aside>

        <div className="panel tutorial-marketplace-list">
          <div className="panel-head">
            <div>
              <h3>Tutoriais publicados</h3>
              <p className="muted compact-copy">
                {loading
                  ? "Carregando biblioteca..."
                  : `${tutorials.length} tutorial(is) disponivel(is)${latestUpdate ? ` • ultima atualizacao ${latestUpdate}` : ""}`}
              </p>
            </div>
          </div>

          <div className="tutorial-marketplace-grid">
            {loading ? (
              <div className="marketplace-empty">
                <strong>Carregando tutoriais...</strong>
                <p>A biblioteca de aulas esta sendo preparada.</p>
              </div>
            ) : tutorials.length === 0 ? (
              <div className="marketplace-empty">
                <strong>Nenhum tutorial publicado ainda</strong>
                <p>Quando o administrador cadastrar novos tutoriais, eles aparecerao organizados aqui.</p>
              </div>
            ) : (
              tutorials.map((tutorial, index) => (
                <article key={tutorial.id} className="tutorial-marketplace-card">
                  <div className="tutorial-marketplace-card-media">
                    <span className="tutorial-marketplace-badge">Tutorial {index + 1}</span>
                    <div className="tutorial-marketplace-visual">
                      <strong>{tutorial.title}</strong>
                      <span>Video aula</span>
                    </div>
                  </div>

                  <div className="tutorial-marketplace-card-body">
                    <div className="tutorial-marketplace-card-head">
                      <strong>{tutorial.title}</strong>
                    </div>

                    <p>{tutorial.description}</p>

                    <span className="tutorial-marketplace-meta">
                      Atualizado em {tutorial.updatedAt ? new Date(tutorial.updatedAt).toLocaleString("pt-BR") : "-"}
                    </span>

                    <div className="tutorial-marketplace-card-actions">
                      <a href={tutorial.youtubeUrl} target="_blank" rel="noreferrer">
                        Acessar aulas no YouTube
                      </a>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function normalizeTutorialItem(raw: any): TutorialItem {
  return {
    id: Number(raw?.id || 0),
    title: String(raw?.title || ""),
    description: String(raw?.description || ""),
    youtubeUrl: String(raw?.youtubeUrl || ""),
    updatedAt: raw?.updatedAt ? String(raw.updatedAt) : null,
    createdAt: raw?.createdAt ? String(raw.createdAt) : null
  };
}

async function parseApiResponse(response: Response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}
