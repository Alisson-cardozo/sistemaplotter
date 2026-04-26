<?php

declare(strict_types=1);

namespace App\Support;

final class Payments
{
    public static function createCheckout(int $planId, int $userId, float $amount, int $durationDays, string $planName, string $payerEmail = ''): array
    {
        $reference = 'CHK-' . strtoupper(bin2hex(random_bytes(6)));
        $settings = Db::pdo()->query('SELECT public_key, access_token, webhook_secret FROM payment_settings WHERE id = 1 LIMIT 1')->fetch() ?: [];
        $publicKey = trim((string) ($settings['public_key'] ?? ''));
        $accessToken = trim((string) ($settings['access_token'] ?? ''));

        if ($accessToken === '') {
            throw new \RuntimeException('Configure o Access token nas credenciais de pagamento.');
        }

        if ($publicKey === '') {
            throw new \RuntimeException('Configure a Public key nas credenciais de pagamento.');
        }

        $expiresAt = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
        $expiresAt = $expiresAt->modify('+10 minutes');
        $payerName = self::firstNameFromEmail($payerEmail);
        $notificationUrl = self::buildNotificationUrl();
        $payload = [
            'transaction_amount' => (float) number_format($amount, 2, '.', ''),
            'description' => 'Plano ' . $planName,
            'payment_method_id' => 'pix',
            'external_reference' => $reference,
            'date_of_expiration' => $expiresAt->format('Y-m-d\TH:i:s.v\Z'),
            'payer' => [
                'email' => $payerEmail !== '' ? $payerEmail : "checkout-user-{$userId}@example.com",
                'first_name' => $payerName,
            ],
            'metadata' => [
                'user_id' => $userId,
                'plan_id' => $planId,
                'duration_days' => $durationDays,
            ],
        ];

        if ($notificationUrl !== null) {
            $payload['notification_url'] = $notificationUrl;
        }

        $response = self::apiRequest('POST', '/v1/payments', $accessToken, $payload, bin2hex(random_bytes(16)));
        $paymentId = (string) ($response['id'] ?? '');
        $pix = self::extractQrCode($response);
        $qrBase64 = self::extractQrCodeBase64($response);
        $status = self::normalizePaymentStatus((string) ($response['status'] ?? 'pending'));
        $expiresAt = self::extractExpiration($response);

        if ($paymentId === '') {
            throw new \RuntimeException('Mercado Pago nao retornou o identificador do pagamento.');
        }

        if ($pix === '' && $qrBase64 === '') {
            throw new \RuntimeException('Mercado Pago nao retornou QR Code ou codigo Pix para este checkout.');
        }

        return [
            'mercadopago_payment_id' => $paymentId,
            'external_reference' => $reference,
            'payment_status' => $status,
            'amount' => $amount,
            'duration_days' => $durationDays,
            'pix_code' => $pix,
            'qr_code_base64' => $qrBase64,
            'expires_at' => $expiresAt,
            'plan_name' => $planName,
            'plan_id' => $planId,
            'user_id' => $userId,
        ];
    }

    public static function refreshCheckoutStatus(string $mercadoPagoPaymentId): ?array
    {
        $settings = Db::pdo()->query('SELECT access_token FROM payment_settings WHERE id = 1 LIMIT 1')->fetch() ?: [];
        $accessToken = trim((string) ($settings['access_token'] ?? ''));
        if ($accessToken === '') {
            return null;
        }

        $response = self::apiRequest('GET', '/v1/payments/' . rawurlencode($mercadoPagoPaymentId), $accessToken);

        return [
            'payment_status' => self::normalizePaymentStatus((string) ($response['status'] ?? 'pending')),
            'pix_code' => self::extractQrCode($response),
            'qr_code_base64' => self::extractQrCodeBase64($response),
            'expires_at' => self::extractExpiration($response),
        ];
    }

    private static function apiRequest(string $method, string $path, string $accessToken, ?array $payload = null, ?string $idempotencyKey = null): array
    {
        $url = 'https://api.mercadopago.com' . $path;
        $verifySsl = self::shouldVerifySsl();
        $caBundle = self::resolveCaBundlePath();
        $headers = [
            'Authorization: Bearer ' . $accessToken,
            'Content-Type: application/json',
            'Accept: application/json',
        ];

        if ($idempotencyKey !== null) {
            $headers[] = 'X-Idempotency-Key: ' . $idempotencyKey;
        }

        $body = $payload !== null ? json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null;

        if (function_exists('curl_init')) {
            $curl = curl_init($url);
            if ($curl === false) {
                throw new \RuntimeException('Nao foi possivel iniciar a conexao com o Mercado Pago.');
            }

            curl_setopt_array($curl, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_CUSTOMREQUEST => $method,
                CURLOPT_HTTPHEADER => $headers,
                CURLOPT_TIMEOUT => 25,
                CURLOPT_SSL_VERIFYPEER => $verifySsl,
                CURLOPT_SSL_VERIFYHOST => $verifySsl ? 2 : 0,
            ]);

            if ($body !== null) {
                curl_setopt($curl, CURLOPT_POSTFIELDS, $body);
            }

            if ($caBundle !== null) {
                curl_setopt($curl, CURLOPT_CAINFO, $caBundle);
            }

            $raw = curl_exec($curl);
            $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
            $error = curl_error($curl);

            if ($raw === false) {
                if ($verifySsl && self::isSslIssuerError($error)) {
                    throw new \RuntimeException('Falha ao consultar o Mercado Pago: ' . $error . '. Em ambiente local, use MP_SSL_VERIFY=false no .env ou configure o CA bundle do PHP.');
                }
                throw new \RuntimeException('Falha ao consultar o Mercado Pago: ' . $error);
            }
        } else {
            $context = stream_context_create([
                'http' => [
                    'method' => $method,
                    'header' => implode("\r\n", $headers),
                    'content' => $body ?? '',
                    'timeout' => 25,
                    'ignore_errors' => true,
                ],
                'ssl' => [
                    'verify_peer' => $verifySsl,
                    'verify_peer_name' => $verifySsl,
                    'allow_self_signed' => !$verifySsl,
                    ...($caBundle !== null ? ['cafile' => $caBundle] : []),
                ],
            ]);
            $raw = @file_get_contents($url, false, $context);
            $statusLine = $http_response_header[0] ?? 'HTTP/1.1 500 Internal Server Error';
            preg_match('/\s(\d{3})\s/', $statusLine, $matches);
            $status = isset($matches[1]) ? (int) $matches[1] : 500;
            if ($raw === false) {
                $details = error_get_last()['message'] ?? 'Falha ao consultar o Mercado Pago.';
                throw new \RuntimeException((string) $details);
            }
        }

        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            throw new \RuntimeException('Mercado Pago retornou uma resposta invalida.');
        }

        if ($status >= 400) {
            $message = (string) ($decoded['message'] ?? $decoded['error'] ?? $decoded['cause'][0]['description'] ?? 'Erro ao gerar checkout no Mercado Pago.');
            throw new \RuntimeException($message);
        }

        return $decoded;
    }

    private static function buildNotificationUrl(): ?string
    {
        $siteUrl = trim((string) Env::get('SITE_URL', ''));
        if ($siteUrl === '' || preg_match('/localhost|127\.0\.0\.1/i', $siteUrl)) {
            return null;
        }

        return rtrim($siteUrl, '/') . '/api/payments/mercadopago/webhook';
    }

    private static function firstNameFromEmail(string $email): string
    {
        $email = trim($email);
        if ($email === '') {
            return 'Cliente';
        }

        $localPart = explode('@', $email)[0] ?? '';
        $firstPart = preg_split('/[.\-_]+/', $localPart)[0] ?? '';
        $firstPart = trim($firstPart);

        return $firstPart !== '' ? ucfirst($firstPart) : 'Cliente';
    }

    private static function extractQrCode(array $response): string
    {
        return (string) (
            $response['point_of_interaction']['transaction_data']['qr_code']
            ?? $response['transaction_details']['qr_code']
            ?? ''
        );
    }

    private static function extractQrCodeBase64(array $response): string
    {
        return (string) (
            $response['point_of_interaction']['transaction_data']['qr_code_base64']
            ?? $response['transaction_details']['qr_code_base64']
            ?? ''
        );
    }

    private static function extractExpiration(array $response): string
    {
        $raw = (string) ($response['date_of_expiration'] ?? '');
        if ($raw === '') {
            return date('Y-m-d H:i:s', strtotime('+10 minutes'));
        }

        $timestamp = strtotime($raw);
        return $timestamp !== false ? date('Y-m-d H:i:s', $timestamp) : date('Y-m-d H:i:s', strtotime('+10 minutes'));
    }

    private static function normalizePaymentStatus(string $status): string
    {
        $normalized = strtolower(trim($status));
        return match ($normalized) {
            'approved', 'accredited', 'processed' => 'approved',
            'cancelled', 'canceled', 'rejected', 'refunded', 'charged_back' => 'cancelled',
            default => 'pending',
        };
    }

    private static function shouldVerifySsl(): bool
    {
        $configured = strtolower(trim((string) Env::get('MP_SSL_VERIFY', '')));
        if ($configured !== '') {
            return !in_array($configured, ['0', 'false', 'off', 'no'], true);
        }

        return strtolower((string) Env::get('APP_ENV', 'production')) !== 'local';
    }

    private static function resolveCaBundlePath(): ?string
    {
        $candidates = [
            Env::get('CURL_CA_BUNDLE'),
            Env::get('SSL_CERT_FILE'),
            ini_get('curl.cainfo') ?: null,
            ini_get('openssl.cafile') ?: null,
        ];

        foreach ($candidates as $candidate) {
            if (is_string($candidate) && $candidate !== '' && is_file($candidate)) {
                return $candidate;
            }
        }

        return null;
    }

    private static function isSslIssuerError(string $error): bool
    {
        $error = strtolower($error);
        return str_contains($error, 'unable to get local issuer certificate')
            || str_contains($error, 'certificate')
            || str_contains($error, 'ssl');
    }
}
