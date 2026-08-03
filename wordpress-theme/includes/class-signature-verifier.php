<?php
/**
 * AstroPress Signature Verifier
 *
 * 拦截 /graphql 请求，校验 X-Graphql-Timestamp + X-Graphql-Signature。
 * 非法/过期签名返回 403，只放行 Astro 服务端发出的合法代理请求。
 */

class AstroPressSignatureVerifier {

    public static function init(): void {
        $requestPath = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
        if (strpos($requestPath, '/graphql') === false) {
            return;
        }
        if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
            self::handlePreflight();
            return;
        }
        self::verify();
    }

    private static function handlePreflight(): void {
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Graphql-Timestamp, X-Graphql-Signature');
        http_response_code(204);
        exit;
    }

    private static function verify(): void {
        $timestamp = $_SERVER['HTTP_X_GRAPHQL_TIMESTAMP'] ?? '';
        $signature = $_SERVER['HTTP_X_GRAPHQL_SIGNATURE'] ?? '';
        $debugMode = (int) get_option('maltose_debug_mode', 0);

        if (empty($timestamp) || empty($signature)) {
            self::deny('Missing signature headers');
        }

        $now    = time();
        $maxAge = (int) get_option('maltose_sign_expire', 60);
        $timeDiff = abs($now - (int) $timestamp);
        if ($timeDiff > $maxAge) {
            $info = $debugMode ? [
                'received_timestamp' => $timestamp,
                'server_time' => $now,
                'time_diff_seconds' => $timeDiff,
                'max_age_seconds' => $maxAge,
            ] : [];
            self::deny('Signature expired', 403, $info);
        }

        $secret = get_option('maltose_secret_key', '');
        if (empty($secret)) {
            self::deny('Secret not configured', 500);
        }

        $expected = hash('sha256', $secret . $timestamp);
        if (!hash_equals($expected, $signature)) {
            $info = $debugMode ? [
                'received_timestamp' => $timestamp,
                'received_signature' => $signature,
                'local_computed' => $expected,
                'secret_length' => strlen($secret),
                'secret_match' => false,
            ] : [];
            self::deny('Invalid signature', 403, $info);
        }
    }

    private static function deny(string $message, int $code = 403, array $debug = []): void {
        $payload = ['error' => $message];
        if (!empty($debug)) {
            $payload['debug'] = $debug;
        }
        wp_die(
            json_encode($payload),
            $code,
            ['Content-Type' => 'application/json']
        );
    }
}
