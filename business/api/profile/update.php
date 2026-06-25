<?php
/* POST /business/api/profile/update.php
   Body: { company_name?, phone?, tin?, address?, password?, current_password? }
   Password change requires current_password. */

require_once __DIR__ . '/../helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond_err('Method not allowed', 405);

$business = require_business_auth();
$body     = get_body();
$pdo      = db_connect();

$updates = [];
$params  = [];

foreach (['company_name', 'phone', 'tin', 'address'] as $field) {
    if (!empty($body[$field])) {
        $updates[] = "$field = ?";
        $params[]  = clean($body[$field]);
    }
}

if (!empty($body['password'])) {
    if (empty($body['current_password'])) {
        respond_err('current_password is required to change password');
    }
    if (!password_verify($body['current_password'], $business['password_hash'])) {
        respond_err('Current password is incorrect', 401);
    }
    if (strlen($body['password']) < 8) {
        respond_err('New password must be at least 8 characters');
    }
    $updates[] = 'password_hash = ?';
    $params[]  = password_hash($body['password'], PASSWORD_BCRYPT, ['cost' => 12]);
}

if (empty($updates)) respond_err('No changes provided');

$params[] = $business['id'];
$pdo->prepare("UPDATE businesses SET " . implode(', ', $updates) . " WHERE id = ?")->execute($params);

respond_ok('Profile updated successfully');
