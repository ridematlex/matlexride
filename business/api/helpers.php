<?php
/* =============================================
   MATLEX RIDE — Business API Helpers
   Every endpoint: require_once __DIR__ . '/../helpers.php';
   ============================================= */

require_once __DIR__ . '/../../config.php';

set_api_headers();

// ── Extract Bearer token from Authorization header ──
function get_bearer_token(): ?string {
    $header = $_SERVER['HTTP_AUTHORIZATION']
           ?? apache_request_headers()['Authorization']
           ?? null;

    if ($header && preg_match('/Bearer\s+(.+)$/i', $header, $m)) {
        return $m[1];
    }
    return null;
}

// ── Rate limit by key (e.g. 'biz_login:name@company.com') ─
function check_rate_limit(string $key, int $max = 5, int $window = 900): void {
    try {
        $pdo = db_connect();
        if (random_int(1, 50) === 1) {
            $pdo->prepare("DELETE FROM rate_limits WHERE window_start < DATE_SUB(NOW(), INTERVAL ? SECOND)")
                ->execute([$window]);
        }
        $pdo->prepare("
            INSERT INTO rate_limits (rl_key, attempts, window_start) VALUES (?, 1, NOW())
            ON DUPLICATE KEY UPDATE
                attempts     = IF(window_start < DATE_SUB(NOW(), INTERVAL ? SECOND), 1, attempts + 1),
                window_start = IF(window_start < DATE_SUB(NOW(), INTERVAL ? SECOND), NOW(), window_start)
        ")->execute([$key, $window, $window]);

        $row = $pdo->prepare("SELECT attempts FROM rate_limits WHERE rl_key = ? LIMIT 1");
        $row->execute([$key]);
        $data = $row->fetch();
        if ($data && (int)$data['attempts'] > $max) {
            respond_err('Too many attempts — please wait before trying again', 429);
        }
    } catch (PDOException $e) {
        // rate_limits table missing — fail open and let the request through
    }
}

// ── Validate token, return business row or abort ───
// Does NOT enforce approval status — use require_approved_business() for that.
function require_business_auth(): array {
    $token = get_bearer_token();
    if (!$token) {
        respond_err('Unauthorised — no token provided', 401);
    }

    $pdo = db_connect();
    $stmt = $pdo->prepare("
        SELECT s.actor_id, s.actor_type, s.expires_at
        FROM   sessions s
        WHERE  s.token = ? AND s.actor_type = 'business'
        LIMIT  1
    ");
    $stmt->execute([hash_token($token)]);
    $session = $stmt->fetch();

    if (!$session) {
        respond_err('Unauthorised — invalid token', 401);
    }
    if (new DateTime() > new DateTime($session['expires_at'])) {
        respond_err('Session expired — please log in again', 401);
    }

    $stmt2 = $pdo->prepare("SELECT * FROM businesses WHERE id = ? LIMIT 1");
    $stmt2->execute([$session['actor_id']]);
    $business = $stmt2->fetch();

    if (!$business || $business['status'] === 'rejected') {
        respond_err('Account not found or rejected', 403);
    }

    return $business;
}

// ── Same as above, but also blocks non-approved accounts ──
// Use on every data-bearing dashboard endpoint (staff, trips, transactions, etc.)
function require_approved_business(): array {
    $business = require_business_auth();
    if ($business['status'] !== 'approved') {
        respond_err('Your business account is pending admin approval', 403, [
            'status' => $business['status'],
        ]);
    }
    return $business;
}

// ── Read & decode JSON request body ───────────────
function get_body(): array {
    $raw = file_get_contents('php://input');
    $body = json_decode($raw, true);
    return is_array($body) ? $body : [];
}

// ── Required field check ──────────────────────────
function require_fields(array $body, array $fields): void {
    foreach ($fields as $f) {
        if (!isset($body[$f]) || $body[$f] === '') {
            respond_err("Field '$f' is required", 422);
        }
    }
}

// ── Stopgap admin auth (header: X-Admin-Key) until real admin sessions exist ──
function require_admin_key(): void {
    $key = $_SERVER['HTTP_X_ADMIN_KEY'] ?? apache_request_headers()['X-Admin-Key'] ?? null;
    if (!$key || !hash_equals(ADMIN_API_KEY, $key)) {
        respond_err('Unauthorised — invalid admin key', 401);
    }
}

// ── Verify a staff member belongs to this business (or abort) ──
function require_owned_staff(PDO $pdo, int $business_id, int $staff_id): array {
    $stmt = $pdo->prepare("SELECT * FROM business_staff WHERE id = ? AND business_id = ? LIMIT 1");
    $stmt->execute([$staff_id, $business_id]);
    $staff = $stmt->fetch();
    if (!$staff) respond_err('Staff member not found', 404);
    return $staff;
}
