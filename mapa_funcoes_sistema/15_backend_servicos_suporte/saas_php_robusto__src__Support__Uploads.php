<?php

declare(strict_types=1);

namespace App\Support;

final class Uploads
{
    private static function projectRoot(): string
    {
        return dirname(__DIR__, 2);
    }

    private static function publicRoot(): string
    {
        $projectRoot = self::projectRoot();
        $hostingerRoot = dirname($projectRoot);

        if (is_file($hostingerRoot . '/index.php') && is_dir($hostingerRoot . '/app')) {
            return $hostingerRoot;
        }

        return $projectRoot . '/public';
    }

    private static function publicUploadsDir(string $folder): string
    {
        return rtrim(self::publicRoot(), '/\\') . '/uploads/' . trim($folder, '/\\');
    }

    private static function legacyUploadsDir(string $folder): string
    {
        return self::projectRoot() . '/public/uploads/' . trim($folder, '/\\');
    }

    public static function persistBase64Image(string $payload, string $folder, string $prefix): string
    {
        $payload = trim($payload);
        if ($payload === '') {
            return '';
        }

        if (str_starts_with($payload, '/uploads/')) {
            return $payload;
        }

        if (!preg_match('/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/', $payload, $matches)) {
            return $payload;
        }

        $mime = strtolower($matches[1]);
        $extension = str_contains($mime, 'png') ? 'png' : (str_contains($mime, 'webp') ? 'webp' : 'jpg');
        $absoluteDir = self::publicUploadsDir($folder);
        if (!is_dir($absoluteDir)) {
            mkdir($absoluteDir, 0777, true);
        }

        $fileName = sprintf('%s-%d-%s.%s', $prefix, time(), bin2hex(random_bytes(4)), $extension);
        file_put_contents($absoluteDir . '/' . $fileName, base64_decode($matches[2]));

        return '/uploads/' . $folder . '/' . $fileName;
    }

    public static function ensurePublicUrl(string $path): string
    {
        $path = trim($path);
        if ($path === '' || preg_match('#^https?://#i', $path)) {
            return $path;
        }

        $siteUrl = rtrim((string) Env::get('SITE_URL', ''), '/');
        $buildPublicUrl = static function (string $relativePath) use ($siteUrl): string {
            if ($siteUrl === '') {
                return $relativePath;
            }

            return $siteUrl . '/' . ltrim($relativePath, '/');
        };

        if (!str_starts_with($path, '/uploads/')) {
            return $buildPublicUrl($path);
        }

        $relative = ltrim($path, '/');
        $projectRoot = self::projectRoot();
        $publicFile = rtrim(self::publicRoot(), '/\\') . '/' . $relative;
        if (is_file($publicFile)) {
            return $buildPublicUrl($path);
        }

        $legacyPublicFile = $projectRoot . '/public/' . $relative;
        if (is_file($legacyPublicFile)) {
            $targetDir = dirname($publicFile);
            if (!is_dir($targetDir)) {
                mkdir($targetDir, 0777, true);
            }

            copy($legacyPublicFile, $publicFile);
            return $buildPublicUrl($path);
        }

        $legacyBase = trim((string) Env::get('UPLOADS_DIR', 'storage/uploads'), '/\\');
        $legacyFile = $projectRoot . '/' . $legacyBase . '/' . substr($relative, strlen('uploads/'));
        if (!is_file($legacyFile)) {
            return $path;
        }

        $targetDir = dirname($publicFile);
        if (!is_dir($targetDir)) {
            mkdir($targetDir, 0777, true);
        }

        copy($legacyFile, $publicFile);
        return $buildPublicUrl($path);
    }
}
