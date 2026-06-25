<?php
/* POST /client/api/auth/login.php
   Body: { phone, password } */

require_once __DIR__ . '/../helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond_err('Method not allowed', 405);

$body = get_body();
require_fields($body, ['phone', 'password']);

$phone    = clean($body['phone']);
$password = $body['password'];

check_rate_limit('login:' . $phone, 5, 900); // 5 attempts per 15 min per phone number

$pdo = db_connect();

$stmt = $pdo->prepare("SELECT * FROM users WHERE phone = ? LIMIT 1");
$stmt->execute([$phone]);
$user = $stmt->fetch();

if (!$user || !password_verify($password, $user['password_hash'])) {
    respond_err('Invalid phone number or password', 401);
}
if ($user['status'] === 'suspended') {
    respond_err('Account suspended — contact support', 403);
}

// Invalidate any expired sessions for this user
$pdo->prepare("
    DELETE FROM sessions WHERE actor_id = ? AND actor_type = 'user' AND expires_at < NOW()
")->execute([$user['id']]);

// Create fresh session
$token      = generate_token();
$expires_at = date('Y-m-d H:i:s', time() + TOKEN_EXPIRY);
$pdo->prepare("
    INSERT INTO sessions (actor_id, actor_type, token, expires_at) VALUES (?, 'user', ?, ?)
")->execute([$user['id'], hash_token($token), $expires_at]);

respond_ok('Login successful', [
    'token'      => $token,
    'expires_at' => $expires_at,
    'user'       => [
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
