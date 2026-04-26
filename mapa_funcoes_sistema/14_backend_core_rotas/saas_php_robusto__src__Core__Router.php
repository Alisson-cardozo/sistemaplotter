<?php

declare(strict_types=1);

namespace App\Core;

use Closure;

final class Router
{
    private array $routes = [];

    public function add(string $method, string $path, Closure|array $handler, array $middleware = []): void
    {
        $this->routes[] = [$method, $path, $handler, $middleware];
    }

    public function dispatch(Request $request): Response
    {
        foreach ($this->routes as [$method, $path, $handler, $middleware]) {
            if ($method !== $request->method) {
                continue;
            }

            $pattern = '#^' . preg_replace('#\{([^/]+)\}#', '(?P<$1>[^/]+)', $path) . '$#';
            if (!preg_match($pattern, $request->path, $matches)) {
                continue;
            }

            $params = array_filter($matches, static fn ($key) => !is_int($key), ARRAY_FILTER_USE_KEY);
            foreach ($middleware as $pipe) {
                $response = $this->runMiddleware($pipe, $request, $params);
                if ($response instanceof Response) {
                    return $response;
                }
            }

            if (is_array($handler)) {
                [$class, $action] = $handler;
                $instance = new $class();
                return $instance->$action($request, $params);
            }

            return $handler($request, $params);
        }

        return Response::json(['ok' => false, 'message' => 'Rota nao encontrada.'], 404);
    }

    private function runMiddleware(Closure|array $pipe, Request $request, array $params): ?Response
    {
        if (is_array($pipe)) {
            [$class, $action] = $pipe;
            $instance = new $class();
            return $instance->$action($request, $params);
        }

        return $pipe($request, $params);
    }
}
