import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import mysql from "mysql2/promise";
import nodemailer from "nodemailer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.disable("x-powered-by");
const port = Number(process.env.PORT || 3030);
const host = process.env.HOST || "0.0.0.0";
const uploadsBaseRoot = path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), "storage", "uploads"));
const uploadRoot = path.join(uploadsBaseRoot, "plans");
const marketplaceUploadRoot = path.join(uploadsBaseRoot, "marketplace");
const distPath = path.resolve(process.env.DIST_DIR || path.join(__dirname, "../dist"));

function parseAllowedOrigins() {
  const configuredOrigins = String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return new Set([
    process.env.SITE_URL || "http://localhost:4173",
    "http://localhost:4173",
    "http://localhost:5173",
    ...configuredOrigins
  ]);
}

const allowedOrigins = parseAllowedOrigins();

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.has(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
  }
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json({ limit: "25mb" }));
app.use("/uploads", express.static(uploadsBaseRoot));

app.get("/api/health", async (_req, res) => {
  try {
    await fs.mkdir(uploadRoot, { recursive: true });
    await fs.mkdir(marketplaceUploadRoot, { recursive: true });

    return res.json({
      ok: true,
      status: "online",
      hasDatabaseConfig: hasDbConfig(),
      uploadsDir: uploadsBaseRoot,
      distDir: distPath
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Falha ao validar a aplicacao."
    });
  }
});

let pool = null;
let databaseReadyPromise = null;

function hasDbConfig() {
  return (
    typeof process.env.DB_HOST === "string" &&
    process.env.DB_HOST.trim() !== "" &&
    typeof process.env.DB_USER === "string" &&
    process.env.DB_USER.trim() !== "" &&
    typeof process.env.DB_NAME === "string" &&
    process.env.DB_NAME.trim() !== ""
  );
}

function getPool() {
  if (!hasDbConfig()) {
    return null;
  }

  if (pool == null) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME,
      connectionLimit: 10,
      charset: "utf8mb4"
    });
  }

  return pool;
}

async function ensureDatabaseReady() {
  if (!hasDbConfig()) {
    throw new Error("Banco de dados nao configurado.");
  }

  if (databaseReadyPromise == null) {
    databaseReadyPromise = (async () => {
      const adminConnection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD || "",
        charset: "utf8mb4"
      });

      try {
        await adminConnection.query(
          `CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
        );
      } finally {
        await adminConnection.end();
      }

      const db = getPool();
      if (db == null) {
        throw new Error("Nao foi possivel criar o pool do banco.");
      }

      await db.query(`
        CREATE TABLE IF NOT EXISTS users (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          name VARCHAR(120) NOT NULL,
          email VARCHAR(180) NOT NULL,
          phone_whatsapp VARCHAR(25) NULL,
          is_paid TINYINT(1) NOT NULL DEFAULT 0,
          active_plan_id BIGINT UNSIGNED NULL,
          plan_expires_at DATETIME NULL,
          manual_access_expires_at DATETIME NULL,
          manual_access_bandeiras TINYINT(1) NOT NULL DEFAULT 0,
          manual_access_plotagem_gomo TINYINT(1) NOT NULL DEFAULT 0,
          manual_access_tabela_molde TINYINT(1) NOT NULL DEFAULT 0,
          manual_access_moldes_salvos TINYINT(1) NOT NULL DEFAULT 0,
          manual_access_storefront TINYINT(1) NOT NULL DEFAULT 0,
          password_hash VARCHAR(255) NOT NULL,
          role ENUM('admin','user') NOT NULL DEFAULT 'user',
          access_status ENUM('active','blocked') NOT NULL DEFAULT 'active',
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_users_email (email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await fs.mkdir(uploadRoot, { recursive: true });
      await fs.mkdir(marketplaceUploadRoot, { recursive: true });

      await db.query(`
        CREATE TABLE IF NOT EXISTS marketplace_products (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          user_id BIGINT UNSIGNED NOT NULL,
          name VARCHAR(180) NOT NULL,
          description TEXT NOT NULL,
          price DECIMAL(12,2) NOT NULL,
          image_url VARCHAR(500) NULL,
          images_json LONGTEXT NULL,
          whatsapp_number VARCHAR(25) NOT NULL,
          status ENUM('active','sold') NOT NULL DEFAULT 'active',
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_products_user (user_id),
          KEY idx_products_status (status),
          KEY idx_products_created_at (created_at),
          CONSTRAINT fk_marketplace_products_user
            FOREIGN KEY (user_id) REFERENCES users(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS moldes (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          user_id BIGINT UNSIGNED NULL,
          nome_projeto VARCHAR(180) NOT NULL,
          modelo VARCHAR(80) NOT NULL,
          quantidade_gomos INT NOT NULL DEFAULT 0,
          comprimento_gomo_cm DECIMAL(12,2) NOT NULL DEFAULT 0,
          diametro_boca_cm DECIMAL(12,2) NOT NULL DEFAULT 0,
          bainha_cm DECIMAL(10,2) NOT NULL DEFAULT 0,
          payload_json LONGTEXT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_moldes_nome (nome_projeto),
          KEY idx_moldes_modelo (modelo),
          KEY idx_moldes_created (created_at),
          KEY idx_moldes_user (user_id),
          CONSTRAINT fk_moldes_user
            FOREIGN KEY (user_id) REFERENCES users(id)
            ON DELETE SET NULL
            ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS subscription_plans (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          name VARCHAR(160) NOT NULL,
          description TEXT NOT NULL,
          price DECIMAL(12,2) NOT NULL DEFAULT 0,
          duration_days INT NOT NULL DEFAULT 30,
          image_path VARCHAR(500) NULL,
          image_data LONGTEXT NULL,
          is_promo TINYINT(1) NOT NULL DEFAULT 0,
          is_most_popular TINYINT(1) NOT NULL DEFAULT 0,
          access_bandeiras TINYINT(1) NOT NULL DEFAULT 0,
          access_plotagem_gomo TINYINT(1) NOT NULL DEFAULT 1,
          access_tabela_molde TINYINT(1) NOT NULL DEFAULT 1,
          access_moldes_salvos TINYINT(1) NOT NULL DEFAULT 1,
          access_storefront TINYINT(1) NOT NULL DEFAULT 0,
          status ENUM('active','inactive') NOT NULL DEFAULT 'active',
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS payment_settings (
          id TINYINT UNSIGNED NOT NULL,
          public_key VARCHAR(255) NOT NULL DEFAULT '',
          access_token VARCHAR(255) NOT NULL DEFAULT '',
          webhook_secret VARCHAR(255) NOT NULL DEFAULT '',
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS plan_orders (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          user_id BIGINT UNSIGNED NOT NULL,
          plan_id BIGINT UNSIGNED NOT NULL,
          mercadopago_payment_id VARCHAR(80) NULL,
          external_reference VARCHAR(160) NOT NULL,
          payment_status VARCHAR(40) NOT NULL DEFAULT 'pending',
          amount DECIMAL(12,2) NOT NULL DEFAULT 0,
          duration_days INT NOT NULL DEFAULT 30,
          pix_code LONGTEXT NULL,
          qr_code_base64 LONGTEXT NULL,
          expires_at DATETIME NULL,
          approved_at DATETIME NULL,
          cancelled_at DATETIME NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_plan_orders_reference (external_reference),
          KEY idx_plan_orders_user (user_id),
          KEY idx_plan_orders_plan (plan_id),
          KEY idx_plan_orders_payment (mercadopago_payment_id),
          CONSTRAINT fk_plan_orders_user
            FOREIGN KEY (user_id) REFERENCES users(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE,
          CONSTRAINT fk_plan_orders_plan
            FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS admin_messages (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          user_id BIGINT UNSIGNED NOT NULL,
          subject VARCHAR(180) NOT NULL,
          message TEXT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_admin_messages_user (user_id),
          CONSTRAINT fk_admin_messages_user
            FOREIGN KEY (user_id) REFERENCES users(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await db.query(`
        ALTER TABLE users
          ADD COLUMN IF NOT EXISTS phone_whatsapp VARCHAR(25) NULL AFTER email,
          ADD COLUMN IF NOT EXISTS is_paid TINYINT(1) NOT NULL DEFAULT 0 AFTER phone_whatsapp,
          ADD COLUMN IF NOT EXISTS active_plan_id BIGINT UNSIGNED NULL AFTER is_paid,
          ADD COLUMN IF NOT EXISTS plan_expires_at DATETIME NULL AFTER active_plan_id,
          ADD COLUMN IF NOT EXISTS manual_access_expires_at DATETIME NULL AFTER plan_expires_at,
          ADD COLUMN IF NOT EXISTS manual_access_bandeiras TINYINT(1) NOT NULL DEFAULT 0 AFTER manual_access_expires_at,
          ADD COLUMN IF NOT EXISTS manual_access_plotagem_gomo TINYINT(1) NOT NULL DEFAULT 0 AFTER manual_access_bandeiras,
          ADD COLUMN IF NOT EXISTS manual_access_tabela_molde TINYINT(1) NOT NULL DEFAULT 0 AFTER manual_access_plotagem_gomo,
          ADD COLUMN IF NOT EXISTS manual_access_moldes_salvos TINYINT(1) NOT NULL DEFAULT 0 AFTER manual_access_tabela_molde,
          ADD COLUMN IF NOT EXISTS manual_access_storefront TINYINT(1) NOT NULL DEFAULT 0 AFTER manual_access_moldes_salvos,
          ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NOT NULL DEFAULT '' AFTER is_paid,
          ADD COLUMN IF NOT EXISTS role ENUM('admin','user') NOT NULL DEFAULT 'user' AFTER password_hash,
          ADD COLUMN IF NOT EXISTS access_status ENUM('active','blocked') NOT NULL DEFAULT 'active' AFTER role
      `);

      await db.query(`
        ALTER TABLE users
          MODIFY COLUMN name VARCHAR(120) NOT NULL,
          MODIFY COLUMN email VARCHAR(180) NOT NULL,
          MODIFY COLUMN phone_whatsapp VARCHAR(25) NULL,
          MODIFY COLUMN is_paid TINYINT(1) NOT NULL DEFAULT 0,
          MODIFY COLUMN manual_access_bandeiras TINYINT(1) NOT NULL DEFAULT 0,
          MODIFY COLUMN manual_access_plotagem_gomo TINYINT(1) NOT NULL DEFAULT 0,
          MODIFY COLUMN manual_access_tabela_molde TINYINT(1) NOT NULL DEFAULT 0,
          MODIFY COLUMN manual_access_moldes_salvos TINYINT(1) NOT NULL DEFAULT 0,
          MODIFY COLUMN manual_access_storefront TINYINT(1) NOT NULL DEFAULT 0,
          MODIFY COLUMN password_hash VARCHAR(255) NOT NULL,
          MODIFY COLUMN role ENUM('admin','user') NOT NULL DEFAULT 'user',
          MODIFY COLUMN access_status ENUM('active','blocked') NOT NULL DEFAULT 'active'
      `);

      await db.query(`
        ALTER TABLE moldes
          MODIFY COLUMN nome_projeto VARCHAR(180) NOT NULL,
          MODIFY COLUMN modelo VARCHAR(80) NOT NULL,
          MODIFY COLUMN quantidade_gomos INT NOT NULL DEFAULT 0,
          MODIFY COLUMN comprimento_gomo_cm DECIMAL(12,2) NOT NULL DEFAULT 0,
          MODIFY COLUMN diametro_boca_cm DECIMAL(12,2) NOT NULL DEFAULT 0,
          MODIFY COLUMN bainha_cm DECIMAL(10,2) NOT NULL DEFAULT 0,
          MODIFY COLUMN payload_json LONGTEXT NOT NULL
      `);

      await db.query(`
        ALTER TABLE subscription_plans
          ADD COLUMN IF NOT EXISTS duration_days INT NOT NULL DEFAULT 30 AFTER price,
          ADD COLUMN IF NOT EXISTS image_path VARCHAR(500) NULL AFTER duration_days,
          ADD COLUMN IF NOT EXISTS image_data LONGTEXT NULL AFTER image_path,
          ADD COLUMN IF NOT EXISTS is_promo TINYINT(1) NOT NULL DEFAULT 0 AFTER image_data,
          ADD COLUMN IF NOT EXISTS is_most_popular TINYINT(1) NOT NULL DEFAULT 0 AFTER is_promo,
          ADD COLUMN IF NOT EXISTS access_bandeiras TINYINT(1) NOT NULL DEFAULT 0 AFTER is_most_popular,
          ADD COLUMN IF NOT EXISTS access_plotagem_gomo TINYINT(1) NOT NULL DEFAULT 1 AFTER access_bandeiras,
          ADD COLUMN IF NOT EXISTS access_tabela_molde TINYINT(1) NOT NULL DEFAULT 1 AFTER access_plotagem_gomo,
          ADD COLUMN IF NOT EXISTS access_moldes_salvos TINYINT(1) NOT NULL DEFAULT 1 AFTER access_tabela_molde,
          ADD COLUMN IF NOT EXISTS access_storefront TINYINT(1) NOT NULL DEFAULT 0 AFTER access_moldes_salvos,
          ADD COLUMN IF NOT EXISTS status ENUM('active','inactive') NOT NULL DEFAULT 'active' AFTER access_storefront
      `);

      await db.query(`
        ALTER TABLE plan_orders
          ADD COLUMN IF NOT EXISTS mercadopago_payment_id VARCHAR(80) NULL AFTER plan_id,
          ADD COLUMN IF NOT EXISTS external_reference VARCHAR(160) NOT NULL AFTER mercadopago_payment_id,
          ADD COLUMN IF NOT EXISTS payment_status VARCHAR(40) NOT NULL DEFAULT 'pending' AFTER external_reference,
          ADD COLUMN IF NOT EXISTS amount DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER payment_status,
          ADD COLUMN IF NOT EXISTS duration_days INT NOT NULL DEFAULT 30 AFTER amount,
          ADD COLUMN IF NOT EXISTS pix_code LONGTEXT NULL AFTER duration_days,
          ADD COLUMN IF NOT EXISTS qr_code_base64 LONGTEXT NULL AFTER pix_code,
          ADD COLUMN IF NOT EXISTS expires_at DATETIME NULL AFTER qr_code_base64,
          ADD COLUMN IF NOT EXISTS approved_at DATETIME NULL AFTER expires_at,
          ADD COLUMN IF NOT EXISTS cancelled_at DATETIME NULL AFTER approved_at
      `);

      await db.query(`
        ALTER TABLE marketplace_products
          ADD COLUMN IF NOT EXISTS images_json LONGTEXT NULL AFTER image_url
      `);

      await db.query(`
        INSERT INTO payment_settings (id, public_key, access_token, webhook_secret)
        VALUES (1, '', '', '')
        ON DUPLICATE KEY UPDATE id = VALUES(id)
      `);
    })().catch((error) => {
      databaseReadyPromise = null;
      throw error;
    });
  }

  return databaseReadyPromise;
}

async function persistPlanImage(imageValue) {
  const raw = String(imageValue || "").trim();
  if (raw === "") {
    return "";
  }

  if (raw.startsWith("/uploads/plans/")) {
    return raw;
  }

  const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    return raw;
  }

  const mime = match[1].toLowerCase();
  const base64 = match[2];
  const extension =
    mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : mime.includes("gif") ? "gif" : "jpg";
  const fileName = `plan-${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${extension}`;
  const fullPath = path.join(uploadRoot, fileName);

  await fs.mkdir(uploadRoot, { recursive: true });
  await fs.writeFile(fullPath, Buffer.from(base64, "base64"));

  return `/uploads/plans/${fileName}`;
}

async function persistMarketplaceImage(imageValue) {
  const raw = String(imageValue || "").trim();
  if (raw === "") {
    return "";
  }

  if (raw.startsWith("/uploads/marketplace/")) {
    return raw;
  }

  const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    return raw;
  }

  const mime = match[1].toLowerCase();
  const base64 = match[2];
  const extension =
    mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : mime.includes("gif") ? "gif" : "jpg";
  const fileName = `product-${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${extension}`;
  const fullPath = path.join(marketplaceUploadRoot, fileName);

  await fs.mkdir(marketplaceUploadRoot, { recursive: true });
  await fs.writeFile(fullPath, Buffer.from(base64, "base64"));

  return `/uploads/marketplace/${fileName}`;
}

app.post("/api/admin/plan-image", async (req, res) => {
  const body = req.body ?? {};

  try {
    await ensureDatabaseReady();
    const imagePath = await persistPlanImage(body.imageDataUrl);
    return res.json({ ok: true, imagePath });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Nao foi possivel enviar a imagem do plano."
    });
  }
});

app.post("/api/admin/marketplace-image", async (req, res) => {
  const body = req.body ?? {};

  try {
    await ensureDatabaseReady();
    const imagePath = await persistMarketplaceImage(body.imageDataUrl);
    return res.json({ ok: true, imagePath });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Nao foi possivel enviar a imagem do produto."
    });
  }
});

function parseNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedValue) {
  if (typeof storedValue !== "string" || !storedValue.includes(":")) {
    return false;
  }

  const [salt, storedHash] = storedValue.split(":");
  if (!salt || !storedHash) {
    return false;
  }

  const calculatedHashBuffer = crypto.scryptSync(password, salt, 64);
  const storedHashBuffer = Buffer.from(storedHash, "hex");
  if (calculatedHashBuffer.length !== storedHashBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(calculatedHashBuffer, storedHashBuffer);
}

function mapUserPayload(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role === "admin" ? "admin" : "user",
    isPaid: row.isPaid === true || row.isPaid === 1 || row.isPaid === "1"
  };
}

function toBool(value) {
  return value === true || value === 1 || value === "1";
}

function hasValidAccessUntil(value) {
  if (!value) {
    return false;
  }
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

async function buildUserPayload(db, row) {
  if (!row) {
    return null;
  }

  const role = row.role === "admin" ? "admin" : "user";
  const manualAccessActive = hasValidAccessUntil(row.manualAccessExpiresAt);
  const planAccessActive = hasValidAccessUntil(row.planExpiresAt) && Number(row.activePlanId || 0) > 0;

  let planPermissions = {
    accessBandeiras: false,
    accessPlotagemGomo: false,
    accessTabelaMolde: false,
    accessMoldesSalvos: false,
    accessStorefront: false
  };

  if (planAccessActive) {
    const [planRows] = await db.query(
      `SELECT
        access_bandeiras AS accessBandeiras,
        access_plotagem_gomo AS accessPlotagemGomo,
        access_tabela_molde AS accessTabelaMolde,
        access_moldes_salvos AS accessMoldesSalvos,
        access_storefront AS accessStorefront
      FROM subscription_plans
      WHERE id = ? AND status = 'active'
      LIMIT 1`,
      [row.activePlanId]
    );

    if (Array.isArray(planRows) && planRows[0]) {
      planPermissions = {
        accessBandeiras: toBool(planRows[0].accessBandeiras),
        accessPlotagemGomo: toBool(planRows[0].accessPlotagemGomo),
        accessTabelaMolde: toBool(planRows[0].accessTabelaMolde),
        accessMoldesSalvos: toBool(planRows[0].accessMoldesSalvos),
        accessStorefront: toBool(planRows[0].accessStorefront)
      };
    }
  }

  const manualPermissions = {
    accessBandeiras: manualAccessActive && toBool(row.manualAccessBandeiras),
    accessPlotagemGomo: manualAccessActive && toBool(row.manualAccessPlotagemGomo),
    accessTabelaMolde: manualAccessActive && toBool(row.manualAccessTabelaMolde),
    accessMoldesSalvos: manualAccessActive && toBool(row.manualAccessMoldesSalvos),
    accessStorefront: manualAccessActive && toBool(row.manualAccessStorefront)
  };

  const permissions =
    role === "admin"
      ? {
          accessBandeiras: true,
          accessPlotagemGomo: true,
          accessTabelaMolde: true,
          accessMoldesSalvos: true,
          accessStorefront: true
        }
      : {
          accessBandeiras: planPermissions.accessBandeiras || manualPermissions.accessBandeiras,
          accessPlotagemGomo: planPermissions.accessPlotagemGomo || manualPermissions.accessPlotagemGomo,
          accessTabelaMolde: planPermissions.accessTabelaMolde || manualPermissions.accessTabelaMolde,
          accessMoldesSalvos: planPermissions.accessMoldesSalvos || manualPermissions.accessMoldesSalvos,
          accessStorefront: planPermissions.accessStorefront || manualPermissions.accessStorefront
        };

  const accessExpiresCandidates = [row.planExpiresAt, row.manualAccessExpiresAt]
    .filter(Boolean)
    .map((item) => new Date(item).getTime())
    .filter((item) => Number.isFinite(item));

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role,
    isPaid:
      role === "admin" ||
      planAccessActive ||
      manualAccessActive ||
      toBool(row.isPaid),
    accessExpiresAt:
      accessExpiresCandidates.length > 0 ? new Date(Math.max(...accessExpiresCandidates)).toISOString() : null,
    permissions
  };
}

function parseImageList(rawJson, fallbackImage) {
  try {
    const parsed = JSON.parse(String(rawJson || "[]"));
    if (Array.isArray(parsed)) {
      const filtered = parsed.map((item) => String(item || "").trim()).filter(Boolean);
      if (filtered.length > 0) {
        return filtered;
      }
    }
  } catch {
    // ignore malformed json
  }

  const fallback = String(fallbackImage || "").trim();
  return fallback ? [fallback] : [];
}

function computePlanExpiresAt(durationDays) {
  const next = new Date();
  next.setDate(next.getDate() + Math.max(1, Number(durationDays) || 1));
  return next;
}

async function getPaymentSettingsRow(db) {
  const [rows] = await db.query(
    "SELECT public_key AS publicKey, access_token AS accessToken, webhook_secret AS webhookSecret FROM payment_settings WHERE id = 1 LIMIT 1"
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function mercadopagoRequest(endpoint, accessToken, options = {}) {
  const response = await fetch(`https://api.mercadopago.com${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.error ||
      payload?.cause?.[0]?.description ||
      "A API do Mercado Pago nao respondeu corretamente.";
    throw new Error(String(message));
  }

  return payload;
}

async function activateApprovedPlanOrder(db, orderId) {
  const [rows] = await db.query(
    `SELECT
      o.id,
      o.user_id AS userId,
      o.plan_id AS planId,
      o.payment_status AS paymentStatus,
      o.duration_days AS durationDays
    FROM plan_orders o
    WHERE o.id = ?
    LIMIT 1`,
    [orderId]
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  const order = rows[0];
  if (String(order.paymentStatus) !== "approved") {
    return order;
  }

  const planExpiresAt = computePlanExpiresAt(order.durationDays);
  await db.query(
    "UPDATE users SET is_paid = 1, active_plan_id = ?, plan_expires_at = ? WHERE id = ?",
    [order.planId, planExpiresAt, order.userId]
  );

  return order;
}

async function syncPlanOrderFromMercadoPago(db, orderRow) {
  if (!orderRow || !orderRow.mercadopagoPaymentId) {
    return orderRow;
  }

  const settings = await getPaymentSettingsRow(db);
  const accessToken = String(settings?.accessToken || "").trim();
  if (!accessToken) {
    return orderRow;
  }

  const payment = await mercadopagoRequest(`/v1/payments/${orderRow.mercadopagoPaymentId}`, accessToken, {
    method: "GET"
  });

  const status = String(payment.status || orderRow.paymentStatus || "pending");
  const approvedAt = payment.date_approved ? new Date(payment.date_approved) : null;

  await db.query(
    `UPDATE plan_orders
     SET payment_status = ?, approved_at = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [status, approvedAt, orderRow.id]
  );

  const nextOrder = {
    ...orderRow,
    paymentStatus: status,
    approvedAt
  };

  if (status === "approved") {
    await activateApprovedPlanOrder(db, orderRow.id);
  }

  return nextOrder;
}

app.post("/api/auth/register", async (req, res) => {
  if (!hasDbConfig()) {
    return res.status(503).json({
      ok: false,
      message: "Banco de dados nao configurado. Preencha DB_HOST, DB_USER e DB_NAME no .env."
    });
  }

  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (name === "" || email === "" || password === "") {
    return res.status(400).json({ ok: false, message: "Preencha nome, email e senha." });
  }

  try {
    await ensureDatabaseReady();
    const db = getPool();
    if (db == null) {
      throw new Error("Pool do banco nao disponivel.");
    }

    const [existingRows] = await db.query("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
    if (Array.isArray(existingRows) && existingRows.length > 0) {
      return res.status(409).json({ ok: false, message: "Ja existe uma conta com esse email." });
    }

    const passwordHash = hashPassword(password);
    const [result] = await db.query("INSERT INTO users (name, email, password_hash, role, access_status) VALUES (?, ?, ?, 'user', 'active')", [
      name,
      email,
      passwordHash
    ]);

    const [createdRows] = await db.query(
      `SELECT
        id,
        name,
        email,
        role,
        is_paid AS isPaid,
        active_plan_id AS activePlanId,
        plan_expires_at AS planExpiresAt,
        manual_access_expires_at AS manualAccessExpiresAt,
        manual_access_bandeiras AS manualAccessBandeiras,
        manual_access_plotagem_gomo AS manualAccessPlotagemGomo,
        manual_access_tabela_molde AS manualAccessTabelaMolde,
        manual_access_moldes_salvos AS manualAccessMoldesSalvos,
        manual_access_storefront AS manualAccessStorefront
      FROM users
      WHERE id = ?
      LIMIT 1`,
      [result.insertId]
    );

    return res.status(201).json({
      ok: true,
      user: await buildUserPayload(db, Array.isArray(createdRows) ? createdRows[0] : null)
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Nao foi possivel criar a conta.",
      error: error instanceof Error ? error.message : "Erro desconhecido"
    });
  }
});

app.post("/api/auth/login", async (req, res) => {
  if (!hasDbConfig()) {
    return res.status(503).json({
      ok: false,
      message: "Banco de dados nao configurado. Preencha DB_HOST, DB_USER e DB_NAME no .env."
    });
  }

  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (email === "" || password === "") {
    return res.status(400).json({ ok: false, message: "Informe email e senha." });
  }

  try {
    await ensureDatabaseReady();
    const db = getPool();
    if (db == null) {
      throw new Error("Pool do banco nao disponivel.");
    }

    const [rows] = await db.query(
      `SELECT
        id,
        name,
        email,
        password_hash AS passwordHash,
        role,
        is_paid AS isPaid,
        access_status AS accessStatus,
        active_plan_id AS activePlanId,
        plan_expires_at AS planExpiresAt,
        manual_access_expires_at AS manualAccessExpiresAt,
        manual_access_bandeiras AS manualAccessBandeiras,
        manual_access_plotagem_gomo AS manualAccessPlotagemGomo,
        manual_access_tabela_molde AS manualAccessTabelaMolde,
        manual_access_moldes_salvos AS manualAccessMoldesSalvos,
        manual_access_storefront AS manualAccessStorefront
      FROM users
      WHERE email = ?
      LIMIT 1`,
      [email]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(401).json({ ok: false, message: "Email ou senha invalidos." });
    }

    const user = rows[0];
    if (user.accessStatus === "blocked") {
      return res.status(403).json({ ok: false, message: "Seu acesso esta bloqueado. Fale com o administrador." });
    }

    if (!verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ ok: false, message: "Email ou senha invalidos." });
    }

    return res.json({ ok: true, user: await buildUserPayload(db, user) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Nao foi possivel fazer login.",
      error: error instanceof Error ? error.message : "Erro desconhecido"
    });
  }
});

app.post("/api/auth/validate", async (req, res) => {
  if (!hasDbConfig()) {
    return res.status(503).json({
      ok: false,
      message: "Banco de dados nao configurado. Preencha DB_HOST, DB_USER e DB_NAME no .env."
    });
  }

  const id = Number(req.body?.id);
  const email = String(req.body?.email || "").trim().toLowerCase();

  if (!Number.isFinite(id) || id <= 0 || email === "") {
    return res.status(400).json({ ok: false, message: "Sessao invalida." });
  }

  try {
    await ensureDatabaseReady();
    const db = getPool();
    if (db == null) {
      throw new Error("Pool do banco nao disponivel.");
    }

    const [rows] = await db.query(
      `SELECT
        id,
        name,
        email,
        role,
        is_paid AS isPaid,
        access_status AS accessStatus,
        active_plan_id AS activePlanId,
        plan_expires_at AS planExpiresAt,
        manual_access_expires_at AS manualAccessExpiresAt,
        manual_access_bandeiras AS manualAccessBandeiras,
        manual_access_plotagem_gomo AS manualAccessPlotagemGomo,
        manual_access_tabela_molde AS manualAccessTabelaMolde,
        manual_access_moldes_salvos AS manualAccessMoldesSalvos,
        manual_access_storefront AS manualAccessStorefront
      FROM users
      WHERE id = ? AND email = ?
      LIMIT 1`,
      [id, email]
    );

    const user = Array.isArray(rows) ? rows[0] : null;
    if (!user) {
      return res.status(401).json({ ok: false, message: "Usuario nao encontrado no banco atual." });
    }

    if (user.accessStatus === "blocked") {
      return res.status(403).json({ ok: false, message: "Seu acesso esta bloqueado." });
    }

    return res.json({ ok: true, user: await buildUserPayload(db, user) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Nao foi possivel validar a sessao."
    });
  }
});

app.post("/api/account/profile", async (req, res) => {
  if (!hasDbConfig()) {
    return res.status(503).json({ ok: false, message: "Banco de dados nao configurado." });
  }

  const userId = Number(req.body?.userId);
  const email = String(req.body?.email || "").trim().toLowerCase();
  const currentPassword = String(req.body?.currentPassword || "");
  const newPassword = String(req.body?.newPassword || "");

  if (!Number.isFinite(userId) || userId <= 0 || email === "" || currentPassword === "") {
    return res.status(400).json({ ok: false, message: "Informe usuario, email e senha atual." });
  }

  try {
    await ensureDatabaseReady();
    const db = getPool();
    const [rows] = await db.query(
      `SELECT
        id,
        name,
        email,
        password_hash AS passwordHash,
        role,
        is_paid AS isPaid,
        active_plan_id AS activePlanId,
        plan_expires_at AS planExpiresAt,
        manual_access_expires_at AS manualAccessExpiresAt,
        manual_access_bandeiras AS manualAccessBandeiras,
        manual_access_plotagem_gomo AS manualAccessPlotagemGomo,
        manual_access_tabela_molde AS manualAccessTabelaMolde,
        manual_access_moldes_salvos AS manualAccessMoldesSalvos,
        manual_access_storefront AS manualAccessStorefront
      FROM users
      WHERE id = ?
      LIMIT 1`,
      [userId]
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({ ok: false, message: "Usuario nao encontrado." });
    }

    const user = rows[0];
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      return res.status(401).json({ ok: false, message: "Senha atual invalida." });
    }

    const [emailRows] = await db.query("SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1", [email, userId]);
    if (Array.isArray(emailRows) && emailRows.length > 0) {
      return res.status(409).json({ ok: false, message: "Esse email ja esta em uso por outro usuario." });
    }

    const passwordHash = newPassword.trim() !== "" ? hashPassword(newPassword) : user.passwordHash;
    await db.query("UPDATE users SET email = ?, password_hash = ? WHERE id = ?", [email, passwordHash, userId]);

    const [updatedRows] = await db.query(
      `SELECT
        id,
        name,
        email,
        role,
        is_paid AS isPaid,
        active_plan_id AS activePlanId,
        plan_expires_at AS planExpiresAt,
        manual_access_expires_at AS manualAccessExpiresAt,
        manual_access_bandeiras AS manualAccessBandeiras,
        manual_access_plotagem_gomo AS manualAccessPlotagemGomo,
        manual_access_tabela_molde AS manualAccessTabelaMolde,
        manual_access_moldes_salvos AS manualAccessMoldesSalvos,
        manual_access_storefront AS manualAccessStorefront
      FROM users
      WHERE id = ?
      LIMIT 1`,
      [userId]
    );
    return res.json({ ok: true, user: await buildUserPayload(db, updatedRows[0]) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Nao foi possivel atualizar a conta."
    });
  }
});

app.get("/api/marketplace/products", async (_req, res) => {
  if (!hasDbConfig()) {
    return res.status(503).json({ ok: false, message: "Banco de dados nao configurado." });
  }

  try {
    await ensureDatabaseReady();
    const db = getPool();
    const [rows] = await db.query(`
      SELECT
        p.id,
        p.user_id AS userId,
        p.name,
        p.description,
        p.price,
        p.image_url AS imageUrl,
        p.images_json AS imagesJson,
        p.whatsapp_number AS whatsapp,
        p.status,
        p.created_at AS createdAt,
        p.updated_at AS updatedAt,
        u.name AS sellerName
      FROM marketplace_products p
      INNER JOIN users u ON u.id = p.user_id
      ORDER BY p.updated_at DESC, p.id DESC
    `);

    const items = Array.isArray(rows)
      ? rows.map((row) => ({
          id: row.id,
          userId: row.userId,
          sellerName: row.sellerName,
          name: row.name,
          description: row.description,
          price: Number(row.price || 0),
          images: parseImageList(row.imagesJson, row.imageUrl),
          whatsapp: row.whatsapp,
          sold: row.status === "sold",
          createdAt: row.createdAt,
          updatedAt: row.updatedAt
        }))
      : [];

    return res.json({ ok: true, items });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Nao foi possivel listar os produtos."
    });
  }
});

app.post("/api/admin/marketplace/products", async (req, res) => {
  if (!hasDbConfig()) {
    return res.status(503).json({ ok: false, message: "Banco de dados nao configurado." });
  }

  const body = req.body ?? {};
  const userId = Number(body.userId);
  const name = String(body.name || "").trim();
  const description = String(body.description || "").trim();
  const price = parseNumber(body.price, 0);
  const whatsapp = String(body.whatsapp || "").trim();
  const images = Array.isArray(body.images) ? body.images.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 3) : [];

  if (!Number.isFinite(userId) || userId <= 0 || !name || !description || price <= 0 || !whatsapp || images.length === 0) {
    return res.status(400).json({ ok: false, message: "Preencha nome, descricao, valor, WhatsApp e ate 3 fotos." });
  }

  try {
    await ensureDatabaseReady();
    const db = getPool();
    await db.query(
      `INSERT INTO marketplace_products (user_id, name, description, price, image_url, images_json, whatsapp_number, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
      [userId, name, description, price, images[0], JSON.stringify(images), whatsapp]
    );
    return res.status(201).json({ ok: true, message: "Produto publicado na loja interna." });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Nao foi possivel publicar o produto."
    });
  }
});

app.put("/api/admin/marketplace/products/:id", async (req, res) => {
  if (!hasDbConfig()) {
    return res.status(503).json({ ok: false, message: "Banco de dados nao configurado." });
  }

  const id = Number(req.params.id);
  const body = req.body ?? {};
  const name = String(body.name || "").trim();
  const description = String(body.description || "").trim();
  const price = parseNumber(body.price, 0);
  const whatsapp = String(body.whatsapp || "").trim();
  const images = Array.isArray(body.images) ? body.images.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 3) : [];

  if (!Number.isFinite(id) || id <= 0 || !name || !description || price <= 0 || !whatsapp || images.length === 0) {
    return res.status(400).json({ ok: false, message: "Dados invalidos para atualizar o produto." });
  }

  try {
    await ensureDatabaseReady();
    const db = getPool();
    await db.query(
      `UPDATE marketplace_products
       SET name = ?, description = ?, price = ?, image_url = ?, images_json = ?, whatsapp_number = ?
       WHERE id = ?`,
      [name, description, price, images[0], JSON.stringify(images), whatsapp, id]
    );
    return res.json({ ok: true, message: "Produto atualizado com sucesso." });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Nao foi possivel atualizar o produto."
    });
  }
});

app.post("/api/admin/marketplace/products/:id/status", async (req, res) => {
  if (!hasDbConfig()) {
    return res.status(503).json({ ok: false, message: "Banco de dados nao configurado." });
  }

  const id = Number(req.params.id);
  const sold = req.body?.sold === true;
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ ok: false, message: "Produto invalido." });
  }

  try {
    await ensureDatabaseReady();
    const db = getPool();
    await db.query("UPDATE marketplace_products SET status = ? WHERE id = ?", [sold ? "sold" : "active", id]);
    return res.json({ ok: true, message: "Status do produto atualizado." });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Nao foi possivel atualizar o status do produto."
    });
  }
});

app.get("/api/molds", async (_req, res) => {
  if (!hasDbConfig()) {
    return res.status(503).json({
      ok: false,
      message: "Banco de dados nao configurado. Preencha DB_HOST, DB_USER e DB_NAME no .env."
    });
  }

  try {
    await ensureDatabaseReady();
    const db = getPool();
    if (db == null) {
      throw new Error("Pool do banco nao disponivel.");
    }
    const [rows] = await db.query(
      `
        SELECT
          id,
          nome_projeto AS nomeProjeto,
          modelo,
          quantidade_gomos AS quantidadeGomos,
          comprimento_gomo_cm AS comprimentoGomoCm,
          created_at AS createdAt
        FROM moldes
        ORDER BY id DESC
      `
    );

    res.json({ ok: true, items: rows });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Nao foi possivel listar os moldes.",
      error: error instanceof Error ? error.message : "Erro desconhecido"
    });
  }
});

app.get("/api/molds/:id", async (req, res) => {
  if (!hasDbConfig()) {
    return res.status(503).json({
      ok: false,
      message: "Banco de dados nao configurado. Preencha DB_HOST, DB_USER e DB_NAME no .env."
    });
  }

  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ ok: false, message: "ID de molde invalido." });
  }

  try {
    await ensureDatabaseReady();
    const db = getPool();
    if (db == null) {
      throw new Error("Pool do banco nao disponivel.");
    }
    const [rows] = await db.query("SELECT id, payload_json AS payloadJson FROM moldes WHERE id = ? LIMIT 1", [id]);
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({ ok: false, message: "Molde nao encontrado." });
    }

    const row = rows[0];
    const payload = typeof row.payloadJson === "string" ? JSON.parse(row.payloadJson) : row.payloadJson;
    res.json({ ok: true, id: row.id, payload });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Nao foi possivel carregar o molde.",
      error: error instanceof Error ? error.message : "Erro desconhecido"
    });
  }
});

app.post("/api/molds", async (req, res) => {
  if (!hasDbConfig()) {
    return res.status(503).json({
      ok: false,
      message: "Banco de dados nao configurado. Preencha DB_HOST, DB_USER e DB_NAME no .env."
    });
  }

  const snapshot = req.body ?? {};
  if (snapshot.input == null || typeof snapshot.input !== "object") {
    return res.status(400).json({ ok: false, message: "Payload do molde invalido." });
  }

  try {
    await ensureDatabaseReady();
    const db = getPool();
    if (db == null) {
      throw new Error("Pool do banco nao disponivel.");
    }
    const nomeProjeto = String(snapshot.input.projeto || "Molde sem nome").trim() || "Molde sem nome";
    const modelo = String(snapshot.input.modelo || "outros").trim() || "outros";
    const quantidadeGomos = parseNumber(snapshot.input.quantidadeGomos, 0);
    const comprimentoGomoCm = parseNumber(snapshot.input.comprimentoGomoCm, 0);
    const diametroBocaCm = parseNumber(snapshot.input.diametroBocaCm, 0);
    const bainhaCm = parseNumber(snapshot.input.bainhaCm, 0);
    const payloadJson = JSON.stringify(snapshot);

    const [result] = await db.query(
      `
        INSERT INTO moldes (
          nome_projeto,
          modelo,
          quantidade_gomos,
          comprimento_gomo_cm,
          diametro_boca_cm,
          bainha_cm,
          payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [nomeProjeto, modelo, quantidadeGomos, comprimentoGomoCm, diametroBocaCm, bainhaCm, payloadJson]
    );

    res.status(201).json({
      ok: true,
      id: result.insertId,
      message: "Molde salvo com sucesso."
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Nao foi possivel salvar o molde.",
      error: error instanceof Error ? error.message : "Erro desconhecido"
    });
  }
});

app.get("/api/admin/users", async (_req, res) => {
  if (!hasDbConfig()) {
    return res.status(503).json({ ok: false, message: "Banco de dados nao configurado." });
  }

  try {
    await ensureDatabaseReady();
    const db = getPool();
    const [rows] = await db.query(`
      SELECT
        id,
        name,
        email,
        role,
        access_status AS accessStatus,
        is_paid AS isPaid,
        manual_access_expires_at AS accessExpiresAt,
        manual_access_bandeiras AS accessBandeiras,
        manual_access_plotagem_gomo AS accessPlotagemGomo,
        manual_access_tabela_molde AS accessTabelaMolde,
        manual_access_moldes_salvos AS accessMoldesSalvos,
        manual_access_storefront AS accessStorefront,
        created_at AS createdAt
      FROM users
      ORDER BY role DESC, id DESC
    `);
    return res.json({ ok: true, items: rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Nao foi possivel listar usuarios."
    });
  }
});

app.post("/api/admin/users/:id/access", async (req, res) => {
  if (!hasDbConfig()) {
    return res.status(503).json({ ok: false, message: "Banco de dados nao configurado." });
  }

  const id = Number(req.params.id);
  const accessStatus = req.body?.accessStatus === "blocked" ? "blocked" : "active";
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ ok: false, message: "Usuario invalido." });
  }

  try {
    await ensureDatabaseReady();
    const db = getPool();
    await db.query("UPDATE users SET access_status = ? WHERE id = ? AND role <> 'admin'", [accessStatus, id]);
    return res.json({ ok: true, message: "Acesso atualizado com sucesso." });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Nao foi possivel atualizar o acesso."
    });
  }
});

app.post("/api/admin/users/:id/grant", async (req, res) => {
  if (!hasDbConfig()) {
    return res.status(503).json({ ok: false, message: "Banco de dados nao configurado." });
  }

  const id = Number(req.params.id);
  const durationDays = Number(req.body?.durationDays);
  if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(durationDays) || durationDays <= 0) {
    return res.status(400).json({ ok: false, message: "Informe um usuario valido e a quantidade de dias." });
  }

  try {
    await ensureDatabaseReady();
    const db = getPool();
    const accessExpiresAt = computePlanExpiresAt(durationDays);

    await db.query(
      `UPDATE users
       SET
         is_paid = 1,
         manual_access_expires_at = ?,
         manual_access_bandeiras = ?,
         manual_access_plotagem_gomo = ?,
         manual_access_tabela_molde = ?,
         manual_access_moldes_salvos = ?,
         manual_access_storefront = ?
       WHERE id = ? AND role <> 'admin'`,
      [
        accessExpiresAt,
        req.body?.accessBandeiras ? 1 : 0,
        req.body?.accessPlotagemGomo ? 1 : 0,
        req.body?.accessTabelaMolde ? 1 : 0,
        req.body?.accessMoldesSalvos ? 1 : 0,
        req.body?.accessStorefront ? 1 : 0,
        id
      ]
    );

    return res.json({ ok: true, message: "Liberacao manual atualizada com sucesso." });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Nao foi possivel liberar o acesso manual."
    });
  }
});

app.post("/api/admin/users/:id/revoke-grant", async (req, res) => {
  if (!hasDbConfig()) {
    return res.status(503).json({ ok: false, message: "Banco de dados nao configurado." });
  }

  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ ok: false, message: "Informe um usuario valido para cancelar a liberacao." });
  }

  try {
    await ensureDatabaseReady();
    const db = getPool();
    await db.query(
      `UPDATE users
       SET
         is_paid = CASE
           WHEN active_plan_id IS NOT NULL AND plan_expires_at IS NOT NULL AND plan_expires_at > NOW() THEN 1
           ELSE 0
         END,
         manual_access_expires_at = NULL,
         manual_access_bandeiras = 0,
         manual_access_plotagem_gomo = 0,
         manual_access_tabela_molde = 0,
         manual_access_moldes_salvos = 0,
         manual_access_storefront = 0
       WHERE id = ? AND role <> 'admin'`,
      [id]
    );

    return res.json({ ok: true, message: "Liberacao manual cancelada com sucesso." });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Nao foi possivel cancelar a liberacao manual."
    });
  }
});

app.post("/api/admin/users/:id/password", async (req, res) => {
  if (!hasDbConfig()) {
    return res.status(503).json({ ok: false, message: "Banco de dados nao configurado." });
  }

  const id = Number(req.params.id);
  const password = String(req.body?.password || "");
  if (!Number.isFinite(id) || id <= 0 || password.trim() === "") {
    return res.status(400).json({ ok: false, message: "Informe usuario e nova senha." });
  }

  try {
    await ensureDatabaseReady();
    const db = getPool();
    await db.query("UPDATE users SET password_hash = ? WHERE id = ?", [hashPassword(password), id]);
    return res.json({ ok: true, message: "Senha atualizada com sucesso." });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Nao foi possivel atualizar a senha."
    });
  }
});

app.get("/api/admin/plans", async (_req, res) => {
  if (!hasDbConfig()) {
    return res.status(503).json({ ok: false, message: "Banco de dados nao configurado." });
  }

  try {
    await ensureDatabaseReady();
    const db = getPool();
    const [rows] = await db.query(`
      SELECT
        id,
        name,
        description,
        price,
        duration_days AS durationDays,
        CASE
          WHEN image_path IS NOT NULL AND image_path <> '' THEN image_path
          ELSE image_data
        END AS imageDataUrl,
        is_promo AS isPromo,
        is_most_popular AS isMostPopular,
        access_bandeiras AS accessBandeiras,
        access_plotagem_gomo AS accessPlotagemGomo,
        access_tabela_molde AS accessTabelaMolde,
        access_moldes_salvos AS accessMoldesSalvos,
        access_storefront AS accessStorefront,
        status,
        created_at AS createdAt
      FROM subscription_plans
      ORDER BY id DESC
    `);
    return res.json({ ok: true, items: rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Nao foi possivel listar os planos."
    });
  }
});

app.get("/api/plans", async (_req, res) => {
  if (!hasDbConfig()) {
    return res.status(503).json({ ok: false, message: "Banco de dados nao configurado." });
  }

  try {
    await ensureDatabaseReady();
    const db = getPool();
    const [rows] = await db.query(`
      SELECT
        id,
        name,
        description,
        price,
        duration_days AS durationDays,
        CASE
          WHEN image_path IS NOT NULL AND image_path <> '' THEN image_path
          ELSE image_data
        END AS imageDataUrl,
        is_promo AS isPromo,
        is_most_popular AS isMostPopular,
        access_bandeiras AS accessBandeiras,
        access_plotagem_gomo AS accessPlotagemGomo,
        access_tabela_molde AS accessTabelaMolde,
        access_moldes_salvos AS accessMoldesSalvos,
        access_storefront AS accessStorefront,
        status
      FROM subscription_plans
      WHERE status = 'active'
      ORDER BY is_most_popular DESC, is_promo DESC, id DESC
    `);
    return res.json({ ok: true, items: rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Nao foi possivel listar os planos ativos."
    });
  }
});

app.post("/api/plans/checkout", async (req, res) => {
  if (!hasDbConfig()) {
    return res.status(503).json({ ok: false, message: "Banco de dados nao configurado." });
  }

  const userId = Number(req.body?.userId);
  const planId = Number(req.body?.planId);
  if (!Number.isFinite(userId) || userId <= 0 || !Number.isFinite(planId) || planId <= 0) {
    return res.status(400).json({ ok: false, message: "Usuario ou plano invalido para checkout." });
  }

  try {
    await ensureDatabaseReady();
    const db = getPool();
    const settings = await getPaymentSettingsRow(db);
    const accessToken = String(settings?.accessToken || "").trim();
    if (!accessToken) {
      return res.status(400).json({ ok: false, message: "Configure o Access Token do Mercado Pago no painel admin." });
    }

    const [userRows] = await db.query(
      "SELECT id, name, email, is_paid AS isPaid, access_status AS accessStatus FROM users WHERE id = ? LIMIT 1",
      [userId]
    );
    const [planRows] = await db.query(
      `SELECT id, name, description, price, duration_days AS durationDays, status
       FROM subscription_plans
       WHERE id = ? LIMIT 1`,
      [planId]
    );

    const user = Array.isArray(userRows) && userRows[0] ? userRows[0] : null;
    const plan = Array.isArray(planRows) && planRows[0] ? planRows[0] : null;

    if (!user || user.accessStatus === "blocked") {
      return res.status(404).json({ ok: false, message: "Usuario nao encontrado ou bloqueado." });
    }
    if (!plan || plan.status !== "active") {
      return res.status(404).json({ ok: false, message: "Plano nao encontrado ou inativo." });
    }

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const externalReference = `plan-${userId}-${planId}-${crypto.randomBytes(6).toString("hex")}`;
    const notificationUrl =
      process.env.SITE_URL && !/localhost|127\.0\.0\.1/i.test(process.env.SITE_URL)
        ? `${process.env.SITE_URL.replace(/\/$/, "")}/api/payments/mercadopago/webhook`
        : undefined;

    const paymentPayload = {
      transaction_amount: Number(plan.price),
      description: `Plano ${plan.name}`,
      payment_method_id: "pix",
      payer: {
        email: user.email,
        first_name: String(user.name || "").split(" ")[0] || user.name
      },
      external_reference: externalReference,
      date_of_expiration: expiresAt.toISOString(),
      metadata: {
        user_id: userId,
        plan_id: planId,
        duration_days: Number(plan.durationDays || 30)
      },
      ...(notificationUrl ? { notification_url: notificationUrl } : {})
    };

    const payment = await mercadopagoRequest("/v1/payments", accessToken, {
      method: "POST",
      headers: {
        "X-Idempotency-Key": crypto.randomUUID()
      },
      body: JSON.stringify(paymentPayload)
    });

    const qrCodeBase64 = String(payment?.point_of_interaction?.transaction_data?.qr_code_base64 || "");
    const pixCode = String(payment?.point_of_interaction?.transaction_data?.qr_code || "");
    const paymentId = String(payment?.id || "");
    const paymentStatus = String(payment?.status || "pending");

    if (!paymentId || !pixCode) {
      throw new Error("O Mercado Pago nao retornou os dados do Pix para este plano.");
    }

    const [insertResult] = await db.query(
      `INSERT INTO plan_orders (
        user_id, plan_id, mercadopago_payment_id, external_reference, payment_status,
        amount, duration_days, pix_code, qr_code_base64, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        planId,
        paymentId,
        externalReference,
        paymentStatus,
        Number(plan.price),
        Number(plan.durationDays || 30),
        pixCode,
        qrCodeBase64,
        expiresAt
      ]
    );

    return res.status(201).json({
      ok: true,
      checkout: {
        orderId: insertResult.insertId,
        paymentId,
        paymentStatus,
        qrCodeBase64,
        pixCode,
        expiresAt: expiresAt.toISOString(),
        planName: plan.name,
        amount: Number(plan.price),
        durationDays: Number(plan.durationDays || 30)
      }
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Nao foi possivel iniciar o checkout do plano."
    });
  }
});

app.get("/api/plans/checkout/:id", async (req, res) => {
  if (!hasDbConfig()) {
    return res.status(503).json({ ok: false, message: "Banco de dados nao configurado." });
  }

  const orderId = Number(req.params.id);
  const userId = Number(req.query.userId);
  if (!Number.isFinite(orderId) || orderId <= 0 || !Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({ ok: false, message: "Checkout invalido." });
  }

  try {
    await ensureDatabaseReady();
    const db = getPool();
    const [rows] = await db.query(
      `SELECT
        o.id,
        o.user_id AS userId,
        o.plan_id AS planId,
        o.mercadopago_payment_id AS mercadopagoPaymentId,
        o.payment_status AS paymentStatus,
        o.amount,
        o.duration_days AS durationDays,
        o.pix_code AS pixCode,
        o.qr_code_base64 AS qrCodeBase64,
        o.expires_at AS expiresAt,
        p.name AS planName
      FROM plan_orders o
      INNER JOIN subscription_plans p ON p.id = o.plan_id
      WHERE o.id = ? AND o.user_id = ?
      LIMIT 1`,
      [orderId, userId]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({ ok: false, message: "Checkout nao encontrado." });
    }

    const currentOrder = await syncPlanOrderFromMercadoPago(db, rows[0]);
    const [userRows] = await db.query(
      `SELECT
        id,
        name,
        email,
        role,
        is_paid AS isPaid,
        active_plan_id AS activePlanId,
        plan_expires_at AS planExpiresAt,
        manual_access_expires_at AS manualAccessExpiresAt,
        manual_access_bandeiras AS manualAccessBandeiras,
        manual_access_plotagem_gomo AS manualAccessPlotagemGomo,
        manual_access_tabela_molde AS manualAccessTabelaMolde,
        manual_access_moldes_salvos AS manualAccessMoldesSalvos,
        manual_access_storefront AS manualAccessStorefront
      FROM users
      WHERE id = ?
      LIMIT 1`,
      [userId]
    );
    const user = Array.isArray(userRows) && userRows[0] ? await buildUserPayload(db, userRows[0]) : null;

    return res.json({
      ok: true,
      checkout: {
        orderId: currentOrder.id,
        paymentStatus: currentOrder.paymentStatus,
        qrCodeBase64: currentOrder.qrCodeBase64 || "",
        pixCode: currentOrder.pixCode || "",
        expiresAt: currentOrder.expiresAt ? new Date(currentOrder.expiresAt).toISOString() : null,
        planName: currentOrder.planName,
        amount: Number(currentOrder.amount || 0),
        durationDays: Number(currentOrder.durationDays || 0)
      },
      user
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Nao foi possivel consultar o checkout."
    });
  }
});

app.post("/api/plans/checkout/:id/cancel", async (req, res) => {
  if (!hasDbConfig()) {
    return res.status(503).json({ ok: false, message: "Banco de dados nao configurado." });
  }

  const orderId = Number(req.params.id);
  const userId = Number(req.body?.userId);
  if (!Number.isFinite(orderId) || orderId <= 0 || !Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({ ok: false, message: "Checkout invalido para cancelamento." });
  }

  try {
    await ensureDatabaseReady();
    const db = getPool();
    await db.query(
      "UPDATE plan_orders SET payment_status = 'cancelled', cancelled_at = NOW() WHERE id = ? AND user_id = ? AND payment_status IN ('pending','in_process')",
      [orderId, userId]
    );
    return res.json({ ok: true, message: "Compra cancelada com sucesso." });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Nao foi possivel cancelar a compra."
    });
  }
});

app.all("/api/payments/mercadopago/webhook", async (req, res) => {
  if (!hasDbConfig()) {
    return res.sendStatus(204);
  }

  try {
    await ensureDatabaseReady();
    const db = getPool();
    const paymentId =
      String(req.body?.data?.id || req.query["data.id"] || req.body?.id || req.query.id || "").trim();

    if (!paymentId) {
      return res.sendStatus(204);
    }

    const [rows] = await db.query(
      `SELECT id, mercadopago_payment_id AS mercadopagoPaymentId, payment_status AS paymentStatus
       FROM plan_orders
       WHERE mercadopago_payment_id = ?
       LIMIT 1`,
      [paymentId]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.sendStatus(204);
    }

    const syncedOrder = await syncPlanOrderFromMercadoPago(db, rows[0]);
    if (String(syncedOrder?.paymentStatus || "") === "approved") {
      await activateApprovedPlanOrder(db, syncedOrder.id);
    }

    return res.sendStatus(200);
  } catch {
    return res.sendStatus(500);
  }
});

app.post("/api/admin/plans", async (req, res) => {
  if (!hasDbConfig()) {
    return res.status(503).json({ ok: false, message: "Banco de dados nao configurado." });
  }

  const body = req.body ?? {};
  try {
    await ensureDatabaseReady();
    const db = getPool();
    await db.query(
      `
        INSERT INTO subscription_plans (
          name, description, price, image_path, image_data, is_promo, is_most_popular,
          access_bandeiras, access_plotagem_gomo, access_tabela_molde, access_moldes_salvos, access_storefront, status, duration_days
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        String(body.name || "").trim(),
        String(body.description || "").trim(),
        parseNumber(body.price, 0),
        String(body.imageDataUrl || "").trim(),
        "",
        body.isPromo ? 1 : 0,
        body.isMostPopular ? 1 : 0,
        body.accessBandeiras ? 1 : 0,
        body.accessPlotagemGomo ? 1 : 0,
        body.accessTabelaMolde ? 1 : 0,
        body.accessMoldesSalvos ? 1 : 0,
        body.accessStorefront ? 1 : 0,
        body.status === "inactive" ? "inactive" : "active",
        Math.max(1, parseNumber(body.durationDays, 30))
      ]
    );
    return res.status(201).json({ ok: true, message: "Plano criado com sucesso." });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Nao foi possivel criar o plano."
    });
  }
});

app.put("/api/admin/plans/:id", async (req, res) => {
  if (!hasDbConfig()) {
    return res.status(503).json({ ok: false, message: "Banco de dados nao configurado." });
  }

  const id = Number(req.params.id);
  const body = req.body ?? {};
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ ok: false, message: "Plano invalido." });
  }

  try {
    await ensureDatabaseReady();
    const db = getPool();
    await db.query(
      `
        UPDATE subscription_plans
        SET
          name = ?,
          description = ?,
          price = ?,
          duration_days = ?,
          image_path = ?,
          image_data = ?,
          is_promo = ?,
          is_most_popular = ?,
          access_bandeiras = ?,
          access_plotagem_gomo = ?,
          access_tabela_molde = ?,
          access_moldes_salvos = ?,
          access_storefront = ?,
          status = ?
        WHERE id = ?
      `,
      [
        String(body.name || "").trim(),
        String(body.description || "").trim(),
        parseNumber(body.price, 0),
        Math.max(1, parseNumber(body.durationDays, 30)),
        String(body.imageDataUrl || "").trim(),
        "",
        body.isPromo ? 1 : 0,
        body.isMostPopular ? 1 : 0,
        body.accessBandeiras ? 1 : 0,
        body.accessPlotagemGomo ? 1 : 0,
        body.accessTabelaMolde ? 1 : 0,
        body.accessMoldesSalvos ? 1 : 0,
        body.accessStorefront ? 1 : 0,
        body.status === "inactive" ? "inactive" : "active",
        id
      ]
    );
    return res.json({ ok: true, message: "Plano atualizado com sucesso." });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Nao foi possivel atualizar o plano."
    });
  }
});

app.delete("/api/admin/plans/:id", async (req, res) => {
  if (!hasDbConfig()) {
    return res.status(503).json({ ok: false, message: "Banco de dados nao configurado." });
  }

  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ ok: false, message: "Plano invalido." });
  }

  try {
    await ensureDatabaseReady();
    const db = getPool();
    await db.query("DELETE FROM subscription_plans WHERE id = ?", [id]);
    return res.json({ ok: true, message: "Plano excluido com sucesso." });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Nao foi possivel excluir o plano."
    });
  }
});

app.get("/api/admin/payment-settings", async (_req, res) => {
  if (!hasDbConfig()) {
    return res.status(503).json({ ok: false, message: "Banco de dados nao configurado." });
  }

  try {
    await ensureDatabaseReady();
    const db = getPool();
    const [rows] = await db.query(
      "SELECT public_key AS publicKey, access_token AS accessToken, webhook_secret AS webhookSecret, updated_at AS updatedAt FROM payment_settings WHERE id = 1 LIMIT 1"
    );
    return res.json({ ok: true, settings: Array.isArray(rows) && rows[0] ? rows[0] : {} });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Nao foi possivel carregar as credenciais."
    });
  }
});

app.post("/api/admin/payment-settings", async (req, res) => {
  if (!hasDbConfig()) {
    return res.status(503).json({ ok: false, message: "Banco de dados nao configurado." });
  }

  try {
    await ensureDatabaseReady();
    const db = getPool();
    await db.query(
      `
        UPDATE payment_settings
        SET public_key = ?, access_token = ?, webhook_secret = ?
        WHERE id = 1
      `,
      [String(req.body?.publicKey || ""), String(req.body?.accessToken || ""), String(req.body?.webhookSecret || "")]
    );
    return res.json({ ok: true, message: "Credenciais salvas com sucesso." });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Nao foi possivel salvar as credenciais."
    });
  }
});

app.post("/api/admin/messages", async (req, res) => {
  if (!hasDbConfig()) {
    return res.status(503).json({ ok: false, message: "Banco de dados nao configurado." });
  }

  const userId = Number(req.body?.userId);
  const subject = String(req.body?.subject || "").trim();
  const message = String(req.body?.message || "").trim();
  if (!Number.isFinite(userId) || userId <= 0 || subject === "" || message === "") {
    return res.status(400).json({ ok: false, message: "Informe usuario, assunto e mensagem." });
  }

  try {
    await ensureDatabaseReady();
    const db = getPool();
    await db.query("INSERT INTO admin_messages (user_id, subject, message) VALUES (?, ?, ?)", [userId, subject, message]);
    return res.status(201).json({ ok: true, message: "Mensagem registrada com sucesso." });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Nao foi possivel registrar a mensagem."
    });
  }
});

app.post("/api/send-mold-email", async (req, res) => {
  try {
    const { email, projectName, files } = req.body ?? {};

    if (typeof email !== "string" || email.trim() === "") {
      return res.status(400).json({ ok: false, message: "Informe um email valido." });
    }

    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ ok: false, message: "Nenhum arquivo foi enviado." });
    }

    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: Number(process.env.MAIL_PORT || 465),
      secure: String(process.env.MAIL_SECURE).toLowerCase() === "true",
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
      }
    });

    const attachmentItems = files
      .map((file) => {
        const extension = typeof file.filename === "string" ? file.filename.split(".").pop()?.toUpperCase() ?? "ARQ" : "ARQ";
        return `
          <tr>
            <td style="padding:12px 14px;border-bottom:1px solid #e7edf4;font:600 13px Arial,Helvetica,sans-serif;color:#17324d;">
              ${file.filename}
            </td>
            <td style="padding:12px 14px;border-bottom:1px solid #e7edf4;font:500 12px Arial,Helvetica,sans-serif;color:#5d7288;text-align:right;">
              ${extension}
            </td>
          </tr>
        `;
      })
      .join("");

    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: email,
      subject: `Molde taqueado - ${projectName || "Projeto"}`,
      html: `
        <div style="margin:0;padding:32px 0;background:#f3f0e8;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;">
            <tr>
              <td align="center">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="720" style="width:720px;max-width:720px;background:#ffffff;border:1px solid #e3e8ef;border-radius:20px;overflow:hidden;border-collapse:separate;">
                  <tr>
                    <td style="padding:0;">
                      <div style="padding:24px 32px;background:linear-gradient(135deg,#14263d 0%,#1f446a 100%);">
                        <div style="font:700 12px Arial,Helvetica,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#f5c17c;margin-bottom:10px;">
                          Estacao de modelagem
                        </div>
                        <div style="font:700 30px Arial,Helvetica,sans-serif;line-height:1.2;color:#ffffff;margin-bottom:8px;">
                          Arquivos do molde
                        </div>
                        <div style="font:400 14px Arial,Helvetica,sans-serif;line-height:1.7;color:#dbe7f3;">
                          Seu molde foi gerado com sucesso e segue anexado em tamanho real, junto com o relatorio tecnico do projeto.
                        </div>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:28px 32px 8px 32px;">
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;">
                        <tr>
                          <td style="padding:0 0 18px 0;">
                            <div style="font:700 18px Arial,Helvetica,sans-serif;color:#17324d;margin-bottom:8px;">
                              Resumo do projeto
                            </div>
                            <div style="font:400 14px Arial,Helvetica,sans-serif;color:#4b5f74;line-height:1.7;">
                              Projeto: <strong style="color:#17324d;">${projectName || "Sem nome"}</strong><br />
                              Entrega: molde inteiro, partes separadas e relatorio tecnico.
                            </div>
                          </td>
                        </tr>
                        <tr>
                          <td>
                            <div style="background:#f8fbff;border:1px solid #dbe7f3;border-radius:16px;padding:18px 18px 8px 18px;">
                              <div style="font:700 16px Arial,Helvetica,sans-serif;color:#17324d;margin-bottom:10px;">
                                Anexos enviados
                              </div>
                              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;">
                                <thead>
                                  <tr>
                                    <th align="left" style="padding:0 14px 10px 14px;font:700 11px Arial,Helvetica,sans-serif;letter-spacing:1px;text-transform:uppercase;color:#6f8194;border-bottom:1px solid #dbe7f3;">
                                      Arquivo
                                    </th>
                                    <th align="right" style="padding:0 14px 10px 14px;font:700 11px Arial,Helvetica,sans-serif;letter-spacing:1px;text-transform:uppercase;color:#6f8194;border-bottom:1px solid #dbe7f3;">
                                      Tipo
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  ${attachmentItems}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding-top:22px;">
                            <div style="background:#fff7e8;border:1px solid #f4ddae;border-radius:14px;padding:14px 16px;font:400 13px Arial,Helvetica,sans-serif;line-height:1.7;color:#6d5631;">
                              Confira se os dados do molde foram preenchidos exatamente como no sistema de origem antes de iniciar a montagem.
                            </div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 32px 28px 32px;">
                      <div style="padding-top:20px;border-top:1px solid #e7edf4;font:400 12px Arial,Helvetica,sans-serif;color:#7b8a99;line-height:1.7;">
                        Email gerado automaticamente pelo sistema de molde taqueado.<br />
                        Se precisar de uma nova versao, atualize o projeto e gere novamente os arquivos.
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </div>
      `,
      attachments: files.map((file) => ({
        filename: file.filename,
        content: file.contentBase64,
        encoding: "base64",
        contentType: file.contentType || "image/svg+xml"
      }))
    });

    res.json({ ok: true, message: "Arquivos enviados por email com sucesso." });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Nao foi possivel enviar o email.",
      error: error instanceof Error ? error.message : "Erro desconhecido"
    });
  }
});

app.use(express.static(distPath));

app.get("*", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

async function bootstrap() {
  await fs.mkdir(uploadRoot, { recursive: true });
  await fs.mkdir(marketplaceUploadRoot, { recursive: true });

  app.listen(port, host, () => {
    console.log(`Servidor rodando em http://${host}:${port}`);
    console.log(`Frontend estatico: ${distPath}`);
    console.log(`Uploads: ${uploadsBaseRoot}`);
  });
}

bootstrap().catch((error) => {
  console.error("Falha ao iniciar o servidor:", error);
  process.exit(1);
});
