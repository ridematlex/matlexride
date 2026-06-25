<?php
/* GET /client/api/profile/get.php
   Returns full profile: user info + saved places + recent stats. */

require_once __DIR__ . '/../helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') respond_err('Method not allowed', 405);

$user = require_auth('user');
$pdo  = db_connect();

// Saved places
$places = $pdo->prepare("
    SELECT id, label, address, lat, lng FROM saved_places WHERE user_id = ? ORDER BY label
");
$places->execute([$user['id']]);

// Trip stats
$stats = $pdo->prepare("
    SELECT COUNT(*) AS total_trips, COALESCE(SUM(fare),0) AS total_spent
    FROM trips WHERE passenger_id = ? AND status = 'completed'
");
$stats->execute([$user['id']]);
$s = $stats->fetch();

// Referral count
$refs = $pdo->prepare("SELECT COUNT(*) FROM users WHERE referred_by = ?");
$refs->execute([$user['id']]);

respond_ok('OK', [
    'user' => [
        'id'             => $user['id'],
        'name'           => $user['name'],
        'phone'          => $user['phone'],
        'email'          => $user['email'],
        'profile_photo'  => $user['profile_photo'],
        'wallet_balance' => (float)$user['wallet_balance'],
        'rating'         => (float)$user['rating'],
        'referral_code'  => $user['referral_code'],
        'total_trips'    => (int)$s['total_trips'],
        'total_spent'    => (float)$s['total_spent'],
        'referrals'      => (int)$refs->fetchColumn(),
    ],
    'saved_places' => $places->fetchAll(),
]);
