import { useEffect, useMemo, useState } from "react";
import type { AuthUser } from "./AuthPanel";
import { apiFetch, resolveAssetUrl } from "../lib/api";

type PlanItem = {
  id: number;
  name: string;
  description: string;
  price: number;
  durationDays: number;
  imageDataUrl: string;
  isPromo: boolean;
  isMostPopular: boolean;
  accessBandeiras: boolean;
  accessPainel: boolean;
  accessPlotagemGomo: boolean;
  accessTabelaMolde: boolean;
  accessMoldesSalvos: boolean;
  accessStorefront: boolean;
  status: "active" | "inactive";
};

type Props = {
  authUser: AuthUser;
  onAuthUserUpdated: (user: AuthUser) => void;
};

type CheckoutData = {
  orderId: number;
  paymentStatus: string;
  qrCodeBase64: string;
  pixCode: string;
  expiresAt: string | null;
  planName: string;
  amount: number;
  durationDays: number;
};

function normalizePlan(raw: any): PlanItem {
  return {
    id: Number(raw?.id || 0),
    name: String(raw?.name || ""),
    description: String(raw?.description || ""),
    price: Number(raw?.price || 0),
    durationDays: Number(raw?.durationDays || 0),
    imageDataUrl: String(raw?.imageDataUrl || ""),
    isPromo: raw?.isPromo === true || raw?.isPromo === 1 || raw?.isPromo === "1",
    isMostPopular: raw?.isMostPopular === true || raw?.isMostPopular === 1 || raw?.isMostPopular === "1",
    accessBandeiras: raw?.accessBandeiras === true || raw?.accessBandeiras === 1 || raw?.accessBandeiras === "1",
    accessPainel: raw?.accessPainel === true || raw?.accessPainel === 1 || raw?.accessPainel === "1",
    accessPlotagemGomo: raw?.accessPlotagemGomo === true || raw?.accessPlotagemGomo === 1 || raw?.accessPlotagemGomo === "1",
    accessTabelaMolde: raw?.accessTabelaMolde === true || raw?.accessTabelaMolde === 1 || raw?.accessTabelaMolde === "1",
    accessMoldesSalvos: raw?.accessMoldesSalvos === true || raw?.accessMoldesSalvos === 1 || raw?.accessMoldesSalvos === "1",
    accessStorefront: raw?.accessStorefront === true || raw?.accessStorefront === 1 || raw?.accessStorefront === "1",
    status: raw?.status === "inactive" ? "inactive" : "active"
  };
}

function toCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function enabledAccessCount(plan: PlanItem) {
  return [
    plan.accessBandeiras,
    plan.accessPainel,
    plan.accessPlotagemGomo,
    plan.accessTabelaMolde,
    plan.accessMoldesSalvos,
    plan.accessStorefront
  ].filter(Boolean).length;
}

function planFeatures(plan: PlanItem) {
  return [
    plan.accessBandeiras ? "Acesso a bandeiras pixeladas" : null,
    plan.accessPainel ? "Acesso ao painel e letreiros" : null,
    plan.accessPlotagemGomo ? "Plotagem completa de moldes" : null,
    plan.accessTabelaMolde ? "Cadastro da tabela do molde" : null,
    plan.accessMoldesSalvos ? "Biblioteca de moldes salvos" : null,
    plan.accessStorefront ? "Marketplace para publicar projetos" : null,
    plan.durationDays > 0 ? `${plan.durationDays} dias de liberacao` : null
  ].filter((item): item is string => item !== null);
}

export function PlansWorkspace({ authUser, onAuthUserUpdated }: Props) {
  const plansPerPage = 3;
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<{ type: "idle" | "error"; message?: string }>({ type: "idle" });
  const [selectedPlan, setSelectedPlan] = useState<PlanItem | null>(null);
  const [checkoutData, setCheckoutData] = useState<CheckoutData | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [copyState, setCopyState] = useState<{ type: "idle" | "success" | "error"; message?: string }>({ type: "idle" });
  const [unlockMessage, setUnlockMessage] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        setLoading(true);
        setStatus({ type: "idle" });
        const response = await apiFetch("/api/plans");
        const payload = await parseApiResponse(response);
        if (!response.ok) {
          throw new Error(payload.error || payload.message || "Nao foi possivel carregar os planos.");
        }

        if (!cancelled) {
          setPlans(Array.isArray(payload.items) ? payload.items.map(normalizePlan) : []);
        }
      } catch (error) {
        if (!cancelled) {
          setStatus({ type: "error", message: error instanceof Error ? error.message : "Nao foi possivel carregar os planos." });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (expiresAt == null) {
      setRemainingSeconds(0);
      return;
    }

    const updateRemaining = () => {
      const next = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setRemainingSeconds(next);
    };

    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  const pixCode = checkoutData?.pixCode || "";
  const qrCodeImageSrc = checkoutData?.qrCodeBase64
    ? `data:image/png;base64,${checkoutData.qrCodeBase64}`
    : pixCode
      ? `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(pixCode)}`
      : "";
  const totalPages = Math.max(1, Math.ceil(plans.length / plansPerPage));
  const paginatedPlans = useMemo(
    () => plans.slice((currentPage - 1) * plansPerPage, currentPage * plansPerPage),
    [currentPage, plans]
  );

  const checkoutExpired = selectedPlan != null && remainingSeconds <= 0;
  const formattedTimer = `${String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:${String(remainingSeconds % 60).padStart(2, "0")}`;

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (selectedPlan == null || checkoutData == null || checkoutExpired) {
      return;
    }

    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const response = await apiFetch(`/api/plans/checkout/${checkoutData.orderId}`);
          const payload = await parseApiResponse(response);
          if (!response.ok || !payload.checkout) {
            return;
          }

          setCheckoutData(payload.checkout);
          setExpiresAt(payload.checkout.expiresAt ? Date.parse(payload.checkout.expiresAt) : null);

          if (payload.user && payload.user.isPaid === true) {
            onAuthUserUpdated(payload.user);
            setSelectedPlan(null);
            setCheckoutData(null);
            setExpiresAt(null);
            setRemainingSeconds(0);
            setCopyState({ type: "idle" });
            setUnlockMessage("Parabens! Pagamento aprovado, acesso liberado. Aproveite todas as ferramentas.");
          }
        } catch {
        }
      })();
    }, 5000);

    return () => window.clearInterval(timer);
  }, [authUser.id, checkoutData, checkoutExpired, onAuthUserUpdated, selectedPlan]);

  const openCheckout = async (plan: PlanItem) => {
    setCheckoutLoading(true);
    setStatus({ type: "idle" });
    setCopyState({ type: "idle" });
    setUnlockMessage("");

    try {
      const response = await apiFetch("/api/plans/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: plan.id
        })
      });

      const payload = await parseApiResponse(response);
      if (!response.ok || !payload.checkout) {
        throw new Error(payload.error || payload.message || "Nao foi possivel abrir o checkout deste plano.");
      }

      setSelectedPlan(plan);
      setCheckoutData(payload.checkout);
      setExpiresAt(payload.checkout.expiresAt ? Date.parse(payload.checkout.expiresAt) : Date.now() + 10 * 60 * 1000);
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Nao foi possivel abrir o checkout." });
    } finally {
      setCheckoutLoading(false);
    }
  };

  const closeCheckout = async () => {
    if (checkoutData != null && selectedPlan != null && !checkoutExpired) {
      try {
        await apiFetch(`/api/plans/checkout/${checkoutData.orderId}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });
      } catch {
      }
    }
    setSelectedPlan(null);
    setCheckoutData(null);
    setExpiresAt(null);
    setRemainingSeconds(0);
    setCopyState({ type: "idle" });
  };

  const copyPixCode = async () => {
    if (!pixCode) {
      return;
    }

    try {
      await navigator.clipboard.writeText(pixCode);
      setCopyState({ type: "success", message: "Codigo copia e cola copiado com sucesso." });
    } catch {
      setCopyState({ type: "error", message: "Nao foi possivel copiar o codigo automaticamente." });
    }
  };

  return (
    <section className="table-panel workspace-tab-panel plans-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Planos ativos</p>
          <h3>{authUser.isPaid ? "Seu acesso esta ativo" : "Escolha um plano para liberar as ferramentas"}</h3>
          <p className="muted compact-copy">
            Aqui aparecem os planos que o administrador colocou no ar. Sem plano ativo, voce continua vendo o marketplace e pode analisar qual acesso faz mais sentido para voce.
          </p>
        </div>
      </div>

      {!authUser.isPaid ? (
        <div className="warning warning">
          Sua conta ainda nao possui plano ativo. Escolha um dos planos abaixo e fale com o administrador para liberar plotagem de gomo, moldes, bandeiras e demais ferramentas.
        </div>
      ) : (
        <div className="delivery-status success">Seu usuario ja possui acesso ativo. Mesmo assim, voce pode consultar os planos publicados nesta area.</div>
      )}

      {status.message ? <div className="delivery-status error">{status.message}</div> : null}
      {unlockMessage ? <div className="delivery-status success">{unlockMessage}</div> : null}

      <div className="plans-showcase">
        <section className="plans-hero-card">
          <div className="plans-hero-pill">
            <span>Acesso profissional</span>
            <strong>{loading ? "Carregando planos..." : `${plans.length} plano(s) publicado(s)`}</strong>
          </div>

          <div className="plans-hero-copy">
            <span className="eyebrow">Assinatura do sistema</span>
              <h3>
                Tudo que você precisa para plotar, <em>criar e produzir</em>, <em>em um só lugar.</em> Planos flexíveis, <em>acesso imediato</em> e sem limites.
              </h3>
              <p>
                Mais controle, mais recursos, mais resultado. Escolha o plano ideal e leve sua producao para outro nivel.
              </p>
            </div>

          <div className="plans-summary-strip">
            <div className="plans-summary-card">
              <span>Planos no ar</span>
              <strong>{loading ? "..." : plans.length}</strong>
            </div>
            <div className="plans-summary-card">
              <span>Status da conta</span>
              <strong>{authUser.isPaid ? "Ativa" : "Sem plano"}</strong>
            </div>
            <div className="plans-summary-card">
              <span>Marketplace</span>
              <strong>Liberado</strong>
            </div>
          </div>
        </section>

        <div className="plans-library-head">
          <div>
            <strong>Planos publicados</strong>
            <span>Use como vitrine de comparacao antes de abrir o checkout e concluir a contratacao.</span>
          </div>
          <div className="plans-library-count">{loading ? "..." : `${plans.length} plano(s)`}</div>
        </div>

        <div className="plans-grid plans-grid-premium">
          {loading ? (
            <div className="plans-empty">
              <strong>Carregando planos...</strong>
              <p>Estamos buscando os planos que o administrador publicou.</p>
            </div>
          ) : plans.length === 0 ? (
            <div className="plans-empty">
              <strong>Nenhum plano ativo no momento</strong>
              <p>Assim que o administrador publicar novos planos, eles vao aparecer aqui para consulta.</p>
            </div>
          ) : (
            paginatedPlans.map((plan) => (
              <article key={plan.id} className={`plan-store-card premium ${plan.isMostPopular ? "featured" : ""}`}>
                <div className="plan-store-badges static">
                  {plan.isPromo ? <span className="mini-badge promo">Promocao</span> : null}
                  {plan.isMostPopular ? <span className="mini-badge popular">Mais procurado</span> : null}
                </div>

                <div className="plan-store-tier">
                  <span>{plan.isMostPopular ? "Plano destaque" : "Plano disponivel"}</span>
                  <strong>{plan.name}</strong>
                </div>

                <div className="plan-store-price-block">
                  <strong>{toCurrency(plan.price)}</strong>
                </div>

                {plan.imageDataUrl ? (
                  <div className="plan-store-visual premium">
                    <img src={resolveAssetUrl(plan.imageDataUrl)} alt={plan.name} className="plan-store-image" />
                  </div>
                ) : null}

                <div className="plan-store-glance">
                  <div className="plan-store-glance-item">
                    <span>Duracao</span>
                    <strong>{plan.durationDays > 0 ? `${plan.durationDays} dias` : "Livre"}</strong>
                  </div>
                  <div className="plan-store-glance-item">
                    <span>Acessos</span>
                    <strong>{enabledAccessCount(plan)} modulos</strong>
                  </div>
                  <div className="plan-store-glance-item">
                    <span>Checkout</span>
                    <strong>Pix imediato</strong>
                  </div>
                </div>

                <ul className="plan-store-feature-list">
                  {planFeatures(plan).map((feature) => (
                    <li key={`${plan.id}-${feature}`}>{feature}</li>
                  ))}
                </ul>

                <div className="plan-store-cta">
                  <button type="button" onClick={() => openCheckout(plan)}>
                    {checkoutLoading && selectedPlan?.id === plan.id ? "Abrindo checkout..." : "Assinar agora"}
                  </button>
                </div>
              </article>
            ))
          )}
        </div>

        {!loading && plans.length > plansPerPage ? (
          <div className="plans-pagination">
            <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1}>
              Anterior
            </button>
            {Array.from({ length: totalPages }, (_, index) => {
              const page = index + 1;
              return (
                <button key={page} type="button" className={currentPage === page ? "active" : ""} onClick={() => setCurrentPage(page)}>
                  {page}
                </button>
              );
            })}
            <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages}>
              Proxima
            </button>
          </div>
        ) : null}
      </div>

      {selectedPlan ? (
        <div className="plan-checkout-backdrop" role="presentation" onClick={closeCheckout}>
        <section className="plan-checkout-panel" role="dialog" aria-modal="true" aria-label={`Checkout do plano ${selectedPlan.name}`} onClick={(event) => event.stopPropagation()}>
          <div className="plan-checkout-head">
            <div>
              <p className="eyebrow">Checkout do plano</p>
              <h3>Finalize a compra em ate 10 minutos</h3>
              <p className="muted compact-copy">
                Pague com Pix usando o QR Code abaixo ou o codigo copia e cola. Depois da expiracao, voce pode gerar uma nova tentativa de compra.
              </p>
            </div>
            <button type="button" className="plan-checkout-cancel" onClick={closeCheckout}>
              Cancelar compra
            </button>
          </div>

          <div className="plan-checkout-layout">
            <div className="plan-checkout-qr-card">
              <span className={`plan-checkout-timer ${checkoutExpired ? "expired" : ""}`}>
                {checkoutExpired ? "Tempo expirado" : `Expira em ${formattedTimer}`}
              </span>
              <div className="plan-checkout-qr-box">
                {qrCodeImageSrc ? (
                  <img
                    src={qrCodeImageSrc}
                    alt={`QR Code Pix do plano ${selectedPlan.name}`}
                    className="plan-checkout-qr-image"
                  />
                ) : (
                  <div className="plan-checkout-qr-fallback">QR indisponivel</div>
                )}
              </div>
              <strong>QR Code Pix</strong>
              <p>Abra o aplicativo do seu banco, escolha pagar com Pix e escaneie o codigo.</p>
            </div>

            <div className="plan-checkout-info-card">
              <div className="plan-checkout-banner">
                <strong>{selectedPlan.name}</strong>
                <span>{toCurrency(checkoutData?.amount ?? selectedPlan.price)} • {checkoutData?.durationDays ?? selectedPlan.durationDays} dia(s)</span>
              </div>

              <div className="plan-checkout-summary">
                <article>
                  <span>Plano</span>
                  <strong>{selectedPlan.name}</strong>
                </article>
                <article>
                  <span>Valor</span>
                  <strong>{toCurrency(checkoutData?.amount ?? selectedPlan.price)}</strong>
                </article>
                <article>
                  <span>Dias de acesso</span>
                  <strong>{checkoutData?.durationDays ?? selectedPlan.durationDays} dia(s)</strong>
                </article>
                <article>
                  <span>Status</span>
                  <strong>{String(checkoutData?.paymentStatus || "pending").toUpperCase()}</strong>
                </article>
              </div>

              <label className="field">
                <span>Pix copia e cola</span>
                <textarea rows={5} readOnly value={pixCode} />
              </label>

              <div className="plan-checkout-actions">
                <button type="button" onClick={copyPixCode} disabled={checkoutExpired}>
                  Copiar codigo Pix
                </button>
                <button type="button" onClick={closeCheckout}>
                  Voltar aos planos
                </button>
              </div>

              {copyState.message ? (
                <div className={`delivery-status ${copyState.type === "success" ? "success" : "error"}`}>{copyState.message}</div>
              ) : null}

              {checkoutExpired ? (
                <div className="delivery-status error">
                  O tempo desta compra expirou. Volte aos planos e abra novamente o checkout para gerar um novo codigo.
                </div>
              ) : (
                <div className="plan-checkout-instructions">
                  <strong>Resumo da compra</strong>
                  <ul>
                    <li>Plano: {selectedPlan.name}</li>
                    <li>Valor: {toCurrency(checkoutData?.amount ?? selectedPlan.price)}</li>
                    <li>Acesso: {checkoutData?.durationDays ?? selectedPlan.durationDays} dia(s)</li>
                    <li>Pagamento com expiracao de 10 minutos</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </section>
        </div>
      ) : null}
    </section>
  );
}

async function parseApiResponse(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("A API de planos nao respondeu corretamente.");
  }
}
