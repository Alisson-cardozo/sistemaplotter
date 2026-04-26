<?php

declare(strict_types=1);

namespace App\Support;

final class Mailer
{
    public static function send(string $to, string $subject, array $payload): void
    {
        $driver = Env::get('MAIL_DRIVER', 'log');
        if ($driver === 'log') {
            $dir = dirname(__DIR__, 2) . '/storage/mail';
            if (!is_dir($dir)) {
                mkdir($dir, 0777, true);
            }
            $file = $dir . '/mail-' . date('Ymd-His') . '.log';
            file_put_contents($file, json_encode(compact('to', 'subject', 'payload'), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            return;
        }

        if ($driver === 'smtp') {
            self::sendViaSmtp($to, $subject, $payload);
            return;
        }

        self::sendViaNativeMail($to, $subject, $payload);
    }

    private static function sendViaNativeMail(string $to, string $subject, array $payload): void
    {
        [$headers, $body] = self::buildMimeMessage($to, $subject, $payload);
        if (!@mail($to, self::encodeHeader($subject), $body, implode("\r\n", $headers))) {
            throw new \RuntimeException('Nao foi possivel enviar o email pelo driver mail.');
        }
    }

    private static function sendViaSmtp(string $to, string $subject, array $payload): void
    {
        $host = Env::get('MAIL_HOST', 'smtp.gmail.com') ?? 'smtp.gmail.com';
        $port = (int) (Env::get('MAIL_PORT', '587') ?? '587');
        $encryption = strtolower(Env::get('MAIL_ENCRYPTION', 'tls') ?? 'tls');
        $username = Env::get('MAIL_USER', Env::get('MAIL_FROM', ''));
        $password = Env::get('MAIL_PASS', '');
        $from = Env::get('MAIL_FROM', $username ?? 'noreply@example.com') ?? 'noreply@example.com';
        $timeout = 20;

        $transport = $encryption === 'ssl' ? 'ssl://' . $host : $host;
        $socket = @stream_socket_client($transport . ':' . $port, $errorNumber, $errorMessage, $timeout, STREAM_CLIENT_CONNECT);
        if (!is_resource($socket)) {
            throw new \RuntimeException('Falha ao conectar no servidor SMTP: ' . $errorMessage . ' (' . $errorNumber . ').');
        }

        stream_set_timeout($socket, $timeout);

        try {
            self::expectResponse($socket, [220]);
            self::writeCommand($socket, 'EHLO localhost');
            self::expectResponse($socket, [250]);

            if ($encryption === 'tls') {
                self::writeCommand($socket, 'STARTTLS');
                self::expectResponse($socket, [220]);
                if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                    throw new \RuntimeException('Nao foi possivel ativar TLS na conexao SMTP.');
                }
                self::writeCommand($socket, 'EHLO localhost');
                self::expectResponse($socket, [250]);
            }

            if ($username !== null && $username !== '' && $password !== null && $password !== '') {
                self::writeCommand($socket, 'AUTH LOGIN');
                self::expectResponse($socket, [334]);
                self::writeCommand($socket, base64_encode($username));
                self::expectResponse($socket, [334]);
                self::writeCommand($socket, base64_encode($password));
                self::expectResponse($socket, [235]);
            }

            self::writeCommand($socket, 'MAIL FROM:<' . $from . '>');
            self::expectResponse($socket, [250]);
            self::writeCommand($socket, 'RCPT TO:<' . $to . '>');
            self::expectResponse($socket, [250, 251]);
            self::writeCommand($socket, 'DATA');
            self::expectResponse($socket, [354]);

            [$headers, $body] = self::buildMimeMessage($to, $subject, $payload);
            $message = implode("\r\n", $headers) . "\r\n\r\n" . self::escapeSmtpBody($body) . "\r\n.";
            self::writeRaw($socket, $message . "\r\n");
            self::expectResponse($socket, [250]);
            self::writeCommand($socket, 'QUIT');
        } finally {
            fclose($socket);
        }
    }

    private static function buildMimeMessage(string $to, string $subject, array $payload): array
    {
        $from = Env::get('MAIL_FROM', 'noreply@example.com') ?? 'noreply@example.com';
        $fromName = Env::get('MAIL_FROM_NAME', Env::get('APP_NAME', 'Plotagem Moldes PHP') ?? 'Plotagem Moldes PHP') ?? 'Plotagem Moldes PHP';
        $body = (string) ($payload['body'] ?? json_encode($payload, JSON_UNESCAPED_UNICODE));
        $attachments = is_array($payload['files'] ?? null) ? $payload['files'] : [];

        $headers = [
            'MIME-Version: 1.0',
            'From: ' . self::formatAddress($from, $fromName),
            'To: ' . $to,
            'Subject: ' . self::encodeHeader($subject),
        ];

        if ($attachments === []) {
            $headers[] = 'Content-Type: text/plain; charset=UTF-8';
            $headers[] = 'Content-Transfer-Encoding: 8bit';
            return [$headers, $body];
        }

        $boundary = 'mixed_' . bin2hex(random_bytes(12));
        $headers[] = 'Content-Type: multipart/mixed; boundary="' . $boundary . '"';

        $parts = [];
        $parts[] = '--' . $boundary;
        $parts[] = 'Content-Type: text/plain; charset=UTF-8';
        $parts[] = 'Content-Transfer-Encoding: 8bit';
        $parts[] = '';
        $parts[] = $body;

        foreach ($attachments as $attachment) {
            $filename = (string) ($attachment['filename'] ?? 'arquivo.bin');
            $contentType = (string) ($attachment['contentType'] ?? 'application/octet-stream');
            $contentBase64 = (string) ($attachment['contentBase64'] ?? '');
            if ($contentBase64 === '') {
                continue;
            }

            $parts[] = '--' . $boundary;
            $parts[] = 'Content-Type: ' . $contentType . '; name="' . addslashes($filename) . '"';
            $parts[] = 'Content-Transfer-Encoding: base64';
            $parts[] = 'Content-Disposition: attachment; filename="' . addslashes($filename) . '"';
            $parts[] = '';
            $parts[] = chunk_split($contentBase64, 76, "\r\n");
        }

        $parts[] = '--' . $boundary . '--';

        return [$headers, implode("\r\n", $parts)];
    }

    private static function encodeHeader(string $value): string
    {
        return '=?UTF-8?B?' . base64_encode($value) . '?=';
    }

    private static function formatAddress(string $email, string $name): string
    {
        return self::encodeHeader($name) . ' <' . $email . '>';
    }

    private static function writeCommand($socket, string $command): void
    {
        self::writeRaw($socket, $command . "\r\n");
    }

    private static function writeRaw($socket, string $data): void
    {
        $written = fwrite($socket, $data);
        if ($written === false) {
            throw new \RuntimeException('Falha ao escrever na conexao SMTP.');
        }
    }

    private static function expectResponse($socket, array $expectedCodes): void
    {
        $response = self::readResponse($socket);
        $code = (int) substr($response, 0, 3);
        if (!in_array($code, $expectedCodes, true)) {
            throw new \RuntimeException('SMTP respondeu com erro: ' . trim($response));
        }
    }

    private static function readResponse($socket): string
    {
        $response = '';
        while (($line = fgets($socket, 515)) !== false) {
            $response .= $line;
            if (isset($line[3]) && $line[3] === ' ') {
                break;
            }
        }

        if ($response === '') {
            throw new \RuntimeException('Servidor SMTP nao respondeu.');
        }

        return $response;
    }

    private static function escapeSmtpBody(string $body): string
    {
        return preg_replace('/^\./m', '..', $body) ?? $body;
    }
}
