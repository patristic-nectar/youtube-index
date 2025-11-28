const fs = require("fs");
const path = require("path");

console.log("Building Patristic Nectar Widget...\n");

try {
  const alpineJs = fs.readFileSync("node_modules/alpinejs/dist/cdn.js", "utf8");
  console.log("Loaded Alpine.js from node_modules");

  const config = fs.readFileSync("src/config.js", "utf8");
  console.log("Loaded config.js");

  const app = fs.readFileSync("src/app.js", "utf8");
  console.log("Loaded app.js");

  const widgetHtml = fs.readFileSync("src/widget.html", "utf8");
  console.log("Loaded widget.html");

  const styles = fs.readFileSync("src/styles.css", "utf8");
  console.log("Loaded styles.css");

  const escapedHtml = widgetHtml
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$");

  const bundledJs = `/**
 * Patristic Nectar YouTube Widget
 * Version: 1.0.0
 * A searchable, filterable index of Patristic Nectar YouTube videos
 */

(function() {
  'use strict';

  // Alpine.js bundled (v3.x)
  ${alpineJs}

  // Widget configuration
  ${config}

  // Alpine.js component
  ${app}

  // Auto-inject widget HTML on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', function() {
    const container = document.getElementById('patristic-nectar-widget');
    if (container) {
      container.innerHTML = \`${escapedHtml}\`;
    }
  });

  // Export for manual initialization if needed
  window.PatristicNectarWidget = {
    version: '1.0.0',
    init: function(containerId) {
      const container = document.getElementById(containerId || 'patristic-nectar-widget');
      if (container) {
        container.innerHTML = \`${escapedHtml}\`;
      } else {
        console.error('Patristic Nectar Widget: Container element not found');
      }
    }
  };

})();
`;

  fs.mkdirSync("dist", { recursive: true });

  fs.writeFileSync("dist/widget.js", bundledJs);
  console.log("✓ Created dist/widget.js");

  fs.writeFileSync("dist/widget.css", styles);
  console.log("✓ Created dist/widget.css");

  const jsSize = (Buffer.byteLength(bundledJs, "utf8") / 1024).toFixed(2);
  const cssSize = (Buffer.byteLength(styles, "utf8") / 1024).toFixed(2);

  console.log("\n✅ Build complete!");
  console.log(`\nFile sizes:`);
  console.log(`  - dist/widget.js: ${jsSize} KB`);
  console.log(`  - dist/widget.css: ${cssSize} KB`);
  console.log(
    `  - Total: ${(parseFloat(jsSize) + parseFloat(cssSize)).toFixed(2)} KB`,
  );
  console.log("\nYou can now use the widget by including:");
  console.log('  <div id="patristic-nectar-widget"></div>');
  console.log('  <link rel="stylesheet" href="dist/widget.css">');
  console.log('  <script src="dist/widget.js"></script>');
} catch (error) {
  console.error("❌ Build failed:", error.message);
  process.exit(1);
}
