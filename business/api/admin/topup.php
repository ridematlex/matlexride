<?php
/* POST /business/api/admin/topup.php
   Header: X-Admin-Key: <ADMIN_API_KEY>
   Body: { business_id, amount, reason? }
   Admin-confirmed wallet credit, used after the business has paid
   outside the app (e.g. mobile money) and admin has verified receipt. */

require_once __DIR__ . '/../helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond_err('Method not allowed', 405);

require_admin_key();

$body = get_body();
require_fields($body, ['business_id', 'amount']);

$amount = (float)$body['amount'];
if ($amount <= 0) respond_err('Amount must be greater than zero');

$reason = isset($body['reason']) && $body['reason'] !== '' ? clean($body['reason']) : 'Admin top-up — payment confirmed';

$pdo = db_connect();
$stmt = $pdo->prepare("SELECT id FROM businesses WHERE id = ? LIMIT 1");
$stmt->execute([(int)$body['business_id']]);
$business = $stmt->fetch();
if (!$business) respond_err('Business not found', 404);

$pdo->beginTransaction();
try {
    $pdo->prepare("UPDATE businesses SET wallet_balance = wallet_balance + ? WHERE id = ?")
        ->execute([$amount, $business['id']]);

    $pdo->prepare("
        INSERT INTO business_transactions (business_id, staff_id, type, amount, reason, status)
        VALUES (?, NULL, 'topup', ?, ?, 'completed')
    ")->execute([$business['id'], $amount, $reason]);

    $pdo->commit();
} catch (Exception $e) {
    $pdo->rollBack();
    respond_err('Top-up failed — please try again', 500);
}

$bal = $pdo->prepare("SELECT wallet_balance FROM businesses WHERE id = ?");
$bal->execute([$business['id']]);

respond_ok('Wallet topped up successfully', [
    'wallet_balance' => (float)$bal->fetch()['wallet_balance'],
]);
