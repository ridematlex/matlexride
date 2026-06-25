<?php
/* GET /client/api/trips/status.php?trip_id=123
   Polled by the client every 3 seconds while searching/in-progress.
   Returns current trip status + driver details when assigned. */

require_once __DIR__ . '/../helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') respond_err('Method not allowed', 405);

$user    = require_auth('user');
$trip_id = isset($_GET['trip_id']) ? (int)$_GET['trip_id'] : 0;
if (!$trip_id) respond_err('trip_id is required');

$pdo = db_connect();

$stmt = $pdo->prepare("
    SELECT
        t.id, t.status, t.ride_type, t.fare, t.discount_amount,
        t.pickup_address, t.dropoff_address, t.distance_km,
        t.created_at, t.assigned_at, t.started_at, t.completed_at,
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
$stmt->execute([$trip_id, $user['id']]);
$trip = $stmt->fetch();

if (!$trip) respond_err('Trip not found', 404);

$response = [
    'id'             => $trip['id'],
    'status'         => $trip['status'],
    'ride_type'      => $trip['ride_type'],
    'fare'           => (float)$trip['fare'],
    'distance_km'    => (float)$trip['distance_km'],
    'pickup_address' => $trip['pickup_address'],
    'dropoff_address'=> $trip['dropoff_address'],
    'created_at'     => $trip['created_at'],
    'completed_at'   => $trip['completed_at'],
    'driver'         => null,
];

if ($trip['driver_id']) {
    $response['driver'] = [
        'id'           => $trip['driver_id'],
        'name'         => $trip['driver_name'],
        'phone'        => $trip['driver_phone'],
        'plate'        => $trip['driver_plate'],
        'vehicle'      => $trip['driver_vehicle'] . ' · ' . $trip['driver_color'],
        'photo'        => $trip['driver_photo'],
        'rating'       => (float)$trip['driver_rating'],
        'total_trips'  => (int)$trip['driver_trips'],
        'current_lat'  => $trip['driver_lat'],
        'current_lng'  => $trip['driver_lng'],
        'assigned_at'  => $trip['assigned_at'],
    ];
}

respond_ok('OK', ['trip' => $response]);
