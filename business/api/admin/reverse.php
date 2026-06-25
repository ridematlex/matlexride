<?php
/* POST /business/api/admin/reverse.php
   Header: X-Admin-Key: <ADMIN_API_KEY>
   Body: { transaction_id, reason? }
   Reverses a mistaken top-up by debiting the wallet back and logging
   an offsetting 'topup_reversal' entry — the original transaction is
   never edited or deleted, preserving the audit trail. */

require_once __DIR__ . '/../helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond_err('Method not allowed', 405);

require_admin_key();

$body = get_body();
require_fields($body, ['transaction_id']);

$pdo  = db_connect();
$stmt = $pdo->prepare("SELECT * FROM business_transactions WHERE id = ? LIMIT 1");
$stmt->execute([(int)$body['transaction_id']]);
$txn = $stmt->fetch();

if (!$txn) respond_err('Transaction not found', 404);
if ($txn['type'] !== 'topup') respond_err('Only top-up transactions can be reversed');

$already = $pdo->prepare("SELECT id FROM business_transactions WHERE related_transaction_id = ? LIMIT 1");
$already->execute([$txn['id']]);
if ($already->fetch()) respond_err('This top-up has already been reversed');

$reason = isset($body['reason']) && $body['reason'] !== '' ? clean($body['reason']) : 'Reversal of top-up #' . $txn['id'];

$pdo->beginTransaction();
try {
    $pdo->prepare("UPDATE businesses SET wallet_balance = wallet_balance - ? WHERE id = ?")
        ->execute([$txn['amount'], $txn['business_id']]);

    $pdo->prepare("
        INSERT INTO business_transactions (business_id, staff_id, related_transaction_id, type, amount, reason, status)
        VALUES (?, NULL, ?, 'topup_reversal', ?, ?, 'completed')
    ")->execute([$txn['business_id'], $txn['id'], $txn['amount'], $reason]);

    $pdo->commit();
} catch (Exception $e) {
    $pdo->rollBack();
    respond_err('Reversal failed — please try again', 500);
}

$bal = $pdo->prepare("SELECT wallet_balance FROM businesses WHERE id = ?");
$bal->execute([$txn['business_id']]);

respond_ok('Top-up reversed', [
    'wallet_balance' => (float)$bal->fetch()['wallet_balance'],
]);
