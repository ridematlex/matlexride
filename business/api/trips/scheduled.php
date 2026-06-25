<?php
/* GET /business/api/trips/scheduled.php
   Returns upcoming trips, soonest first. */

require_once __DIR__ . '/../helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') respond_err('Method not allowed', 405);

$business = require_approved_business();
$pdo      = db_connect();

$stmt = $pdo->prepare("
    SELECT t.id, t.staff_id, s.name AS staff_name, t.pickup_address, t.dropoff_address,
           t.ride_type, t.scheduled_at, t.fare, t.status, t.created_at
    FROM scheduled_trips t
    LEFT JOIN business_staff s ON s.id = t.staff_id
    WHERE t.business_id = ? AND t.status = 'upcoming'
    ORDER BY t.scheduled_at ASC
");
$stmt->execute([$business['id']]);
$rows = $stmt->fetchAll();

$trips = array_map(fn($r) => [
    'id'              => (int)$r['id'],
    'staff_id'        => $r['staff_id'] !== null ? (int)$r['staff_id'] : null,
    'staff_name'      => $r['staff_name'],
    'pickup_address'  => $r['pickup_address'],
    'dropoff_address' => $r['dropoff_address'],
    'ride_type'       => $r['ride_type'],
    'scheduled_at'    => $r['scheduled_at'],
    'fare'            => $r['fare'] !== null ? (float)$r['fare'] : null,
    'status'          => $r['status'],
    'created_at'      => $r['created_at'],
], $rows);

respond_ok('OK', ['trips' => $trips]);
