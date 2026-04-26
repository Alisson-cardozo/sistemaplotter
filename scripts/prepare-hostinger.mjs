import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const sourcePhpDir = path.join(rootDir, "saas_php_robusto");
const sourcePublicDir = path.join(sourcePhpDir, "public");
const deployRoot = path.join(rootDir, "deploy-hostinger");
const publicHtmlDir = path.join(deployRoot, "public_html");
const bundledPhpDir = path.join(publicHtmlDir, "saas_php_robusto");

async function ensureEmptyDir(target) {
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(target, { recursive: true });
}

async function copyIfExists(from, to) {
  try {
    await fs.cp(from, to, { recursive: true, force: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

async function writeDeployIndex() {
  const content = `<?php

declare(strict_types=1);

require __DIR__ . '/saas_php_robusto/bootstrap/app.php';

use App\\Core\\Request;

$app = app();
$response = $app->handle(Request::capture());
$response->send();
`;

  await fs.writeFile(path.join(publicHtmlDir, "index.php"), content, "utf8");
}

async function writeDeployReadme() {
  const content = `DEPLOY HOSTINGER

1. Compacte o conteudo desta pasta deploy-hostinger.
2. Envie o zip para a Hostinger.
3. Extraia mantendo public_html como raiz publica.
4. Confira o arquivo public_html/saas_php_robusto/.env antes de publicar.
5. Importe o banco com saas_php_robusto/database/schema.sql se necessario.
`;

  await fs.writeFile(path.join(deployRoot, "README.txt"), content, "utf8");
}

async function main() {
  await ensureEmptyDir(publicHtmlDir);

  await copyIfExists(path.join(sourcePublicDir, ".htaccess"), path.join(publicHtmlDir, ".htaccess"));
  await copyIfExists(path.join(sourcePublicDir, "app"), path.join(publicHtmlDir, "app"));
  await copyIfExists(path.join(sourcePublicDir, "uploads"), path.join(publicHtmlDir, "uploads"));

  await fs.mkdir(bundledPhpDir, { recursive: true });

  for (const entry of ["bootstrap", "config", "database", "imagem", "routes", "src", "storage"]) {
    await copyIfExists(path.join(sourcePhpDir, entry), path.join(bundledPhpDir, entry));
  }

  await copyIfExists(path.join(sourcePhpDir, ".env"), path.join(bundledPhpDir, ".env"));
  await copyIfExists(path.join(sourcePhpDir, "README.md"), path.join(bundledPhpDir, "README.md"));

  await writeDeployIndex();
  await writeDeployReadme();

  console.log("Pacote da Hostinger preparado em:", deployRoot);
}

main().catch((error) => {
  console.error("Falha ao preparar o pacote da Hostinger.");
  console.error(error);
  process.exitCode = 1;
});
