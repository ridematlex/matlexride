<?php
/* POST /business/api/auth/logout.php
   Header: Authorization: Bearer <token> */

require_once __DIR__ . '/../helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond_err('Method not allowed', 405);

$token = get_bearer_token();
if (!$token) respond_err('No token provided', 401);

$pdo = db_connect();
$pdo->prepare("DELETE FROM sessions WHERE token = ? AND actor_type = 'business'")->execute([hash_token($token)]);

respond_ok('Logged out successfully');
