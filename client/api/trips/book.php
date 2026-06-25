<?php
/* POST /client/api/trips/book.php
   Body: { pickup_address, dropoff_address, ride_type,
           pickup_lat?, pickup_lng?, dropoff_lat?, dropoff_lng?,
           distance_km?, promo_code? } */

require_once __DIR__ . '/../helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond_err('Method not allowed', 405);

$user = require_auth('user');
$body = get_body();
require_fields($body, ['pickup_address', 'dropoff_address', 'ride_type']);

$ride_types = ['go', 'comfort', 'xl', 'boda'];
if (!in_array($body['ride_type'], $ride_types)) {
    respond_err('Invalid ride_type. Must be: go, comfort, xl or boda');
}

// Base fares per km (UGX)
$rate_per_km = ['go' => 1200, 'comfort' => 1600, 'xl' => 2200, 'boda' => 600];
$base_fare   = ['go' => 3000, 'comfort' => 4000, 'xl' => 6000, 'boda' => 1500];

$distance_km = isset($body['distance_km']) ? (float)$body['distance_km'] : 5.0;
$ride_type   = $body['ride_type'];
$fare        = round($base_fare[$ride_type] + $distance_km * $rate_per_km[$ride_type]);

$discount      = 0;
$promo_code_id = null;

// ── Apply promo code if provided ──────────────
if (!empty($body['promo_code'])) {
    $pdo   = db_connect();
    $code  = strtoupper(clean($body['promo_code']));
    $promo = $pdo->prepare("
        SELECT * FROM promo_codes
        WHERE code = ? AND is_active = 1
          AND (expires_at IS NULL OR expires_at > NOW())
          AND (max_uses IS NULL OR used_count < max_uses)
        LIMIT 1
    ");
    $promo->execute([$code]);
    $promo_row = $promo->fetch();

    if ($promo_row) {
        // Check user hasn't used it before
        $used = $pdo->prepare("SELECT id FROM promo_uses WHERE promo_id = ? AND user_id = ? LIMIT 1");
        $used->execute([$promo_row['id'], $user['id']]);

        if (!$used->fetch() && $fare >= $promo_row['min_fare']) {
            if ($promo_row['discount_type'] === 'percent') {
                $discount = round($fare * $promo_row['discount_value'] / 100);
                if ($promo_row['max_discount']) {
                    $discount = min($discount, $promo_row['max_discount']);
                }
            } else {
                $discount = $promo_row['discount_value'];
            }
            $promo_code_id = $promo_row['id'];
        }
    }
}

$final_fare = max(0, $fare - $discount);
$pdo = db_connect();

$ins = $pdo->prepare("
    INSERT INTO trips
        (passenger_id, pickup_address, pickup_lat, pickup_lng,
         dropoff_address, dropoff_lat, dropoff_lng,
         distance_km, fare, ride_type, discount_amount, promo_code_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'searching')
");
$ins->execute([
    $user['id'],
    clean($body['pickup_address']),
    $body['pickup_lat']   ?? null,
    $body['pickup_lng']   ?? null,
    clean($body['dropoff_address']),
    $body['dropoff_lat']  ?? null,
    $body['dropoff_lng']  ?? null,
    $distance_km,
    $final_fare,
    $ride_type,
    $discount,
    $promo_code_id,
]);
$trip_id = (int)$pdo->lastInsertId();

// Record promo use
if ($promo_code_id) {
    $pdo->prepare("
        INSERT INTO promo_uses (promo_id, user_id, trip_id) VALUES (?, ?, ?)
    ")->execute([$promo_code_id, $user['id'], $trip_id]);

    $pdo->prepare("
        UPDATE promo_codes SET used_count = used_count + 1 WHERE id = ?
    ")->execute([$promo_code_id]);
}

respond_ok('Ride booked — searching for driver', [
    'trip' => [
        'id'               => $trip_id,
        'status'           => 'searching',
        'ride_type'        => $ride_type,
        'pickup_address'   => $body['pickup_address'],
        'dropoff_address'  => $body['dropoff_address'],
        'distance_km'      => $distance_km,
        'fare'             => $final_fare,
        'original_fare'    => $fare,
        'discount'         => $discount,
    ],
]);
