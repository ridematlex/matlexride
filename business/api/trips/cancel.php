<?php
/* POST /business/api/trips/cancel.php
   Body: { trip_id } */

require_once __DIR__ . '/../helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond_err('Method not allowed', 405);

$business = require_approved_business();
$body     = get_body();
require_fields($body, ['trip_id']);

$pdo  = db_connect();
$stmt = $pdo->prepare("SELECT * FROM scheduled_trips WHERE id = ? AND business_id = ? LIMIT 1");
$stmt->execute([(int)$body['trip_id'], $business['id']]);
$trip = $stmt->fetch();

if (!$trip) respond_err('Trip not found', 404);
if ($trip['status'] !== 'upcoming') respond_err('Only upcoming trips can be cancelled');

$pdo->prepare("UPDATE scheduled_trips SET status = 'cancelled' WHERE id = ?")->execute([$trip['id']]);

respond_ok('Trip cancelled');
