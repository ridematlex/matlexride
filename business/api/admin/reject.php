<?php
/* POST /business/api/admin/reject.php
   Header: X-Admin-Key: <ADMIN_API_KEY>
   Body: { business_id }
   Stopgap admin endpoint — no real admin login exists yet. */

require_once __DIR__ . '/../helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond_err('Method not allowed', 405);

require_admin_key();

$body = get_body();
require_fields($body, ['business_id']);

$pdo  = db_connect();
$stmt = $pdo->prepare("SELECT id FROM businesses WHERE id = ? LIMIT 1");
$stmt->execute([(int)$body['business_id']]);
$business = $stmt->fetch();

if (!$business) respond_err('Business not found', 404);

$pdo->prepare("UPDATE businesses SET status = 'rejected' WHERE id = ?")
    ->execute([$business['id']]);

$pdo->prepare("DELETE FROM sessions WHERE actor_id = ? AND actor_type = 'business'")
    ->execute([$business['id']]);

respond_ok('Business rejected');
