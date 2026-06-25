<?php
/* POST /business/api/staff/invite.php
   Body: { name, phone, email?, department? } */

require_once __DIR__ . '/../helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond_err('Method not allowed', 405);

$business = require_approved_business();
$body     = get_body();
require_fields($body, ['name', 'phone']);

$name       = clean($body['name']);
$phone      = clean($body['phone']);
$email      = isset($body['email'])      ? clean($body['email'])      : null;
$department = isset($body['department']) ? clean($body['department']) : null;

$pdo = db_connect();
$ins = $pdo->prepare("
    INSERT INTO business_staff (business_id, name, phone, email, department)
    VALUES (?, ?, ?, ?, ?)
");
$ins->execute([$business['id'], $name, $phone, $email, $department]);

respond_ok('Staff member added', ['staff_id' => (int)$pdo->lastInsertId()]);
