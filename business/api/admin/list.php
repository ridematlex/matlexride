<?php
/* GET /business/api/admin/list.php
   Header: X-Admin-Key: <ADMIN_API_KEY>
   Returns all business accounts for the admin panel's approval queue. */

require_once __DIR__ . '/../helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') respond_err('Method not allowed', 405);

require_admin_key();

$pdo = db_connect();
$stmt = $pdo->query("
    SELECT id, company_name, email, phone, tin, address, wallet_balance, status, approved_at, created_at
    FROM businesses
    ORDER BY (status = 'pending') DESC, created_at DESC
");
$rows = $stmt->fetchAll();

$businesses = array_map(fn($r) => [
    'id'             => (int)$r['id'],
    'company_name'   => $r['company_name'],
    'email'          => $r['email'],
    'phone'          => $r['phone'],
    'tin'            => $r['tin'],
    'address'        => $r['address'],
    'wallet_balance' => (float)$r['wallet_balance'],
    'status'         => $r['status'],
    'approved_at'    => $r['approved_at'],
    'created_at'     => $r['created_at'],
], $rows);

respond_ok('OK', ['businesses' => $businesses]);
