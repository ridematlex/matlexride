<?php
/* GET /business/api/admin/transactions.php?business_id=123
   Header: X-Admin-Key: <ADMIN_API_KEY>
   Lists a business's transactions, flagging which top-ups have
   already been reversed so the admin UI can hide the Reverse button. */

require_once __DIR__ . '/../helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') respond_err('Method not allowed', 405);

require_admin_key();

$business_id = (int)($_GET['business_id'] ?? 0);
if (!$business_id) respond_err('business_id is required', 422);

$pdo  = db_connect();
$stmt = $pdo->prepare("SELECT id FROM businesses WHERE id = ? LIMIT 1");
$stmt->execute([$business_id]);
if (!$stmt->fetch()) respond_err('Business not found', 404);

$rows = $pdo->prepare("
    SELECT tx.id, tx.staff_id, s.name AS staff_name, tx.type, tx.amount, tx.reason,
           tx.status, tx.related_transaction_id, tx.created_at
    FROM business_transactions tx
    LEFT JOIN business_staff s ON s.id = tx.staff_id
    WHERE tx.business_id = ?
    ORDER BY tx.created_at DESC
");
$rows->execute([$business_id]);
$all = $rows->fetchAll();

$reversedIds = [];
foreach ($all as $r) {
    if ($r['related_transaction_id'] !== null) $reversedIds[(int)$r['related_transaction_id']] = true;
}

$transactions = array_map(fn($r) => [
    'id'                     => (int)$r['id'],
    'staff_id'               => $r['staff_id'] !== null ? (int)$r['staff_id'] : null,
    'staff_name'             => $r['staff_name'],
    'type'                   => $r['type'],
    'amount'                 => (float)$r['amount'],
    'reason'                 => $r['reason'],
    'status'                 => $r['status'],
    'related_transaction_id' => $r['related_transaction_id'] !== null ? (int)$r['related_transaction_id'] : null,
    'is_reversed'            => isset($reversedIds[(int)$r['id']]),
    'created_at'             => $r['created_at'],
], $all);

respond_ok('OK', ['transactions' => $transactions]);
