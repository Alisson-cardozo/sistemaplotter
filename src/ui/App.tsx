import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { normalizeModelName, parseCwbPayload } from "../domain/cwbAdapter";
import { calculatePattern } from "../domain/geometry";
import { importPdfTemplate, ImportedPdfData } from "../domain/pdfImport";
import { sampleProject } from "../domain/sampleProject";
import { InputPoint, ProjectInput, RegionTackingConfig, TacoSectionConfig } from "../domain/types";
import { BandeirasWorkspace } from "./BandeirasWorkspace";
import { AdminWorkspace } from "./AdminWorkspace";
import { AccountWorkspace } from "./AccountWorkspace";
import { AuthPanel, AuthUser } from "./AuthPanel";
import { MarketplaceWorkspace } from "./MarketplaceWorkspace";
import { MoldesWorkspace } from "./MoldesWorkspace";
import { PanelWorkspace } from "./PanelWorkspace";
import { PatternPiecesGallery } from "./PatternPiecesGallery";
import { PatternPreview } from "./PatternPreview";
import { PlansWorkspace } from "./PlansWorkspace";
import { SuggestionsWorkspace } from "./SuggestionsWorkspace";
import { TutorialWorkspace } from "./TutorialWorkspace";
import { apiFetch, clearAuthSession, loadAuthSession, saveAuthSession } from "../lib/api";
import { buildAttachmentsFromRawFiles, deliveryFormatDescription, deliveryFormatLabel, DeliveryFileFormat } from "../lib/deliveryFormats";

const brandLogo = `${import.meta.env.BASE_URL}assets/logo.png`;
type WorkspaceTab =
  | "inicio"
  | "prancheta"
  | "molde"
  | "moldes"
  | "bandeiras"
  | "painel"
  | "marketplace"
  | "planos"
  | "conta"
  | "tutorial"
  | "sugestoes"
  | "admin";

export function App() {
  const currentYear = new Date().getFullYear();
  const initialManualMaxWidth = Math.max(...sampleProject.tabelaPontos.map((point) => point.larguraMeiaCm * 2), 0);
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => loadAuthSession());
  const [authChecking, setAuthChecking] = useState(() => loadAuthSession() != null);
  const [input, setInput] = useState<ProjectInput>(sampleProject);
  const [previewZoom, setPreviewZoom] = useState(0.35);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTab>("inicio");
  const [lineColors, setLineColors] = useState({
    divisao: "#000000",
    bainha: "#8f8f8f"
  });
  const [sectionColors, setSectionColors] = useState<Record<string, string>>({
    boca: "#f4e64a",
    b1: "#f4e64a",
    b2: "#ffd86a",
    bojo: "#77e6f2",
    bico: "#f062b8"
  });
  const [sectionSizingMode, setSectionSizingMode] = useState<Record<string, "manual" | "equal">>(() =>
    Object.fromEntries(sampleProject.regioes.map((regiao) => [regiao.regiao, "manual"]))
  );
  const [collapsedPranchetaSections, setCollapsedPranchetaSections] = useState({
    mold: false,
    delivery: true
  });
  const [collapsedRegions, setCollapsedRegions] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(sampleProject.regioes.map((regiao, index) => [regiao.regiao, index !== 0]))
  );
  const [pointCountDraft, setPointCountDraft] = useState(String(sampleProject.tabelaPontos.length));
  const [draftPoints, setDraftPoints] = useState<InputPoint[]>(sampleProject.tabelaPontos);
  const [manualMaxWidthDraft, setManualMaxWidthDraft] = useState(String(initialManualMaxWidth));
  const [importJsonDraft, setImportJsonDraft] = useState("");
  const [importState, setImportState] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    data?: ImportedPdfData;
    message?: string;
  }>({ status: "idle" });
  const [deliveryEmail, setDeliveryEmail] = useState("");
  const [deliveryMode, setDeliveryMode] = useState<"regions_plus_whole" | "divisions_plus_whole">("regions_plus_whole");
  const [deliveryFileFormat, setDeliveryFileFormat] = useState<DeliveryFileFormat>("all");
  const [deliveryState, setDeliveryState] = useState<{ status: "idle" | "loading" | "success" | "error"; message?: string }>({
    status: "idle"
  });
  const [userNotificationCount, setUserNotificationCount] = useState(0);
  const [adminNotificationCount, setAdminNotificationCount] = useState(0);
  const [transmitState, setTransmitState] = useState<{ status: "idle" | "saving" | "success" | "error"; message?: string }>({
    status: "idle"
  });
  const moldPanelRef = useRef<HTMLDivElement | null>(null);
  const deliveryPanelRef = useRef<HTMLDivElement | null>(null);
  const divisionsPanelRef = useRef<HTMLDivElement | null>(null);
  const result = useMemo(() => calculatePattern(input), [input]);
  const displayMaxWidthCm = input.larguraMaximaManualCm ?? result.metricas.larguraMaximaGomoCm;
  const isAdmin = authUser?.role === "admin";
  const deliveryBasePreviewFiles = useMemo(() => {
    const projectBase = (input.projeto || "molde").trim() || "molde";
    const visualFiles = [{ kind: "inteiro", label: "Molde inteiro", filename: `${projectBase}-inteiro.svg` }];

    if (deliveryMode === "regions_plus_whole") {
      return [
        ...visualFiles,
        { kind: "parte", label: "Boca", filename: `${projectBase}-boca.svg` },
        { kind: "parte", label: "Bojo", filename: `${projectBase}-bojo.svg` },
        { kind: "parte", label: "Bico", filename: `${projectBase}-bico.svg` }
      ];
    }

    return [
      ...visualFiles,
      ...result.faixasTacos.map((faixa) => ({
        kind: "divisao" as const,
        label: faixa.nome,
        filename: `${projectBase}-${faixa.nome.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "divisao"}.svg`
      }))
    ];
  }, [deliveryMode, input.projeto, result.faixasTacos]);
  const deliveryPreviewFiles = useMemo(() => {
    const toPng = (filename: string) => filename.replace(/\.svg$/i, ".png");
    const toPdf = (filename: string) => filename.replace(/\.svg$/i, ".pdf");
    const projectBase = (input.projeto || "molde").trim() || "molde";
    const preview: Array<{ kind: string; label: string; filename: string; format: string }> = [];

    if (deliveryFileFormat === "pdf" || deliveryFileFormat === "all") {
      preview.push({
        kind: "relatorio",
        label: "Relatorio tecnico",
        filename: `${projectBase}-relatorio-tecnico.pdf`,
        format: "PDF"
      });
      preview.push(
        ...deliveryBasePreviewFiles.map((file) => ({
          ...file,
          filename: toPdf(file.filename),
          format: "PDF"
        }))
      );
    }

    if (deliveryFileFormat === "svg" || deliveryFileFormat === "all") {
      preview.push(
        ...deliveryBasePreviewFiles.map((file) => ({
          ...file,
          format: "SVG"
        }))
      );
    }

    if (deliveryFileFormat === "png" || deliveryFileFormat === "all") {
      preview.push(
        ...deliveryBasePreviewFiles.map((file) => ({
          ...file,
          filename: toPng(file.filename),
          format: "PNG"
        }))
      );
    }

    return preview;
  }, [deliveryBasePreviewFiles, deliveryFileFormat, input.projeto]);
  const deliveryPackageLabel = deliveryMode === "regions_plus_whole" ? "3 partes + inteiro" : "Divisoes + inteiro";
  const isRestrictedUser = authUser?.role === "user" && !authUser.isPaid;
  const moldDisplayName = String(input.modelo).trim() || String(input.projeto).trim() || "Molde sem nome";

  const canAccessWorkspace = (tab: WorkspaceTab) => {
    if (authUser == null) {
      return false;
    }

    if (authUser.role === "admin") {
      return true;
    }

    if (tab === "inicio" || tab === "marketplace" || tab === "planos" || tab === "conta" || tab === "tutorial" || tab === "sugestoes") {
      return true;
    }

    if (tab === "prancheta") {
      return authUser.permissions.accessPlotagemGomo;
    }

    if (tab === "molde") {
      return authUser.permissions.accessTabelaMolde;
    }

    if (tab === "moldes") {
      return authUser.permissions.accessMoldesSalvos;
    }

    if (tab === "bandeiras") {
      return authUser.permissions.accessBandeiras;
    }

    if (tab === "painel") {
      return authUser.permissions.accessPainel;
    }

    return false;
  };

  const openWorkspaceTab = (tab: WorkspaceTab) => {
    if (!canAccessWorkspace(tab)) {
      setActiveWorkspaceTab("planos");
      return;
    }

    setActiveWorkspaceTab(tab);
  };

  useEffect(() => {
    if (authUser == null) {
      clearAuthSession();
      return;
    }
    saveAuthSession(authUser);
  }, [authUser]);

  useEffect(() => {
    if (authUser == null) {
      setAuthChecking(false);
      return;
    }

    let cancelled = false;
    setAuthChecking(true);

    void (async () => {
      try {
        const response = await fetch("/api/auth/validate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authUser.token}`
          },
          body: JSON.stringify({ id: authUser.id, email: authUser.email })
        });
        const payload = await parseApiResponse(response);

        if (!response.ok || payload.user == null) {
          throw new Error(payload.error || payload.message || "Sessao invalida para o banco atual.");
        }

        if (!cancelled) {
          setAuthUser({ ...payload.user, token: authUser.token });
        }
      } catch {
        if (!cancelled) {
          setAuthUser(null);
          clearAuthSession();
          setActiveWorkspaceTab("inicio");
        }
      } finally {
        if (!cancelled) {
          setAuthChecking(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authUser?.email, authUser?.id, authUser?.token]);

  useEffect(() => {
    if (authUser == null) {
      setUserNotificationCount(0);
      setAdminNotificationCount(0);
      return;
    }

    let cancelled = false;
    const loadNotifications = async () => {
      try {
        const endpoint = authUser.role === "admin" ? "/api/admin/notifications" : "/api/notifications";
        const response = await apiFetch(endpoint);
        const payload = await parseApiResponse(response);
        if (!response.ok) {
          return;
        }
        const unreadCount = Array.isArray(payload.items) ? payload.items.filter((item: any) => !(item?.isRead === true || item?.isRead === 1 || item?.isRead === "1")).length : 0;
        if (cancelled) {
          return;
        }
        if (authUser.role === "admin") {
          setAdminNotificationCount(unreadCount);
        } else {
          setUserNotificationCount(unreadCount);
        }
      } catch {
      }
    };

    void loadNotifications();
    const timer = setInterval(() => {
      void loadNotifications();
    }, 30000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [authUser?.id, authUser?.role, authUser?.token]);

  useEffect(() => {
    if (authUser == null) {
      return;
    }

    if (authUser.role !== "admin" && !canAccessWorkspace(activeWorkspaceTab)) {
      setActiveWorkspaceTab("planos");
    }
  }, [activeWorkspaceTab, authUser]);

  useEffect(() => {
    if (authUser?.role === "user" && activeWorkspaceTab === "inicio") {
      setActiveWorkspaceTab(authUser.isPaid ? "marketplace" : "planos");
    }
  }, [authUser]);

  const currentTabTitle =
    activeWorkspaceTab === "inicio"
      ? "Inicio"
      : activeWorkspaceTab === "prancheta"
        ? "Plotagem de gomo"
        : activeWorkspaceTab === "molde"
          ? "Adicionar tabela do molde"
          : activeWorkspaceTab === "moldes"
            ? "Moldes"
          : activeWorkspaceTab === "bandeiras"
            ? "Bandeiras"
            : activeWorkspaceTab === "painel"
              ? "Painel e letreiros"
            : activeWorkspaceTab === "marketplace"
              ? "Marketplace"
              : activeWorkspaceTab === "planos"
                ? "Planos"
              : activeWorkspaceTab === "conta"
                ? "Minha conta"
                : activeWorkspaceTab === "tutorial"
                  ? "Tutoriais"
                : activeWorkspaceTab === "sugestoes"
                  ? "Sugestoes"
                  : "Painel administrativo";

  const shouldHighlightPlans = isRestrictedUser;

  const logout = async () => {
    try {
      if (authUser?.token) {
        await apiFetch("/api/auth/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });
      }
    } catch {
    } finally {
      setAuthUser(null);
      clearAuthSession();
      setActiveWorkspaceTab("inicio");
    }
  };

  useEffect(() => {
    setDraftPoints(input.tabelaPontos);
    setPointCountDraft(String(input.tabelaPontos.length));
    setManualMaxWidthDraft(String(input.larguraMaximaManualCm ?? result.metricas.larguraMaximaGomoCm));
  }, [input.tabelaPontos, input.larguraMaximaManualCm, result.metricas.larguraMaximaGomoCm]);

  const updateInput = <K extends keyof ProjectInput>(key: K, value: ProjectInput[K]) => {
    setInput((current) => ({ ...current, [key]: value }));
  };

  const updatePoint = (index: number, patch: Partial<InputPoint>) => {
    setDraftPoints((current) => current.map((point, pointIndex) => (pointIndex === index ? { ...point, ...patch } : point)));
  };

  const togglePranchetaSection = (section: "mold" | "delivery") => {
    setCollapsedPranchetaSections((current) => ({ ...current, [section]: !current[section] }));
  };

  const toggleRegionCollapse = (regionKey: string) => {
    setCollapsedRegions((current) => ({ ...current, [regionKey]: !current[regionKey] }));
  };

  const addPoint = () => {
    setDraftPoints((current) => {
      const last = current[current.length - 1];
      const next = [
        ...current,
        {
          ponto: last.ponto + 1,
          alturaCm: 0,
          alturaAcumuladaCm: last.alturaAcumuladaCm,
          larguraMeiaCm: last.larguraMeiaCm
        }
      ];
      setPointCountDraft(String(next.length));
      return next;
    });
  };

  const resizePoints = (nextCountValue: string) => {
    setPointCountDraft(nextCountValue);
    const nextCount = Number(nextCountValue);
    if (!Number.isFinite(nextCount) || nextCount < 2) {
      return;
    }

    setDraftPoints((currentPoints) => {
      if (nextCount === currentPoints.length) {
        return currentPoints;
      }

      if (nextCount < currentPoints.length) {
        return currentPoints.slice(0, nextCount).map((point, index) => ({ ...point, ponto: index + 1 }));
      }

      const last = currentPoints[currentPoints.length - 1];
      const additions = Array.from({ length: nextCount - currentPoints.length }, (_, index) => ({
        ponto: currentPoints.length + index + 1,
        alturaCm: 0,
        alturaAcumuladaCm: last?.alturaAcumuladaCm ?? 0,
        larguraMeiaCm: last?.larguraMeiaCm ?? 0
      }));

      return [...currentPoints, ...additions];
    });
  };

  const removePoint = (index: number) => {
    setDraftPoints((current) => {
      const next = current
        .filter((_, pointIndex) => pointIndex !== index)
        .map((point, pointIndex) => ({ ...point, ponto: pointIndex + 1 }));
      setPointCountDraft(String(next.length));
      return next;
    });
  };

  const saveSnapshotToMolds = async (snapshot: {
    input: ProjectInput;
    lineColors: { divisao: string; bainha: string };
    sectionColors: Record<string, string>;
    draftPoints: InputPoint[];
  }) => {
    try {
      setTransmitState({ status: "saving", message: "Transmitido. Salvando na aba Moldes..." });
      const response = await fetch("/api/molds", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authUser ? { Authorization: `Bearer ${authUser.token}` } : {})
        },
        body: JSON.stringify(snapshot)
      });
      const payload = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Nao foi possivel salvar no banco de moldes.");
      }

      setTransmitState({ status: "success", message: "Transmitido e salvo em Moldes com sucesso." });
    } catch (error) {
      setTransmitState({
        status: "error",
        message:
          error instanceof Error
            ? `Transmitido, mas nao salvou em Moldes: ${error.message}`
            : "Transmitido, mas nao salvou em Moldes."
      });
    }
  };

  const commitDraftPoints = (nextTab: WorkspaceTab, successMessage?: string) => {
    if (String(input.modelo).trim() === "") {
      setTransmitState({ status: "error", message: "Informe o modelo do molde antes de transmitir." });
      return;
    }

    if (!Number.isFinite(input.quantidadeGomos) || input.quantidadeGomos <= 0) {
      setTransmitState({ status: "error", message: "Informe a quantidade de gomos corretamente." });
      return;
    }

    if (!Number.isFinite(input.bainhaCm) || input.bainhaCm < 0) {
      setTransmitState({ status: "error", message: "Informe o tamanho da bainhinha corretamente." });
      return;
    }

    if (!Number.isFinite(input.diametroBocaCm) || input.diametroBocaCm <= 0) {
      setTransmitState({ status: "error", message: "Informe o diametro da boca corretamente." });
      return;
    }

    if (manualMaxWidthDraft.trim() === "" || !Number.isFinite(Number(manualMaxWidthDraft)) || Number(manualMaxWidthDraft) <= 0) {
      setTransmitState({ status: "error", message: "Informe a largura maxima do gomo corretamente." });
      return;
    }

    const nextPoints = draftPoints.map((point, index) => ({
      ...point,
      ponto: index + 1,
      alturaAcumuladaCm: 0
    }));
    const nextHeight = roundToOne(nextPoints.reduce((total, point, index) => total + (index === 0 ? 0 : point.alturaCm), 0));
    const nextInput: ProjectInput = {
      ...input,
      comprimentoGomoCm: nextHeight,
      larguraMaximaManualCm: Number(manualMaxWidthDraft),
      tabelaPontos: nextPoints,
      regioes: syncRegionsToHeight(input.regioes, input.comprimentoGomoCm, nextHeight)
    };

    setInput(nextInput);
    setActiveWorkspaceTab(nextTab);

    const snapshot = {
      input: nextInput,
      lineColors,
      sectionColors,
      draftPoints: nextPoints
    };
    void saveSnapshotToMolds(snapshot);

    if (successMessage) {
      setTransmitState({ status: "success", message: successMessage });
    }
  };

  const applyDraftPoints = () => {
    commitDraftPoints("prancheta", "Molde transmitido para a plotagem de gomo.");
  };

  const handlePdfImport = async (file: File | undefined) => {
    if (file == null) {
      return;
    }

    setImportState({ status: "loading" });
    try {
      const imported = await importPdfTemplate(file);
      setImportState({
        status: "ready",
        data: imported,
        message:
          imported.pdfTipo === "imagem"
            ? "Esse PDF parece ser imagem/arte escaneada. A leitura automatica de campos tecnicos fica limitada sem OCR."
            : imported.pontos.length > 0
              ? `${imported.pontos.length} pontos encontrados no PDF.`
              : "PDF lido, mas a tabela de pontos precisa de conferÃªncia manual."
      });
    } catch {
      setImportState({
        status: "error",
        message: "Nao foi possivel ler esse PDF automaticamente. Tente outro arquivo ou confira os dados manualmente."
      });
    }
  };

  const applyImportedData = () => {
    if (importState.data == null) {
      return;
    }

    const imported = importState.data;
    if (imported.pontos.length > 0) {
      setDraftPoints(
        imported.pontos.map((point, index) => ({
          ...point,
          ponto: index + 1,
          alturaAcumuladaCm: 0
        }))
      );
      setPointCountDraft(String(imported.pontos.length));
    }

    setInput((current) => ({
      ...current,
      projeto: imported.projeto ?? current.projeto,
      modelo: normalizeModelName(imported.modelo) ?? current.modelo,
      quantidadeGomos: imported.quantidadeGomos ?? current.quantidadeGomos,
      bainhaCm: imported.bainhaCm ?? current.bainhaCm,
      diametroBocaCm: imported.diametroBocaCm ?? imported.metricas?.diametroBocaCm ?? current.diametroBocaCm,
      larguraMaximaManualCm: imported.metricas?.larguraMaximaGomoCm ?? current.larguraMaximaManualCm,
      comprimentoGomoCm: imported.comprimentoGomoCm ?? imported.metricas?.alturaCheioCm ?? current.comprimentoGomoCm
    }));
  };

  const applyImportedJson = () => {
    try {
      const parsed = parseCwbPayload(importJsonDraft);
      const importedPoints = parsed.tabelaPontos;

      if (importedPoints.length >= 2) {
        setDraftPoints(importedPoints);
        setPointCountDraft(String(importedPoints.length));
      }

      setInput((current) => ({
        ...current,
        projeto: parsed.projeto ?? current.projeto,
        modelo: normalizeModelName(parsed.modelo) ?? current.modelo,
        quantidadeGomos: toFiniteNumber(parsed.quantidadeGomos, current.quantidadeGomos),
        bainhaCm: toFiniteNumber(parsed.bainhaCm, current.bainhaCm),
        diametroBocaCm: toFiniteNumber(parsed.diametroBocaCm, current.diametroBocaCm),
        larguraMaximaManualCm: toFiniteNumber(parsed.larguraMaximaGomoCm, current.larguraMaximaManualCm ?? result.metricas.larguraMaximaGomoCm),
        comprimentoGomoCm: toFiniteNumber(parsed.comprimentoGomoCm ?? parsed.alturaCheioCm, current.comprimentoGomoCm)
      }));

      setImportState({
        status: "ready",
        message: `${importedPoints.length} pontos carregados do JSON da CWB.`
      });
    } catch {
      setImportState({
        status: "error",
        message: "O JSON colado nao esta em um formato valido."
      });
    }
  };

  const updateRegion = (index: number, patch: Partial<RegionTackingConfig>) => {
    setInput((current) => ({
      ...current,
      regioes: current.regioes.map((regiao, regionIndex) => {
        if (regionIndex !== index) {
          return regiao;
        }

        const updated = { ...regiao, ...patch };
        if (patch.modo === "secoes" && updated.secoes.length === 0) {
          updated.secoes = buildDefaultSections(updated.regiao, updated.alturaCm, updated.tacosPorGomo, updated.alturaTacoCm);
          return updated;
        }
        return updated;
      })
    }));
  };

  const updateSection = (regionIndex: number, sectionIndex: number, patch: Partial<TacoSectionConfig>) => {
    setInput((current) => {
      const nextRegioes = current.regioes.map((regiao, currentRegionIndex) =>
        currentRegionIndex === regionIndex
          ? {
              ...regiao,
              secoes: regiao.secoes.map((secao, currentSectionIndex) =>
                currentSectionIndex === sectionIndex ? { ...secao, ...patch } : secao
              )
            }
          : regiao
      );

      if (patch.alturaSecaoCm == null) {
        return {
          ...current,
          regioes: nextRegioes.map(syncRegionHeightFromSections)
        };
      }

      return {
        ...current,
        regioes: adjustGlobalSectionHeights(current.regioes, regionIndex, sectionIndex, patch.alturaSecaoCm)
      };
    });
  };

  const addSection = (regionIndex: number) => {
    setInput((current) => ({
      ...current,
      regioes: current.regioes.map((regiao, currentRegionIndex) =>
        currentRegionIndex === regionIndex
          ? rebalanceSections({
              ...regiao,
              secoes: [
                ...regiao.secoes,
                {
                  id: `${regiao.regiao}-${regiao.secoes.length + 1}`,
                  nome: `${regiao.regiao} ${regiao.secoes.length + 1}`,
                  alturaSecaoCm: 10,
                  alturaTacoCm: regiao.alturaTacoCm,
                  tacosPorGomo: regiao.tacosPorGomo
                }
              ]
            })
          : regiao
      )
    }));
  };

  const removeSection = (regionIndex: number, sectionIndex: number) => {
    setInput((current) => ({
      ...current,
      regioes: current.regioes.map((regiao, currentRegionIndex) =>
        currentRegionIndex === regionIndex
          ? rebalanceSections({
              ...regiao,
              secoes: regiao.secoes.filter((_, currentSectionIndex) => currentSectionIndex !== sectionIndex)
            })
          : regiao
      )
    }));
  };

  const splitSectionsEvenly = (regionIndex: number) => {
    const regionName = input.regioes[regionIndex]?.regiao;
    if (regionName) {
      setSectionSizingMode((current) => ({ ...current, [regionName]: "equal" }));
    }
    setInput((current) => ({
      ...current,
      regioes: current.regioes.map((regiao, currentRegionIndex) =>
        currentRegionIndex === regionIndex ? rebalanceSections(regiao) : regiao
      )
    }));
  };

  const enableManualSectionSizing = (regionName: RegionTackingConfig["regiao"]) => {
    setSectionSizingMode((current) => ({ ...current, [regionName]: "manual" }));
  };

  const updateLineColor = (key: "divisao" | "bainha", value: string) => {
    setLineColors((current) => ({ ...current, [key]: value }));
  };

  const updateSectionColor = (key: string, value: string) => {
    setSectionColors((current) => ({ ...current, [key]: value }));
  };

  const sendFilesByEmail = async () => {
    if (deliveryEmail.trim() === "") {
      setDeliveryState({ status: "error", message: "Informe o email do usuario." });
      return;
    }

    try {
      setDeliveryState({ status: "loading", message: "Enviando arquivos..." });
      const exportResponse = await apiFetch("/api/pattern/export-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input })
      });
      const exportPayload = await exportResponse.json();
      const rawFiles = Array.isArray(exportPayload.files)
        ? exportPayload.files.map((file: { filename: string; contentType?: string; content: string; region?: string; divisionId?: string; divisionName?: string }) => ({
            filename: file.filename,
            contentType: file.contentType || "image/svg+xml",
            content: file.content,
            region: file.region,
            divisionId: file.divisionId,
            divisionName: file.divisionName
          }))
        : [];
      const selectedFiles = rawFiles.filter((file: { filename: string; contentType: string; content?: string; region?: string }) => {
        if (file.region === "inteiro") {
          return true;
        }
        if (deliveryMode === "regions_plus_whole") {
          return file.region === "boca" || file.region === "bojo" || file.region === "bico";
        }
        return file.region === "divisao";
      });
      const files = await buildAttachmentsFromRawFiles(selectedFiles, deliveryFileFormat);
      const summary = [
        { label: "Tamanho final", value: `${input.comprimentoGomoCm} cm` },
        { label: "Quantidade de gomos", value: String(input.quantidadeGomos) },
        { label: "Boca", value: `${input.diametroBocaCm} cm` },
        { label: "Largura maxima", value: `${displayMaxWidthCm} cm` },
        { label: "Nome do molde", value: moldDisplayName },
        { label: "Total de tacos", value: String(result.faixasTacos.reduce((sum, faixa) => sum + faixa.totalTacos, 0)) }
      ];
      const parts = result.faixasTacos.map((faixa, index) => ({
        nome: faixa.nome,
        ordem: index + 1,
        altura: `${faixa.alturaCm} cm`,
        configuracao: `${faixa.quantidadeVertical} subindo | ${faixa.tacosPorGomo} por gomo`
      }));
      const body = [
        `Molde: ${moldDisplayName}`,
        `Modelo: ${input.modelo}`,
        `Pacote enviado: ${deliveryPackageLabel}`,
        `Formato do arquivo: ${deliveryFormatLabel(deliveryFileFormat)}`,
        "",
        "Dados do molde:",
        ...summary.map((item) => `- ${item.label}: ${item.value}`),
        "",
        "Partes:",
        ...parts.map((part) => `- ${part.nome} | Ordem ${part.ordem} | ${part.altura} | ${part.configuracao}`)
      ].join("\n");

      const response = await fetch(`/api/send-mold-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authUser ? { Authorization: `Bearer ${authUser.token}` } : {})
        },
        body: JSON.stringify({
          email: deliveryEmail,
          projectName: moldDisplayName,
          deliveryMode,
          body,
          summary,
          parts,
          files
        })
      });

      const rawResponse = await response.text();
      const payload = parseLooseJsonResponse(rawResponse);
      if (!response.ok) {
        throw new Error(payload.message || "Falha ao enviar os arquivos.");
      }

      setDeliveryState({
        status: "success",
        message: `Pacote ${deliveryPackageLabel} enviado com ${files.length} arquivo(s).`
      });
    } catch (error) {
      setDeliveryState({
        status: "error",
        message:
          error instanceof TypeError
            ? "Nao foi possivel conectar ao servidor de email. Ligue o backend com npm run dev:mail."
            : error instanceof Error
              ? error.message
              : "Nao foi possivel enviar o email."
      });
    }
  };

  const buildCurrentMoldSnapshot = () => ({
    input,
    lineColors,
    sectionColors,
    draftPoints
  });

  const applyMoldSnapshot = (snapshot: {
    input: ProjectInput;
    lineColors: { divisao: string; bainha: string };
    sectionColors: Record<string, string>;
    draftPoints: InputPoint[];
  }) => {
    setInput(snapshot.input);
    setLineColors(snapshot.lineColors ?? { divisao: "#000000", bainha: "#8f8f8f" });
    setSectionColors(snapshot.sectionColors ?? {});
    setDraftPoints(snapshot.draftPoints?.length ? snapshot.draftPoints : snapshot.input.tabelaPontos);
    setPointCountDraft(String((snapshot.draftPoints?.length || snapshot.input.tabelaPontos.length) ?? 0));
    setSectionSizingMode(Object.fromEntries(snapshot.input.regioes.map((regiao) => [regiao.regiao, "manual"])));
    setActiveWorkspaceTab("prancheta");
  };

  const editMoldSnapshot = (snapshot: {
    input: ProjectInput;
    lineColors: { divisao: string; bainha: string };
    sectionColors: Record<string, string>;
    draftPoints: InputPoint[];
  }) => {
    setInput(snapshot.input);
    setLineColors(snapshot.lineColors ?? { divisao: "#000000", bainha: "#8f8f8f" });
    setSectionColors(snapshot.sectionColors ?? {});
    setDraftPoints(snapshot.draftPoints?.length ? snapshot.draftPoints : snapshot.input.tabelaPontos);
    setPointCountDraft(String((snapshot.draftPoints?.length || snapshot.input.tabelaPontos.length) ?? 0));
    setManualMaxWidthDraft(String(Math.max(...snapshot.input.tabelaPontos.map((point) => point.larguraMeiaCm * 2), 0)));
    setSectionSizingMode(Object.fromEntries(snapshot.input.regioes.map((regiao) => [regiao.regiao, "manual"])));
    setActiveWorkspaceTab("molde");
    setTransmitState({ status: "success", message: "Molde aberto para edicao na tabela do molde." });
  };

  const openSidebarSection = (section: "molde" | "envio" | "divisoes") => {
    setActiveWorkspaceTab("prancheta");
    window.setTimeout(() => {
      const target =
        section === "molde"
          ? moldPanelRef.current
          : section === "envio"
            ? deliveryPanelRef.current
            : divisionsPanelRef.current;

      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  };

  if (authChecking) {
    return (
      <div className="auth-shell">
        <div className="auth-backdrop" />
        <section className="auth-card auth-checking-card">
          <div className="auth-panel-head">
            <p className="eyebrow">Validando acesso</p>
            <h3>Conferindo login no banco atual</h3>
            <p className="muted">Se o banco tiver sido trocado, o sistema vai voltar automaticamente para a tela de login.</p>
          </div>
        </section>
      </div>
    );
  }

  if (authUser == null) {
    return (
      <AuthPanel
        onAuthenticated={(user) => {
          setAuthUser(user);
          setActiveWorkspaceTab(user.role === "admin" ? "inicio" : user.isPaid ? "marketplace" : "planos");
        }}
      />
    );
  }

  return (
    <div
      className={`shell cad-shell ${activeWorkspaceTab === "inicio" ? "home-shell" : ""} ${
        activeWorkspaceTab === "bandeiras" || activeWorkspaceTab === "painel" ? "bandeiras-shell" : ""
      } ${activeWorkspaceTab === "marketplace" ? "marketplace-shell" : ""} ${
        activeWorkspaceTab === "prancheta" ? "prancheta-shell" : ""
      } ${
        activeWorkspaceTab !== "prancheta" &&
        activeWorkspaceTab !== "inicio" &&
        activeWorkspaceTab !== "bandeiras" &&
        activeWorkspaceTab !== "painel" &&
        activeWorkspaceTab !== "marketplace"
          ? "full-workspace-shell"
          : ""
      }`}
    >
      <aside className="sidebar left">
        {activeWorkspaceTab === "prancheta" && (
          <>
            <div className="panel hero cad-title prancheta-hero-panel">
              <p className="eyebrow">Estacao de modelagem</p>
              <h1>Plotagem de Gomo</h1>
              <p className="muted">Entrada tecnica do molde, configuracao das regioes e visualizacao da plotagem para producao.</p>
            </div>

            <div className="prancheta-stack" ref={divisionsPanelRef}>
              {input.regioes.map((regiao, regionIndex) => (
                <div key={regiao.regiao} className="region-card">
                  <button type="button" className={`region-head region-collapse ${collapsedRegions[regiao.regiao] ? "collapsed" : ""}`} onClick={() => toggleRegionCollapse(regiao.regiao)}>
                    <div>
                      <h3>{regiao.regiao}</h3>
                      <p className="region-copy">
                        Configure a altura da regiao e como os tacos serao distribuidos nesta parte do molde.
                      </p>
                    </div>
                    <div className="region-head-side">
                      <div className={`region-badge ${regiao.modo === "unico" ? "single" : "sectioned"}`}>
                        {regiao.modo === "unico" ? "Config unica" : `${regiao.secoes.length} secoes`}
                      </div>
                      <span className={`panel-collapse-button region-collapse-button ${collapsedRegions[regiao.regiao] ? "collapsed" : ""}`}>
                        {collapsedRegions[regiao.regiao] ? "Expandir" : "Minimizar"}
                      </span>
                    </div>
                  </button>
                  {!collapsedRegions[regiao.regiao] ? (
                    regiao.modo === "unico" ? (
                      <>
                        <div className="grid two region-grid">
                          <Field label="Altura da regiao (cm)">
                            <input type="number" value={regiao.alturaCm} onChange={(event) => updateRegion(regionIndex, { alturaCm: Number(event.target.value) })} />
                          </Field>
                          <Field label="Modo">
                            <select value={regiao.modo} onChange={(event) => updateRegion(regionIndex, { modo: event.target.value as RegionTackingConfig["modo"] })}>
                              <option value="unico">Unica configuracao</option>
                              <option value="secoes">Por secoes</option>
                            </select>
                          </Field>
                        </div>
                        <div className="grid two region-grid">
                          <Field label="Tacos por gomo">
                            <input type="number" value={regiao.tacosPorGomo} onChange={(event) => updateRegion(regionIndex, { tacosPorGomo: Number(event.target.value) })} />
                          </Field>
                          <Field label="Altura do taco (cm)">
                            <input type="number" value={regiao.alturaTacoCm} onChange={(event) => updateRegion(regionIndex, { alturaTacoCm: Number(event.target.value) })} />
                          </Field>
                        </div>
                        <div className="region-grid">
                          <Field label="Cor da parte">
                            <input type="color" value={sectionColors[regiao.regiao] ?? "#cccccc"} onChange={(event) => updateSectionColor(regiao.regiao, event.target.value)} />
                          </Field>
                        </div>
                        <div className="region-result">
                          {result.faixasTacos
                            .filter((faixa) => faixa.regiao === regiao.regiao)
                            .map((faixa) => (
                              <span key={faixa.id}>
                                {faixa.quantidadeVertical} subindo | {faixa.tacosPorGomo} por gomo | total {faixa.totalTacos}
                              </span>
                            ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="grid two region-grid">
                          <Field label="Altura da regiao (cm)">
                            <input type="number" value={regiao.alturaCm} onChange={(event) => updateRegion(regionIndex, { alturaCm: Number(event.target.value) })} />
                          </Field>
                          <Field label="Modo">
                            <select value={regiao.modo} onChange={(event) => updateRegion(regionIndex, { modo: event.target.value as RegionTackingConfig["modo"] })}>
                              <option value="unico">Unica configuracao</option>
                              <option value="secoes">Por secoes</option>
                            </select>
                          </Field>
                        </div>
                        <div className="section-mode-card">
                          <div>
                            <h4>Tamanho das secoes</h4>
                            <p>
                              O cliente pode escolher manualmente a altura de cada secao ou mandar o sistema dividir a regiao em partes iguais.
                            </p>
                          </div>
                          <div className="section-mode-actions">
                            <button
                              type="button"
                              className={sectionSizingMode[regiao.regiao] === "manual" ? "active" : ""}
                              onClick={() => enableManualSectionSizing(regiao.regiao)}
                            >
                              Escolher manualmente
                            </button>
                            <button
                              type="button"
                              className={sectionSizingMode[regiao.regiao] === "equal" ? "active" : ""}
                              onClick={() => splitSectionsEvenly(regionIndex)}
                            >
                              Dividir igual
                            </button>
                          </div>
                        </div>

                        <div className="panel-head small section-headline">
                          <h3>Secoes</h3>
                          <div className="section-actions">
                            <button onClick={() => addSection(regionIndex)}>Adicionar secao</button>
                          </div>
                        </div>
                        <div className="editor-table">
                          <table>
                            <thead>
                              <tr>
                                <th>Secao</th>
                                <th>Cor</th>
                                <th>Altura</th>
                                <th>Altura do taco</th>
                                <th>Tacos/gomo</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {regiao.secoes.map((secao, sectionIndex) => (
                                <tr key={secao.id}>
                                  <td><input value={secao.nome} onChange={(event) => updateSection(regionIndex, sectionIndex, { nome: event.target.value })} /></td>
                                  <td><input type="color" value={sectionColors[secao.id] ?? "#cccccc"} onChange={(event) => updateSectionColor(secao.id, event.target.value)} /></td>
                                  <td>
                                    <input
                                      type="number"
                                      min={secao.alturaTacoCm}
                                      step={secao.alturaTacoCm}
                                      value={secao.alturaSecaoCm}
                                      onChange={(event) => updateSection(regionIndex, sectionIndex, { alturaSecaoCm: Number(event.target.value) })}
                                    />
                                  </td>
                                  <td><input type="number" value={secao.alturaTacoCm} onChange={(event) => updateSection(regionIndex, sectionIndex, { alturaTacoCm: Number(event.target.value) })} /></td>
                                  <td><input type="number" value={secao.tacosPorGomo} onChange={(event) => updateSection(regionIndex, sectionIndex, { tacosPorGomo: Number(event.target.value) })} /></td>
                                  <td><button onClick={() => removeSection(regionIndex, sectionIndex)}>Excluir</button></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="region-result">
                          <span className="region-note">
                            {sectionSizingMode[regiao.regiao] === "manual"
                              ? "Altura manual ativa: o cliente define exatamente o tamanho de cada secao."
                              : "Alturas distribuidas igualmente: use os campos se quiser ajustar depois."}
                          </span>
                          {result.faixasTacos
                            .filter((faixa) => faixa.regiao === regiao.regiao)
                            .map((faixa) => (
                              <span key={faixa.id}>
                                {faixa.secao}: {faixa.quantidadeVertical} subindo | {faixa.tacosPorGomo} por gomo | total {faixa.totalTacos}
                              </span>
                            ))}
                        </div>
                      </>
                    )
                  ) : null}
                </div>
              ))}
            </div>

            <div className="panel delivery-panel" ref={deliveryPanelRef}>
              <div className="panel-head">
                <div>
                  <h3>Enviar email</h3>
                  <p className="panel-subcopy">Gere e envie os arquivos tecnicos do molde com os dados principais do projeto.</p>
                </div>
                <button type="button" className={`panel-collapse-button ${collapsedPranchetaSections.delivery ? "collapsed" : ""}`} onClick={() => togglePranchetaSection("delivery")}>
                  {collapsedPranchetaSections.delivery ? "Expandir" : "Minimizar"}
                </button>
              </div>
              {!collapsedPranchetaSections.delivery ? (
                <>
                  <p className="muted compact-copy">
                    O sistema envia os moldes em tamanho real e um PDF tecnico completo com todas as informacoes do projeto.
                  </p>
                  <div className="email-delivery-panel">
                    <div className="delivery-mode-panel">
                      <strong>Pacote de envio</strong>
                      <div className="delivery-mode-options">
                        <label className={`delivery-mode-card ${deliveryMode === "regions_plus_whole" ? "active" : ""}`}>
                          <input
                            type="radio"
                            name="deliveryMode"
                            checked={deliveryMode === "regions_plus_whole"}
                            onChange={() => setDeliveryMode("regions_plus_whole")}
                          />
                          <span>3 partes + inteiro</span>
                          <em>Pacote ativo</em>
                          <small>Boca, bojo, bico e mais o arquivo inteiro com relatorio.</small>
                        </label>
                        <label className={`delivery-mode-card ${deliveryMode === "divisions_plus_whole" ? "active" : ""}`}>
                          <input
                            type="radio"
                            name="deliveryMode"
                            checked={deliveryMode === "divisions_plus_whole"}
                            onChange={() => setDeliveryMode("divisions_plus_whole")}
                          />
                          <span>Divisoes + inteiro</span>
                          <em>Pacote ativo</em>
                          <small>Envia cada divisao separada e mais o arquivo inteiro com relatorio.</small>
                        </label>
                      </div>
                    </div>
                    <div className="delivery-mode-panel">
                      <strong>Formato do arquivo</strong>
                      <div className="delivery-mode-options">
                        {(["pdf", "svg", "png", "all"] as DeliveryFileFormat[]).map((format) => (
                          <label key={format} className={`delivery-mode-card ${deliveryFileFormat === format ? "active" : ""}`}>
                            <input
                              type="radio"
                              name="deliveryFileFormat"
                              checked={deliveryFileFormat === format}
                              onChange={() => setDeliveryFileFormat(format)}
                            />
                            <span>{deliveryFormatLabel(format)}</span>
                            <em>Formato ativo</em>
                            <small>{deliveryFormatDescription(format)}</small>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="delivery-summary-grid">
                      <div className="delivery-summary-card"><span>Tamanho final</span><strong>{input.comprimentoGomoCm} cm</strong></div>
                      <div className="delivery-summary-card"><span>Quantidade de gomos</span><strong>{input.quantidadeGomos}</strong></div>
                      <div className="delivery-summary-card"><span>Boca</span><strong>{input.diametroBocaCm} cm</strong></div>
                      <div className="delivery-summary-card"><span>Largura maxima</span><strong>{displayMaxWidthCm} cm</strong></div>
                      <div className="delivery-summary-card"><span>Nome do molde</span><strong>{moldDisplayName}</strong></div>
                      <div className="delivery-summary-card"><span>Total de tacos</span><strong>{result.faixasTacos.reduce((sum, faixa) => sum + faixa.totalTacos, 0)}</strong></div>
                    </div>
                    <div className="delivery-parts-list">
                      {result.faixasTacos.map((faixa, index) => (
                        <div key={faixa.id} className="delivery-part-card">
                          <strong>{faixa.nome}</strong>
                          <span>Ordem {index + 1}</span>
                          <span>{faixa.alturaCm} cm</span>
                          <span>{faixa.quantidadeVertical} subindo | {faixa.tacosPorGomo} por gomo</span>
                        </div>
                      ))}
                    </div>
                    <div className="delivery-files-panel">
                      <div className="delivery-files-head">
                        <strong>Anexos deste pacote</strong>
                        <span>{deliveryPreviewFiles.length} arquivo(s)</span>
                      </div>
                      <div className="delivery-files-list">
                        {deliveryPreviewFiles.map((file) => (
                          <div key={file.filename} className="delivery-file-chip">
                            <div className="delivery-file-top">
                              <strong>{file.label}</strong>
                              <em>{file.format}</em>
                            </div>
                            <span>{file.filename}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="delivery-final-summary">
                      <strong>Resumo do envio</strong>
                      <span>Vai enviar para: {deliveryEmail.trim() || "email ainda nao informado"}</span>
                      <span>Pacote: {deliveryPackageLabel}</span>
                      <span>Formato: {deliveryFormatLabel(deliveryFileFormat)}</span>
                      <span>Total de anexos: {deliveryPreviewFiles.length}</span>
                    </div>
                    <Field label="Email do usuario">
                      <input value={deliveryEmail} onChange={(event) => setDeliveryEmail(event.target.value)} placeholder="usuario@email.com" />
                    </Field>
                    <button onClick={sendFilesByEmail} disabled={deliveryState.status === "loading"}>
                      {deliveryState.status === "loading" ? "Enviando..." : "Enviar por email"}
                    </button>
                    {deliveryState.message ? (
                      <div className={`delivery-status ${deliveryState.status}`}>{deliveryState.message}</div>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>

            <div className="panel mold-panel" ref={moldPanelRef}>
              <div className="panel-head">
                <div>
                  <h3>Dados do molde</h3>
                  <p className="panel-subcopy">Conferencia rapida das medidas principais do projeto e ajustes de visualizacao da plotagem de molde.</p>
                </div>
                <button type="button" className={`panel-collapse-button ${collapsedPranchetaSections.mold ? "collapsed" : ""}`} onClick={() => togglePranchetaSection("mold")}>
                  {collapsedPranchetaSections.mold ? "Expandir" : "Minimizar"}
                </button>
              </div>
              {!collapsedPranchetaSections.mold ? (
                <>
                  <div className="mold-summary-strip technical-summary-strip">
                    <div className="mold-summary-card">
                      <span>Tamanho final</span>
                      <strong>{input.comprimentoGomoCm} cm</strong>
                    </div>
                    <div className="mold-summary-card">
                      <span>Quantidade de gomos</span>
                      <strong>{input.quantidadeGomos}</strong>
                    </div>
                    <div className="mold-summary-card">
                      <span>Boca</span>
                      <strong>{input.diametroBocaCm} cm</strong>
                    </div>
                    <div className="mold-summary-card">
                      <span>Largura maxima</span>
                      <strong>{displayMaxWidthCm} cm</strong>
                    </div>
                    <div className="mold-summary-card">
                      <span>Nome do molde</span>
                      <strong>{moldDisplayName}</strong>
                    </div>
                    <div className="mold-summary-card">
                      <span>Total de tacos</span>
                      <strong>{result.faixasTacos.reduce((sum, faixa) => sum + faixa.totalTacos, 0)}</strong>
                    </div>
                  </div>
                  <p className="muted compact-copy">
                    Os dados de cadastro do molde ficam na aba <strong>Adicionar tabela do molde</strong>. Aqui fica apenas a conferencia tecnica da plotagem montada.
                  </p>
                </>
              ) : null}
            </div>

            <div className="panel mold-panel pieces-gallery-panel">
              <div className="panel-head">
                <div>
                  <h3>Partes repartidas</h3>
                  <p className="panel-subcopy">Confira as partes separadas do molde no fim das configuracoes, sem ocupar a area principal da plotagem de molde.</p>
                </div>
              </div>
              <PatternPiecesGallery result={result} lineColors={lineColors} sectionColors={sectionColors} />
            </div>
          </>
        )}
      </aside>

      <main className="workspace">
        <div className="workspace-header">
          <div>
            <div className="brand-banner">
              <img src={brandLogo} alt="Logo" className="brand-logo" />
              <div className="brand-title-block">
                <span className="brand-title-main">ALISSON</span>
                <span className="brand-title-sub">PROJETOS E AUTOMACOES</span>
              </div>
            </div>
            <h2>{currentTabTitle}</h2>
            <p className="workspace-user">
              Acesso liberado para {authUser.name} - {authUser.email}
              {authUser.role === "admin"
                ? " | Perfil: administrador"
                : ` | Perfil: usuario | ${authUser.isPaid ? "Plano ativo" : "Sem plano ativo | Ferramentas tecnicas bloqueadas ate liberacao"}`}
            </p>
          </div>
          <div className="workspace-tabs">
            <button
              type="button"
              className={activeWorkspaceTab === "inicio" ? "active" : ""}
              onClick={() => openWorkspaceTab("inicio")}
            >
              Inicio
            </button>
            {!isRestrictedUser ? (
              <>
                <button
                  type="button"
                  className={`${activeWorkspaceTab === "prancheta" ? "active" : ""} ${!canAccessWorkspace("prancheta") ? "locked" : ""}`}
                  onClick={() => openWorkspaceTab("prancheta")}
                  title={!canAccessWorkspace("prancheta") ? "Acesso bloqueado para este usuario." : undefined}
                >
                  Plotagem de gomo
                </button>
                <button
                  type="button"
                  className={`${activeWorkspaceTab === "molde" ? "active" : ""} ${!canAccessWorkspace("molde") ? "locked" : ""}`}
                  onClick={() => openWorkspaceTab("molde")}
                  title={!canAccessWorkspace("molde") ? "Acesso bloqueado para este usuario." : undefined}
                >
                  Adicionar tabela do molde
                </button>
                <button
                  type="button"
                  className={`${activeWorkspaceTab === "moldes" ? "active" : ""} ${!canAccessWorkspace("moldes") ? "locked" : ""}`}
                  onClick={() => openWorkspaceTab("moldes")}
                  title={!canAccessWorkspace("moldes") ? "Acesso bloqueado para este usuario." : undefined}
                >
                  Moldes
                </button>
                <button
                  type="button"
                  className={`${activeWorkspaceTab === "bandeiras" ? "active" : ""} ${!canAccessWorkspace("bandeiras") ? "locked" : ""}`}
                  onClick={() => openWorkspaceTab("bandeiras")}
                  title={!canAccessWorkspace("bandeiras") ? "Acesso bloqueado para este usuario." : undefined}
                >
                  Bandeiras
                </button>
                <button
                  type="button"
                  className={`${activeWorkspaceTab === "painel" ? "active" : ""} ${!canAccessWorkspace("painel") ? "locked" : ""}`}
                  onClick={() => openWorkspaceTab("painel")}
                  title={!canAccessWorkspace("painel") ? "Acesso bloqueado para este usuario." : undefined}
                >
                  Painel e letreiros
                </button>
              </>
            ) : null}
            <button
              type="button"
              className={activeWorkspaceTab === "marketplace" ? "active" : ""}
              onClick={() => openWorkspaceTab("marketplace")}
            >
              Marketplace
            </button>
            <button
              type="button"
              className={`${activeWorkspaceTab === "planos" ? "active" : ""} ${shouldHighlightPlans ? "attention" : ""}`}
              onClick={() => openWorkspaceTab("planos")}
            >
              Planos
            </button>
            <button type="button" className={activeWorkspaceTab === "conta" ? "active" : ""} onClick={() => openWorkspaceTab("conta")}>
              Minha conta
            </button>
            <button type="button" className={activeWorkspaceTab === "tutorial" ? "active" : ""} onClick={() => openWorkspaceTab("tutorial")}>
              Tutoriais
            </button>
            <button type="button" className={activeWorkspaceTab === "sugestoes" ? "active" : ""} onClick={() => openWorkspaceTab("sugestoes")}>
              {authUser.role === "admin" ? "Sugestoes" : `Sugestoes${userNotificationCount > 0 ? ` (${userNotificationCount})` : ""}`}
            </button>
            {authUser.role === "admin" && !isRestrictedUser ? (
              <button type="button" className={activeWorkspaceTab === "admin" ? "active" : ""} onClick={() => openWorkspaceTab("admin")}>
                {`Admin${adminNotificationCount > 0 ? ` (${adminNotificationCount})` : ""}`}
              </button>
            ) : null}
            <button type="button" onClick={() => void logout()}>
              Sair
            </button>
          </div>
        </div>

        {activeWorkspaceTab === "inicio" ? (
          <section className="table-panel home-panel">
            <div className="home-layout">
              <div>
                <div className="home-hero">
                  <div>
                    <p className="eyebrow">Area do usuario</p>
                    <p className="muted compact-copy">
                      Nesta area inicial voce escolhe entre trabalhar com moldes de gomo, bandeiras pixeladas ou painel e letreiros.
                      Cada modulo abre com suas configuracoes proprias para manter o fluxo organizado.
                    </p>
                    {!isAdmin ? (
                      <div className="warning locked-warning">
                        Seu acesso atual libera o <strong>Marketplace</strong> e a area <strong>Minha conta</strong>. As demais ferramentas ficam bloqueadas ate a liberacao de um plano.
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="home-grid">
                  <button
                    type="button"
                    className={`home-card ${!canAccessWorkspace("prancheta") ? "home-card-locked" : ""}`}
                    onClick={() => openWorkspaceTab("prancheta")}
                  >
                    <strong>Plotagem de gomo</strong>
                    <span>Visualizar o molde, conferir divisoes, tacos, bainhas e revisar o desenho tecnico.</span>
                    {!canAccessWorkspace("prancheta") ? <em className="card-lock-copy">Bloqueado no seu acesso atual</em> : null}
                  </button>

                  <button
                    type="button"
                    className={`home-card ${!canAccessWorkspace("molde") ? "home-card-locked" : ""}`}
                    onClick={() => openWorkspaceTab("molde")}
                  >
                    <strong>Adicionar tabela do molde</strong>
                    <span>Preencher pontos, alturas e larguras do gomo e transmitir os dados para a plotagem de molde.</span>
                    {!canAccessWorkspace("molde") ? <em className="card-lock-copy">Bloqueado no seu acesso atual</em> : null}
                  </button>

                  <button
                    type="button"
                    className={`home-card ${!canAccessWorkspace("moldes") ? "home-card-locked" : ""}`}
                    onClick={() => openWorkspaceTab("moldes")}
                  >
                    <strong>Moldes</strong>
                    <span>Listar moldes cadastrados, abrir modelos prontos e carregar tudo direto na plotagem.</span>
                    {!canAccessWorkspace("moldes") ? <em className="card-lock-copy">Bloqueado no seu acesso atual</em> : null}
                  </button>

                  <button
                    type="button"
                    className={`home-card ${!canAccessWorkspace("bandeiras") ? "home-card-locked" : ""}`}
                    onClick={() => openWorkspaceTab("bandeiras")}
                  >
                    <strong>Bandeiras</strong>
                    <span>Carregar imagem, numerar cores e gerar tabela tecnica para bandeira pixelada.</span>
                    {!canAccessWorkspace("bandeiras") ? <em className="card-lock-copy">Bloqueado no seu acesso atual</em> : null}
                  </button>

                  <button
                    type="button"
                    className={`home-card ${!canAccessWorkspace("painel") ? "home-card-locked" : ""}`}
                    onClick={() => openWorkspaceTab("painel")}
                  >
                    <strong>Painel e letreiros</strong>
                    <span>Carregar imagem, revisar blocos e trabalhar a leitura visual de painel com acesso separado da aba bandeiras.</span>
                    {!canAccessWorkspace("painel") ? <em className="card-lock-copy">Bloqueado no seu acesso atual</em> : null}
                  </button>

                  <button type="button" className="home-card" onClick={() => openWorkspaceTab("marketplace")}>
                    <strong>Marketplace</strong>
                    <span>Criar sua vitrine interna com foto, descricao, valor e contato direto via WhatsApp.</span>
                    <em className="card-lock-copy card-available-copy">Disponivel no seu acesso</em>
                  </button>

                  <button type="button" className="home-card" onClick={() => openWorkspaceTab("tutorial")}>
                    <strong>Tutoriais</strong>
                    <span>Acessar a descricao das aulas e abrir direto o link publicado pelo administrador no YouTube.</span>
                    <em className="card-lock-copy card-available-copy">Disponivel no seu acesso</em>
                  </button>

                  <button
                    type="button"
                    className={`home-card ${shouldHighlightPlans ? "home-card-attention" : ""}`}
                    onClick={() => openWorkspaceTab("planos")}
                  >
                    <strong>Planos</strong>
                    <span>Veja os planos que o administrador colocou no ar e confira qual libera plotagem, moldes, bandeiras, painel e demais ferramentas.</span>
                    <em className="card-lock-copy card-available-copy">
                      {shouldHighlightPlans ? "Sua conta precisa de um plano ativo" : "Consulte os planos publicados"}
                    </em>
                  </button>

                  <button
                    type="button"
                    className={`home-card ${!canAccessWorkspace("bandeiras") ? "home-card-locked" : ""}`}
                    onClick={() => openWorkspaceTab("bandeiras")}
                  >
                    <strong>Funcoes da aba Bandeiras</strong>
                    <span>Upload pixelado, zoom, grade 7x5, detector de tons perdidos e ajuste de cor mais proxima.</span>
                    <span>Tabela com No., cor, quantidade, folhas e envio por email em 4 partes com arquivo inteiro opcional.</span>
                    {!canAccessWorkspace("bandeiras") ? <em className="card-lock-copy">Bloqueado no seu acesso atual</em> : null}
                  </button>

                  <button
                    type="button"
                    className={`home-card ${!canAccessWorkspace("painel") ? "home-card-locked" : ""}`}
                    onClick={() => openWorkspaceTab("painel")}
                  >
                    <strong>Funcoes da aba Painel</strong>
                    <span>Entrada separada para painel e letreiros, com o mesmo fluxo de leitura visual, cores e exportacao organizado.</span>
                    {!canAccessWorkspace("painel") ? <em className="card-lock-copy">Bloqueado no seu acesso atual</em> : null}
                  </button>

                  <button
                    type="button"
                    className={`home-card ${!canAccessWorkspace("molde") ? "home-card-locked" : ""}`}
                    onClick={() => (canAccessWorkspace("molde") ? openSidebarSection("molde") : openWorkspaceTab("marketplace"))}
                  >
                    <strong>Dados do molde</strong>
                    <span>Conferir nome do projeto, modelo, gomos, boca, banhinha e medidas principais.</span>
                    {!canAccessWorkspace("molde") ? <em className="card-lock-copy">Bloqueado no seu acesso atual</em> : null}
                  </button>

                  <button
                    type="button"
                    className={`home-card ${!canAccessWorkspace("prancheta") ? "home-card-locked" : ""}`}
                    onClick={() => (canAccessWorkspace("prancheta") ? openSidebarSection("divisoes") : openWorkspaceTab("marketplace"))}
                  >
                    <strong>Divisoes e tacos</strong>
                    <span>Configurar BOCA, BOJO, BICO e as reparticoes por secoes com cores e tacos por gomo.</span>
                    {!canAccessWorkspace("prancheta") ? <em className="card-lock-copy">Bloqueado no seu acesso atual</em> : null}
                  </button>

                  <button
                    type="button"
                    className={`home-card ${!canAccessWorkspace("prancheta") ? "home-card-locked" : ""}`}
                    onClick={() => (canAccessWorkspace("prancheta") ? openSidebarSection("envio") : openWorkspaceTab("marketplace"))}
                  >
                    <strong>Envio</strong>
                    <span>Mandar o molde inteiro, partes separadas e PDF tecnico profissional por email.</span>
                    {!canAccessWorkspace("prancheta") ? <em className="card-lock-copy">Bloqueado no seu acesso atual</em> : null}
                  </button>

                  {authUser.role === "admin" ? (
                    <button type="button" className="home-card" onClick={() => setActiveWorkspaceTab("admin")}>
                      <strong>Painel administrativo</strong>
                      <span>Entrada reservada para gestao de usuarios, planos, acessos e configuracoes da plataforma.</span>
                    </button>
                  ) : null}
                </div>
              </div>

              <aside className="home-logo-panel">
                <img src={brandLogo} alt="Logo Alisson Projetos e Automacoes" className="home-side-logo" />
              </aside>
            </div>
          </section>
        ) : activeWorkspaceTab === "prancheta" ? (
          <>
            <PatternPreview
              result={result}
              zoom={previewZoom}
              onZoomChange={setPreviewZoom}
              lineColors={lineColors}
              sectionColors={sectionColors}
              showPoints={input.mostrarPontos}
              onShowPointsChange={(checked) => updateInput("mostrarPontos", checked)}
              onLineColorChange={updateLineColor}
            />
          </>
        ) : activeWorkspaceTab === "bandeiras" ? (
          <BandeirasWorkspace />
        ) : activeWorkspaceTab === "painel" ? (
          <PanelWorkspace />
        ) : activeWorkspaceTab === "marketplace" ? (
          <MarketplaceWorkspace authUser={authUser} />
        ) : activeWorkspaceTab === "planos" ? (
          <PlansWorkspace authUser={authUser} onAuthUserUpdated={setAuthUser} />
        ) : activeWorkspaceTab === "conta" ? (
          <AccountWorkspace authUser={authUser} onUserUpdated={setAuthUser} />
        ) : activeWorkspaceTab === "tutorial" ? (
          <TutorialWorkspace />
        ) : activeWorkspaceTab === "sugestoes" ? (
          <SuggestionsWorkspace authUser={authUser} onNotificationsChanged={() => setUserNotificationCount(0)} />
        ) : activeWorkspaceTab === "admin" ? (
          <AdminWorkspace onNotificationsChanged={() => setAdminNotificationCount(0)} />
        ) : activeWorkspaceTab === "moldes" ? (
          <MoldesWorkspace
            authUser={authUser}
            buildSnapshot={buildCurrentMoldSnapshot}
            onLoadToPlot={applyMoldSnapshot}
            onLoadToEdit={editMoldSnapshot}
          />
        ) : (
          <section className="table-panel mold-input-panel workspace-tab-panel">
            <div className="panel-head mold-tab-head">
              <div>
                <p className="eyebrow">Adicionar tabela do molde</p>
                <h3>Cadastro tecnico do molde</h3>
                <p className="panel-subcopy">Organize os dados principais do molde e preencha a tabela de pontos com mais clareza.</p>
              </div>
              <div className="point-actions">
                <button onClick={applyDraftPoints}>Salvar e transmitir</button>
              </div>
            </div>
            {transmitState.message ? (
              <div
                className={`delivery-status ${
                  transmitState.status === "success" ? "success" : transmitState.status === "error" ? "error" : "saving"
                }`}
              >
                {transmitState.message}
              </div>
            ) : null}
            <div className="warning warning">
              Atencao: preencha exatamente como esta no site onde voce esta tirando o molde para nao ter erro nas informacoes na hora de montar seu molde no sistema.
            </div>
            <div className="mold-intake-layout">
              <section className="mold-intake-block">
                <div className="panel-head compact-panel-head">
                  <div>
                    <h3>Resumo rapido</h3>
                    <p className="panel-subcopy">Conferencia imediata dos dados principais que alimentam a plotagem.</p>
                  </div>
                </div>
                <div className="mold-summary-strip">
                  <div className="mold-summary-card">
                    <span>Quantidade de gomos</span>
                    <strong>{input.quantidadeGomos}</strong>
                  </div>
                  <div className="mold-summary-card">
                    <span>Boca</span>
                    <strong>{input.diametroBocaCm} cm</strong>
                  </div>
                  <div className="mold-summary-card">
                    <span>Largura maxima</span>
                    <strong>{displayMaxWidthCm} cm</strong>
                  </div>
                  <div className="mold-summary-card">
                    <span>Tamanho em cm</span>
                    <strong>{input.comprimentoGomoCm} cm</strong>
                  </div>
                </div>
              </section>

              <section className="mold-intake-block">
                <div className="panel-head compact-panel-head">
                  <div>
                    <h3>Configuracoes do molde</h3>
                    <p className="panel-subcopy">Defina as informacoes tecnicas que acompanham a tabela do molde.</p>
                  </div>
                </div>
                <div className="grid two mold-grid mold-settings-grid">
                  <Field label="Modelo">
                    <input required value={input.modelo} onChange={(event) => updateInput("modelo", event.target.value as ProjectInput["modelo"])} />
                  </Field>
                  <Field label="Quantidade de gomo">
                    <input
                      type="number"
                      required
                      inputMode="numeric"
                      value={input.quantidadeGomos}
                      onChange={(event) => updateInput("quantidadeGomos", Number(event.target.value))}
                    />
                  </Field>
                  <Field label="Tamanho da banhinha">
                    <input
                      type="number"
                      required
                      inputMode="decimal"
                      value={input.bainhaCm}
                      onChange={(event) => updateInput("bainhaCm", Number(event.target.value))}
                    />
                  </Field>
                  <Field label="Diametro da Boca">
                    <input
                      type="number"
                      required
                      inputMode="decimal"
                      value={input.diametroBocaCm}
                      onChange={(event) => updateInput("diametroBocaCm", Number(event.target.value))}
                    />
                  </Field>
                  <Field label="Largura max. do Gomo">
                    <input type="number" required inputMode="decimal" value={manualMaxWidthDraft} onChange={(event) => setManualMaxWidthDraft(event.target.value)} />
                  </Field>
                </div>
              </section>
            </div>
            <div className="mold-table-head">
              <div>
                <h3>Tabela de pontos do gomo</h3>
                <p className="muted compact-copy">
                  Preencha os pontos do gomo. O sistema calcula automaticamente a altura acumulada e o tamanho total em cm somando as alturas da tabela do molde.
                </p>
              </div>
              <div className="mold-table-actions">
                <Field label="Quantidade de pontos">
                  <input type="number" min="2" value={pointCountDraft} onChange={(event) => resizePoints(event.target.value)} />
                </Field>
              </div>
            </div>
            <div className="mold-entry-layout">
              <div className="editor-table mold-entry-table">
                <table>
                  <thead>
                    <tr>
                      <th>Ponto</th>
                      <th>Altura (cm)</th>
                      <th>Largura/2 (cm)</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {draftPoints.map((point, index) => (
                      <tr key={point.ponto}>
                        <td>{point.ponto}</td>
                        <td><input type="number" value={point.alturaCm} onChange={(event) => updatePoint(index, { alturaCm: Number(event.target.value) })} /></td>
                        <td><input type="number" value={point.larguraMeiaCm} onChange={(event) => updatePoint(index, { larguraMeiaCm: Number(event.target.value) })} /></td>
                        <td><button onClick={() => removePoint(index)} disabled={draftPoints.length <= 2}>Excluir</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <aside className="tutorial-panel">
                <div className="panel-head">
                  <h3>Tutorial de uso</h3>
                </div>
                <div className="tutorial-steps">
                  <div className="tutorial-step">
                    <strong>1. Preencha os dados do molde</strong>
                    <p>Informe modelo, quantidade de gomos, tamanho da banhinha, diametro da boca e confira a largura maxima do gomo.</p>
                  </div>
                  <div className="tutorial-step">
                    <strong>2. Defina a quantidade de pontos</strong>
                    <p>Escolha quantos pontos o molde vai ter. O sistema cria a tabela automaticamente para voce preencher.</p>
                  </div>
                  <div className="tutorial-step">
                    <strong>3. Preencha Altura e Largura/2</strong>
                    <p>Digite exatamente os valores do molde original. A altura acumulada e o tamanho total sao calculados pelo sistema.</p>
                  </div>
                  <div className="tutorial-step">
                    <strong>4. Salve e transmita</strong>
                    <p>Clique em <em>Salvar e transmitir</em> para enviar os dados para a plotagem de molde e atualizar o desenho do gomo.</p>
                  </div>
                  <div className="tutorial-step">
                    <strong>5. Configure BOCA, BOJO e BICO</strong>
                    <p>No painel lateral, ajuste as regioes principais do balÃ£o e escolha se cada uma sera unica ou repartida em partes.</p>
                  </div>
                  <div className="tutorial-step">
                    <strong>6. Defina o taqueamento</strong>
                    <p>Em cada regiao ou parte, informe a altura do taco e quantos tacos por gomo deseja usar.</p>
                  </div>
                  <div className="tutorial-step">
                    <strong>7. Confira o gomo plotado</strong>
                    <p>Veja o molde montado, as divisÃµes, as bainhas e o taqueamento. Use o zoom para conferir os detalhes.</p>
                  </div>
                  <div className="tutorial-step">
                    <strong>8. Revise antes de montar</strong>
                    <p>Se algum dado estiver diferente do molde de origem, volte em Adicionar tabela do molde, corrija e transmita novamente.</p>
                  </div>
                </div>
              </aside>
            </div>
          </section>
        )}

        <footer className="footer">
          <div>
            Â© <span>{currentYear}</span> - Alisson Cardozo Varela. Todos os direitos reservados.
          </div>
          <div className="footerLinks">
            <a href="mailto:alissonprojetostaco@gmail.com">
              <svg className="footerIcon" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2m0 4l-8 5L4 8V6l8 5l8-5z" />
              </svg>
              E-mail
            </a>
            <a href="https://wa.me/5521990792058" target="_blank" rel="noopener noreferrer">
              <svg className="footerIcon" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M16.75 13.96c.25.13 1.47.72 1.7.85c.23.13.39.2.44.33c.05.13.05.77-.18 1.51c-.22.74-1.3 1.41-1.77 1.49c-.46.07-.99.1-1.6-.1c-.37-.12-.84-.27-1.45-.53c-2.55-1.1-4.21-3.67-4.34-3.84c-.13-.17-1.03-1.37-1.03-2.61s.65-1.85.88-2.1c.23-.25.5-.31.67-.31h.48c.15 0 .35-.06.54.4c.2.46.68 1.58.74 1.7c.06.12.1.26.02.42c-.08.17-.12.27-.24.41c-.12.14-.25.31-.36.42c-.12.12-.24.25-.1.5c.14.25.62 1.01 1.33 1.63c.92.82 1.69 1.07 1.94 1.2c.25.12.39.1.53-.06c.14-.17.61-.72.77-.96c.17-.25.34-.2.57-.12M12.04 2C6.52 2 2.04 6.35 2.04 11.72c0 1.72.47 3.33 1.29 4.72L2 22l5.73-1.5c1.34.73 2.88 1.15 4.31 1.15c5.52 0 9.99-4.35 9.99-9.72S17.56 2 12.04 2" />
              </svg>
              WhatsApp
            </a>
            <a href="https://t.me/programador_OFC" target="_blank" rel="noopener noreferrer">
              <svg className="footerIcon" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M9.78 18.65c-.39 0-.32-.15-.46-.52l-1.14-3.76l8.77-5.2" />
                <path fill="currentColor" d="M9.78 18.65c.3 0 .43-.14.6-.3l1.6-1.56l-2-1.2" />
                <path fill="currentColor" d="M9.98 15.58l4.86 3.59c.55.3.95.14 1.09-.51l1.96-9.24c.21-.8-.3-1.16-.83-.92L5.3 12.92c-.8.32-.79.77-.15.97l3.03.95l7.01-4.42c.33-.2.64-.09.39.13" />
              </svg>
              Telegram
            </a>
            <a href="https://www.instagram.com/alissoncardozo?igsh=MXh1aXM3dWszZDdpaQ==" target="_blank" rel="noopener noreferrer">
              <svg className="footerIcon" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M7.8 2h8.4A5.8 5.8 0 0 1 22 7.8v8.4A5.8 5.8 0 0 1 16.2 22H7.8A5.8 5.8 0 0 1 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8A3.6 3.6 0 0 0 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6A3.6 3.6 0 0 0 16.4 4zm9.65 1.5a1.2 1.2 0 1 1 0 2.4a1.2 1.2 0 0 1 0-2.4M12 7a5 5 0 1 1 0 10a5 5 0 0 1 0-10m0 2a3 3 0 1 0 0 6a3 3 0 0 0 0-6" />
              </svg>
              Instagram
            </a>
            <a href="https://github.com/Alisson-cardozo?tab=overview&from=2024-01-01&to=2024-01-13" target="_blank" rel="noopener noreferrer">
              <svg className="footerIcon" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M12 2A10 10 0 0 0 2 12c0 3.54 2.29 6.53 5.47 7.59c.4.07.55-.17.55-.38c0-.19-.01-.82-.01-1.49c-2.01.37-2.53-.49-2.69-.94c-.09-.23-.48-.94-.82-1.13c-.28-.15-.68-.52-.01-.53c.63-.01 1.08.58 1.23.82c.72 1.21 1.87.87 2.33.66c.07-.52.28-.87.5-1.07c-1.78-.2-3.64-.89-3.64-3.95c0-.87.31-1.59.82-2.15c-.08-.2-.36-1.02.08-2.12c0 0 .67-.21 2.2.82c.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82c.44 1.1.16 1.92.08 2.12c.51.56.82 1.27.82 2.15c0 3.07-1.87 3.75-3.65 3.95c.29.25.54.73.54 1.48c0 1.07-.01 1.93-.01 2.2c0 .21.15.46.55.38A10.01 10.01 0 0 0 22 12A10 10 0 0 0 12 2" />
              </svg>
              GitHub
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}

function buildDefaultSections(regiao: RegionTackingConfig["regiao"], alturaCm: number, tacosPorGomo: number, alturaTacoCm: number): TacoSectionConfig[] {
  const metade = Number((alturaCm / 2).toFixed(1));
  return [
    {
      id: `${regiao}-1`,
      nome: `${regiao} 1`,
      alturaSecaoCm: metade,
      alturaTacoCm,
      tacosPorGomo
    },
    {
      id: `${regiao}-2`,
      nome: `${regiao} 2`,
      alturaSecaoCm: Number((alturaCm - metade).toFixed(1)),
      alturaTacoCm,
      tacosPorGomo
    }
  ];
}

function rebalanceSections(regiao: RegionTackingConfig): RegionTackingConfig {
  if (regiao.modo !== "secoes" || regiao.secoes.length === 0) {
    return regiao;
  }

  const evenHeight = Number((regiao.alturaCm / regiao.secoes.length).toFixed(1));
  let acumulado = 0;
  const secoes = regiao.secoes.map((secao, index) => {
    const alturaSecaoCm = index === regiao.secoes.length - 1 ? Number((regiao.alturaCm - acumulado).toFixed(1)) : evenHeight;
    acumulado += alturaSecaoCm;
    return {
      ...secao,
      alturaSecaoCm
    };
  });

  return {
    ...regiao,
    secoes
  };
}

function syncRegionHeightFromSections(regiao: RegionTackingConfig): RegionTackingConfig {
  if (regiao.modo !== "secoes" || regiao.secoes.length === 0) {
    return regiao;
  }

  return {
    ...regiao,
    alturaCm: roundToOne(regiao.secoes.reduce((sum, secao) => sum + secao.alturaSecaoCm, 0))
  };
}

function adjustGlobalSectionHeights(
  regioes: RegionTackingConfig[],
  targetRegionIndex: number,
  targetSectionIndex: number,
  requestedHeight: number
): RegionTackingConfig[] {
  const cloned = regioes.map((regiao) => ({
    ...regiao,
    secoes: regiao.secoes.map((secao) => ({ ...secao }))
  }));

  const slots = cloned.flatMap((regiao, regionIndex) => {
    if (regiao.modo === "secoes" && regiao.secoes.length > 0) {
      return regiao.secoes.map((secao, sectionIndex) => ({
        regionIndex,
        sectionIndex,
        height: secao.alturaSecaoCm,
        minHeight: secao.alturaTacoCm
      }));
    }

    return [];
  });

  const slotIndex = slots.findIndex((slot) => slot.regionIndex === targetRegionIndex && slot.sectionIndex === targetSectionIndex);
  if (slotIndex < 0) {
    return cloned.map(syncRegionHeightFromSections);
  }

  const slot = slots[slotIndex];
  const step = Math.max(slot.minHeight, 0.1);
  const nextHeight = Math.max(roundToStep(requestedHeight, step), slot.minHeight);
  let delta = roundToOne(nextHeight - slot.height);
  slots[slotIndex].height = nextHeight;

  if (delta > 0) {
    for (let index = slotIndex + 1; index < slots.length && delta > 0; index += 1) {
      const donorStep = Math.max(slots[index].minHeight, 0.1);
      const reducible = roundToStep(slots[index].height - slots[index].minHeight, donorStep);
      if (reducible <= 0) {
        continue;
      }
      const reduction = Math.min(reducible, delta);
      const steppedReduction = Math.min(reducible, roundToStep(reduction, step));
      if (steppedReduction <= 0) {
        continue;
      }
      slots[index].height = roundToOne(slots[index].height - steppedReduction);
      delta = roundToOne(delta - steppedReduction);
    }

    if (delta > 0) {
      slots[slotIndex].height = roundToOne(slots[slotIndex].height - delta);
    }
  } else if (delta < 0) {
    let gain = Math.abs(delta);
    for (let index = slotIndex + 1; index < slots.length && gain > 0; index += 1) {
      const steppedGain = roundToStep(gain, step);
      if (steppedGain <= 0) {
        continue;
      }
      slots[index].height = roundToOne(slots[index].height + steppedGain);
      gain = roundToOne(gain - steppedGain);
      break;
    }

    if (gain > 0 && slotIndex > 0) {
      const receiverIndex = slotIndex - 1;
      slots[receiverIndex].height = roundToOne(slots[receiverIndex].height + gain);
    }
  }

  slots.forEach((currentSlot) => {
    const sectionStep = Math.max(currentSlot.minHeight, 0.1);
    cloned[currentSlot.regionIndex].secoes[currentSlot.sectionIndex].alturaSecaoCm = Math.max(
      currentSlot.minHeight,
      roundToStep(currentSlot.height, sectionStep)
    );
  });

  const normalized = cloned.map(syncRegionHeightFromSections);
  return normalized.map((regiao) => {
    if (regiao.modo !== "secoes" || regiao.secoes.length === 0) {
      return regiao;
    }

    return {
      ...regiao,
      secoes: normalizeSectionHeights(regiao.secoes, regiao.alturaCm)
    };
  });
}

function syncRegionsToHeight(regioes: RegionTackingConfig[], currentHeight: number, nextHeight: number): RegionTackingConfig[] {
  if (currentHeight <= 0 || nextHeight <= 0) {
    return regioes;
  }

  const totalPercent = regioes.reduce((sum, regiao) => sum + (regiao.percentualPadrao ?? 0), 0);

  return regioes.map((regiao, index) => {
    const fallbackRatio = regiao.alturaCm / currentHeight;
    const proportionalRatio = totalPercent > 0 ? (regiao.percentualPadrao ?? 0) / totalPercent : fallbackRatio;
    const rawNextRegionHeight = nextHeight * proportionalRatio;
    const nextRegionHeight =
      index === regioes.length - 1
        ? roundToOne(
            nextHeight -
              regioes
                .slice(0, -1)
                .reduce((sum, item) => sum + roundToOne(nextHeight * (totalPercent > 0 ? (item.percentualPadrao ?? 0) / totalPercent : item.alturaCm / currentHeight)), 0)
          )
        : roundToOne(rawNextRegionHeight);

    if (regiao.modo !== "secoes" || regiao.secoes.length === 0) {
      return {
        ...regiao,
        alturaCm: Math.max(nextRegionHeight, regiao.alturaTacoCm)
      };
    }

    const sectionRatioBase =
      regiao.alturaCm > 0 ? regiao.alturaCm : regiao.secoes.reduce((sum, secao) => sum + secao.alturaSecaoCm, 0);

    const scaledSections = regiao.secoes.map((secao) => ({
      ...secao,
      alturaSecaoCm: Math.max(
        roundToOne((secao.alturaSecaoCm / Math.max(sectionRatioBase, 1)) * nextRegionHeight),
        secao.alturaTacoCm
      )
    }));

    const rawAdjustedSections = scaledSections.map((secao, index) => {
      if (index !== scaledSections.length - 1) {
        return secao;
      }
      const usedHeight = scaledSections.slice(0, -1).reduce((total, item) => total + item.alturaSecaoCm, 0);
      return {
        ...secao,
        alturaSecaoCm: roundToOne(Math.max(nextRegionHeight - usedHeight, secao.alturaTacoCm))
      };
    });

    const adjustedSections = normalizeSectionHeights(rawAdjustedSections, Math.max(nextRegionHeight, regiao.secoes.reduce((sum, secao) => sum + secao.alturaTacoCm, 0)));
    const finalRegionHeight = roundToOne(adjustedSections.reduce((total, secao) => total + secao.alturaSecaoCm, 0));

    return {
      ...regiao,
      alturaCm: finalRegionHeight,
      secoes: adjustedSections
    };
  });
}

function normalizeSectionHeights(secoes: TacoSectionConfig[], targetHeight: number): TacoSectionConfig[] {
  if (secoes.length === 0) {
    return secoes;
  }

  const result = secoes.map((secao) => ({ ...secao }));
  const minimumTotal = result.reduce((total, secao) => total + secao.alturaTacoCm, 0);
  const safeTarget = Math.max(targetHeight, minimumTotal);
  let currentTotal = roundToOne(result.reduce((total, secao) => total + secao.alturaSecaoCm, 0));

  if (currentTotal === safeTarget) {
    return result;
  }

  const lastIndex = result.length - 1;
  result[lastIndex] = {
    ...result[lastIndex],
    alturaSecaoCm: roundToOne(result[lastIndex].alturaSecaoCm + (safeTarget - currentTotal))
  };

  if (result[lastIndex].alturaSecaoCm < result[lastIndex].alturaTacoCm) {
    result[lastIndex].alturaSecaoCm = result[lastIndex].alturaTacoCm;
  }

  currentTotal = roundToOne(result.reduce((total, secao) => total + secao.alturaSecaoCm, 0));
  if (currentTotal === safeTarget) {
    return result;
  }

  let difference = roundToOne(currentTotal - safeTarget);
  if (difference <= 0) {
    return result;
  }

  for (let index = 0; index < result.length && difference > 0; index += 1) {
    const secao = result[index];
    const reducible = roundToOne(secao.alturaSecaoCm - secao.alturaTacoCm);
    if (reducible <= 0) {
      continue;
    }
    const reduction = Math.min(reducible, difference);
    result[index] = {
      ...secao,
      alturaSecaoCm: roundToOne(secao.alturaSecaoCm - reduction)
    };
    difference = roundToOne(difference - reduction);
  }

  return result;
}

function roundToOne(value: number) {
  return Math.round(value * 10) / 10;
}

function roundToStep(value: number, step: number) {
  if (step <= 0) {
    return roundToOne(value);
  }
  return roundToOne(Math.round(value / step) * step);
}

function toFiniteNumber(value: unknown, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
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
    throw new Error("Resposta invalida da API.");
  }
}

function parseLooseJsonResponse(rawText: string) {
  const text = String(rawText || "").trim();
  if (text === "") {
    return {};
  }

  try {
    return JSON.parse(text) as { message?: string; error?: string };
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const candidate = text.slice(start, end + 1);
      try {
        return JSON.parse(candidate) as { message?: string; error?: string };
      } catch {
      }
    }

    return {
      message: text.includes("<")
        ? "Arquivos enviados, mas o servidor retornou texto extra depois da resposta. Verifique avisos do PHP no backend."
        : text
    };
  }
}


