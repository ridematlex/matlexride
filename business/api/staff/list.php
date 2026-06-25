<?php
/* GET /business/api/staff/list.php
   Header: Authorization: Bearer <token> */

require_once __DIR__ . '/../helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') respond_err('Method not allowed', 405);

$business = require_approved_business();
$pdo      = db_connect();

$stmt = $pdo->prepare("
    SELECT id, name, phone, email, department, wallet_balance, status, created_at
    FROM business_staff WHERE business_id = ? ORDER BY created_at DESC
");
$stmt->execute([$business['id']]);
$rows = $stmt->fetchAll();

$staff = array_map(fn($r) => [
    'id'             => (int)$r['id'],
    'name'           => $r['name'],
    'phone'          => $r['phone'],
    'email'          => $r['email'],
    'department'     => $r['department'],
    'wallet_balance' => (float)$r['wallet_balance'],
    'status'         => $r['status'],
    'created_at'     => $r['created_at'],
], $rows);

respond_ok('OK', ['staff' => $staff]);
