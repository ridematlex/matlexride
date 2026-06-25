Put your site images in this directory.

Naming suggestions:
- team-<name>.jpg/png for team photos (e.g. team-mathias.jpg)
- hero-<name>.jpg for hero/backgrounds
- gallery-01.jpg, gallery-02.jpg for generic assets

Suggested sizes:
- Team portraits: 800x800 (square) — optimized for web (use progressive JPG or WebP)
- Hero/background: 1600x900 or wider
- Gallery: 1200px wide for full-width, 600-800px for card images

Usage examples (in HTML):
<img src="assets/images/team-mathias.jpg" alt="Mathias Akandinda">
<a href="assets/images/gallery-01.jpg" download>Download high-res</a>

If you want WebP and fallbacks, name files like `team-mathias.webp` and `team-mathias.jpg` and use `<picture>` elements.