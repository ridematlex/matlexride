<?php
/* =============================================
   MATLEX RIDE — Central Configuration
   Include this file in every API endpoint.
   Change credentials block for production.
   ============================================= */

// ── Read env from $_SERVER (Apache SetEnv) first, then OS env, then default ──
function _env(string $key, string $default = ''): string {
    return $_SERVER[$key] ?? $_ENV[$key] ?? getenv($key) ?: $default;
}

// ── Database credentials ──────────────────────
define('DB_HOST', _env('DB_HOST', 'localhost'));
define('DB_USER', _env('DB_USER', 'matlex_user'));
define('DB_PASS', _env('DB_PASS', 'Matlex_user1@mysql123'));
define('DB_NAME', _env('DB_NAME', 'matlex_db'));
define('DB_PORT', (int)_env('DB_PORT', '3306'));

// ── App settings ──────────────────────────────
define('APP_NAME',    'Matlex Ride');
define('APP_VERSION', '1.0.0');
define('APP_ENV',     _env('APP_ENV', 'development'));

// ── Auth ──────────────────────────────────────
define('TOKEN_SECRET',  _env('TOKEN_SECRET', 'mx_secret_change_in_prod_2025'));
define('TOKEN_EXPIRY',  86400 * 30);  // 30 days in seconds

// Stopgap key for admin-only endpoints until a real admin login/session exists
define('ADMIN_API_KEY', _env('ADMIN_API_KEY', 'mx_admin_change_in_prod_2025'));

// ── URLs (no trailing slash) ──────────────────
define('BASE_URL',   _env('APP_URL', 'http://localhost/matlex'));
define('CLIENT_URL', BASE_URL . '/client');
define('API_URL',    CLIENT_URL . '/api');

// ── Timezone ──────────────────────────────────
date_default_timezone_set('Africa/Kampala');

// ── CORS + JSON headers (applied to every API response) ──
function set_api_headers(): void {
    header('Content-Type: application/json; charset=UTF-8');
    $origin = (APP_ENV === 'production') ? (_env('APP_URL', '') ?: '') : '*';
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');

    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit();
    }
}

// ── Hash a raw token before DB storage/lookup ─
function hash_token(string $token): string {
    return hash('sha256', $token);
}

// ── DB connection (returns PDO, throws on failure) ────────
function db_connect(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;   // reuse within the same request

    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        DB_HOST, DB_PORT, DB_NAME
    );
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];

    try {
        $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
    } catch (PDOException $e) {
        // Do not expose raw PDO message to client
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Database unavailable']);
        exit();
    }

    return $pdo;
}

// ── Standardised JSON responses ───────────────
function respond(bool $success, string $message, array $data = [], int $code = 200): void {
    http_response_code($code);
    echo json_encode([
        'success' => $success,
        'message' => $message,
        'data'    => $data,
    ]);
    exit();
}

function respond_ok(string $message, array $data = []): void {
    respond(true, $message, $data, 200);
}

function respond_err(string $message, int $code = 400, array $data = []): void {
    respond(false, $message, $data, $code);
}

// ── Generate a secure random token ────────────
function generate_token(int $bytes = 32): string {
    return bin2hex(random_bytes($bytes));
}

// ── Sanitise input ────────────────────────────
function clean(string $value): string {
    return htmlspecialchars(strip_tags(trim($value)), ENT_QUOTES, 'UTF-8');
}
