<?php
/* GET /business/api/transactions/list.php */

require_once __DIR__ . '/../helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') respond_err('Method not allowed', 405);

$business = require_approved_business();
$pdo      = db_connect();

$stmt = $pdo->prepare("
    SELECT tx.id, tx.staff_id, s.name AS staff_name, tx.type, tx.amount, tx.reason, tx.status, tx.created_at
    FROM business_transactions tx
    LEFT JOIN business_staff s ON s.id = tx.staff_id
    WHERE tx.business_id = ?
    ORDER BY tx.created_at DESC
");
$stmt->execute([$business['id']]);
$rows = $stmt->fetchAll();

$transactions = array_map(fn($r) => [
    'id'         => (int)$r['id'],
    'staff_id'   => $r['staff_id'] !== null ? (int)$r['staff_id'] : null,
    'staff_name' => $r['staff_name'],
    'type'       => $r['type'],
    'amount'     => (float)$r['amount'],
    'reason'     => $r['reason'],
    'status'     => $r['status'],
    'created_at' => $r['created_at'],
], $rows);

respond_ok('OK', ['transactions' => $transactions]);
