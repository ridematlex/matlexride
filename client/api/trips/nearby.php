<?php
/* GET /client/api/trips/nearby.php?lat=0.3&lng=32.6&radius=5
   Returns online drivers within radius km of given coordinates.
   Falls back to all online drivers if no coords provided. */

require_once __DIR__ . '/../helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') respond_err('Method not allowed', 405);

require_auth('user');

$pdo    = db_connect();
$lat    = isset($_GET['lat'])    ? (float)$_GET['lat']    : null;
$lng    = isset($_GET['lng'])    ? (float)$_GET['lng']    : null;
$radius = isset($_GET['radius']) ? (float)$_GET['radius'] : 5.0; // km

if ($lat !== null && $lng !== null) {
    // Bounding box pre-filter using the index, then exact Haversine on the small result set.
    // LEAST(1,...) guards against floating-point rounding errors at ACOS boundary.
    $lat_delta = $radius / 111.0;
    $lng_delta = $radius / (111.0 * max(cos(deg2rad($lat)), 0.01));

    $stmt = $pdo->prepare("
        SELECT
            id, name, vehicle_type, vehicle_model, vehicle_color,
            license_plate, profile_photo, rating, total_trips,
            current_lat, current_lng,
            (6371 * ACOS(LEAST(1,
                COS(RADIANS(?)) * COS(RADIANS(current_lat)) *
                COS(RADIANS(current_lng) - RADIANS(?)) +
                SIN(RADIANS(?)) * SIN(RADIANS(current_lat))
            ))) AS distance_km
        FROM  drivers
        WHERE status = 'online'
          AND current_lat IS NOT NULL
          AND current_lng  IS NOT NULL
          AND current_lat  BETWEEN ? AND ?
          AND current_lng  BETWEEN ? AND ?
        HAVING distance_km <= ?
        ORDER BY distance_km ASC
        LIMIT 20
    ");
    $stmt->execute([
        $lat, $lng, $lat,
        $lat - $lat_delta, $lat + $lat_delta,
        $lng - $lng_delta, $lng + $lng_delta,
        $radius,
    ]);
} else {
    // No coords — return all online drivers
    $stmt = $pdo->prepare("
        SELECT id, name, vehicle_type, vehicle_model, vehicle_color,
               license_plate, profile_photo, rating, total_trips,
               current_lat, current_lng, NULL AS distance_km
        FROM   drivers
        WHERE  status = 'online'
        ORDER BY RAND()
        LIMIT 20
    ");
    $stmt->execute();
}

$drivers = $stmt->fetchAll();

respond_ok('OK', [
    'count'   => count($drivers),
    'drivers' => $drivers,
]);
