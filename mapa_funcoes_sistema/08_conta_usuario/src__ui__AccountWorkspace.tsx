import { FormEvent, useState } from "react";
import { AuthUser } from "./AuthPanel";
import { apiFetch } from "../lib/api";

type Props = {
  authUser: AuthUser;
  onUserUpdated: (user: AuthUser) => void;
};

export function AccountWorkspace({ authUser, onUserUpdated }: Props) {
  const [name, setName] = useState(authUser.name);
  const [email, setEmail] = useState(authUser.email);
  const [phoneWhatsapp, setPhoneWhatsapp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<{ type: "idle" | "success" | "error"; message?: string }>({ type: "idle" });
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (name.trim() === "") {
      setStatus({ type: "error", message: "Informe o nome." });
      return;
    }
    if (email.trim() === "") {
      setStatus({ type: "error", message: "Informe o email." });
      return;
    }

    if (newPassword.trim() !== "" && newPassword !== confirmPassword) {
      setStatus({ type: "error", message: "A nova senha e a confirmacao nao coincidem." });
      return;
    }

    setLoading(true);
    setStatus({ type: "idle" });
    try {
      const response = await apiFetch("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phoneWhatsapp,
          newPassword
        })
      });

      const payload = await parseApiResponse(response);
      if (!response.ok || payload.user == null) {
        throw new Error(payload.error || payload.message || "Nao foi possivel atualizar sua conta.");
      }

      onUserUpdated(payload.user as AuthUser);
      setNewPassword("");
      setConfirmPassword("");
      setPhoneWhatsapp("");
      setEmail((payload.user as AuthUser).email);
      setStatus({ type: "success", message: "Conta atualizada com sucesso." });
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Nao foi possivel atualizar sua conta." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="table-panel workspace-tab-panel account-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Minha conta</p>
          <h3>Alterar perfil e senha</h3>
          <p className="muted compact-copy">
            Tanto o administrador quanto qualquer usuario podem atualizar o proprio perfil e a propria senha dentro do sistema.
          </p>
        </div>
      </div>

      <div className="account-layout">
        <div className="panel account-summary-card">
          <h3>Dados atuais</h3>
          <div className="account-summary-grid">
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
        </div>

        <form className="panel account-form-card" onSubmit={submit}>
          <div className="grid two">
            <label className="field">
              <span>Nome</span>
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="field">
              <span>Email</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
          </div>

          <div className="grid two">
            <label className="field">
              <span>WhatsApp</span>
              <input value={phoneWhatsapp} onChange={(event) => setPhoneWhatsapp(event.target.value)} />
            </label>
          </div>

          <div className="grid two">
            <label className="field">
              <span>Senha atual</span>
              <input type="password" value="********" disabled />
            </label>
            <label className="field">
              <span>Nova senha</span>
              <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
            </label>
          </div>

          <label className="field">
            <span>Repetir nova senha</span>
            <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
          </label>

          <button type="submit" disabled={loading}>
            {loading ? "Salvando alteracoes..." : "Salvar alteracoes da conta"}
          </button>

          {status.message ? <div className={`delivery-status ${status.type === "success" ? "success" : "error"}`}>{status.message}</div> : null}
        </form>
      </div>
    </section>
  );
}

async function parseApiResponse(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("A API da conta nao respondeu corretamente.");
  }
}
