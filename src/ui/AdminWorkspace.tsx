import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch, resolveAssetUrl } from "../lib/api";

type AdminUser = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "user";
  accessStatus: "active" | "blocked";
  isPaid: boolean;
  accessExpiresAt: string | null;
  accessBandeiras: boolean;
  accessPainel: boolean;
  accessPlotagemGomo: boolean;
  accessTabelaMolde: boolean;
  accessMoldesSalvos: boolean;
  accessStorefront: boolean;
  createdAt: string;
};

type AdminPlan = {
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
  createdAt: string;
};

type PaymentSettings = {
  publicKey: string;
  accessToken: string;
  webhookSecret: string;
  updatedAt?: string;
};

type TutorialItem = {
  id: number;
  title: string;
  description: string;
  youtubeUrl: string;
  updatedAt?: string;
};

type AdminOrder = {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
  planId: number;
  planName: string;
  paymentStatus: string;
  amount: number;
  durationDays: number;
  createdAt: string;
  expiresAt: string | null;
  approvedAt: string | null;
  cancelledAt: string | null;
};

type NotificationItem = {
  id: number;
  userId: number | null;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
};

type SuggestionItem = {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
  rating: number;
  subject: string;
  suggestion: string;
  createdAt: string;
  messages: Array<{
    id: number;
    senderRole: "user" | "admin";
    message: string;
    createdAt: string;
  }>;
};

type PlanFormState = {
  id: number | null;
  name: string;
  description: string;
  price: string;
  durationDays: string;
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

type AdminPanelTab = "resumo" | "usuarios" | "planos" | "pagamentos" | "tutoriais" | "mensagens";

function normalizeAdminUser(raw: any): AdminUser {
  return {
    id: Number(raw?.id || 0),
    name: String(raw?.name || ""),
    email: String(raw?.email || ""),
    role: raw?.role === "admin" ? "admin" : "user",
    accessStatus: raw?.accessStatus === "blocked" ? "blocked" : "active",
    isPaid: raw?.isPaid === true || raw?.isPaid === 1 || raw?.isPaid === "1",
    accessExpiresAt: raw?.accessExpiresAt ? String(raw.accessExpiresAt) : null,
    accessBandeiras: raw?.accessBandeiras === true || raw?.accessBandeiras === 1 || raw?.accessBandeiras === "1",
    accessPainel: raw?.accessPainel === true || raw?.accessPainel === 1 || raw?.accessPainel === "1",
    accessPlotagemGomo: raw?.accessPlotagemGomo === true || raw?.accessPlotagemGomo === 1 || raw?.accessPlotagemGomo === "1",
    accessTabelaMolde: raw?.accessTabelaMolde === true || raw?.accessTabelaMolde === 1 || raw?.accessTabelaMolde === "1",
    accessMoldesSalvos: raw?.accessMoldesSalvos === true || raw?.accessMoldesSalvos === 1 || raw?.accessMoldesSalvos === "1",
    accessStorefront: raw?.accessStorefront === true || raw?.accessStorefront === 1 || raw?.accessStorefront === "1",
    createdAt: String(raw?.createdAt || "")
  };
}

function normalizeAdminPlan(raw: any): AdminPlan {
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
    status: raw?.status === "inactive" ? "inactive" : "active",
    createdAt: String(raw?.createdAt || "")
  };
}

function emptyPlanForm(): PlanFormState {
  return {
    id: null,
    name: "",
    description: "",
    price: "",
    durationDays: "30",
    imageDataUrl: "",
    isPromo: false,
    isMostPopular: false,
    accessBandeiras: false,
    accessPainel: false,
    accessPlotagemGomo: true,
    accessTabelaMolde: true,
    accessMoldesSalvos: true,
    accessStorefront: false,
    status: "active"
  };
}

function normalizeAdminOrder(raw: any): AdminOrder {
  return {
    id: Number(raw?.id || 0),
    userId: Number(raw?.userId || 0),
    userName: String(raw?.userName || ""),
    userEmail: String(raw?.userEmail || ""),
    planId: Number(raw?.planId || 0),
    planName: String(raw?.planName || ""),
    paymentStatus: String(raw?.paymentStatus || "pending"),
    amount: Number(raw?.amount || 0),
    durationDays: Number(raw?.durationDays || 0),
    createdAt: String(raw?.createdAt || ""),
    expiresAt: raw?.expiresAt ? String(raw.expiresAt) : null,
    approvedAt: raw?.approvedAt ? String(raw.approvedAt) : null,
    cancelledAt: raw?.cancelledAt ? String(raw.cancelledAt) : null
  };
}

function normalizeNotificationItem(raw: any): NotificationItem {
  return {
    id: Number(raw?.id || 0),
    userId: raw?.userId == null ? null : Number(raw.userId),
    type: String(raw?.type || ""),
    title: String(raw?.title || ""),
    body: String(raw?.body || ""),
    isRead: raw?.isRead === true || raw?.isRead === 1 || raw?.isRead === "1",
    createdAt: String(raw?.createdAt || "")
  };
}

function formatCurrencyBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function normalizeTutorialItem(raw: any): TutorialItem {
  return {
    id: Number(raw?.id || 0),
    title: String(raw?.title || ""),
    description: String(raw?.description || ""),
    youtubeUrl: String(raw?.youtubeUrl || ""),
    updatedAt: raw?.updatedAt ? String(raw.updatedAt) : undefined
  };
}

function normalizeSuggestionItem(raw: any): SuggestionItem {
  return {
    id: Number(raw?.id || 0),
    userId: Number(raw?.userId || 0),
    userName: String(raw?.userName || ""),
    userEmail: String(raw?.userEmail || ""),
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

async function fileToDataUrl(file: File) {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Nao foi possivel ler a imagem do plano."));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const instance = new Image();
    instance.onload = () => resolve(instance);
    instance.onerror = () => reject(new Error("Nao foi possivel processar a imagem do plano."));
    instance.src = rawDataUrl;
  });

  const maxSize = 960;
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Nao foi possivel preparar a imagem do plano.");
  }

  context.fillStyle = "#101510";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", 0.72);
}

export function AdminWorkspace({ onNotificationsChanged }: { onNotificationsChanged?: () => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [suggestionReplyDrafts, setSuggestionReplyDrafts] = useState<Record<number, string>>({});
  const [replyingSuggestionId, setReplyingSuggestionId] = useState<number | null>(null);
  const [deletingSuggestionId, setDeletingSuggestionId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<AdminPanelTab>("resumo");
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>({
    publicKey: "",
    accessToken: "",
    webhookSecret: ""
  });
  const [tutorials, setTutorials] = useState<TutorialItem[]>([]);
  const [tutorialEditingId, setTutorialEditingId] = useState<number | null>(null);
  const [tutorialForm, setTutorialForm] = useState<Omit<TutorialItem, "id">>({
    title: "",
    description: "",
    youtubeUrl: ""
  });
  const [planForm, setPlanForm] = useState<PlanFormState>(emptyPlanForm);
  const [messageTargetUserId, setMessageTargetUserId] = useState("");
  const [messageSubject, setMessageSubject] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [passwordTargetUserId, setPasswordTargetUserId] = useState("");
  const [profileTargetUserId, setProfileTargetUserId] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [grantTargetUserId, setGrantTargetUserId] = useState("");
  const [grantDays, setGrantDays] = useState("30");
  const [grantPermissions, setGrantPermissions] = useState({
    accessBandeiras: false,
    accessPainel: false,
    accessPlotagemGomo: true,
    accessTabelaMolde: true,
    accessMoldesSalvos: true,
    accessStorefront: false
  });
  const [status, setStatus] = useState<{ type: "idle" | "success" | "error"; message?: string }>({ type: "idle" });
  const [loading, setLoading] = useState(false);
  const [uploadingPlanImage, setUploadingPlanImage] = useState(false);

  const adminTabs: Array<{
    id: AdminPanelTab;
    label: string;
    copy: string;
  }> = [
    { id: "resumo", label: "Resumo", copy: "Visao geral rapida da operacao." },
    { id: "usuarios", label: "Usuarios", copy: "Acessos, bloqueios e senhas." },
    { id: "planos", label: "Planos", copy: "Ofertas, foto, acessos e status." },
    { id: "pagamentos", label: "Pagamentos", copy: "Mercado Pago e checkout." },
    { id: "tutoriais", label: "Tutoriais", copy: "Biblioteca de aulas e links do YouTube." },
    { id: "mensagens", label: "Mensagens", copy: "Comunicacao administrativa, avaliacoes e sugestoes." }
  ];

  const overview = useMemo(
    () => {
      const approvedOrders = orders.filter((order) => order.paymentStatus === "approved");
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfWeek = new Date(startOfDay);
      const dayOfWeek = startOfWeek.getDay();
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      startOfWeek.setDate(startOfWeek.getDate() - diffToMonday);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const getOrderPaidAt = (order: AdminOrder) => {
        const source = order.approvedAt || order.createdAt;
        const parsed = source ? new Date(source) : null;
        return parsed && Number.isFinite(parsed.getTime()) ? parsed : null;
      };

      const sumApprovedSince = (startDate: Date) =>
        approvedOrders.reduce((total, order) => {
          const paidAt = getOrderPaidAt(order);
          if (!paidAt || paidAt < startDate) {
            return total;
          }
          return total + order.amount;
        }, 0);

      return {
        totalUsers: users.length,
        blockedUsers: users.filter((user) => user.accessStatus === "blocked").length,
        paidUsers: users.filter((user) => user.isPaid).length,
        activePlans: plans.filter((plan) => plan.status === "active").length,
        revenueDay: sumApprovedSince(startOfDay),
        revenueWeek: sumApprovedSince(startOfWeek),
        revenueMonth: sumApprovedSince(startOfMonth)
      };
    },
    [orders, plans, users]
  );

  const loadAdminData = async () => {
    setLoading(true);
    setStatus({ type: "idle" });
    try {
      const [usersResponse, plansResponse, paymentResponse, tutorialResponse, ordersResponse, suggestionsResponse, notificationsResponse] = await Promise.all([
        apiFetch("/api/admin/users"),
        apiFetch("/api/admin/plans"),
        apiFetch("/api/admin/payment-settings"),
        apiFetch("/api/admin/tutorial"),
        apiFetch("/api/admin/orders"),
        apiFetch("/api/admin/suggestions"),
        apiFetch("/api/admin/notifications")
      ]);

      const usersPayload = await parseApiResponse(usersResponse);
      const plansPayload = await parseApiResponse(plansResponse);
      const paymentPayload = await parseApiResponse(paymentResponse);
      const tutorialPayload = await parseApiResponse(tutorialResponse);
      const ordersPayload = await parseApiResponse(ordersResponse);
      const suggestionsPayload = await parseApiResponse(suggestionsResponse);
      const notificationsPayload = await parseApiResponse(notificationsResponse);

      if (!usersResponse.ok) {
        throw new Error(usersPayload.error || usersPayload.message || "Nao foi possivel carregar usuarios.");
      }
      if (!plansResponse.ok) {
        throw new Error(plansPayload.error || plansPayload.message || "Nao foi possivel carregar planos.");
      }
      if (!paymentResponse.ok) {
        throw new Error(paymentPayload.error || paymentPayload.message || "Nao foi possivel carregar credenciais.");
      }
      if (!tutorialResponse.ok) {
        throw new Error(tutorialPayload.error || tutorialPayload.message || "Nao foi possivel carregar o tutorial.");
      }
      if (!ordersResponse.ok) {
        throw new Error(ordersPayload.error || ordersPayload.message || "Nao foi possivel carregar os pedidos.");
      }
      if (!suggestionsResponse.ok) {
        throw new Error(suggestionsPayload.error || suggestionsPayload.message || "Nao foi possivel carregar as sugestoes.");
      }
      if (!notificationsResponse.ok) {
        throw new Error(notificationsPayload.error || notificationsPayload.message || "Nao foi possivel carregar as notificacoes.");
      }

      setUsers(Array.isArray(usersPayload.items) ? usersPayload.items.map(normalizeAdminUser) : []);
      setPlans(Array.isArray(plansPayload.items) ? plansPayload.items.map(normalizeAdminPlan) : []);
      setOrders(Array.isArray(ordersPayload.items) ? ordersPayload.items.map(normalizeAdminOrder) : []);
      setSuggestions(Array.isArray(suggestionsPayload.items) ? suggestionsPayload.items.map(normalizeSuggestionItem) : []);
      setNotifications(Array.isArray(notificationsPayload.items) ? notificationsPayload.items.map(normalizeNotificationItem) : []);
      if (Array.isArray(notificationsPayload.items) && notificationsPayload.items.every((item: any) => item?.isRead === true || item?.isRead === 1 || item?.isRead === "1")) {
        onNotificationsChanged?.();
      }
      if (paymentPayload.settings && typeof paymentPayload.settings === "object") {
        setPaymentSettings({
          publicKey: paymentPayload.settings.publicKey || "",
          accessToken: paymentPayload.settings.accessToken || "",
          webhookSecret: paymentPayload.settings.webhookSecret || "",
          updatedAt: paymentPayload.settings.updatedAt
        });
      }
      setTutorials(Array.isArray(tutorialPayload.items) ? tutorialPayload.items.map(normalizeTutorialItem) : []);
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Nao foi possivel carregar o painel administrativo."
      });
    } finally {
      setLoading(false);
    }
  };

  const markNotificationAsRead = async (notificationId: number) => {
    try {
      const response = await apiFetch(`/api/admin/notifications/${notificationId}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const payload = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Nao foi possivel marcar a notificacao como lida.");
      }
      await loadAdminData();
      onNotificationsChanged?.();
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Erro ao marcar notificacao como lida." });
    }
  };

  useEffect(() => {
    void loadAdminData();
  }, []);

  useEffect(() => {
    const selectedUser = users.find((user) => String(user.id) === profileTargetUserId);
    setProfileName(selectedUser?.name ?? "");
    setProfileEmail(selectedUser?.email ?? "");
  }, [profileTargetUserId, users]);

  const savePlan = async (event: FormEvent) => {
    event.preventDefault();
    const price = Number(String(planForm.price).replace(",", "."));
    const durationDays = Number(String(planForm.durationDays).replace(",", "."));
    if (!planForm.name.trim() || !planForm.description.trim() || !Number.isFinite(price) || price < 0 || !Number.isFinite(durationDays) || durationDays <= 0) {
      setStatus({ type: "error", message: "Preencha nome, descricao, valor e a quantidade de dias do plano." });
      return;
    }

    try {
      const response = await apiFetch(planForm.id ? `/api/admin/plans/${planForm.id}` : "/api/admin/plans", {
        method: planForm.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: planForm.name,
          description: planForm.description,
          price,
          durationDays,
          imageDataUrl: planForm.imageDataUrl,
          isPromo: planForm.isPromo,
          isMostPopular: planForm.isMostPopular,
          accessBandeiras: planForm.accessBandeiras,
          accessPainel: planForm.accessPainel,
          accessPlotagemGomo: planForm.accessPlotagemGomo,
          accessTabelaMolde: planForm.accessTabelaMolde,
          accessMoldesSalvos: planForm.accessMoldesSalvos,
          accessStorefront: planForm.accessStorefront,
          status: planForm.status
        })
      });
      const payload = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Nao foi possivel salvar o plano.");
      }
      setPlanForm(emptyPlanForm());
      setStatus({ type: "success", message: planForm.id ? "Plano atualizado com sucesso." : "Plano criado com sucesso." });
      await loadAdminData();
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Erro ao salvar plano." });
    }
  };

  const editPlan = (plan: AdminPlan) => {
    setPlanForm({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      price: String(plan.price).replace(".", ","),
      durationDays: String(plan.durationDays),
      imageDataUrl: plan.imageDataUrl,
      isPromo: plan.isPromo,
      isMostPopular: plan.isMostPopular,
      accessBandeiras: plan.accessBandeiras,
      accessPainel: plan.accessPainel,
      accessPlotagemGomo: plan.accessPlotagemGomo,
      accessTabelaMolde: plan.accessTabelaMolde,
      accessMoldesSalvos: plan.accessMoldesSalvos,
      accessStorefront: plan.accessStorefront,
      status: plan.status
    });
    setStatus({ type: "idle" });
  };

  const deletePlan = async (id: number) => {
    try {
      const response = await apiFetch(`/api/admin/plans/${id}`, { method: "DELETE" });
      const payload = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Nao foi possivel excluir o plano.");
      }
      setStatus({ type: "success", message: "Plano excluido com sucesso." });
      if (planForm.id === id) {
        setPlanForm(emptyPlanForm());
      }
      await loadAdminData();
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Erro ao excluir plano." });
    }
  };

  const toggleUserAccess = async (user: AdminUser) => {
    try {
      const response = await apiFetch(`/api/admin/users/${user.id}/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessStatus: user.accessStatus === "active" ? "blocked" : "active"
        })
      });
      const payload = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Nao foi possivel alterar o acesso.");
      }
      setStatus({
        type: "success",
        message: user.accessStatus === "active" ? "Usuario bloqueado com sucesso." : "Usuario liberado com sucesso."
      });
      await loadAdminData();
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Erro ao alterar acesso." });
    }
  };

  const updateUserProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!profileTargetUserId || !profileName.trim() || !profileEmail.trim()) {
      setStatus({ type: "error", message: "Selecione o usuario e informe nome e email." });
      return;
    }

    try {
      const response = await apiFetch(`/api/admin/users/${profileTargetUserId}/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profileName,
          email: profileEmail
        })
      });
      const payload = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Nao foi possivel atualizar o perfil do usuario.");
      }
      setStatus({ type: "success", message: "Perfil do usuario atualizado com sucesso." });
      await loadAdminData();
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Erro ao atualizar o perfil do usuario." });
    }
  };

  const grantUserAccess = async (event: FormEvent) => {
    event.preventDefault();
    const durationDays = Number(String(grantDays).replace(",", "."));

    if (!grantTargetUserId) {
      setStatus({ type: "error", message: "Selecione o usuario que vai receber a liberacao." });
      return;
    }

    if (!Number.isFinite(durationDays) || durationDays <= 0) {
      setStatus({ type: "error", message: "Informe uma quantidade valida de dias para a liberacao." });
      return;
    }

    if (!Object.values(grantPermissions).some(Boolean)) {
      setStatus({ type: "error", message: "Escolha pelo menos uma permissao para liberar ao usuario." });
      return;
    }

    try {
      const response = await apiFetch(`/api/admin/users/${grantTargetUserId}/grant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          days: durationDays,
          ...grantPermissions
        })
      });
      const payload = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Nao foi possivel liberar o acesso do usuario.");
      }
      setStatus({ type: "success", message: "Liberacao manual aplicada com sucesso." });
      await loadAdminData();
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Erro ao liberar acesso do usuario." });
    }
  };

  const revokeUserAccess = async () => {
    if (!grantTargetUserId) {
      setStatus({ type: "error", message: "Selecione o usuario que vai perder a liberacao manual." });
      return;
    }

    try {
      const response = await apiFetch(`/api/admin/users/${grantTargetUserId}/revoke-grant`, {
        method: "POST"
      });
      const payload = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Nao foi possivel cancelar a liberacao manual do usuario.");
      }
      setStatus({ type: "success", message: "Liberacao manual cancelada com sucesso." });
      await loadAdminData();
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Erro ao cancelar a liberacao manual do usuario."
      });
    }
  };

  const changeUserPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!passwordTargetUserId || !newPassword.trim()) {
      setStatus({ type: "error", message: "Selecione o usuario e informe a nova senha." });
      return;
    }

    try {
      const response = await apiFetch(`/api/admin/users/${passwordTargetUserId}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword })
      });
      const payload = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Nao foi possivel alterar a senha.");
      }
      setNewPassword("");
      setStatus({ type: "success", message: "Senha alterada com sucesso." });
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Erro ao alterar senha." });
    }
  };

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!messageTargetUserId || !messageSubject.trim() || !messageBody.trim()) {
      setStatus({ type: "error", message: "Selecione o usuario e preencha assunto e mensagem." });
      return;
    }

    try {
      const response = await apiFetch("/api/admin/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: Number(messageTargetUserId),
          subject: messageSubject,
          message: messageBody
        })
      });
      const payload = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Nao foi possivel registrar a mensagem.");
      }
      setMessageSubject("");
      setMessageBody("");
      setStatus({ type: "success", message: "Mensagem administrativa registrada com sucesso." });
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Erro ao registrar mensagem." });
    }
  };

  const replyToSuggestion = async (suggestionId: number) => {
    const message = (suggestionReplyDrafts[suggestionId] || "").trim();
    if (!message) {
      setStatus({ type: "error", message: "Digite a resposta antes de enviar ao usuario." });
      return;
    }

    try {
      setReplyingSuggestionId(suggestionId);
      const response = await apiFetch(`/api/admin/suggestions/${suggestionId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message })
      });
      const payload = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Nao foi possivel responder a sugestao.");
      }
      setSuggestionReplyDrafts((current) => ({ ...current, [suggestionId]: "" }));
      setStatus({ type: "success", message: "Resposta enviada ao usuario com sucesso." });
      await loadAdminData();
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Erro ao responder a sugestao." });
    } finally {
      setReplyingSuggestionId(null);
    }
  };

  const deleteSuggestion = async (suggestionId: number) => {
    try {
      setDeletingSuggestionId(suggestionId);
      const response = await apiFetch(`/api/admin/suggestions/${suggestionId}`, {
        method: "DELETE"
      });
      const payload = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Nao foi possivel excluir a sugestao.");
      }
      setSuggestionReplyDrafts((current) => {
        const next = { ...current };
        delete next[suggestionId];
        return next;
      });
      setStatus({ type: "success", message: "Conversa de sugestao excluida com sucesso." });
      await loadAdminData();
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Erro ao excluir a sugestao." });
    } finally {
      setDeletingSuggestionId(null);
    }
  };

  const savePaymentSettings = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const response = await apiFetch("/api/admin/payment-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentSettings)
      });
      const payload = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Nao foi possivel salvar as credenciais.");
      }
      setStatus({ type: "success", message: "Credenciais do Mercado Pago salvas com sucesso." });
      await loadAdminData();
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Erro ao salvar credenciais." });
    }
  };

  const resetTutorialForm = () => {
    setTutorialEditingId(null);
    setTutorialForm({
      title: "",
      description: "",
      youtubeUrl: ""
    });
  };

  const saveTutorialSettings = async (event: FormEvent) => {
    event.preventDefault();
    if (!tutorialForm.title.trim()) {
      setStatus({ type: "error", message: "Informe o nome do tutorial." });
      return;
    }
    if (!tutorialForm.description.trim()) {
      setStatus({ type: "error", message: "Informe a descricao do tutorial." });
      return;
    }

    try {
      const response = await apiFetch(tutorialEditingId ? `/api/admin/tutorial/${tutorialEditingId}` : "/api/admin/tutorial", {
        method: tutorialEditingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tutorialForm)
      });
      const payload = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Nao foi possivel salvar o tutorial.");
      }
      setStatus({ type: "success", message: tutorialEditingId ? "Tutorial atualizado com sucesso." : "Tutorial criado com sucesso." });
      resetTutorialForm();
      await loadAdminData();
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Erro ao salvar tutorial." });
    }
  };

  const editTutorialSettings = (tutorial: TutorialItem) => {
    setTutorialEditingId(tutorial.id);
    setTutorialForm({
      title: tutorial.title || "",
      description: tutorial.description || "",
      youtubeUrl: tutorial.youtubeUrl || ""
    });
    setStatus({ type: "success", message: "Tutorial carregado no formulario para edicao." });
  };

  const deleteTutorialSettings = async (tutorialId: number) => {
    try {
      const response = await apiFetch(`/api/admin/tutorial/${tutorialId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" }
      });
      const payload = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Nao foi possivel excluir o tutorial.");
      }
      if (tutorialEditingId === tutorialId) {
        resetTutorialForm();
      }
      setStatus({ type: "success", message: "Tutorial excluido com sucesso." });
      await loadAdminData();
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Erro ao excluir tutorial." });
    }
  };

  const approveOrder = async (orderId: number) => {
    try {
      const response = await apiFetch(`/api/admin/plans/${orderId}/approve-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const payload = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Nao foi possivel aprovar o pedido.");
      }
      setStatus({ type: "success", message: "Pedido aprovado e acesso liberado ao usuario." });
      await loadAdminData();
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Erro ao aprovar pedido." });
    }
  };

  const handlePlanImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      setUploadingPlanImage(true);
      setStatus({ type: "success", message: "Preparando e enviando a foto do plano..." });
      const imageDataUrl = await fileToDataUrl(file);
      const response = await apiFetch("/api/admin/plan-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl })
      });
      const payload = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Nao foi possivel enviar a imagem do plano.");
      }
      setPlanForm((current) => ({ ...current, imageDataUrl: String(payload.imagePath || "") }));
      setStatus({ type: "success", message: "Foto do plano enviada com sucesso." });
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Nao foi possivel carregar a imagem do plano." });
    } finally {
      setUploadingPlanImage(false);
      event.target.value = "";
    }
  };

  return (
    <section className="table-panel workspace-tab-panel admin-panel">
      <div className="admin-hero">
        <div>
          <p className="eyebrow">Painel administrativo</p>
          <h3>Gestao completa da plataforma</h3>
          <p className="muted compact-copy">
            Aqui voce administra usuarios, controla liberacao de acesso, organiza planos com destaque comercial, cadastra credenciais do Mercado
            Pago e registra comunicacoes operacionais da plataforma.
          </p>
        </div>
        <div className="admin-hero-actions">
          <button type="button" onClick={() => void loadAdminData()} disabled={loading}>
            {loading ? "Atualizando..." : "Atualizar painel"}
          </button>
        </div>
      </div>

      {status.message ? <div className={`delivery-status ${status.type === "success" ? "success" : "error"}`}>{status.message}</div> : null}

      <div className="admin-workspace">
        <aside className="admin-nav">
          <div className="admin-nav-head">
            <p className="eyebrow">Setores do painel</p>
            <h3>Gerencie cada area separadamente</h3>
            <p className="muted compact-copy">
              Escolha ao lado o setor que deseja administrar. Cada aba concentra apenas o que e daquele fluxo.
            </p>
          </div>

          <div className="admin-subtabs">
            {adminTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={tab.id === activeTab ? "active" : ""}
                onClick={() => setActiveTab(tab.id)}
              >
                <strong>{tab.label}</strong>
                <span>{tab.copy}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="admin-content">
      <div className="admin-grid">
        {activeTab === "resumo" ? (
          <>
            <section className="panel admin-section admin-summary-section">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Resumo administrativo</p>
                  <h3>Visao geral do painel</h3>
                  <p className="muted compact-copy">
                    Aqui fica o resumo rapido da plataforma para voce acompanhar usuarios, planos publicados e situacao comercial antes de entrar nas abas especificas.
                  </p>
                </div>
              </div>

              <div className="admin-overview-grid">
                <article className="admin-metric-card">
                  <span>Usuarios cadastrados</span>
                  <strong>{overview.totalUsers}</strong>
                  <p>Base total de contas registradas na plataforma.</p>
                </article>
                <article className="admin-metric-card">
                  <span>Usuarios bloqueados</span>
                  <strong>{overview.blockedUsers}</strong>
                  <p>Contas com acesso suspenso pelo administrador.</p>
                </article>
                <article className="admin-metric-card">
                  <span>Usuarios pagos</span>
                  <strong>{overview.paidUsers}</strong>
                  <p>Clientes marcados com acesso pago ativo.</p>
                </article>
                <article className="admin-metric-card">
                  <span>Planos ativos</span>
                  <strong>{overview.activePlans}</strong>
                  <p>Planos disponiveis para oferta dentro da plataforma.</p>
                </article>
              </div>

              <div className="admin-summary-boards">
                <article className="admin-summary-card">
                  <span className="eyebrow">Usuarios</span>
                  <strong>{users.length ? `${users.length} conta(s) no sistema` : "Nenhum usuario cadastrado"}</strong>
                  <p>Entre na aba Usuarios para bloquear acessos, redefinir senha e acompanhar quem esta pago ou bloqueado.</p>
                </article>
                <article className="admin-summary-card">
                  <span className="eyebrow">Planos</span>
                  <strong>{plans.length ? `${plans.length} plano(s) publicados` : "Nenhum plano publicado"}</strong>
                  <p>Na aba Planos voce cadastra oferta, envia foto, define acessos e organiza a vitrine comercial.</p>
                </article>
                <article className="admin-summary-card">
                  <span className="eyebrow">Operacao</span>
                  <strong>Pagamentos e mensagens separados</strong>
                  <p>Credenciais do Mercado Pago e comunicacao administrativa agora ficam em abas proprias para nao misturar o fluxo.</p>
                </article>
              </div>

              <div className="admin-summary-boards">
                <article className="admin-summary-card">
                  <span className="eyebrow">Faturamento do dia</span>
                  <strong>{formatCurrencyBRL(overview.revenueDay)}</strong>
                  <p>Soma das vendas de planos com pagamento aprovado hoje.</p>
                </article>
                <article className="admin-summary-card">
                  <span className="eyebrow">Faturamento da semana</span>
                  <strong>{formatCurrencyBRL(overview.revenueWeek)}</strong>
                  <p>Soma dos pedidos aprovados na semana atual.</p>
                </article>
                <article className="admin-summary-card">
                  <span className="eyebrow">Faturamento do mes</span>
                  <strong>{formatCurrencyBRL(overview.revenueMonth)}</strong>
                  <p>Total das vendas aprovadas no mes atual.</p>
                </article>
              </div>
            </section>
          </>
        ) : null}

        {activeTab === "usuarios" ? (
          <section className="panel admin-section admin-users-section">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Gestao de usuarios</p>
                <h3>Usuarios</h3>
                <p className="muted compact-copy">Veja email, status de acesso, perfil e realize bloqueio, liberacao e troca de senha.</p>
              </div>
            </div>

            <div className="editor-table">
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Email</th>
                    <th>Perfil</th>
                    <th>Acesso</th>
                    <th>Pago</th>
                    <th>Liberado ate</th>
                    <th>Criado em</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.name}</td>
                      <td>{user.email}</td>
                      <td>{user.role === "admin" ? "Administrador" : "Usuario"}</td>
                      <td>{user.accessStatus === "active" ? "Liberado" : "Bloqueado"}</td>
                      <td>{user.isPaid ? "Sim" : "Nao"}</td>
                      <td>{user.accessExpiresAt ? new Date(user.accessExpiresAt).toLocaleString("pt-BR") : "-"}</td>
                      <td>{new Date(user.createdAt).toLocaleString("pt-BR")}</td>
                      <td>
                        {user.role === "admin" ? (
                          <span className="muted">Admin principal</span>
                        ) : (
                          <button type="button" onClick={() => void toggleUserAccess(user)}>
                            {user.accessStatus === "active" ? "Bloquear" : "Liberar"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <form className="admin-inline-form" onSubmit={updateUserProfile}>
              <div className="grid two">
                <label className="field">
                  <span>Usuario para editar perfil</span>
                  <select value={profileTargetUserId} onChange={(event) => setProfileTargetUserId(event.target.value)}>
                    <option value="">Selecione</option>
                    {users.map((user) => (
                      <option key={user.id} value={String(user.id)}>
                        {user.name} - {user.email}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Nome</span>
                  <input value={profileName} onChange={(event) => setProfileName(event.target.value)} />
                </label>
              </div>
              <label className="field">
                <span>Email</span>
                <input type="email" value={profileEmail} onChange={(event) => setProfileEmail(event.target.value)} />
              </label>
              <button type="submit">Alterar nome e email do usuario</button>
            </form>

            <form className="admin-inline-form" onSubmit={changeUserPassword}>
              <div className="grid two">
                <label className="field">
                  <span>Usuario para trocar senha</span>
                  <select value={passwordTargetUserId} onChange={(event) => setPasswordTargetUserId(event.target.value)}>
                    <option value="">Selecione</option>
                    {users.map((user) => (
                      <option key={user.id} value={String(user.id)}>
                        {user.name} - {user.email}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Nova senha</span>
                  <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
                </label>
              </div>
              <button type="submit">Alterar senha do usuario</button>
            </form>

            <form className="admin-inline-form" onSubmit={grantUserAccess}>
              <div className="panel-head small">
                <div>
                  <p className="eyebrow">Liberacao manual</p>
                  <h3>Dias e permissoes por usuario</h3>
                  <p className="muted compact-copy">Use esta area para liberar ferramentas especificas para um usuario, mesmo sem compra imediata do plano.</p>
                </div>
              </div>

              <div className="grid two">
                <label className="field">
                  <span>Usuario para liberar</span>
                  <select value={grantTargetUserId} onChange={(event) => setGrantTargetUserId(event.target.value)}>
                    <option value="">Selecione</option>
                    {users
                      .filter((user) => user.role !== "admin")
                      .map((user) => (
                        <option key={user.id} value={String(user.id)}>
                          {user.name} - {user.email}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="field">
                  <span>Quantidade de dias</span>
                  <input value={grantDays} onChange={(event) => setGrantDays(event.target.value)} />
                </label>
              </div>

              <div className="admin-access-grid">
                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={grantPermissions.accessBandeiras}
                    onChange={(event) => setGrantPermissions((current) => ({ ...current, accessBandeiras: event.target.checked }))}
                  />
                  <span>Funcoes de bandeiras</span>
                </label>
                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={grantPermissions.accessPainel}
                    onChange={(event) => setGrantPermissions((current) => ({ ...current, accessPainel: event.target.checked }))}
                  />
                  <span>Painel e letreiros</span>
                </label>
                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={grantPermissions.accessPlotagemGomo}
                    onChange={(event) => setGrantPermissions((current) => ({ ...current, accessPlotagemGomo: event.target.checked }))}
                  />
                  <span>Plotagem de gomo</span>
                </label>
                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={grantPermissions.accessTabelaMolde}
                    onChange={(event) => setGrantPermissions((current) => ({ ...current, accessTabelaMolde: event.target.checked }))}
                  />
                  <span>Adicionar tabela do molde</span>
                </label>
                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={grantPermissions.accessMoldesSalvos}
                    onChange={(event) => setGrantPermissions((current) => ({ ...current, accessMoldesSalvos: event.target.checked }))}
                  />
                  <span>Usar moldes ja adicionados</span>
                </label>
                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={grantPermissions.accessStorefront}
                    onChange={(event) => setGrantPermissions((current) => ({ ...current, accessStorefront: event.target.checked }))}
                  />
                  <span>Ter loja no sistema</span>
                </label>
              </div>

              <div className="admin-plan-actions">
                <button type="submit">Liberar acesso manual do usuario</button>
                <button type="button" onClick={() => void revokeUserAccess()}>
                  Cancelar liberacao manual
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {activeTab === "planos" ? (
        <section className="panel admin-section">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Gestao de planos</p>
              <h3>Planos da plataforma</h3>
              <p className="muted compact-copy">
                Crie planos com foto, promocao, destaque de mais comprado e niveis de acesso por funcionalidade do sistema.
              </p>
            </div>
          </div>

          <div className="admin-plan-stage">
            <form className="admin-plan-form" onSubmit={savePlan}>
              <div className="admin-plan-form-head">
                <div>
                  <strong>{planForm.id ? "Editando plano" : "Novo plano"}</strong>
                  <span>Monte a oferta, defina os acessos e deixe a vitrine pronta para venda.</span>
                </div>
                <div className="admin-plan-head-badge">{planForm.id ? "Modo edicao" : "Cadastro rapido"}</div>
              </div>

              <div className="grid two">
                <label className="field">
                  <span>Nome do plano</span>
                  <input value={planForm.name} onChange={(event) => setPlanForm((current) => ({ ...current, name: event.target.value }))} />
                </label>
                <label className="field">
                  <span>Valor</span>
                  <input value={planForm.price} onChange={(event) => setPlanForm((current) => ({ ...current, price: event.target.value }))} />
                </label>
              </div>
              <label className="field">
                <span>Quantidade de dias de acesso</span>
                <input
                  value={planForm.durationDays}
                  onChange={(event) => setPlanForm((current) => ({ ...current, durationDays: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>Descricao detalhada</span>
                <textarea rows={4} value={planForm.description} onChange={(event) => setPlanForm((current) => ({ ...current, description: event.target.value }))} />
              </label>

              <div className="admin-plan-preview-frame">
                <div className="admin-plan-preview-copy">
                  <span>Capa do plano</span>
                  <strong>{planForm.imageDataUrl ? "Imagem pronta para exibicao" : "Envie uma foto para destacar o plano"}</strong>
                  <p>{uploadingPlanImage ? "A imagem esta sendo enviada e preparada para a vitrine." : "Use uma imagem limpa e impactante para deixar o plano com mais valor visual."}</p>
                </div>
                {planForm.imageDataUrl ? (
                  <img src={resolveAssetUrl(planForm.imageDataUrl)} alt="Preview do plano" className="admin-plan-image-preview" />
                ) : (
                  <div className="admin-plan-empty-image">Sem foto do plano</div>
                )}
              </div>

              <label className="upload-button">
                <input type="file" accept="image/*" onChange={handlePlanImage} disabled={uploadingPlanImage} />
                {uploadingPlanImage
                  ? "Enviando foto..."
                  : planForm.imageDataUrl
                    ? "Trocar foto do plano"
                    : "Enviar foto do plano"}
              </label>

              <div className="grid two">
                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={planForm.isPromo}
                    onChange={(event) => setPlanForm((current) => ({ ...current, isPromo: event.target.checked }))}
                  />
                  <span>Plano em promocao</span>
                </label>
                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={planForm.isMostPopular}
                    onChange={(event) => setPlanForm((current) => ({ ...current, isMostPopular: event.target.checked }))}
                  />
                  <span>Plano mais comprado</span>
                </label>
              </div>

              <div className="admin-access-grid">
                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={planForm.accessBandeiras}
                    onChange={(event) => setPlanForm((current) => ({ ...current, accessBandeiras: event.target.checked }))}
                  />
                  <span>Funcoes de bandeiras</span>
                </label>
                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={planForm.accessPainel}
                    onChange={(event) => setPlanForm((current) => ({ ...current, accessPainel: event.target.checked }))}
                  />
                  <span>Painel e letreiros</span>
                </label>
                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={planForm.accessPlotagemGomo}
                    onChange={(event) => setPlanForm((current) => ({ ...current, accessPlotagemGomo: event.target.checked }))}
                  />
                  <span>Plotagem de gomo</span>
                </label>
                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={planForm.accessTabelaMolde}
                    onChange={(event) => setPlanForm((current) => ({ ...current, accessTabelaMolde: event.target.checked }))}
                  />
                  <span>Adicionar tabela do molde</span>
                </label>
                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={planForm.accessMoldesSalvos}
                    onChange={(event) => setPlanForm((current) => ({ ...current, accessMoldesSalvos: event.target.checked }))}
                  />
                  <span>Usar moldes ja adicionados</span>
                </label>
                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={planForm.accessStorefront}
                    onChange={(event) => setPlanForm((current) => ({ ...current, accessStorefront: event.target.checked }))}
                  />
                  <span>Ter loja no sistema</span>
                </label>
              </div>

              <label className="field">
                <span>Status do plano</span>
                <select value={planForm.status} onChange={(event) => setPlanForm((current) => ({ ...current, status: event.target.value as "active" | "inactive" }))}>
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </select>
              </label>

              <div className="admin-plan-actions">
                <button type="submit" disabled={uploadingPlanImage}>
                  {uploadingPlanImage ? "Aguardando upload da foto..." : planForm.id ? "Salvar alteracoes do plano" : "Criar plano"}
                </button>
                {planForm.id ? (
                  <button type="button" onClick={() => setPlanForm(emptyPlanForm())}>
                    Cancelar edicao
                  </button>
                ) : null}
              </div>
            </form>
          </div>

          <div className="admin-plan-library-head">
            <div>
              <strong>Planos publicados</strong>
              <span>Galeria com visual comercial para revisar fotos, badges e acessos liberados em cada oferta.</span>
            </div>
            <div className="admin-plan-library-count">{plans.length} plano(s)</div>
          </div>

          <div className="admin-plan-list">
            {plans.map((plan) => (
              <article key={plan.id} className="admin-plan-card">
                <div className="admin-plan-card-head">
                  <div>
                    <strong>{plan.name}</strong>
                    <span>R$ {Number.isFinite(plan.price) ? plan.price.toFixed(2) : "0.00"}</span>
                    <small>{plan.durationDays > 0 ? `${plan.durationDays} dia(s) de acesso` : "Duracao nao definida"}</small>
                  </div>
                  <div className="admin-plan-badges">
                    {plan.isPromo ? <span className="mini-badge promo">Promocao</span> : null}
                    {plan.isMostPopular ? <span className="mini-badge popular">Mais comprado</span> : null}
                    <span className="mini-badge neutral">{plan.status === "active" ? "Ativo" : "Inativo"}</span>
                  </div>
                </div>
                {plan.imageDataUrl ? (
                  <img src={resolveAssetUrl(plan.imageDataUrl)} alt={plan.name} className="admin-plan-card-image" />
                ) : (
                  <div className="admin-plan-card-image admin-plan-card-image-empty">Plano sem foto</div>
                )}
                <p>{plan.description}</p>
                <div className="admin-plan-meta">
                  <span>{plan.accessBandeiras ? "Bandeiras" : "Sem bandeiras"}</span>
                  <span>{plan.accessPainel ? "Painel e letreiros" : "Sem painel"}</span>
                  <span>{plan.accessPlotagemGomo ? "Plotagem de gomo" : "Sem plotagem"}</span>
                  <span>{plan.accessTabelaMolde ? "Tabela do molde" : "Sem tabela"}</span>
                  <span>{plan.accessMoldesSalvos ? "Moldes salvos" : "Sem moldes"}</span>
                  <span>{plan.accessStorefront ? "Loja interna" : "Sem loja"}</span>
                </div>
                <div className="admin-plan-card-actions">
                  <button type="button" onClick={() => editPlan(plan)}>
                    Editar
                  </button>
                  <button type="button" onClick={() => void deletePlan(plan.id)}>
                    Excluir
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
        ) : null}

        {activeTab === "pagamentos" ? (
        <section className="panel admin-section admin-single-column">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Metodos de pagamento</p>
              <h3>Credenciais do Mercado Pago</h3>
              <p className="muted compact-copy">
                Cadastre aqui as chaves de pagamento para conectar os planos ao checkout da plataforma quando a integracao for ativada.
              </p>
            </div>
          </div>

          <form className="admin-inline-form" onSubmit={savePaymentSettings}>
            <label className="field">
              <span>Public key</span>
              <input
                value={paymentSettings.publicKey}
                onChange={(event) => setPaymentSettings((current) => ({ ...current, publicKey: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Access token</span>
              <input
                value={paymentSettings.accessToken}
                onChange={(event) => setPaymentSettings((current) => ({ ...current, accessToken: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Webhook secret</span>
              <input
                value={paymentSettings.webhookSecret}
                onChange={(event) => setPaymentSettings((current) => ({ ...current, webhookSecret: event.target.value }))}
              />
            </label>
            <button type="submit">Salvar credenciais</button>
            {paymentSettings.updatedAt ? (
              <p className="muted compact-copy">Ultima atualizacao: {new Date(paymentSettings.updatedAt).toLocaleString("pt-BR")}</p>
            ) : null}
          </form>

          <div className="editor-table moldes-table">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Usuario</th>
                  <th>Plano</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Criado em</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted">
                      Nenhum pedido registrado ainda.
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => (
                    <tr key={order.id}>
                      <td>#{order.id}</td>
                      <td>
                        {order.userName}
                        <br />
                        <span className="muted">{order.userEmail}</span>
                      </td>
                      <td>{order.planName}</td>
                      <td>R$ {order.amount.toFixed(2)}</td>
                      <td>{order.paymentStatus}</td>
                      <td>{order.createdAt ? new Date(order.createdAt).toLocaleString("pt-BR") : "-"}</td>
                      <td>
                        {order.paymentStatus === "approved" ? (
                          <span className="muted">Aprovado</span>
                        ) : (
                          <button type="button" onClick={() => void approveOrder(order.id)}>
                            Aprovar pedido
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
        ) : null}

        {activeTab === "tutoriais" ? (
        <section className="panel admin-section admin-single-column">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Tutoriais</p>
              <h3>Biblioteca de tutoriais</h3>
              <p className="muted compact-copy">
                Cadastre varios tutoriais com nome, descricao e link direto para o YouTube.
              </p>
            </div>
          </div>

          <div className="tutorial-admin-top">
            <form className="panel tutorial-admin-form" onSubmit={saveTutorialSettings}>
              <div className="panel-head small">
                <div>
                  <p className="eyebrow">{tutorialEditingId ? "Edicao" : "Novo tutorial"}</p>
                  <h3>{tutorialEditingId ? "Atualizar tutorial selecionado" : "Cadastrar tutorial"}</h3>
                </div>
              </div>

              <label className="field">
                <span>Nome do tutorial</span>
                <input
                  value={tutorialForm.title}
                  onChange={(event) => setTutorialForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Ex.: Plotagem basica, marketplace, bandeiras..."
                />
              </label>
              <label className="field">
                <span>Descricao do tutorial</span>
                <textarea
                  rows={6}
                  value={tutorialForm.description}
                  onChange={(event) => setTutorialForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Explique aqui do que se tratam as aulas e como o usuario deve aproveitar o conteudo."
                />
              </label>
              <label className="field">
                <span>Link do YouTube</span>
                <input
                  value={tutorialForm.youtubeUrl}
                  onChange={(event) => setTutorialForm((current) => ({ ...current, youtubeUrl: event.target.value }))}
                  placeholder="https://www.youtube.com/..."
                />
              </label>
              <div className="tutorial-form-actions">
                <button type="submit">{tutorialEditingId ? "Salvar alteracoes" : "Adicionar tutorial"}</button>
                <button type="button" className="secondary" onClick={resetTutorialForm}>
                  Limpar formulario
                </button>
              </div>
            </form>

            <div className="tutorial-preview-card">
              <p className="eyebrow">Previa para o usuario</p>
              <h3>{tutorialForm.title || "Nome do tutorial"}</h3>
              <p className="tutorial-page-copy">{tutorialForm.description || "A descricao do tutorial vai aparecer aqui."}</p>
              {tutorialForm.youtubeUrl ? (
                <a className="tutorial-open-button" href={tutorialForm.youtubeUrl} target="_blank" rel="noreferrer">
                  Acessar aulas no YouTube
                </a>
              ) : (
                <div className="marketplace-action-disabled">Nenhum link publicado ainda.</div>
              )}
            </div>
          </div>

          <div className="admin-plan-library-head tutorial-library-head">
            <div>
              <strong>Tutoriais publicados</strong>
              <span>Organize sua biblioteca em cards individuais com acesso rapido para editar, excluir e abrir no YouTube.</span>
            </div>
            <div className="admin-plan-library-count">{tutorials.length} tutorial(is)</div>
          </div>

          <div className="tutorial-admin-grid">
            {tutorials.length === 0 ? (
              <div className="tutorial-preview-card">
                <p className="muted compact-copy">Nenhum tutorial cadastrado ainda.</p>
              </div>
            ) : (
              tutorials.map((tutorial) => (
                <article key={tutorial.id} className="tutorial-admin-card">
                  <div className="tutorial-admin-card-head">
                    <div>
                      <strong>{tutorial.title}</strong>
                      <small>{tutorial.updatedAt ? new Date(tutorial.updatedAt).toLocaleString("pt-BR") : "-"}</small>
                    </div>
                    <div className="admin-plan-badges">
                      <span className="mini-badge neutral">Tutorial</span>
                    </div>
                  </div>
                  <p className="tutorial-admin-description">{tutorial.description}</p>
                  <div className="tutorial-admin-actions">
                    <a className="tutorial-open-button" href={tutorial.youtubeUrl} target="_blank" rel="noreferrer">
                      Abrir no YouTube
                    </a>
                    <button type="button" className="secondary" onClick={() => editTutorialSettings(tutorial)}>
                      Editar
                    </button>
                    <button type="button" className="secondary danger" onClick={() => void deleteTutorialSettings(tutorial.id)}>
                      Excluir
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
        ) : null}

        {activeTab === "mensagens" ? (
        <section className="panel admin-section admin-single-column">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Central de mensagens</p>
              <h3>Comunicacao com usuarios</h3>
              <p className="muted compact-copy">
                Receba avaliacoes e sugestoes de melhoria dos usuarios, alem de registrar mensagens operacionais da plataforma.
              </p>
            </div>
          </div>

          <div className="admin-messages-stack">
            <div className="admin-messages-panel">
              <div className="panel-head small">
                <div>
                  <p className="eyebrow">Notificacoes do sistema</p>
                  <h3>Alertas recentes</h3>
                  <p className="muted compact-copy">Cadastros novos, compras de plano e novas mensagens de sugestao aparecem aqui.</p>
                </div>
              </div>

              {notifications.length === 0 ? (
                <p className="muted compact-copy">Nenhuma notificacao registrada ainda.</p>
              ) : (
                <div className="admin-messages-notification-grid">
                  {notifications.map((item) => (
                    <article key={item.id} className="admin-messages-notification-card">
                      <div className="admin-messages-notification-head">
                        <div>
                          <strong>{item.title}</strong>
                          <p>{item.body}</p>
                          <small>{item.createdAt ? new Date(item.createdAt).toLocaleString("pt-BR") : "-"}</small>
                        </div>
                        <span className={`mini-badge ${item.isRead ? "neutral" : "popular"}`}>{item.isRead ? "Lida" : "Nova"}</span>
                      </div>
                      {!item.isRead ? (
                        <button type="button" onClick={() => void markNotificationAsRead(item.id)}>
                          Marcar como lida
                        </button>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="admin-messages-panel">
              <div className="panel-head small">
                <div>
                  <p className="eyebrow">Sugestoes recebidas</p>
                  <h3>Avaliacoes e melhorias do sistema</h3>
                  <p className="muted compact-copy">Aqui chegam as opinioes enviadas pelos usuarios na nova aba de sugestoes.</p>
                </div>
              </div>

              {suggestions.length === 0 ? (
                <p className="muted compact-copy">Nenhuma sugestao enviada ainda.</p>
              ) : (
                <div className="admin-suggestions-grid">
                  {suggestions.map((item) => (
                    <article key={item.id} className="admin-suggestion-card">
                      <div className="admin-suggestion-head">
                        <div>
                          <strong>{item.subject}</strong>
                          <span>{item.userName} - {item.userEmail}</span>
                          <small>{item.createdAt ? new Date(item.createdAt).toLocaleString("pt-BR") : "-"}</small>
                        </div>
                        <span className="mini-badge popular">Nota {item.rating}/5</span>
                      </div>

                      <div className="admin-suggestion-thread">
                        <div className="admin-suggestion-bubble user">
                          <strong>{item.userName}</strong>
                          <p>{item.suggestion}</p>
                        </div>
                        {item.messages.map((message) => (
                          <div key={message.id} className={`admin-suggestion-bubble ${message.senderRole === "admin" ? "admin" : "user"}`}>
                            <strong>{message.senderRole === "admin" ? "Administrador" : item.userName}</strong>
                            <p>{message.message}</p>
                            <small>{message.createdAt ? new Date(message.createdAt).toLocaleString("pt-BR") : "-"}</small>
                          </div>
                        ))}
                      </div>

                      <label className="field">
                        <span>Responder nessa conversa</span>
                        <textarea
                          rows={4}
                          value={suggestionReplyDrafts[item.id] ?? ""}
                          onChange={(event) => setSuggestionReplyDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                          placeholder="Digite aqui a resposta para o usuario."
                        />
                      </label>
                      <div className="admin-suggestion-actions">
                        <button type="button" onClick={() => void replyToSuggestion(item.id)} disabled={replyingSuggestionId === item.id}>
                          {replyingSuggestionId === item.id ? "Enviando resposta..." : "Responder usuario"}
                        </button>
                        <button
                          type="button"
                          className="secondary danger"
                          onClick={() => void deleteSuggestion(item.id)}
                          disabled={deletingSuggestionId === item.id}
                        >
                          {deletingSuggestionId === item.id ? "Excluindo..." : "Excluir conversa"}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <form className="admin-inline-form admin-messages-form" onSubmit={sendMessage}>
              <div className="panel-head small">
                <div>
                  <p className="eyebrow">Mensagem administrativa</p>
                  <h3>Registrar contato manual</h3>
                </div>
              </div>

              <label className="field">
                <span>Usuario de destino</span>
                <select value={messageTargetUserId} onChange={(event) => setMessageTargetUserId(event.target.value)}>
                  <option value="">Selecione</option>
                  {users
                    .filter((user) => user.role !== "admin")
                    .map((user) => (
                      <option key={user.id} value={String(user.id)}>
                        {user.name} - {user.email}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field">
                <span>Assunto</span>
                <input value={messageSubject} onChange={(event) => setMessageSubject(event.target.value)} />
              </label>
              <label className="field">
                <span>Mensagem</span>
                <textarea rows={5} value={messageBody} onChange={(event) => setMessageBody(event.target.value)} />
              </label>
              <button type="submit">Registrar mensagem</button>
            </form>
          </div>
        </section>
        ) : null}
      </div>
        </div>
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
      throw new Error("A API administrativa nao respondeu JSON. Reinicie o backend com npm run dev.");
    }
    throw new Error("Resposta invalida da API administrativa.");
  }
}
