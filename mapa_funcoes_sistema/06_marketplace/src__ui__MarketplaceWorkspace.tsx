import { ChangeEvent, useEffect, useMemo, useState } from "react";
import type { AuthUser } from "./AuthPanel";
import { apiFetch, resolveAssetUrl } from "../lib/api";

type MarketplaceProduct = {
  id: number;
  userId: number;
  sellerName: string;
  name: string;
  description: string;
  price: number;
  images: string[];
  whatsapp: string;
  sold: boolean;
  inactive: boolean;
  contactEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type ProductFormState = {
  name: string;
  description: string;
  price: string;
  images: string[];
  whatsapp: string;
};

type Props = {
  authUser: AuthUser;
};

function sanitizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function toWhatsappNumber(raw: string) {
  const digits = sanitizePhone(raw);
  if (digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function buildWhatsappHref(phone: string, productName: string, price: number) {
  const target = toWhatsappNumber(phone);
  const text = encodeURIComponent(`Ola! Tenho interesse no produto: ${productName} (R$ ${price.toFixed(2)}).`);
  return `https://wa.me/${target}?text=${text}`;
}

function toCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function emptyForm(): ProductFormState {
  return {
    name: "",
    description: "",
    price: "",
    images: [],
    whatsapp: ""
  };
}

async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Nao foi possivel ler a imagem."));
    reader.readAsDataURL(file);
  });
}

function normalizeProduct(raw: any): MarketplaceProduct {
  const images = Array.isArray(raw?.images)
    ? raw.images.map((item: unknown) => resolveAssetUrl(String(item || "").trim())).filter(Boolean)
    : [];
  return {
    id: Number(raw?.id || 0),
    userId: Number(raw?.userId || 0),
    sellerName: String(raw?.sellerName || ""),
    name: String(raw?.name || ""),
    description: String(raw?.description || ""),
    price: Number(raw?.price || 0),
    images,
    whatsapp: String(raw?.whatsapp || ""),
    sold: raw?.sold === true || raw?.sold === 1 || raw?.sold === "1",
    inactive: raw?.inactive === true || raw?.inactive === 1 || raw?.inactive === "1",
    contactEnabled: raw?.contactEnabled === true || raw?.contactEnabled === 1 || raw?.contactEnabled === "1",
    createdAt: String(raw?.createdAt || ""),
    updatedAt: String(raw?.updatedAt || "")
  };
}

export function MarketplaceWorkspace({ authUser }: Props) {
  const productsPerPage = 8;
  const canManageMarketplace = authUser.role === "admin" || authUser.permissions.accessStorefront;
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [status, setStatus] = useState<{ type: "idle" | "success" | "error"; message?: string }>({ type: "idle" });
  const [filter, setFilter] = useState<"all" | "available" | "sold">("all");
  const [loading, setLoading] = useState(true);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [viewerProduct, setViewerProduct] = useState<MarketplaceProduct | null>(null);
  const [viewerImageIndex, setViewerImageIndex] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const response = await apiFetch("/api/marketplace/products");
      const payload = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Nao foi possivel carregar os produtos.");
      }
      setProducts(Array.isArray(payload.items) ? payload.items.map(normalizeProduct) : []);
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Nao foi possivel carregar os produtos."
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProducts();
  }, []);

  const filteredProducts = useMemo(() => {
    if (filter === "available") return products.filter((item) => !item.sold && !item.inactive);
    if (filter === "sold") return products.filter((item) => item.sold);
    return products;
  }, [products, filter]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / productsPerPage));
  const paginatedProducts = useMemo(
    () => filteredProducts.slice((currentPage - 1) * productsPerPage, currentPage * productsPerPage),
    [currentPage, filteredProducts]
  );

  const canManageProduct = (product: MarketplaceProduct) => authUser.role === "admin" || product.userId === authUser.id;

  useEffect(() => {
    setCurrentPage(1);
  }, [filter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handleImages = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) {
      return;
    }

    try {
      setUploadingImage(true);
      const availableSlots = Math.max(0, 3 - form.images.length);
      const selected = files.slice(0, availableSlots);
      const uploadedPaths: string[] = [];

      for (const file of selected) {
        const dataUrl = await fileToDataUrl(file);
        const response = await apiFetch("/api/admin/marketplace-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl: dataUrl })
        });
        const payload = await parseApiResponse(response);
        if (!response.ok) {
          throw new Error(payload.error || payload.message || "Nao foi possivel enviar uma das fotos.");
        }
        uploadedPaths.push(String(payload.imagePath || ""));
      }

      setForm((current) => ({
        ...current,
        images: [...current.images, ...uploadedPaths].slice(0, 3)
      }));
      setStatus({ type: "success", message: "Fotos carregadas com sucesso." });
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Nao foi possivel carregar as fotos." });
    } finally {
      setUploadingImage(false);
      event.target.value = "";
    }
  };

  const removeFormImage = (index: number) => {
    setForm((current) => ({
      ...current,
      images: current.images.filter((_, imageIndex) => imageIndex !== index)
    }));
  };

  const saveProduct = async () => {
    const priceNumber = Number(String(form.price).replace(",", "."));
    const phone = sanitizePhone(form.whatsapp);

    if (!form.name.trim() || !form.description.trim() || !Number.isFinite(priceNumber) || priceNumber <= 0 || !phone || form.images.length === 0) {
      setStatus({ type: "error", message: "Preencha nome, descricao, valor, ate 3 fotos e WhatsApp para publicar." });
      return;
    }

    try {
      const response = await apiFetch(editingId ? `/api/admin/marketplace/products/${editingId}` : "/api/admin/marketplace/products", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: authUser.id,
          name: form.name.trim(),
          description: form.description.trim(),
          price: priceNumber,
          images: form.images,
          whatsapp: phone
        })
      });
      const payload = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Nao foi possivel salvar o produto.");
      }

      setStatus({ type: "success", message: editingId ? "Produto atualizado com sucesso." : "Produto publicado na loja interna." });
      setForm(emptyForm());
      setEditingId(null);
      await loadProducts();
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Nao foi possivel salvar o produto." });
    }
  };

  const editProduct = (product: MarketplaceProduct) => {
    setForm({
      name: product.name,
      description: product.description,
      price: String(product.price).replace(".", ","),
      images: product.images,
      whatsapp: product.whatsapp
    });
    setEditingId(product.id);
    setStatus({ type: "success", message: "Editando produto selecionado." });
  };

  const toggleSold = async (product: MarketplaceProduct) => {
    try {
      const response = await apiFetch(`/api/admin/marketplace/products/${product.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sold: !product.sold })
      });
      const payload = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Nao foi possivel atualizar o status.");
      }
      setStatus({ type: "success", message: product.sold ? "Produto reativado com sucesso." : "Produto marcado como vendido." });
      await loadProducts();
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Nao foi possivel atualizar o produto." });
    }
  };

  const deleteProduct = async (product: MarketplaceProduct) => {
    try {
      const response = await apiFetch(`/api/admin/marketplace/products/${product.id}`, {
        method: "DELETE"
      });
      const payload = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(payload.error || payload.message || "Nao foi possivel excluir o produto.");
      }
      setStatus({ type: "success", message: "Produto excluido com sucesso." });
      await loadProducts();
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Nao foi possivel excluir o produto." });
    }
  };

  const openViewer = (product: MarketplaceProduct, imageIndex = 0) => {
    setViewerProduct(product);
    setViewerImageIndex(imageIndex);
  };

  const closeViewer = () => {
    setViewerProduct(null);
    setViewerImageIndex(0);
  };

  return (
    <section className="table-panel workspace-tab-panel marketplace-panel">
      <div className="panel-head mold-tab-head">
        <div>
          <p className="eyebrow">Loja interna</p>
          <h3>Marketplace</h3>
          <p className="muted compact-copy">
            {canManageMarketplace
              ? "Publique produtos para toda a base de usuarios ver, com ate 3 fotos, descricao completa e contato direto."
              : "Aqui voce visualiza todos os produtos publicados na plataforma e pode abrir a galeria completa antes de comprar."}
          </p>
        </div>
      </div>

      {status.message ? <div className={`delivery-status ${status.type === "error" ? "error" : "success"}`}>{status.message}</div> : null}

      <div className="marketplace-layout">
        {canManageMarketplace ? (
          <aside className="panel marketplace-form-panel">
            <div className="panel-head">
              <h3>{editingId ? "Editar produto" : "Publicar produto"}</h3>
            </div>

            <label className="field">
              <span>Nome do produto</span>
              <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </label>

            <label className="field">
              <span>Descricao detalhada</span>
              <textarea rows={5} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
            </label>

            <div className="grid two">
              <label className="field">
                <span>Valor (R$)</span>
                <input value={form.price} onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))} />
              </label>
              <label className="field">
                <span>WhatsApp</span>
                <input value={form.whatsapp} onChange={(event) => setForm((current) => ({ ...current, whatsapp: event.target.value }))} />
              </label>
            </div>

            <label className="upload-button">
              <input type="file" accept="image/*" multiple onChange={handleImages} disabled={uploadingImage || form.images.length >= 3} />
              {uploadingImage
                ? "Enviando fotos..."
                : form.images.length >= 3
                  ? "Limite de 3 fotos atingido"
                  : `Adicionar fotos do produto (${form.images.length}/3)`}
            </label>

            {form.images.length > 0 ? (
              <div className="marketplace-preview-grid">
                {form.images.map((image, index) => (
                  <article key={`${image}-${index}`} className="marketplace-preview-card">
                    <img src={image} alt={`Preview ${index + 1}`} className="marketplace-image-preview" />
                    <button type="button" onClick={() => removeFormImage(index)}>
                      Remover foto
                    </button>
                  </article>
                ))}
              </div>
            ) : null}

            <div className="marketplace-form-actions">
              <button type="button" onClick={() => void saveProduct()} disabled={uploadingImage}>
                {editingId ? "Salvar alteracoes" : "Publicar na loja"}
              </button>
              {editingId ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setForm(emptyForm());
                    setStatus({ type: "idle" });
                  }}
                >
                  Cancelar edicao
                </button>
              ) : null}
            </div>
          </aside>
        ) : (
          <aside className="panel marketplace-form-panel marketplace-readonly-panel">
            <div className="panel-head">
              <h3>Marketplace liberado para compra</h3>
            </div>
            <div className="marketplace-readonly-copy">
              <div className="marketplace-readonly-hero">
                <strong>Todos os produtos publicados ficam visiveis aqui.</strong>
                <p>Abra o anuncio, veja as fotos, confira a descricao completa e fale direto com o vendedor no WhatsApp.</p>
              </div>
              <div className="marketplace-readonly-points">
                <article>
                  <span>Visualizacao completa</span>
                  <p>Entre no produto para analisar fotos, descricao e valor antes de comprar.</p>
                </article>
                <article>
                  <span>Compra direta</span>
                  <p>Use o botao do WhatsApp para falar com quem publicou e combinar o pedido.</p>
                </article>
                <article>
                  <span>Acesso do usuario</span>
                  <p>Cadastro, edicao e publicacao continuam bloqueados para usuarios comuns.</p>
                </article>
              </div>
            </div>
          </aside>
        )}

        <div className="panel marketplace-list-panel">
          <div className="panel-head">
            <h3>Produtos publicados</h3>
            <div className="marketplace-filters">
              <button type="button" className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>
                Todos
              </button>
              <button type="button" className={filter === "available" ? "active" : ""} onClick={() => setFilter("available")}>
                Disponiveis
              </button>
              <button type="button" className={filter === "sold" ? "active" : ""} onClick={() => setFilter("sold")}>
                Vendidos
              </button>
            </div>
          </div>

          <div className="marketplace-grid">
            {loading ? (
              <div className="marketplace-empty">
                <strong>Carregando produtos...</strong>
                <p>A vitrine global do marketplace esta sendo carregada.</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="marketplace-empty">
                <strong>{canManageMarketplace ? "Sua loja ainda esta vazia" : "Nenhum produto publicado ainda"}</strong>
                <p>
                  {canManageMarketplace
                    ? "Publique produtos com ate 3 fotos, valor e WhatsApp para iniciar sua vitrine."
                    : "Quando houver produtos publicados, eles aparecerao aqui para compra."}
                </p>
              </div>
            ) : (
              paginatedProducts.map((product) => (
                <article key={product.id} className={`marketplace-card ${product.sold ? "sold" : ""} ${product.inactive ? "sold" : ""}`}>
                  <div className="marketplace-card-media" onClick={() => openViewer(product, 0)} role="button" tabIndex={0}>
                    <img src={product.images[0] || ""} alt={product.name} className="marketplace-card-image" />
                    {product.sold ? <span className="marketplace-card-sold-badge">Vendido</span> : null}
                    {!product.sold && product.inactive ? <span className="marketplace-card-sold-badge">Inativo</span> : null}
                    {product.images.length > 1 ? <span className="marketplace-card-count">+{product.images.length - 1} foto(s)</span> : null}
                  </div>
                  <div className="marketplace-card-body">
                    <div className="marketplace-card-head">
                      <strong>{product.name}</strong>
                      <span className="marketplace-price">{toCurrency(product.price)}</span>
                    </div>
                    <span className="marketplace-seller">Publicado por {product.sellerName || "Loja interna"}</span>

                    <div className="marketplace-card-actions">
                      <button type="button" onClick={() => openViewer(product, 0)}>
                        Ver fotos e descricao
                      </button>
                      {product.sold ? (
                        <span className="marketplace-action-disabled">Produto vendido</span>
                      ) : product.inactive || !product.contactEnabled ? (
                        <span className="marketplace-action-disabled">Produto inativo ate renovar acesso</span>
                      ) : (
                        <a href={buildWhatsappHref(product.whatsapp, product.name, product.price)} target="_blank" rel="noopener noreferrer">
                          {canManageMarketplace ? "Chamar no WhatsApp" : "Comprar pelo WhatsApp"}
                        </a>
                      )}
                      {canManageProduct(product) ? (
                        <>
                          <button type="button" onClick={() => editProduct(product)}>
                            Editar
                          </button>
                          <button type="button" onClick={() => void toggleSold(product)}>
                            {product.sold ? "Marcar como disponivel" : "Marcar como vendido"}
                          </button>
                          {authUser.role === "admin" ? (
                            <button type="button" className="marketplace-delete-button" onClick={() => void deleteProduct(product)}>
                              Excluir produto
                            </button>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>

          {!loading && filteredProducts.length > productsPerPage ? (
            <div className="marketplace-pagination">
              <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1}>
                Anterior
              </button>
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                <button key={page} type="button" className={page === currentPage ? "active" : ""} onClick={() => setCurrentPage(page)}>
                  {page}
                </button>
              ))}
              <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages}>
                Proxima
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {viewerProduct ? (
        <div className="marketplace-modal-backdrop" onClick={closeViewer}>
          <div className="marketplace-modal" onClick={(event) => event.stopPropagation()}>
            <div className="marketplace-modal-head">
              <div>
                <h3>{viewerProduct.name}</h3>
                <p className="muted compact-copy">{toCurrency(viewerProduct.price)} - Publicado por {viewerProduct.sellerName || "Loja interna"}</p>
                {viewerProduct.sold ? <span className="marketplace-modal-sold-copy">Este produto ja foi vendido.</span> : null}
                {!viewerProduct.sold && viewerProduct.inactive ? <span className="marketplace-modal-sold-copy">Este produto esta inativo ate a renovacao do acesso do vendedor.</span> : null}
              </div>
              <button type="button" onClick={closeViewer}>
                Fechar
              </button>
            </div>

            <div className="marketplace-modal-layout">
              <div className="marketplace-modal-gallery">
                <img src={viewerProduct.images[viewerImageIndex] || viewerProduct.images[0] || ""} alt={viewerProduct.name} className="marketplace-modal-image" />
                {viewerProduct.images.length > 1 ? (
                  <div className="marketplace-thumb-row">
                    {viewerProduct.images.map((image, index) => (
                      <button
                        key={`${image}-${index}`}
                        type="button"
                        className={viewerImageIndex === index ? "active" : ""}
                        onClick={() => setViewerImageIndex(index)}
                      >
                        <img src={image} alt={`${viewerProduct.name} ${index + 1}`} />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="marketplace-modal-copy">
                <div className="marketplace-modal-description">
                  <strong>Descricao completa</strong>
                  <p>{viewerProduct.description}</p>
                </div>
                <div className="marketplace-modal-actions">
                  {viewerProduct.sold ? (
                    <span className="marketplace-action-disabled">Produto vendido - compra encerrada</span>
                  ) : viewerProduct.inactive || !viewerProduct.contactEnabled ? (
                    <span className="marketplace-action-disabled">Contato indisponivel enquanto o acesso do vendedor estiver inativo</span>
                  ) : (
                    <a href={buildWhatsappHref(viewerProduct.whatsapp, viewerProduct.name, viewerProduct.price)} target="_blank" rel="noopener noreferrer">
                      Comprar pelo WhatsApp
                    </a>
                  )}
                  <button type="button" onClick={closeViewer}>
                    Fechar visualizacao
                  </button>
                </div>
              </div>
            </div>
          </div>
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
    throw new Error("A API do marketplace nao respondeu corretamente.");
  }
}
