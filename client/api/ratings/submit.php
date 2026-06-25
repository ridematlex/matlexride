<?php
/* POST /client/api/ratings/submit.php
   Body: { trip_id, stars, comment?, aspects?, tip_amount? } */

require_once __DIR__ . '/../helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond_err('Method not allowed', 405);

$user = require_auth('user');
$body = get_body();
require_fields($body, ['trip_id', 'stars']);

$trip_id   = (int)$body['trip_id'];
$stars     = max(1, min(5, (int)$body['stars']));
$comment   = isset($body['comment'])    ? clean($body['comment']) : null;
$aspects   = isset($body['aspects'])    ? $body['aspects']        : [];
$tip       = isset($body['tip_amount']) ? (float)$body['tip_amount'] : 0.0;

$pdo = db_connect();

// Verify trip belongs to user and is completed
$stmt = $pdo->prepare("
    SELECT * FROM trips
    WHERE id = ? AND passenger_id = ? AND status = 'completed'
    LIMIT 1
");
$stmt->execute([$trip_id, $user['id']]);
$trip = $stmt->fetch();

if (!$trip) respond_err('Trip not found or not yet completed', 404);
if (!$trip['driver_id']) respond_err('No driver assigned to this trip');

// Prevent duplicate rating
$exists = $pdo->prepare("SELECT id FROM ratings WHERE trip_id = ? LIMIT 1");
$exists->execute([$trip_id]);
if ($exists->fetch()) respond_err('You have already rated this trip');

$pdo->beginTransaction();
try {
    $pdo->prepare("
        INSERT INTO ratings (trip_id, passenger_id, driver_id, stars, comment, aspects, tip_amount)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ")->execute([
        $trip_id,
        $user['id'],
        $trip['driver_id'],
        $stars,
        $comment,
        !empty($aspects) ? json_encode($aspects) : null,
        $tip,
    ]);

    // Update driver's aggregated rating
    recalculate_driver_rating((int)$trip['driver_id']);

    // Add tip to driver earnings
    if ($tip > 0) {
        $pdo->prepare("
            UPDATE drivers SET earnings = earnings + ? WHERE id = ?
        ")->execute([$tip, $trip['driver_id']]);
    }

    $pdo->commit();
} catch (Exception $e) {
    $pdo->rollBack();
    respond_err('Rating submission failed — please try again', 500);
}

respond_ok('Rating submitted — thank you!');
