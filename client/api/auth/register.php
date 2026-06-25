<?php
/* POST /client/api/auth/register.php
   Body: { name, phone, password, email?, referral_code? } */

require_once __DIR__ . '/../helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond_err('Method not allowed', 405);

$body = get_body();
require_fields($body, ['name', 'phone', 'password']);

check_rate_limit('reg:' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'), 10, 3600); // 10 registrations per IP per hour

$name     = clean($body['name']);
$phone    = clean($body['phone']);
$password = $body['password'];
$email    = isset($body['email']) ? clean($body['email']) : null;
$ref_code = isset($body['referral_code']) ? strtoupper(clean($body['referral_code'])) : null;

if (strlen($password) < 8) {
    respond_err('Password must be at least 8 characters');
}

$pdo = db_connect();

// Check phone uniqueness
$chk = $pdo->prepare("SELECT id FROM users WHERE phone = ? LIMIT 1");
$chk->execute([$phone]);
if ($chk->fetch()) respond_err('Phone number already registered');

// Check email uniqueness if provided
if ($email) {
    $chk2 = $pdo->prepare("SELECT id FROM users WHERE email = ? LIMIT 1");
    $chk2->execute([$email]);
    if ($chk2->fetch()) respond_err('Email already in use');
}

// Resolve referral
$referred_by = null;
if ($ref_code) {
    $r = $pdo->prepare("SELECT id FROM users WHERE referral_code = ? LIMIT 1");
    $r->execute([$ref_code]);
    $row = $r->fetch();
    if ($row) $referred_by = $row['id'];
}

// Generate unique referral code for new user
do {
    $my_ref = strtoupper(substr($name, 0, 3)) . strtoupper(bin2hex(random_bytes(3)));
    $dup = $pdo->prepare("SELECT id FROM users WHERE referral_code = ? LIMIT 1");
    $dup->execute([$my_ref]);
} while ($dup->fetch());

$hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

$ins = $pdo->prepare("
    INSERT INTO users (name, phone, email, password_hash, referral_code, referred_by)
    VALUES (?, ?, ?, ?, ?, ?)
");
$ins->execute([$name, $phone, $email, $hash, $my_ref, $referred_by]);
$user_id = (int)$pdo->lastInsertId();

// Create session token
$token      = generate_token();
$expires_at = date('Y-m-d H:i:s', time() + TOKEN_EXPIRY);
$pdo->prepare("
    INSERT INTO sessions (actor_id, actor_type, token, expires_at) VALUES (?, 'user', ?, ?)
")->execute([$user_id, hash_token($token), $expires_at]);

// Add welcome wallet credit
if ($referred_by) {
    $pdo->prepare("UPDATE users SET wallet_balance = wallet_balance + 5000 WHERE id = ?")->execute([$user_id]);
    $pdo->prepare("UPDATE users SET wallet_balance = wallet_balance + 5000 WHERE id = ?")->execute([$referred_by]);
}

respond_ok('Account created successfully', [
    'token'      => $token,
    'expires_at' => $expires_at,
    'user'       => [
        'id'             => $user_id,
        'name'           => $name,
        'phone'          => $phone,
        'email'          => $email,
        'referral_code'  => $my_ref,
        'wallet_balance' => $referred_by ? 5000.00 : 0.00,
        'rating'         => 5.00,
    ],
]);
