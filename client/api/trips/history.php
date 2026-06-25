<?php
/* GET /client/api/trips/history.php?page=1&status=all
   Returns paginated trip history with driver & payment info. */

require_once __DIR__ . '/../helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') respond_err('Method not allowed', 405);

$user   = require_auth('user');
$pdo    = db_connect();

$page     = max(1, (int)($_GET['page'] ?? 1));
$limit    = 15;
$offset   = ($page - 1) * $limit;
$status   = $_GET['status'] ?? 'all';

$where = "t.passenger_id = ?";
$params = [$user['id']];

if ($status !== 'all') {
    $allowed = ['completed', 'cancelled', 'searching', 'assigned', 'in_progress'];
    if (in_array($status, $allowed)) {
        $where  .= " AND t.status = ?";
        $params[] = $status;
    }
}

// Total count
$cnt = $pdo->prepare("SELECT COUNT(*) FROM trips t WHERE $where");
$cnt->execute($params);
$total = (int)$cnt->fetchColumn();

// Trip rows joined with driver + payment
$stmt = $pdo->prepare("
    SELECT
        t.id, t.status, t.ride_type,
        t.pickup_address, t.dropoff_address,
        t.distance_km, t.fare, t.discount_amount,
        t.created_at, t.completed_at,
        d.name          AS driver_name,
        d.license_plate AS driver_plate,
        d.vehicle_model AS driver_vehicle,
        d.profile_photo AS driver_photo,
        r.stars         AS rating_stars,
        p.method        AS payment_method,
        p.status        AS payment_status
    FROM trips t
    LEFT JOIN drivers  d ON d.id = t.driver_id
    LEFT JOIN ratings  r ON r.trip_id = t.id
    LEFT JOIN payments p ON p.trip_id = t.id
    WHERE $where
    ORDER BY t.created_at DESC
    LIMIT ? OFFSET ?
");
$params[] = $limit;
$params[] = $offset;
$stmt->execute($params);
$trips = $stmt->fetchAll();

// Summary stats
$stats = $pdo->prepare("
    SELECT
        COUNT(*) AS total_trips,
        COALESCE(SUM(fare), 0) AS total_spent,
        COALESCE(AVG(r.stars), 0) AS avg_rating_given
    FROM trips t
    LEFT JOIN ratings r ON r.trip_id = t.id AND r.passenger_id = t.passenger_id
    WHERE t.passenger_id = ? AND t.status = 'completed'
");
$stats->execute([$user['id']]);
$summary = $stats->fetch();

respond_ok('OK', [
    'trips'   => $trips,
    'summary' => [
        'total_trips'     => (int)$summary['total_trips'],
        'total_spent'     => (float)$summary['total_spent'],
        'avg_rating_given'=> round((float)$summary['avg_rating_given'], 1),
    ],
    'pagination' => [
        'page'       => $page,
        'limit'      => $limit,
        'total'      => $total,
        'total_pages'=> (int)ceil($total / $limit),
    ],
]);
