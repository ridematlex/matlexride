<?php
/* =============================================
   MATLEX RIDE — API Helpers
   Every endpoint: require_once __DIR__ . '/../../config.php';
                   require_once __DIR__ . '/../helpers.php';
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

// ── Rate limit by key (e.g. 'login:+256700000000') ─
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
        // Fix: run database.php once to create the table
    }
}

// ── Validate token, return actor row or abort ──────
function require_auth(string $actor_type = 'user'): array {
    $token = get_bearer_token();
    if (!$token) {
        respond_err('Unauthorised — no token provided', 401);
    }

    $pdo = db_connect();
    $stmt = $pdo->prepare("
        SELECT s.actor_id, s.actor_type, s.expires_at
        FROM   sessions s
        WHERE  s.token = ? AND s.actor_type = ?
        LIMIT  1
    ");
    $stmt->execute([hash_token($token), $actor_type]);
    $session = $stmt->fetch();

    if (!$session) {
        respond_err('Unauthorised — invalid token', 401);
    }
    if (new DateTime() > new DateTime($session['expires_at'])) {
        respond_err('Session expired — please log in again', 401);
    }

    // Fetch the actual actor record
    $table = $actor_type === 'driver' ? 'drivers' : 'users';
    $stmt2 = $pdo->prepare("SELECT * FROM `$table` WHERE id = ? LIMIT 1");
    $stmt2->execute([$session['actor_id']]);
    $actor = $stmt2->fetch();

    if (!$actor || $actor['status'] === 'suspended') {
        respond_err('Account suspended or not found', 403);
    }

    return $actor;
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

// ── Recalculate and update a driver's average rating ─
function recalculate_driver_rating(int $driver_id): void {
    $pdo = db_connect();
    $pdo->prepare("
        UPDATE drivers
        SET    rating = (
            SELECT ROUND(AVG(stars), 2) FROM ratings WHERE driver_id = ?
        )
        WHERE  id = ?
    ")->execute([$driver_id, $driver_id]);
}
