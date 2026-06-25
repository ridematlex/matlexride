<?php
/* POST /business/api/transactions/payout.php
   Body: { staff_id, type: 'credit'|'debit', amount, reason? }
   credit = business pays staff (business wallet -, staff wallet +)
   debit  = business reclaims from staff (staff wallet -, business wallet +) */

require_once __DIR__ . '/../helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond_err('Method not allowed', 405);

$business = require_approved_business();
$body     = get_body();
require_fields($body, ['staff_id', 'type', 'amount']);

$type   = $body['type'];
$amount = (float)$body['amount'];

if (!in_array($type, ['credit', 'debit'], true)) {
    respond_err("type must be 'credit' or 'debit'");
}
if ($amount <= 0) respond_err('Amount must be greater than zero');

$pdo   = db_connect();
$staff = require_owned_staff($pdo, $business['id'], (int)$body['staff_id']);
$reason = isset($body['reason']) ? clean($body['reason']) : ($type === 'credit' ? 'Payout to staff' : 'Reclaim from staff');

if ($type === 'debit' && (float)$staff['wallet_balance'] < $amount) {
    respond_err('Staff wallet balance is lower than the requested debit amount');
}
if ($type === 'credit' && (float)$business['wallet_balance'] < $amount) {
    respond_err('Business wallet balance is too low for this payout');
}

$pdo->beginTransaction();
try {
    if ($type === 'credit') {
        $pdo->prepare("UPDATE businesses SET wallet_balance = wallet_balance - ? WHERE id = ?")
            ->execute([$amount, $business['id']]);
        $pdo->prepare("UPDATE business_staff SET wallet_balance = wallet_balance + ? WHERE id = ?")
            ->execute([$amount, $staff['id']]);
    } else {
        $pdo->prepare("UPDATE business_staff SET wallet_balance = wallet_balance - ? WHERE id = ?")
            ->execute([$amount, $staff['id']]);
        $pdo->prepare("UPDATE businesses SET wallet_balance = wallet_balance + ? WHERE id = ?")
            ->execute([$amount, $business['id']]);
    }

    $tx_type = $type === 'credit' ? 'payout_credit' : 'payout_debit';
    $pdo->prepare("
        INSERT INTO business_transactions (business_id, staff_id, type, amount, reason, status)
        VALUES (?, ?, ?, ?, ?, 'completed')
    ")->execute([$business['id'], $staff['id'], $tx_type, $amount, $reason]);

    $pdo->commit();
} catch (Exception $e) {
    $pdo->rollBack();
    respond_err('Payout failed — please try again', 500);
}

$staff_bal    = $pdo->prepare("SELECT wallet_balance FROM business_staff WHERE id = ?");
$staff_bal->execute([$staff['id']]);
$business_bal = $pdo->prepare("SELECT wallet_balance FROM businesses WHERE id = ?");
$business_bal->execute([$business['id']]);

respond_ok('Payout processed successfully', [
    'staff_wallet_balance'    => (float)$staff_bal->fetch()['wallet_balance'],
    'business_wallet_balance' => (float)$business_bal->fetch()['wallet_balance'],
]);
