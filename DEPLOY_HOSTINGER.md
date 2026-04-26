# Deploy na Hostinger

## O que ja ficou preparado no codigo

- O frontend React agora gera build em `saas_php_robusto/public/app`
- O backend PHP continua em `saas_php_robusto/public`
- O arquivo `saas_php_robusto/public/.htaccess` foi criado para:
  - manter a API em `/api`
  - manter uploads publicos
  - abrir o frontend compilado em `/`
  - suportar rotas da SPA no mesmo dominio
- O comando `npm run build:hostinger` agora monta uma pasta `deploy-hostinger` pronta para zip e upload.

## Antes de subir

1. Atualize `saas_php_robusto/.env` para producao:
   - `APP_ENV=production`
   - `APP_DEBUG=false`
   - `APP_URL=https://seu-dominio.com`
   - ajuste `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`
   - ajuste SMTP se quiser envio de e-mail funcionando
2. Gere o pacote:
   - `npm.cmd run build:hostinger`
3. Confira se a pasta `deploy-hostinger/public_html` foi gerada.

## Estrutura pronta para upload

Depois do comando acima, envie o conteudo da pasta `deploy-hostinger`.

Ela ja vai com esta estrutura:

- `deploy-hostinger/public_html/index.php`
- `deploy-hostinger/public_html/.htaccess`
- `deploy-hostinger/public_html/app`
- `deploy-hostinger/public_html/uploads`
- `deploy-hostinger/public_html/saas_php_robusto/bootstrap`
- `deploy-hostinger/public_html/saas_php_robusto/config`
- `deploy-hostinger/public_html/saas_php_robusto/database`
- `deploy-hostinger/public_html/saas_php_robusto/imagem`
- `deploy-hostinger/public_html/saas_php_robusto/routes`
- `deploy-hostinger/public_html/saas_php_robusto/src`
- `deploy-hostinger/public_html/saas_php_robusto/storage`
- `deploy-hostinger/public_html/saas_php_robusto/.env`

## Banco de dados

1. No hPanel, crie um banco MySQL.
2. Crie um usuario do banco e vincule ao banco.
3. Importe `saas_php_robusto/database/schema.sql`.
4. Coloque essas credenciais no `.env` de producao.

## Publicacao no dominio

1. Compacte a pasta `deploy-hostinger`.
2. Envie o zip para a Hostinger.
3. Extraia o zip.
4. Se a extracao criar uma pasta `deploy-hostinger`, entre nela e mova o conteudo de `public_html` para a raiz publica do dominio.
5. O `index.php` ja vem preparado para buscar o backend em `public_html/saas_php_robusto/bootstrap/app.php`.

## Checklist final

1. Acesse `https://seu-dominio.com/api/health`
2. Se abrir corretamente, teste `https://seu-dominio.com`
3. Faça login
4. Teste upload
5. Teste criacao de pedido de plano
6. Teste envio de email, se SMTP estiver configurado

## Observacao

Se quiser simplificar ainda mais na Hostinger, voce pode manter uma pasta privada com o projeto PHP completo e deixar no `public_html` apenas os arquivos publicos (`index.php`, `.htaccess`, `app`, `uploads`), apontando o `index.php` para a pasta privada.
