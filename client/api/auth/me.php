<?php
/* GET /client/api/auth/me.php
   Header: Authorization: Bearer <token>
   Returns the logged-in user's profile.
   Used on app load to restore session. */

require_once __DIR__ . '/../helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') respond_err('Method not allowed', 405);

$user = require_auth('user');

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
    ],
]);
