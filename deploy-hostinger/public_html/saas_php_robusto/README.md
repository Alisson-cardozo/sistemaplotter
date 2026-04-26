# SaaS PHP robusto para plotagem de moldes

Esta base recria o SaaS atual em PHP, com foco em organizacao, manutencao e crescimento.

## Modulos cobertos

- autenticacao e validacao de sessao
- conta do usuario
- marketplace interno
- moldes salvos
- planos e checkout
- administracao de usuarios
- administracao de planos
- configuracoes de pagamento
- mensagens administrativas
- upload de imagens de planos e marketplace
- envio de email de moldes com fallback em log
- calculo do molde, faixas, tacos, metricas e layout de impressao
- exportacao de SVG e PDF tecnico

## Estrutura

- `public/`: front controller
- `bootstrap/`: inicializacao
- `config/`: ambiente, banco e servicos
- `routes/`: definicao das rotas HTTP
- `src/Core/`: nucleo da aplicacao
- `src/Http/Controllers/`: controllers da API
- `src/Support/`: suporte para auth, upload, pagamento e mail
- `database/schema.sql`: schema completo
- `storage/`: uploads e logs locais

## Como subir

1. Ajuste `saas_php_robusto/.env`
2. Importe `database/schema.sql` no MySQL
3. A partir da pasta raiz `plotagem_moldes`, rode tudo com um comando:

```bash
npm run dev
```

Isso sobe:

- frontend Vite em `http://localhost:4173`
- backend PHP em `http://localhost:8080`

## Acesso administrativo

O administrador inicial fica definido no proprio `database/schema.sql`.

- email: `admin@alissonprojetos.com`
- senha: `Admin@123`

A aplicacao nao precisa ter essa credencial espalhada no frontend ou no backend: ela apenas le o usuario administrador criado no banco.

A aba `Admin` aparece para usuarios com `role = 'admin'` na tabela `users`.

Se quiser subir so o backend PHP:

```bash
php -S localhost:8080 -t public
```

## Observacoes

- O checkout esta com `PAYMENT_DRIVER=mock`, preparado para integrar Mercado Pago depois.
- O envio de email aceita `MAIL_DRIVER=log`, `mail` ou `smtp`.
- Para envio real com anexos via Gmail, use `MAIL_DRIVER=smtp` com `MAIL_HOST=smtp.gmail.com`, `MAIL_PORT=587`, `MAIL_ENCRYPTION=tls`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM` e `MAIL_FROM_NAME`.
- A API foi mantida proxima da assinatura do sistema atual para facilitar migracao do frontend.

## Rotas novas

- POST /api/pattern/calculate: calcula o molde completo a partir do payload do projeto
- POST /api/pattern/export-files: calcula o molde e devolve os arquivos tecnicos

## Arquitetura atual

- controllers separados por modulo
- middleware de autenticacao por Bearer token
- middleware de administrador
- servico de usuario e tokens
- modulo tecnico de calculo e exportacao do molde
- checkout mock com aprovacao administrativa para liberar acesso

## Autenticacao

- `POST /api/auth/login` retorna `user` e `token`
- envie `Authorization: Bearer SEU_TOKEN` nas rotas protegidas

## Fluxo sugerido

1. registrar ou logar
2. consumir `/api/plans` ou `/api/marketplace/products`
3. usar o token nas rotas protegidas
4. calcular molde em `/api/pattern/calculate`
5. exportar arquivos em `/api/pattern/export-files`


Perfeito. Faça as alterações no projeto original em sistemaphinal, teste localmente, e depois gere de novo a pasta de publicação.

Fluxo certo:

editar no projeto original
testar com npm run dev:web e npm run dev:php
gerar o pacote novo
subir novamente para a Hostinger
Quando terminar as mudanças, rode:

cd "C:\Users\Aliss\OneDrive\Área de Trabalho\sistemaphinal"
npm run build
node scripts/prepare-hostinger.mjs
Isso atualiza a pasta:

deploy-hostinger
Aí você sobe essa pasta de novo para o servidor.

Pode me falar agora qual alteração você quer fazer que eu já implemento direto no código.