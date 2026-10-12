---
'@vexoulz/vods-core': patch
---

The `app` entry imports `@vexoulz/ui/platform.css` instead of keeping its own copy of the `--vxp-*` mapping, so a
site on the `app` entry needs `@vexoulz/ui` v0.23.0 or later. Inside the site shell, platform-web's accent (Manage's
primary buttons, accent chips, chat tags and notices) is now the site's accent instead of the neutral one.
