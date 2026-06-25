<?php
/* POST /business/api/auth/login.php
   Body: { email, password }
   Login succeeds for pending/approved/rejected — front-end uses
   the returned status to decide whether to show the dashboard or
   a "pending approval" / "rejected" screen. */

require_once __DIR__ . '/../helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond_err('Method not allowed', 405);

$body = get_body();
require_fields($body, ['email', 'password']);

$email    = clean($body['email']);
$password = $body['password'];

check_rate_limit('biz_login:' . $email, 5, 900);

$pdo = db_connect();

$stmt = $pdo->prepare("SELECT * FROM businesses WHERE email = ? LIMIT 1");
$stmt->execute([$email]);
$business = $stmt->fetch();

if (!$business || !password_verify($password, $business['password_hash'])) {
    respond_err('Invalid email or password', 401);
}
if ($business['status'] === 'rejected') {
    respond_err('This business account has been rejected — contact support', 403);
}

$pdo->prepare("
    DELETE FROM sessions WHERE actor_id = ? AND actor_type = 'business' AND expires_at < NOW()
")->execute([$business['id']]);

$token      = generate_token();
$expires_at = date('Y-m-d H:i:s', time() + TOKEN_EXPIRY);
$pdo->prepare("
    INSERT INTO sessions (actor_id, actor_type, token, expires_at) VALUES (?, 'business', ?, ?)
")->execute([$business['id'], hash_token($token), $expires_at]);

respond_ok('Login successful', [
    'token'      => $token,
    'expires_at' => $expires_at,
    'business'   => [
        'id'             => $business['id'],
        'company_name'   => $business['company_name'],
        'email'          => $business['email'],
        'phone'          => $business['phone'],
        'tin'            => $business['tin'],
        'address'        => $business['address'],
        'status'         => $business['status'],
        'wallet_balance' => (float)$business['wallet_balance'],
    ],
]);
