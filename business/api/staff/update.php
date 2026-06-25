<?php
/* POST /business/api/staff/update.php
   Body: { staff_id, name?, phone?, email?, department?, status? } */

require_once __DIR__ . '/../helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond_err('Method not allowed', 405);

$business = require_approved_business();
$body     = get_body();
require_fields($body, ['staff_id']);

$pdo   = db_connect();
$staff = require_owned_staff($pdo, $business['id'], (int)$body['staff_id']);

$updates = [];
$params  = [];

foreach (['name', 'phone', 'email', 'department'] as $field) {
    if (isset($body[$field])) {
        $updates[] = "$field = ?";
        $params[]  = clean($body[$field]);
    }
}

if (isset($body['status'])) {
    if (!in_array($body['status'], ['active', 'suspended'], true)) {
        respond_err("status must be 'active' or 'suspended'");
    }
    $updates[] = 'status = ?';
    $params[]  = $body['status'];
}

if (empty($updates)) respond_err('No changes provided');

$params[] = $staff['id'];
$pdo->prepare("UPDATE business_staff SET " . implode(', ', $updates) . " WHERE id = ?")->execute($params);

respond_ok('Staff member updated');
