<?php

declare(strict_types=1);

namespace App\Core;

final class Application
{
    public readonly Router $router;

    public function __construct(public readonly Database $db)
    {
        $this->router = new Router();
    }

    public function handle(Request $request): Response
    {
        try {
            return $this->router->dispatch($request);
        } catch (\Throwable $exception) {
            return Response::json([
                'ok' => false,
                'message' => $exception->getMessage(),
            ], 500);
        }
    }
}
