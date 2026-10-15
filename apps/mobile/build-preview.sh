#!/usr/bin/env bash
# Builds the demo-mode web preview as an Artifact-ready folder (preview/).
# The app runs in demo mode because no Supabase environment variables are set.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf dist preview
EXPO_NO_TELEMETRY=1 env -u EXPO_PUBLIC_SUPABASE_URL -u EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY npx expo export --platform web >/dev/null
ENTRY=$(ls dist/_expo/static/js/web/entry-*.js | head -1)
mkdir -p preview/js
cp "$ENTRY" preview/js/app.js
cat > preview/index.html <<'HTML'
<title>Adaptive Athlete Preview</title>
<style>
  /* Single light look by design: the app's own concrete-and-turf palette. */
  :root { --page: #E8EBEA; color-scheme: light; }
  html, body { height: 100%; background: var(--page); }
  body { overflow: hidden; }
  #root { display: flex; height: 100%; flex: 1; }
</style>
<noscript>This preview needs JavaScript.</noscript>
<div id="root"></div>
<script>
  // Expo Router picks the screen from the URL path, so start the preview at "/" whatever path
  // the page is served from. Resolve the bundle's address first: it sits next to this page.
  (function () {
    var src = new URL("js/app.js", location.href).href;
    try { if (location.pathname !== "/") history.replaceState(null, "", "/"); } catch (e) {}
    var s = document.createElement("script");
    s.src = src;
    document.body.appendChild(s);
  })();
</script>
HTML
echo "Preview ready: $(du -sh preview | cut -f1)"
