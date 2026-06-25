<?php
/* POST /business/api/auth/register.php
   Body: { company_name, email, password, phone?, tin?, address? }
   New accounts start as status='pending' — admin must approve before
   approval-gated endpoints will return data. */

require_once __DIR__ . '/../helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond_err('Method not allowed', 405);

$body = get_body();
require_fields($body, ['company_name', 'email', 'password']);

check_rate_limit('biz_reg:' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'), 10, 3600);

$company_name = clean($body['company_name']);
$email        = clean($body['email']);
$password     = $body['password'];
$phone        = isset($body['phone'])   ? clean($body['phone'])   : null;
$tin          = isset($body['tin'])     ? clean($body['tin'])     : null;
$address      = isset($body['address']) ? clean($body['address']) : null;

if (strlen($password) < 8) {
    respond_err('Password must be at least 8 characters');
}

$pdo = db_connect();

$chk = $pdo->prepare("SELECT id FROM businesses WHERE email = ? LIMIT 1");
$chk->execute([$email]);
if ($chk->fetch()) respond_err('Email already registered');

$hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

$ins = $pdo->prepare("
    INSERT INTO businesses (company_name, email, password_hash, phone, tin, address)
    VALUES (?, ?, ?, ?, ?, ?)
");
$ins->execute([$company_name, $email, $hash, $phone, $tin, $address]);
$business_id = (int)$pdo->lastInsertId();

$token      = generate_token();
$expires_at = date('Y-m-d H:i:s', time() + TOKEN_EXPIRY);
$pdo->prepare("
    INSERT INTO sessions (actor_id, actor_type, token, expires_at) VALUES (?, 'business', ?, ?)
")->execute([$business_id, hash_token($token), $expires_at]);

respond_ok('Account created — pending admin approval', [
    'token'      => $token,
    'expires_at' => $expires_at,
    'business'   => [
        'id'             => $business_id,
        'company_name'   => $company_name,
        'email'          => $email,
        'phone'          => $phone,
        'status'         => 'pending',
        'wallet_balance' => 0.00,
    ],
]);
