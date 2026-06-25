<?php
/* GET /business/api/auth/me.php
   Header: Authorization: Bearer <token>
   Returns the logged-in business's profile + dashboard stats.
   Used on app load to restore session and gate the dashboard
   on approval status. Works for pending/rejected too, so the
   front-end can render the right screen. */

require_once __DIR__ . '/../helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') respond_err('Method not allowed', 405);

$business = require_business_auth();
$pdo      = db_connect();

$rides_stmt = $pdo->prepare("
    SELECT COUNT(*) AS c FROM scheduled_trips
    WHERE business_id = ? AND status = 'completed'
      AND scheduled_at >= DATE_FORMAT(NOW(), '%Y-%m-01')
");
$rides_stmt->execute([$business['id']]);
$rides_this_month = (int)$rides_stmt->fetch()['c'];

$staff_stmt = $pdo->prepare("
    SELECT COUNT(*) AS c FROM business_staff WHERE business_id = ? AND status = 'active'
");
$staff_stmt->execute([$business['id']]);
$active_staff = (int)$staff_stmt->fetch()['c'];

respond_ok('OK', [
    'business' => [
        'id'               => $business['id'],
        'company_name'     => $business['company_name'],
        'email'            => $business['email'],
        'phone'            => $business['phone'],
        'tin'              => $business['tin'],
        'address'          => $business['address'],
        'status'           => $business['status'],
        'wallet_balance'   => (float)$business['wallet_balance'],
        'rides_this_month' => $rides_this_month,
        'active_staff'     => $active_staff,
    ],
]);
