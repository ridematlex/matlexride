<?php
/* GET /client/api/trips/stream.php?trip_id=123
   Server-Sent Events — replaces 3-second client polling.
   Client opens one persistent connection; server pushes only when
   status or driver location actually changes.
   Connection caps at 120 s; client auto-reconnects (retry: directive).
   Nginx requirement: add `fastcgi_buffering off;` to the PHP location block. */

require_once __DIR__ . '/../../config.php';

// SSE headers — must come before any output
if (ob_get_level()) ob_end_clean();
header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');
header('X-Accel-Buffering: no'); // tell Nginx not to buffer this response
$cors = (APP_ENV === 'production') ? (getenv('APP_URL') ?: '') : '*';
header('Access-Control-Allow-Origin: ' . $cors);

// Auth — read token manually (helpers.php would overwrite Content-Type)
$raw_token   = null;
$auth_header = $_SERVER['HTTP_AUTHORIZATION']
             ?? (function_exists('apache_request_headers') ? (apache_request_headers()['Authorization'] ?? null) : null);
if ($auth_header && preg_match('/Bearer\s+(.+)$/i', $auth_header, $m)) {
    $raw_token = trim($m[1]);
}

function sse_error(string $msg): void {
    echo "event: error\ndata: " . json_encode(['message' => $msg]) . "\n\n";
    flush();
    exit();
}

// EventSource cannot set headers — accept token as query param fallback (HTTPS only)
if (!$raw_token && isset($_GET['_token'])) {
    $raw_token = $_GET['_token'];
}
if (!$raw_token) sse_error('Unauthorised');

$trip_id = isset($_GET['trip_id']) ? (int)$_GET['trip_id'] : 0;
if (!$trip_id) sse_error('trip_id required');

$pdo = db_connect();

// Validate session
$sess = $pdo->prepare("
    SELECT actor_id FROM sessions
    WHERE  token = ? AND actor_type = 'user' AND expires_at > NOW()
    LIMIT  1
");
$sess->execute([hash_token($raw_token)]);
$session = $sess->fetch();
if (!$session) sse_error('Unauthorised');

$user_id = (int)$session['actor_id'];

// Confirm trip belongs to this user
$own = $pdo->prepare("SELECT id FROM trips WHERE id = ? AND passenger_id = ? LIMIT 1");
$own->execute([$trip_id, $user_id]);
if (!$own->fetch()) sse_error('Trip not found');

// Tell client to reconnect after 3 s if the connection drops
echo "retry: 3000\n\n";
flush();

set_time_limit(120);      // max 2-minute connection window; client reconnects automatically
ignore_user_abort(false); // detect when the browser tab closes

$terminal  = ['completed', 'cancelled'];
$last_hash = '';

$stmt = $pdo->prepare("
    SELECT
        t.status,
        t.fare,
        t.distance_km,
        t.assigned_at,
        t.started_at,
        t.completed_at,
        d.id            AS driver_id,
        d.name          AS driver_name,
        d.phone         AS driver_phone,
        d.license_plate AS driver_plate,
        d.vehicle_model AS driver_vehicle,
        d.vehicle_color AS driver_color,
        d.profile_photo AS driver_photo,
        d.rating        AS driver_rating,
        d.total_trips   AS driver_trips,
        d.current_lat   AS driver_lat,
        d.current_lng   AS driver_lng
    FROM  trips t
    LEFT JOIN drivers d ON d.id = t.driver_id
    WHERE t.id = ? AND t.passenger_id = ?
    LIMIT 1
");

while (true) {
    if (connection_aborted()) break;

    $stmt->execute([$trip_id, $user_id]);
    $row = $stmt->fetch();
    if (!$row) break;

    $payload = json_encode($row);
    $hash    = md5($payload);

    if ($hash !== $last_hash) {
        // Data changed — push it
        echo "data: $payload\n\n";
        flush();
        $last_hash = $hash;
    } else {
        // No change — send a keep-alive comment to prevent proxy timeouts
        echo ": ping\n\n";
        flush();
    }

    if (in_array($row['status'], $terminal, true)) {
        echo "event: done\ndata: {}\n\n";
        flush();
        break;
    }

    sleep(2);
}
