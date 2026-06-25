<?php
/* POST /client/api/profile/update.php
   Body: { name?, email?, password?, current_password? }
   Password change requires current_password. */

require_once __DIR__ . '/../helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond_err('Method not allowed', 405);

$user = require_auth('user');
$body = get_body();
$pdo  = db_connect();

$updates = [];
$params  = [];

if (!empty($body['name'])) {
    $updates[] = 'name = ?';
    $params[]  = clean($body['name']);
}

if (!empty($body['email'])) {
    $email = clean($body['email']);
    $chk = $pdo->prepare("SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1");
    $chk->execute([$email, $user['id']]);
    if ($chk->fetch()) respond_err('Email already in use by another account');
    $updates[] = 'email = ?';
    $params[]  = $email;
}

if (!empty($body['password'])) {
    if (empty($body['current_password'])) {
        respond_err('current_password is required to change password');
    }
    if (!password_verify($body['current_password'], $user['password_hash'])) {
        respond_err('Current password is incorrect', 401);
    }
    if (strlen($body['password']) < 8) {
        respond_err('New password must be at least 8 characters');
    }
    $updates[] = 'password_hash = ?';
    $params[]  = password_hash($body['password'], PASSWORD_BCRYPT, ['cost' => 12]);
}

if (empty($updates)) respond_err('No changes provided');

$params[] = $user['id'];
$pdo->prepare("UPDATE users SET " . implode(', ', $updates) . " WHERE id = ?")->execute($params);

respond_ok('Profile updated successfully');
