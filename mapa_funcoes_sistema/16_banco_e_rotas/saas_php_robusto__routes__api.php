<?php

declare(strict_types=1);

use App\Http\Controllers\Api\AccountController;
use App\Http\Controllers\Api\AdminController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\MarketplaceController;
use App\Http\Controllers\Api\MoldController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\PlanController;
use App\Http\Controllers\Api\SuggestionController;
use App\Http\Controllers\Api\SystemController;
use App\Http\Controllers\Api\TacoMountedFileController;
use App\Http\Controllers\Api\TutorialController;
use App\Http\Controllers\PatternController;
use App\Http\Middleware\AdminMiddleware;
use App\Http\Middleware\AuthMiddleware;

$router = app()->router;

$router->add('GET', '/', static function () {
    $frontendCandidates = [
        __DIR__ . '/../public/app/index.html',
        __DIR__ . '/../../app/index.html',
    ];

    foreach ($frontendCandidates as $frontendEntry) {
        if (is_file($frontendEntry)) {
            return App\Core\Response::html((string) file_get_contents($frontendEntry));
        }
    }

    return App\Core\Response::html(<<<'HTML'
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>SaaS PHP Robusto</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Arial, Helvetica, sans-serif;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        min-height: 100vh;
        background: linear-gradient(180deg, #f5efe4 0%, #eef4fa 100%);
        color: #17324d;
      }
      main {
        max-width: 860px;
        margin: 0 auto;
        padding: 48px 20px;
      }
      .card {
        background: rgba(255, 255, 255, 0.92);
        border: 1px solid #d8e2eb;
        border-radius: 20px;
        padding: 28px;
        box-shadow: 0 18px 50px rgba(23, 50, 77, 0.10);
      }
      h1 {
        margin: 0 0 10px;
        font-size: 34px;
      }
      p, li, code {
        font-size: 16px;
        line-height: 1.6;
      }
      code {
        background: #eef4fa;
        padding: 2px 6px;
        border-radius: 6px;
      }
      ul {
        padding-left: 20px;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="card">
        <h1>SaaS PHP Robusto</h1>
        <p>O projeto ativo aqui e o backend em PHP. A pasta antiga com Vite/Node nao e necessaria para subir esta aplicacao.</p>
        <p>Servidor online. Testes iniciais:</p>
        <ul>
          <li>Status da API: <code>/api/health</code></li>
          <li>Login: <code>POST /api/auth/login</code></li>
          <li>Registro: <code>POST /api/auth/register</code></li>
        </ul>
        <p>Para rodar localmente use: <code>php -S localhost:8080 -t public</code></p>
      </div>
    </main>
  </body>
</html>
HTML);
});

$router->add('GET', '/api/health', [SystemController::class, 'health']);
$router->add('POST', '/api/auth/register', [AuthController::class, 'register']);
$router->add('POST', '/api/auth/login', [AuthController::class, 'login']);
$router->add('POST', '/api/auth/validate', [AuthController::class, 'validate']);
$router->add('POST', '/api/auth/logout', [AuthController::class, 'logout'], [[AuthMiddleware::class, 'handle']]);

$router->add('POST', '/api/account/profile', [AccountController::class, 'profile'], [[AuthMiddleware::class, 'handle']]);
$router->add('GET', '/api/tutorial', [TutorialController::class, 'show'], [[AuthMiddleware::class, 'handle']]);
$router->add('POST', '/api/suggestions', [SuggestionController::class, 'store'], [[AuthMiddleware::class, 'handle']]);
$router->add('GET', '/api/suggestions', [SuggestionController::class, 'userList'], [[AuthMiddleware::class, 'handle']]);
$router->add('POST', '/api/suggestions/{id}/messages', [SuggestionController::class, 'userReply'], [[AuthMiddleware::class, 'handle']]);
$router->add('POST', '/api/suggestions/{id}/hide', [SuggestionController::class, 'hideForUser'], [[AuthMiddleware::class, 'handle']]);
$router->add('GET', '/api/notifications', [NotificationController::class, 'userIndex'], [[AuthMiddleware::class, 'handle']]);
$router->add('POST', '/api/notifications/{id}/read', [NotificationController::class, 'userRead'], [[AuthMiddleware::class, 'handle']]);

$router->add('GET', '/api/marketplace/products', [MarketplaceController::class, 'index']);
$router->add('POST', '/api/admin/marketplace-image', [MarketplaceController::class, 'upload'], [[AuthMiddleware::class, 'handle']]);
$router->add('POST', '/api/admin/marketplace/products', [MarketplaceController::class, 'store'], [[AuthMiddleware::class, 'handle']]);
$router->add('PUT', '/api/admin/marketplace/products/{id}', [MarketplaceController::class, 'update'], [[AuthMiddleware::class, 'handle']]);
$router->add('POST', '/api/admin/marketplace/products/{id}/status', [MarketplaceController::class, 'status'], [[AuthMiddleware::class, 'handle']]);
$router->add('DELETE', '/api/admin/marketplace/products/{id}', [MarketplaceController::class, 'destroy'], [[AuthMiddleware::class, 'handle'], [AdminMiddleware::class, 'handle']]);

$router->add('GET', '/api/molds', [MoldController::class, 'index'], [[AuthMiddleware::class, 'handle']]);
$router->add('GET', '/api/molds/{id}', [MoldController::class, 'show'], [[AuthMiddleware::class, 'handle']]);
$router->add('POST', '/api/molds', [MoldController::class, 'store'], [[AuthMiddleware::class, 'handle']]);
$router->add('DELETE', '/api/molds/{id}', [MoldController::class, 'destroy'], [[AuthMiddleware::class, 'handle']]);

$router->add('GET', '/api/taco-mounted-files', [TacoMountedFileController::class, 'index'], [[AuthMiddleware::class, 'handle']]);
$router->add('GET', '/api/taco-mounted-files/{id}', [TacoMountedFileController::class, 'show'], [[AuthMiddleware::class, 'handle']]);
$router->add('POST', '/api/taco-mounted-files', [TacoMountedFileController::class, 'store'], [[AuthMiddleware::class, 'handle']]);
$router->add('DELETE', '/api/taco-mounted-files/{id}', [TacoMountedFileController::class, 'destroy'], [[AuthMiddleware::class, 'handle']]);

$router->add('GET', '/api/plans', [PlanController::class, 'publicList']);
$router->add('POST', '/api/plans/checkout', [PlanController::class, 'checkout'], [[AuthMiddleware::class, 'handle']]);
$router->add('GET', '/api/plans/checkout/{id}', [PlanController::class, 'showCheckout'], [[AuthMiddleware::class, 'handle']]);
$router->add('POST', '/api/plans/checkout/{id}/cancel', [PlanController::class, 'cancelCheckout'], [[AuthMiddleware::class, 'handle']]);

$router->add('GET', '/api/admin/users', [AdminController::class, 'users'], [[AuthMiddleware::class, 'handle'], [AdminMiddleware::class, 'handle']]);
$router->add('POST', '/api/admin/users/{id}/access', [AdminController::class, 'updateAccess'], [[AuthMiddleware::class, 'handle'], [AdminMiddleware::class, 'handle']]);
$router->add('POST', '/api/admin/users/{id}/profile', [AdminController::class, 'profile'], [[AuthMiddleware::class, 'handle'], [AdminMiddleware::class, 'handle']]);
$router->add('POST', '/api/admin/users/{id}/grant', [AdminController::class, 'grant'], [[AuthMiddleware::class, 'handle'], [AdminMiddleware::class, 'handle']]);
$router->add('POST', '/api/admin/users/{id}/revoke-grant', [AdminController::class, 'revokeGrant'], [[AuthMiddleware::class, 'handle'], [AdminMiddleware::class, 'handle']]);
$router->add('POST', '/api/admin/users/{id}/password', [AdminController::class, 'password'], [[AuthMiddleware::class, 'handle'], [AdminMiddleware::class, 'handle']]);
$router->add('GET', '/api/admin/payment-settings', [AdminController::class, 'paymentSettings'], [[AuthMiddleware::class, 'handle'], [AdminMiddleware::class, 'handle']]);
$router->add('POST', '/api/admin/payment-settings', [AdminController::class, 'savePaymentSettings'], [[AuthMiddleware::class, 'handle'], [AdminMiddleware::class, 'handle']]);
$router->add('GET', '/api/admin/tutorial', [TutorialController::class, 'adminShow'], [[AuthMiddleware::class, 'handle'], [AdminMiddleware::class, 'handle']]);
$router->add('POST', '/api/admin/tutorial', [TutorialController::class, 'adminStore'], [[AuthMiddleware::class, 'handle'], [AdminMiddleware::class, 'handle']]);
$router->add('PUT', '/api/admin/tutorial/{id}', [TutorialController::class, 'adminUpdate'], [[AuthMiddleware::class, 'handle'], [AdminMiddleware::class, 'handle']]);
$router->add('DELETE', '/api/admin/tutorial/{id}', [TutorialController::class, 'adminDelete'], [[AuthMiddleware::class, 'handle'], [AdminMiddleware::class, 'handle']]);
$router->add('POST', '/api/admin/messages', [AdminController::class, 'message'], [[AuthMiddleware::class, 'handle'], [AdminMiddleware::class, 'handle']]);
$router->add('GET', '/api/admin/suggestions', [SuggestionController::class, 'adminList'], [[AuthMiddleware::class, 'handle'], [AdminMiddleware::class, 'handle']]);
$router->add('POST', '/api/admin/suggestions/{id}/reply', [SuggestionController::class, 'adminReply'], [[AuthMiddleware::class, 'handle'], [AdminMiddleware::class, 'handle']]);
$router->add('DELETE', '/api/admin/suggestions/{id}', [SuggestionController::class, 'adminDelete'], [[AuthMiddleware::class, 'handle'], [AdminMiddleware::class, 'handle']]);
$router->add('GET', '/api/admin/notifications', [NotificationController::class, 'adminIndex'], [[AuthMiddleware::class, 'handle'], [AdminMiddleware::class, 'handle']]);
$router->add('POST', '/api/admin/notifications/{id}/read', [NotificationController::class, 'adminRead'], [[AuthMiddleware::class, 'handle'], [AdminMiddleware::class, 'handle']]);
$router->add('POST', '/api/send-mold-email', [AdminController::class, 'sendMoldEmail'], [[AuthMiddleware::class, 'handle']]);

$router->add('GET', '/api/admin/plans', [PlanController::class, 'adminList'], [[AuthMiddleware::class, 'handle'], [AdminMiddleware::class, 'handle']]);
$router->add('GET', '/api/admin/orders', [PlanController::class, 'adminOrders'], [[AuthMiddleware::class, 'handle'], [AdminMiddleware::class, 'handle']]);
$router->add('POST', '/api/admin/plan-image', [PlanController::class, 'uploadImage'], [[AuthMiddleware::class, 'handle'], [AdminMiddleware::class, 'handle']]);
$router->add('POST', '/api/admin/plans', [PlanController::class, 'store'], [[AuthMiddleware::class, 'handle'], [AdminMiddleware::class, 'handle']]);
$router->add('PUT', '/api/admin/plans/{id}', [PlanController::class, 'update'], [[AuthMiddleware::class, 'handle'], [AdminMiddleware::class, 'handle']]);
$router->add('DELETE', '/api/admin/plans/{id}', [PlanController::class, 'destroy'], [[AuthMiddleware::class, 'handle'], [AdminMiddleware::class, 'handle']]);
$router->add('POST', '/api/admin/plans/{id}/approve-order', [PlanController::class, 'simulateApprove'], [[AuthMiddleware::class, 'handle'], [AdminMiddleware::class, 'handle']]);

$router->add('POST', '/api/pattern/calculate', [PatternController::class, 'calculate'], [[AuthMiddleware::class, 'handle']]);
$router->add('POST', '/api/pattern/export-files', [PatternController::class, 'exportFiles'], [[AuthMiddleware::class, 'handle']]);
