<?php
/* POST /business/api/staff/remove.php
   Body: { staff_id } */

require_once __DIR__ . '/../helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond_err('Method not allowed', 405);

$business = require_approved_business();
$body     = get_body();
require_fields($body, ['staff_id']);

$pdo   = db_connect();
$staff = require_owned_staff($pdo, $business['id'], (int)$body['staff_id']);

$pdo->prepare("DELETE FROM business_staff WHERE id = ?")->execute([$staff['id']]);

respond_ok('Staff member removed');
