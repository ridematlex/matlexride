<?php
/* =============================================
   Matlex — One-time PNG icon generator
   Run: https://yourdomain.com/generate-icons.php
   DELETE this file immediately after running.
   Requires: php-gd  (sudo apt install php-gd)
   ============================================= */

$dir = __DIR__ . '/client/assets/icons/';
if (!is_dir($dir)) mkdir($dir, 0755, true);

function make_icon(int $size, string $path): void {
    $img    = imagecreatetruecolor($size, $size);
    $bg     = imagecolorallocate($img, 26,  31,  46);   // #1a1f2e
    $brand  = imagecolorallocate($img, 247, 183, 49);   // #F7B731
    $transp = imagecolorallocatealpha($img, 0, 0, 0, 127);

    imagesavealpha($img, true);
    imagealphablending($img, false);
    imagefill($img, 0, 0, $transp);
    imagealphablending($img, true);

    // Rounded rectangle background
    $r = (int)($size * 0.22);
    imagefilledrectangle($img, $r, 0, $size - $r, $size, $bg);
    imagefilledrectangle($img, 0, $r, $size, $size - $r, $bg);
    imagefilledellipse($img, $r,        $r,        $r * 2, $r * 2, $bg);
    imagefilledellipse($img, $size - $r, $r,        $r * 2, $r * 2, $bg);
    imagefilledellipse($img, $r,        $size - $r, $r * 2, $r * 2, $bg);
    imagefilledellipse($img, $size - $r, $size - $r, $r * 2, $r * 2, $bg);

    // Draw "M" using rectangles (no TTF font needed)
    $pad  = (int)($size * 0.18);
    $top  = (int)($size * 0.20);
    $bot  = (int)($size * 0.80);
    $w    = (int)($size * 0.11);
    $mid  = (int)($size * 0.52);
    $cx   = (int)($size / 2);

    // Left leg
    imagefilledrectangle($img, $pad, $top, $pad + $w, $bot, $brand);
    // Right leg
    imagefilledrectangle($img, $size - $pad - $w, $top, $size - $pad, $bot, $brand);
    // Left diagonal (left to centre-top)
    $pts = [
        $pad,       $top,
        $pad + $w,  $top,
        $cx,        $mid,
        $cx - $w,   $mid,
    ];
    imagefilledpolygon($img, $pts, $brand);
    // Right diagonal (right to centre-top)
    $pts2 = [
        $size - $pad - $w, $top,
        $size - $pad,      $top,
        $cx + $w,          $mid,
        $cx,               $mid,
    ];
    imagefilledpolygon($img, $pts2, $brand);

    imagepng($img, $path);
    imagedestroy($img);
}

$sizes = [192, 512];
$ok = [];
foreach ($sizes as $s) {
    $p = $dir . 'icon-' . $s . '.png';
    make_icon($s, $p);
    $ok[] = "✅ icon-{$s}.png";
}

// Copy SVG as well in case it's missing
if (!file_exists($dir . 'icon.svg') && file_exists(__DIR__ . '/client/assets/icons/icon.svg')) {
    copy(__DIR__ . '/client/assets/icons/icon.svg', $dir . 'icon.svg');
    $ok[] = "✅ icon.svg (copied)";
}
?>
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Icon Generator</title>
<style>body{font-family:monospace;background:#0d1117;color:#e6edf3;padding:40px;max-width:500px;margin:auto;}
h2{color:#f7b731;}li{margin:8px 0;}</style></head>
<body>
<h2>Matlex — Icon Generator</h2>
<ul><?php foreach ($ok as $l) echo "<li>$l</li>"; ?></ul>
<p style="margin-top:24px;color:#28c76f;font-weight:bold;">
  ✅ Done. <strong>DELETE this file from your server now.</strong><br>
  <code>rm /var/www/matlex/generate-icons.php</code>
</p>
</body>
</html>
