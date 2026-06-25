<?php
/* POST /business/api/trips/schedule.php
   Body: { pickup_address, dropoff_address, scheduled_at, ride_type?, staff_id?, fare? } */

require_once __DIR__ . '/../helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond_err('Method not allowed', 405);

$business = require_approved_business();
$body     = get_body();
require_fields($body, ['pickup_address', 'dropoff_address', 'scheduled_at']);

$pickup    = clean($body['pickup_address']);
$dropoff   = clean($body['dropoff_address']);
$scheduled = $body['scheduled_at'];
$ride_type = $body['ride_type'] ?? 'go';
$fare      = isset($body['fare']) ? (float)$body['fare'] : null;
$staff_id  = null;

if (!in_array($ride_type, ['go', 'comfort', 'xl', 'boda'], true)) {
    respond_err("ride_type must be one of: go, comfort, xl, boda");
}

$pdo = db_connect();

if (!empty($body['staff_id'])) {
    $staff    = require_owned_staff($pdo, $business['id'], (int)$body['staff_id']);
    $staff_id = $staff['id'];
}

$ins = $pdo->prepare("
    INSERT INTO scheduled_trips (business_id, staff_id, pickup_address, dropoff_address, ride_type, scheduled_at, fare)
    VALUES (?, ?, ?, ?, ?, ?, ?)
");
$ins->execute([$business['id'], $staff_id, $pickup, $dropoff, $ride_type, $scheduled, $fare]);

respond_ok('Trip scheduled', ['trip_id' => (int)$pdo->lastInsertId()]);
