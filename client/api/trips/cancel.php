<?php
/* POST /client/api/trips/cancel.php
   Body: { trip_id, reason? }
   Only cancels trips in 'searching' or 'assigned' status. */

require_once __DIR__ . '/../helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond_err('Method not allowed', 405);

$user = require_auth('user');
$body = get_body();
require_fields($body, ['trip_id']);

$trip_id = (int)$body['trip_id'];
$reason  = isset($body['reason']) ? clean($body['reason']) : null;

$pdo = db_connect();

$stmt = $pdo->prepare("
    SELECT * FROM trips WHERE id = ? AND passenger_id = ? LIMIT 1
");
$stmt->execute([$trip_id, $user['id']]);
$trip = $stmt->fetch();

if (!$trip) respond_err('Trip not found', 404);

$cancellable = ['searching', 'assigned'];
if (!in_array($trip['status'], $cancellable)) {
    respond_err('Cannot cancel a trip that is ' . $trip['status']);
}

$pdo->beginTransaction();
try {
    $pdo->prepare("
        UPDATE trips SET status = 'cancelled' WHERE id = ?
    ")->execute([$trip_id]);

    $pdo->prepare("
        INSERT INTO trip_cancellations (trip_id, cancelled_by, reason)
        VALUES (?, 'passenger', ?)
    ")->execute([$trip_id, $reason]);

    // Free the driver if one was assigned
    if ($trip['driver_id']) {
        $pdo->prepare("
            UPDATE drivers SET status = 'online' WHERE id = ?
        ")->execute([$trip['driver_id']]);
    }

    $pdo->commit();
} catch (Exception $e) {
    $pdo->rollBack();
    respond_err('Cancellation failed — please try again', 500);
}

respond_ok('Trip cancelled');
