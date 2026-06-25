<?php
/* =============================================
   MATLEX RIDE — Database Setup
   Run once: http://localhost/matlex/database.php
   Safe to re-run — all statements use IF NOT EXISTS.
   ============================================= */

// Apache SetEnv populates $_SERVER, not the OS env — check $_SERVER first
function _dbenv(string $key, string $default = ''): string {
    return $_SERVER[$key] ?? $_ENV[$key] ?? getenv($key) ?: $default;
}
define('DB_HOST', _dbenv('DB_HOST', 'localhost'));
define('DB_NAME', _dbenv('DB_NAME', 'matlex_db'));
define('DB_PORT', (int)_dbenv('DB_PORT', '3306'));

// Root/admin credentials, used only to run this setup script
define('SETUP_USER', _dbenv('SETUP_USER', 'root'));
define('SETUP_PASS', _dbenv('SETUP_PASS', ''));

// App credentials — must match config.php exactly; this script creates/grants this user
define('APP_DB_USER', _dbenv('DB_USER', 'matlex_user'));
define('APP_DB_PASS', _dbenv('DB_PASS', 'Matlex_user1@mysql123'));

// ── Connect without selecting a DB first ──────
try {
    $pdo = new PDO(
        sprintf('mysql:host=%s;port=%d;charset=utf8mb4', DB_HOST, DB_PORT),
        SETUP_USER, SETUP_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
} catch (PDOException $e) {
    die('<b>Cannot connect to MySQL:</b> ' . $e->getMessage());
}

$log = [];

function run(PDO $pdo, string $sql, string $label): void {
    global $log;
    try {
        $pdo->exec($sql);
        $log[] = "✅  $label";
    } catch (PDOException $e) {
        $log[] = "❌  $label — " . $e->getMessage();
    }
}

// Like run(), but treats "already exists" duplicate column/index errors
// (1060/1061) as an already-applied skip rather than a failure — needed
// because ALTER TABLE ADD COLUMN/ADD INDEX has no IF NOT EXISTS clause.
function run_once(PDO $pdo, string $sql, string $label): void {
    global $log;
    try {
        $pdo->exec($sql);
        $log[] = "✅  $label";
    } catch (PDOException $e) {
        if (in_array($e->errorInfo[1] ?? null, [1060, 1061], true)) {
            $log[] = "✅  $label (already applied)";
        } else {
            $log[] = "❌  $label — " . $e->getMessage();
        }
    }
}

// ── 1. Create database ────────────────────────
run($pdo,
    "CREATE DATABASE IF NOT EXISTS `" . DB_NAME . "`
     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
    'Database: ' . DB_NAME
);
$pdo->exec("USE `" . DB_NAME . "`");

// ── 1b. Create the app's MySQL user + grant it access ─
// This is the account config.php connects as for every API request.
run($pdo,
    "CREATE USER IF NOT EXISTS '" . APP_DB_USER . "'@'localhost' IDENTIFIED BY '" . addslashes(APP_DB_PASS) . "'",
    'MySQL user: ' . APP_DB_USER . '@localhost'
);
run($pdo,
    "GRANT ALL PRIVILEGES ON `" . DB_NAME . "`.* TO '" . APP_DB_USER . "'@'localhost'",
    'Grant privileges on ' . DB_NAME . ' to ' . APP_DB_USER
);
run($pdo, "FLUSH PRIVILEGES", 'Flush privileges');

// Foreign key checks off during setup, back on after
$pdo->exec("SET FOREIGN_KEY_CHECKS = 0");

// ═══════════════════════════════════════════════
//  TABLES  (order matters: parents before children)
// ═══════════════════════════════════════════════

// ── 2. users (passengers) ─────────────────────
run($pdo, "
CREATE TABLE IF NOT EXISTS `users` (
  `id`             INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `name`           VARCHAR(120)    NOT NULL,
  `phone`          VARCHAR(20)     NOT NULL UNIQUE,
  `email`          VARCHAR(180)    DEFAULT NULL UNIQUE,
  `password_hash`  VARCHAR(255)    NOT NULL,
  `profile_photo`  VARCHAR(500)    DEFAULT NULL,
  `wallet_balance` DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  `rating`         DECIMAL(3,2)    NOT NULL DEFAULT 5.00,
  `referral_code`  VARCHAR(20)     NOT NULL UNIQUE,
  `referred_by`    INT UNSIGNED    DEFAULT NULL,
  `status`         ENUM('active','suspended') NOT NULL DEFAULT 'active',
  `created_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_phone`  (`phone`),
  KEY `idx_referral` (`referral_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
'Table: users');

// ── 3. drivers ────────────────────────────────
run($pdo, "
CREATE TABLE IF NOT EXISTS `drivers` (
  `id`             INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `name`           VARCHAR(120)    NOT NULL,
  `phone`          VARCHAR(20)     NOT NULL UNIQUE,
  `email`          VARCHAR(180)    DEFAULT NULL UNIQUE,
  `password_hash`  VARCHAR(255)    NOT NULL,
  `profile_photo`  VARCHAR(500)    DEFAULT NULL,
  `license_plate`  VARCHAR(20)     NOT NULL UNIQUE,
  `vehicle_model`  VARCHAR(100)    NOT NULL,
  `vehicle_color`  VARCHAR(50)     NOT NULL,
  `vehicle_type`   ENUM('go','comfort','xl','boda') NOT NULL DEFAULT 'go',
  `status`         ENUM('offline','online','on_trip') NOT NULL DEFAULT 'offline',
  `current_lat`    DECIMAL(10,7)   DEFAULT NULL,
  `current_lng`    DECIMAL(10,7)   DEFAULT NULL,
  `rating`         DECIMAL(3,2)    NOT NULL DEFAULT 5.00,
  `total_trips`    INT UNSIGNED    NOT NULL DEFAULT 0,
  `earnings`       DECIMAL(14,2)   NOT NULL DEFAULT 0.00,
  `created_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`),
  KEY `idx_plate`  (`license_plate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
'Table: drivers');

// ── 4. sessions (tokens for users AND drivers) ─
run($pdo, "
CREATE TABLE IF NOT EXISTS `sessions` (
  `id`          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `actor_id`    INT UNSIGNED  NOT NULL,
  `actor_type`  ENUM('user','driver') NOT NULL,
  `token`       CHAR(64)      NOT NULL UNIQUE,
  `expires_at`  DATETIME      NOT NULL,
  `created_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_token`      (`token`),
  KEY `idx_actor`      (`actor_id`, `actor_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
'Table: sessions');

// ── 5. trips ──────────────────────────────────
run($pdo, "
CREATE TABLE IF NOT EXISTS `trips` (
  `id`               INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `passenger_id`     INT UNSIGNED    NOT NULL,
  `driver_id`        INT UNSIGNED    DEFAULT NULL,
  `pickup_address`   VARCHAR(300)    NOT NULL,
  `pickup_lat`       DECIMAL(10,7)   DEFAULT NULL,
  `pickup_lng`       DECIMAL(10,7)   DEFAULT NULL,
  `dropoff_address`  VARCHAR(300)    NOT NULL,
  `dropoff_lat`      DECIMAL(10,7)   DEFAULT NULL,
  `dropoff_lng`      DECIMAL(10,7)   DEFAULT NULL,
  `distance_km`      DECIMAL(8,2)    DEFAULT NULL,
  `fare`             DECIMAL(12,2)   DEFAULT NULL,
  `ride_type`        ENUM('go','comfort','xl','boda') NOT NULL DEFAULT 'go',
  `status`           ENUM('searching','assigned','in_progress','completed','cancelled') NOT NULL DEFAULT 'searching',
  `promo_code_id`    INT UNSIGNED    DEFAULT NULL,
  `discount_amount`  DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  `created_at`       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `assigned_at`      DATETIME        DEFAULT NULL,
  `started_at`       DATETIME        DEFAULT NULL,
  `completed_at`     DATETIME        DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_passenger` (`passenger_id`),
  KEY `idx_driver`    (`driver_id`),
  KEY `idx_status`    (`status`),
  CONSTRAINT `fk_trips_passenger` FOREIGN KEY (`passenger_id`) REFERENCES `users`   (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_trips_driver`    FOREIGN KEY (`driver_id`)    REFERENCES `drivers` (`id`) ON DELETE SET NULL  ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
'Table: trips');

// ── 6. payments ───────────────────────────────
run($pdo, "
CREATE TABLE IF NOT EXISTS `payments` (
  `id`              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `trip_id`         INT UNSIGNED    NOT NULL,
  `user_id`         INT UNSIGNED    NOT NULL,
  `method`          ENUM('mtn_momo','airtel_money','cash','card','wallet') NOT NULL,
  `amount`          DECIMAL(12,2)   NOT NULL,
  `status`          ENUM('pending','completed','failed','refunded') NOT NULL DEFAULT 'pending',
  `transaction_ref` VARCHAR(120)    DEFAULT NULL,
  `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_trip`    (`trip_id`),
  KEY `idx_user`    (`user_id`),
  CONSTRAINT `fk_payments_trip` FOREIGN KEY (`trip_id`) REFERENCES `trips` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_payments_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
'Table: payments');

// ── 7. ratings ────────────────────────────────
run($pdo, "
CREATE TABLE IF NOT EXISTS `ratings` (
  `id`           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `trip_id`      INT UNSIGNED    NOT NULL UNIQUE,
  `passenger_id` INT UNSIGNED    NOT NULL,
  `driver_id`    INT UNSIGNED    NOT NULL,
  `stars`        TINYINT         NOT NULL DEFAULT 5,
  `comment`      TEXT            DEFAULT NULL,
  `aspects`      JSON            DEFAULT NULL,
  `tip_amount`   DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  `created_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_driver`    (`driver_id`),
  KEY `idx_passenger` (`passenger_id`),
  CONSTRAINT `fk_ratings_trip`      FOREIGN KEY (`trip_id`)      REFERENCES `trips`   (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_ratings_passenger` FOREIGN KEY (`passenger_id`) REFERENCES `users`   (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_ratings_driver`    FOREIGN KEY (`driver_id`)    REFERENCES `drivers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
'Table: ratings');

// ── 8. saved_places ───────────────────────────
run($pdo, "
CREATE TABLE IF NOT EXISTS `saved_places` (
  `id`         INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `user_id`    INT UNSIGNED    NOT NULL,
  `label`      VARCHAR(80)     NOT NULL,
  `address`    VARCHAR(300)    NOT NULL,
  `lat`        DECIMAL(10,7)   DEFAULT NULL,
  `lng`        DECIMAL(10,7)   DEFAULT NULL,
  `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`),
  CONSTRAINT `fk_saved_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
'Table: saved_places');

// ── 9. promo_codes ────────────────────────────
run($pdo, "
CREATE TABLE IF NOT EXISTS `promo_codes` (
  `id`             INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `code`           VARCHAR(30)     NOT NULL UNIQUE,
  `description`    VARCHAR(200)    DEFAULT NULL,
  `discount_type`  ENUM('percent','fixed') NOT NULL DEFAULT 'percent',
  `discount_value` DECIMAL(10,2)   NOT NULL,
  `min_fare`       DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  `max_discount`   DECIMAL(10,2)   DEFAULT NULL,
  `max_uses`       INT             DEFAULT NULL,
  `used_count`     INT             NOT NULL DEFAULT 0,
  `valid_from`     DATETIME        DEFAULT NULL,
  `expires_at`     DATETIME        DEFAULT NULL,
  `is_active`      TINYINT(1)      NOT NULL DEFAULT 1,
  `created_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
'Table: promo_codes');

// ── 10. promo_uses (prevents double-use per user) ──
run($pdo, "
CREATE TABLE IF NOT EXISTS `promo_uses` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `promo_id`   INT UNSIGNED NOT NULL,
  `user_id`    INT UNSIGNED NOT NULL,
  `trip_id`    INT UNSIGNED NOT NULL,
  `used_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_promo_user` (`promo_id`, `user_id`),
  CONSTRAINT `fk_puses_promo` FOREIGN KEY (`promo_id`) REFERENCES `promo_codes` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_puses_user`  FOREIGN KEY (`user_id`)  REFERENCES `users`       (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_puses_trip`  FOREIGN KEY (`trip_id`)  REFERENCES `trips`       (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
'Table: promo_uses');

// ── 11. notifications ─────────────────────────
run($pdo, "
CREATE TABLE IF NOT EXISTS `notifications` (
  `id`         INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `user_id`    INT UNSIGNED    NOT NULL,
  `user_type`  ENUM('user','driver') NOT NULL DEFAULT 'user',
  `type`       VARCHAR(50)     NOT NULL,
  `title`      VARCHAR(150)    NOT NULL,
  `message`    TEXT            NOT NULL,
  `is_read`    TINYINT(1)      NOT NULL DEFAULT 0,
  `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_unread` (`user_id`, `is_read`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
'Table: notifications');

// ── 12. trip_cancellations ────────────────────
run($pdo, "
CREATE TABLE IF NOT EXISTS `trip_cancellations` (
  `id`           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `trip_id`      INT UNSIGNED    NOT NULL UNIQUE,
  `cancelled_by` ENUM('passenger','driver','system') NOT NULL,
  `reason`       VARCHAR(300)    DEFAULT NULL,
  `cancelled_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_cancel_trip` FOREIGN KEY (`trip_id`) REFERENCES `trips` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
'Table: trip_cancellations');

// ── 13. rate_limits ───────────────────────────
run($pdo, "
CREATE TABLE IF NOT EXISTS `rate_limits` (
  `rl_key`       VARCHAR(120)  NOT NULL,
  `attempts`     SMALLINT      NOT NULL DEFAULT 1,
  `window_start` DATETIME      NOT NULL,
  PRIMARY KEY (`rl_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
'Table: rate_limits');

// ── 14. businesses ────────────────────────────
run($pdo, "
CREATE TABLE IF NOT EXISTS `businesses` (
  `id`             INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `company_name`   VARCHAR(150)    NOT NULL,
  `email`          VARCHAR(180)    NOT NULL UNIQUE,
  `password_hash`  VARCHAR(255)    NOT NULL,
  `phone`          VARCHAR(20)     DEFAULT NULL,
  `tin`            VARCHAR(40)     DEFAULT NULL,
  `address`        VARCHAR(300)    DEFAULT NULL,
  `wallet_balance` DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  `status`         ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `approved_at`    DATETIME        DEFAULT NULL,
  `created_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_email`  (`email`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
'Table: businesses');

// ── 15. business_staff ────────────────────────
run($pdo, "
CREATE TABLE IF NOT EXISTS `business_staff` (
  `id`             INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `business_id`    INT UNSIGNED    NOT NULL,
  `name`           VARCHAR(120)    NOT NULL,
  `phone`          VARCHAR(20)     NOT NULL,
  `email`          VARCHAR(180)    DEFAULT NULL,
  `department`     VARCHAR(80)     DEFAULT NULL,
  `wallet_balance` DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  `status`         ENUM('active','suspended') NOT NULL DEFAULT 'active',
  `created_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_business` (`business_id`),
  CONSTRAINT `fk_staff_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
'Table: business_staff');

// ── 16. scheduled_trips ───────────────────────
run($pdo, "
CREATE TABLE IF NOT EXISTS `scheduled_trips` (
  `id`               INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `business_id`      INT UNSIGNED    NOT NULL,
  `staff_id`         INT UNSIGNED    DEFAULT NULL,
  `pickup_address`   VARCHAR(300)    NOT NULL,
  `dropoff_address`  VARCHAR(300)    NOT NULL,
  `ride_type`        ENUM('go','comfort','xl','boda') NOT NULL DEFAULT 'go',
  `scheduled_at`     DATETIME        NOT NULL,
  `fare`             DECIMAL(12,2)   DEFAULT NULL,
  `status`           ENUM('upcoming','completed','cancelled') NOT NULL DEFAULT 'upcoming',
  `created_at`       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_business` (`business_id`),
  KEY `idx_staff`    (`staff_id`),
  KEY `idx_status`   (`status`),
  CONSTRAINT `fk_sched_business` FOREIGN KEY (`business_id`) REFERENCES `businesses`     (`id`) ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT `fk_sched_staff`    FOREIGN KEY (`staff_id`)    REFERENCES `business_staff` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
'Table: scheduled_trips');

// ── 17. business_transactions ─────────────────
run($pdo, "
CREATE TABLE IF NOT EXISTS `business_transactions` (
  `id`          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `business_id` INT UNSIGNED    NOT NULL,
  `staff_id`    INT UNSIGNED    DEFAULT NULL,
  `type`        ENUM('topup','payout_debit','payout_credit','ride_payment','refund') NOT NULL,
  `amount`      DECIMAL(12,2)   NOT NULL,
  `reason`      VARCHAR(200)    DEFAULT NULL,
  `status`      ENUM('completed','pending','failed') NOT NULL DEFAULT 'completed',
  `created_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_business` (`business_id`),
  KEY `idx_staff`    (`staff_id`),
  CONSTRAINT `fk_txn_business` FOREIGN KEY (`business_id`) REFERENCES `businesses`     (`id`) ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT `fk_txn_staff`    FOREIGN KEY (`staff_id`)    REFERENCES `business_staff` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
'Table: business_transactions');

// ── Re-enable FK checks ───────────────────────
$pdo->exec("SET FOREIGN_KEY_CHECKS = 1");

// ── Indexes (safe to re-run — errors are caught) ──────────────────────────
run_once($pdo,
    "ALTER TABLE `drivers` ADD INDEX `idx_status_location` (`status`, `current_lat`, `current_lng`)",
    'Index: drivers status+location');

run($pdo,
    "ALTER TABLE `sessions` MODIFY COLUMN `actor_type` ENUM('user','driver','business') NOT NULL",
    'Alter: sessions.actor_type add business');

run($pdo,
    "ALTER TABLE `business_transactions` MODIFY COLUMN `type` ENUM('topup','payout_debit','payout_credit','ride_payment','refund','topup_reversal') NOT NULL",
    'Alter: business_transactions.type add topup_reversal');

run_once($pdo,
    "ALTER TABLE `business_transactions` ADD COLUMN `related_transaction_id` INT UNSIGNED DEFAULT NULL AFTER `staff_id`",
    'Alter: business_transactions add related_transaction_id');

run_once($pdo,
    "ALTER TABLE `business_transactions` ADD INDEX `idx_related` (`related_transaction_id`)",
    'Index: business_transactions related_transaction_id');

// ── Seed default promo codes ──────────────────
run($pdo, "
INSERT IGNORE INTO `promo_codes`
  (`code`, `description`, `discount_type`, `discount_value`, `min_fare`, `max_uses`, `expires_at`)
VALUES
  ('MATLEX50', '50% off first ride', 'percent', 50.00, 10000, 1000, DATE_ADD(NOW(), INTERVAL 6 MONTH)),
  ('WELCOME',  'UGX 5,000 off signup', 'fixed',   5000.00, 8000, 5000, DATE_ADD(NOW(), INTERVAL 12 MONTH))",
'Seed: promo_codes');

// ── Output result ─────────────────────────────
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Matlex — DB Setup</title>
  <style>
    body { font-family: monospace; max-width: 700px; margin: 40px auto; padding: 20px; background: #0d1117; color: #e6edf3; }
    h2   { color: #f7b731; }
    li   { margin: 6px 0; font-size: 14px; }
    .ok  { color: #28c76f; }
    .err { color: #ea5455; }
    .done { margin-top: 30px; padding: 16px; background: #161b22; border: 1px solid #30363d; border-radius: 8px; }
  </style>
</head>
<body>
  <h2>Matlex Ride — Database Setup</h2>
  <ul>
    <?php foreach ($log as $line): ?>
      <li class="<?= str_starts_with($line, '✅') ? 'ok' : 'err' ?>"><?= htmlspecialchars($line) ?></li>
    <?php endforeach; ?>
  </ul>
  <div class="done">
    <?php
    $errors = array_filter($log, fn($l) => str_starts_with($l, '❌'));
    if (empty($errors)) {
        echo '<span style="color:#28c76f;font-weight:bold;">✅ Database ready. You can close this page.</span>';
    } else {
        echo '<span style="color:#ea5455;font-weight:bold;">⚠️ Some steps failed — check errors above.</span>';
    }
    ?>
  </div>
</body>
</html>
