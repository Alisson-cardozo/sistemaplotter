<?php

declare(strict_types=1);

namespace App\Core;

final class Response
{
    public function __construct(
        private readonly mixed $data,
        private readonly int $status = 200,
        private readonly array $headers = ['Content-Type' => 'application/json; charset=utf-8']
    ) {}

    public static function json(array $data, int $status = 200): self
    {
        return new self($data, $status);
    }

    public static function html(string $html, int $status = 200): self
    {
        return new self($html, $status, ['Content-Type' => 'text/html; charset=utf-8']);
    }

    public function send(): void
    {
        http_response_code($this->status);
        foreach ($this->headers as $name => $value) {
            header($name . ': ' . $value);
        }

        $contentType = '';
        foreach ($this->headers as $name => $value) {
            if (strtolower((string) $name) === 'content-type') {
                $contentType = strtolower((string) $value);
                break;
            }
        }

        if (is_string($this->data) && (str_starts_with($contentType, 'text/html') || str_starts_with($contentType, 'text/plain'))) {
            echo $this->data;
            return;
        }

        echo json_encode($this->data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
}
