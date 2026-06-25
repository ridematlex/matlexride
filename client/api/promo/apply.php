<?php
/* POST /client/api/promo/apply.php
   Body: { code, fare }
   Validates the promo and returns the discount amount before booking. */

require_once __DIR__ . '/../helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond_err('Method not allowed', 405);

$user = require_auth('user');
$body = get_body();
require_fields($body, ['code', 'fare']);

$code = strtoupper(clean($body['code']));
$fare = (float)$body['fare'];
$pdo  = db_connect();

$stmt = $pdo->prepare("
    SELECT * FROM promo_codes
    WHERE code = ? AND is_active = 1
      AND (expires_at IS NULL OR expires_at > NOW())
      AND (max_uses IS NULL OR used_count < max_uses)
    LIMIT 1
");
$stmt->execute([$code]);
$promo = $stmt->fetch();

if (!$promo) respond_err('Invalid or expired promo code', 404);

// Check user hasn't used it
$used = $pdo->prepare("SELECT id FROM promo_uses WHERE promo_id = ? AND user_id = ? LIMIT 1");
$used->execute([$promo['id'], $user['id']]);
if ($used->fetch()) respond_err('You have already used this promo code');

if ($fare < $promo['min_fare']) {
    respond_err('Minimum fare of UGX ' . number_format($promo['min_fare']) . ' required for this code');
}

if ($promo['discount_type'] === 'percent') {
    $discount = round($fare * $promo['discount_value'] / 100);
    if ($promo['max_discount']) $discount = min($discount, $promo['max_discount']);
} else {
    $discount = $promo['discount_value'];
}

respond_ok('Promo code applied!', [
    'code'          => $code,
    'description'   => $promo['description'],
    'discount'      => $discount,
    'final_fare'    => max(0, $fare - $discount),
]);
