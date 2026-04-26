import { FormEvent, useState } from "react";
import logoBalao from "../../saas_php_robusto/imagem/logo_balao.png";
import logoPc from "../../saas_php_robusto/imagem/logo_pc.png";

const brandLogo = `${import.meta.env.BASE_URL}assets/logo.png`;

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  token: string;
  role: "admin" | "user";
  isPaid: boolean;
  accessExpiresAt?: string | null;
  permissions: {
    accessBandeiras: boolean;
    accessPainel: boolean;
    accessPlotagemGomo: boolean;
    accessTabelaMolde: boolean;
    accessMoldesSalvos: boolean;
    accessStorefront: boolean;
  };
};

type Props = {
  onAuthenticated: (user: AuthUser) => void;
};

type AuthResponse = {
  ok: boolean;
  user?: AuthUser;
  token?: string;
  message?: string;
  error?: string;
};

export function AuthPanel({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState("");
  const [status, setStatus] = useState<{ type: "idle" | "error" | "success"; message?: string }>({ type: "idle" });
  const [loading, setLoading] = useState(false);

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setStatus({ type: "idle" });

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword
        })
      });

      const payload = (await parseApiResponse(response)) as AuthResponse;
      if (!response.ok || payload.user == null || typeof payload.token !== "string") {
        throw new Error(payload.error || payload.message || "Nao foi possivel entrar.");
      }

      setStatus({ type: "success", message: "Acesso liberado. Entrando no sistema..." });
      onAuthenticated({ ...payload.user, token: payload.token });
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Nao foi possivel entrar."
      });
    } finally {
      setLoading(false);
    }
  };

  const submitRegister = async (event: FormEvent) => {
    event.preventDefault();
    setStatus({ type: "idle" });

    if (registerName.trim() === "" || registerEmail.trim() === "" || registerPassword.trim() === "") {
      setStatus({ type: "error", message: "Preencha nome, email e senha." });
      return;
    }

    if (registerPassword !== registerPasswordConfirm) {
      setStatus({ type: "error", message: "As senhas nao coincidem." });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: registerName,
          email: registerEmail,
          password: registerPassword
        })
      });

      const payload = (await parseApiResponse(response)) as AuthResponse;
      if (!response.ok || payload.user == null || typeof payload.token !== "string") {
        throw new Error(payload.error || payload.message || "Nao foi possivel criar a conta.");
      }

      setStatus({ type: "success", message: "Cadastro realizado com sucesso. Entrando no sistema..." });
      onAuthenticated({ ...payload.user, token: payload.token });
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Nao foi possivel criar a conta."
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-backdrop" />
      <section className="auth-card auth-reference-card">
        <div className="auth-showcase">
          <div className="auth-topbar">
            <div className="auth-brand auth-brand-inline">
              <img src={brandLogo} alt="Logo Alisson Projetos e Automacoes" className="auth-logo" />
              <div>
                <p className="eyebrow">Plataforma profissional</p>
                <strong className="auth-brand-lockup">ALISSON PROJETOS</strong>
              </div>
            </div>
            <div className="auth-topbar-actions">
              <span className="auth-topbar-chip">Plotagem de moldes</span>
              <span className="auth-topbar-chip subtle">Marketplace de projetos</span>
            </div>
          </div>

          <div className="auth-hero-layout">
            <div className="auth-hero-copy auth-reference-copy">
              <h1>
                Plotagem de moldes,
                <span> bandeiras, moldes salvos e marketplace para vender seus projetos</span>
              </h1>
              <div className="auth-pill-row">
                <span>Plotagem de moldes</span>
                <span>Bandeiras pixeladas</span>
                <span>Moldes salvos</span>
                <span>Marketplace para projetos</span>
              </div>
              <p className="auth-copy">
                Entre para montar seus moldes, salvar projetos prontos, produzir bandeiras com numeracao de cores e organizar um marketplace
                para vender seus projetos no mesmo painel.
              </p>
              <div className="auth-inline-stats">
                <div>
                  <strong>1 painel</strong>
                  <span>plotagem, biblioteca e vendas no mesmo ambiente</span>
                </div>
                <div>
                  <strong>Fluxo tecnico</strong>
                  <span>do cadastro do molde ao envio final dos arquivos</span>
                </div>
              </div>
            </div>

            <div className="auth-device-stage">
              <div className="auth-device-glow auth-device-glow-a" />
              <div className="auth-device-glow auth-device-glow-b" />
              <div className="auth-phone-mock">
                <div className="auth-phone-notch" />
                <div className="auth-phone-screen">
                  <div className="auth-phone-appbar">
                    <img src={brandLogo} alt="" className="auth-phone-logo" />
                    <div>
                      <strong>SISTEMA ALISSON PROJETOS</strong>
                      <span>PLOTAGEM DE MOLDES PARA QUALQUER MODELO DE SUA PREFERENCIA</span>
                    </div>
                  </div>
                  <img src={logoBalao} alt="Logo balao" className="auth-phone-hero-image" />
                  <div className="auth-phone-list">
                    <div />
                    <div />
                    <div />
                  </div>
                  <button type="button" className="auth-phone-cta">
                    Abrir sistema
                  </button>
                </div>
              </div>
              <div className="auth-stage-ring" />
            </div>
          </div>

          <div className="auth-ecosystem-grid">
            <article className="auth-ecosystem-card">
              <strong>Plotagem de moldes</strong>
              <span>Desenho tecnico, divisao em tacos, regioes, bainhas e conferencias completas da modelagem.</span>
            </article>
            <article className="auth-ecosystem-card">
              <strong>Bandeiras</strong>
              <span>Numeracao de cores, grade, leitura visual e preparacao de folhas para producao.</span>
            </article>
            <article className="auth-ecosystem-card">
              <strong>Marketplace para vender seus projetos</strong>
              <span>Organize vitrine, apresente seus projetos e facilite o contato comercial dentro da plataforma.</span>
            </article>
          </div>

          <div className="auth-bottom-band">
            <div className="auth-laptop-mock">
              <img src={logoPc} alt="Apresentacao do sistema Alisson Projetos" className="auth-laptop-art" />
            </div>

            <div className="auth-band-copy">
              <p className="eyebrow">Plataforma em uma unica estrutura</p>
              <h2>Crie, salve, visualize e organize moldes e bandeiras com mais clareza e produtividade</h2>
              <div className="auth-band-metrics">
                <div className="auth-stat">
                  <strong>Moldes e bandeiras</strong>
                  <span>producao visual com leitura tecnica e organizacao pratica no mesmo painel</span>
                </div>
                <div className="auth-stat">
                  <strong>1 acesso</strong>
                  <span>para controlar toda a operacao no mesmo lugar</span>
                </div>
              </div>
            </div>
          </div>

          <footer className="auth-footer">
            <div className="auth-footer-brand">
              <img src={brandLogo} alt="Logo Alisson Projetos" className="auth-footer-logo" />
              <div>
                <strong>ALISSON PROJETOS</strong>
                <span>Plotagem de moldes, bandeiras, moldes salvos e marketplace para projetos.</span>
              </div>
            </div>

            <div className="auth-footer-links">
              <span>Plotagem de moldes</span>
              <span>Bandeiras</span>
              <span>Moldes salvos</span>
              <span>Marketplace</span>
            </div>
          </footer>
        </div>

        <div className="auth-panel">
          <div className="auth-panel-head">
            <p className="eyebrow">Liberar acesso</p>
            <h3>{mode === "login" ? "Entrar no sistema" : "Criar sua conta"}</h3>
            <p className="muted">
              {mode === "login"
                ? "Use seu email e senha para acessar a plataforma."
                : "Cadastre seus dados para entrar e comecar a usar o sistema."}
            </p>
          </div>

          <div className="auth-panel-highlight">
            <strong>{mode === "login" ? "Acesso direto ao painel principal" : "Cadastro rapido para iniciar"}</strong>
            <span>
              {mode === "login"
                ? "Entre com sua conta para abrir plotagem de moldes, bandeiras, moldes salvos e marketplace conforme sua liberacao."
                : "Depois do cadastro voce entra automaticamente e ja pode usar a estrutura do sistema no mesmo navegador."}
            </span>
          </div>

          <div className="auth-switch">
            <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
              Login
            </button>
            <button type="button" className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>
              Cadastrar
            </button>
          </div>

          {mode === "login" ? (
            <form className="auth-form" onSubmit={submitLogin}>
              <label className="field">
                <span>Email</span>
                <input type="email" value={loginEmail} placeholder="seuemail@dominio.com" onChange={(event) => setLoginEmail(event.target.value)} />
              </label>
              <label className="field">
                <span>Senha</span>
                <input type="password" value={loginPassword} placeholder="Digite sua senha" onChange={(event) => setLoginPassword(event.target.value)} />
              </label>
              {status.message ? <div className={`delivery-status ${status.type === "success" ? "success" : "error"}`}>{status.message}</div> : null}
              <button type="submit" disabled={loading}>
                {loading ? "Entrando..." : "Acessar sistema"}
              </button>
            </form>
          ) : (
            <form className="auth-form" onSubmit={submitRegister}>
              <div className="auth-form-grid">
                <label className="field">
                  <span>Nome</span>
                  <input value={registerName} placeholder="Seu nome completo" onChange={(event) => setRegisterName(event.target.value)} />
                </label>
                <label className="field">
                  <span>Email</span>
                  <input type="email" value={registerEmail} placeholder="seuemail@dominio.com" onChange={(event) => setRegisterEmail(event.target.value)} />
                </label>
                <label className="field">
                  <span>Senha</span>
                  <input type="password" value={registerPassword} placeholder="Crie uma senha" onChange={(event) => setRegisterPassword(event.target.value)} />
                </label>
                <label className="field">
                  <span>Repetir senha</span>
                  <input
                    type="password"
                    value={registerPasswordConfirm}
                    placeholder="Repita a senha"
                    onChange={(event) => setRegisterPasswordConfirm(event.target.value)}
                  />
                </label>
              </div>
              {status.message ? <div className={`delivery-status ${status.type === "success" ? "success" : "error"}`}>{status.message}</div> : null}
              <button type="submit" disabled={loading}>
                {loading ? "Criando conta..." : "Criar conta"}
              </button>
            </form>
          )}

          <div className="auth-benefits">
            <div>
              <strong>Ambiente unificado</strong>
              <span>Entre e trabalhe com plotagem de moldes, bandeiras, moldes salvos e marketplace no mesmo painel.</span>
            </div>
            <div>
              <strong>Estrutura profissional</strong>
              <span>Visual tecnico, organizacao de dados e reaproveitamento rapido de projetos.</span>
            </div>
          </div>

          <div className="auth-socials">
            <div className="auth-socials-head">
              <strong>Canais de atendimento e divulgacao</strong>
              <span>Acompanhe os canais oficiais e fale diretamente pelos meios disponiveis.</span>
            </div>

            <div className="auth-socials-grid">
              <a href="https://wa.me/5521990792058" target="_blank" rel="noopener noreferrer" className="auth-social-link">
                <span className="auth-social-title">WhatsApp</span>
                <span className="auth-social-copy">Atendimento direto e rapido</span>
              </a>
              <a href="https://t.me/programador_OFC" target="_blank" rel="noopener noreferrer" className="auth-social-link">
                <span className="auth-social-title">Telegram</span>
                <span className="auth-social-copy">Canal e contato oficial</span>
              </a>
              <a
                href="https://www.instagram.com/alissoncardozo?igsh=MXh1aXM3dWszZDdpaQ=="
                target="_blank"
                rel="noopener noreferrer"
                className="auth-social-link"
              >
                <span className="auth-social-title">Instagram</span>
                <span className="auth-social-copy">Conteudos e apresentacao dos projetos</span>
              </a>
              <a
                href="https://github.com/Alisson-cardozo?tab=overview&from=2024-01-01&to=2024-01-13"
                target="_blank"
                rel="noopener noreferrer"
                className="auth-social-link"
              >
                <span className="auth-social-title">GitHub</span>
                <span className="auth-social-copy">Codigo, automacoes e portfolio tecnico</span>
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

async function parseApiResponse(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("A API de autenticacao nao respondeu corretamente.");
  }
}
