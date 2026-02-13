/**
 * Squarespace Color Integration
 * Dynamically extracts colors from the Squarespace site and injects them as CSS variables
 */

function applySquarespaceColors() {
  // Check if user has disabled automatic color detection
  if (window.PatristicNectarWidgetConfig?.disableSquarespaceColors) {
    return;
  }

  try {
    const root = getComputedStyle(document.documentElement);
    const body = getComputedStyle(document.body);

    // Extract base colors from body
    const textColor = body.color;
    const bgColor = body.backgroundColor;

    // Helper function to check if color is valid (not transparent/black/white when unset)
    function isValidColor(colorString) {
      if (!colorString) return false;

      // Check for transparent or rgba with 0 alpha
      if (colorString === 'transparent' || colorString.includes('rgba(0, 0, 0, 0)')) {
        return false;
      }

      // Parse and check if it's a real color
      const match = colorString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!match) return false;

      const alpha = match[4] !== undefined ? parseFloat(match[4]) : 1;
      return alpha > 0;
    }

    // Validate extracted colors - if invalid, don't apply any colors
    if (!isValidColor(bgColor) || !isValidColor(textColor)) {
      console.log('Patristic Nectar Widget: No valid Squarespace colors detected, using defaults');
      return;
    }

    function normalizeToComputedColor(colorString) {
      if (!colorString) return "";
      const probe = document.createElement("span");
      probe.style.color = colorString.trim();
      probe.style.display = "none";
      document.body.appendChild(probe);
      const resolved = getComputedStyle(probe).color;
      probe.remove();
      return resolved;
    }

    function readCssColorVar(style, name) {
      return normalizeToComputedColor(style.getPropertyValue(name));
    }

    function firstValidColor(candidates) {
      for (const candidate of candidates) {
        if (isValidColor(candidate)) return candidate;
      }
      return "";
    }

    // Prefer explicit theme accent variables first, then visible UI elements.
    const accentFromVars = firstValidColor([
      readCssColorVar(root, "--site-color-accent"),
      readCssColorVar(root, "--accent-color"),
      readCssColorVar(root, "--color-accent"),
      readCssColorVar(root, "--primary-color"),
      readCssColorVar(root, "--button-primary-color"),
      readCssColorVar(body, "--site-color-accent"),
      readCssColorVar(body, "--accent-color")
    ]);

    const primaryBtn = document.querySelector(
      [
        ".sqs-block-button-element--primary",
        ".sqs-button-element--primary",
        ".btn--primary",
        '[class*="primary-button"]',
        '[class*="sqs-button-element--primary"]'
      ].join(", ")
    );
    const accentFromButton =
      primaryBtn && isValidColor(getComputedStyle(primaryBtn).backgroundColor)
        ? getComputedStyle(primaryBtn).backgroundColor
        : "";

    const accentFromLink = isValidColor(body.getPropertyValue("link")) ? body.getPropertyValue("link") : "";

    const accentColor = firstValidColor([
      accentFromVars,
      accentFromButton,
      normalizeToComputedColor(accentFromLink),
      textColor
    ]);

    // Helper function to parse rgb/rgba to components
    function parseColor(colorString) {
      const match = colorString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
      if (match) {
        return {
          r: parseInt(match[1]),
          g: parseInt(match[2]),
          b: parseInt(match[3])
        };
      }
      return null;
    }

    // Helper function to calculate relative luminance
    function getLuminance(r, g, b) {
      const [rs, gs, bs] = [r, g, b].map(c => {
        const val = c / 255;
        return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    }

    // Helper function to darken a color
    function darkenColor(colorString, percent = 15) {
      const parsed = parseColor(colorString);
      if (!parsed) return colorString;

      const factor = (100 - percent) / 100;
      const r = Math.round(parsed.r * factor);
      const g = Math.round(parsed.g * factor);
      const b = Math.round(parsed.b * factor);

      return `rgb(${r}, ${g}, ${b})`;
    }

    // Helper function to create a lighter surface color from background
    function createSurfaceColor(bgColorString) {
      const parsed = parseColor(bgColorString);
      if (!parsed) return '#f8f9fa';

      const luminance = getLuminance(parsed.r, parsed.g, parsed.b);

      // If background is light, make surface slightly darker
      // If background is dark, make surface slightly lighter
      const adjustment = luminance > 0.5 ? -10 : 10;

      const r = Math.max(0, Math.min(255, parsed.r + adjustment));
      const g = Math.max(0, Math.min(255, parsed.g + adjustment));
      const b = Math.max(0, Math.min(255, parsed.b + adjustment));

      return `rgb(${r}, ${g}, ${b})`;
    }

    // Helper function to create border color
    function createBorderColor(bgColorString) {
      const parsed = parseColor(bgColorString);
      if (!parsed) return '#dadce0';

      const luminance = getLuminance(parsed.r, parsed.g, parsed.b);

      // Border should be noticeably different from background
      const adjustment = luminance > 0.5 ? -30 : 30;

      const r = Math.max(0, Math.min(255, parsed.r + adjustment));
      const g = Math.max(0, Math.min(255, parsed.g + adjustment));
      const b = Math.max(0, Math.min(255, parsed.b + adjustment));

      return `rgb(${r}, ${g}, ${b})`;
    }

    // Helper function to create secondary text color
    function createSecondaryTextColor(textColorString) {
      const parsed = parseColor(textColorString);
      if (!parsed) return '#5f6368';

      const luminance = getLuminance(parsed.r, parsed.g, parsed.b);

      // Make secondary text lighter/more transparent
      const opacity = luminance > 0.5 ? 0.6 : 0.7;

      return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${opacity})`;
    }

    // Helper function to get contrasting text color (white or black) for buttons
    function getContrastingTextColor(bgColorString) {
      const parsed = parseColor(bgColorString);
      if (!parsed) return '#ffffff';

      const luminance = getLuminance(parsed.r, parsed.g, parsed.b);

      // Use white text for dark backgrounds, black for light backgrounds
      return luminance > 0.5 ? '#000000' : '#ffffff';
    }

    // Helper function to lighten a color
    function lightenColor(colorString, percent = 20) {
      const parsed = parseColor(colorString);
      if (!parsed) return colorString;

      const factor = percent / 100;
      const r = Math.round(parsed.r + (255 - parsed.r) * factor);
      const g = Math.round(parsed.g + (255 - parsed.g) * factor);
      const b = Math.round(parsed.b + (255 - parsed.b) * factor);

      return `rgb(${r}, ${g}, ${b})`;
    }

    function colorWithAlpha(colorString, alpha = 0.14) {
      const parsed = parseColor(colorString);
      if (!parsed) return `rgba(26, 115, 232, ${alpha})`;
      return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${alpha})`;
    }

    // Helper function to ensure accent has good contrast with background
    function ensureAccentContrast(accentColorString, bgColorString) {
      const accentParsed = parseColor(accentColorString);
      const bgParsed = parseColor(bgColorString);

      if (!accentParsed || !bgParsed) return accentColorString;

      const accentLuminance = getLuminance(accentParsed.r, accentParsed.g, accentParsed.b);
      const bgLuminance = getLuminance(bgParsed.r, bgParsed.g, bgParsed.b);

      // If background is dark, ensure accent is light enough
      if (bgLuminance < 0.5 && accentLuminance < 0.5) {
        return lightenColor(accentColorString, 40);
      }

      // If background is light, ensure accent is dark enough
      if (bgLuminance > 0.5 && accentLuminance > 0.5) {
        return darkenColor(accentColorString, 30);
      }

      return accentColorString;
    }

    // Calculate derived colors
    const accentAdjusted = ensureAccentContrast(accentColor, bgColor);
    const accentDark = darkenColor(accentAdjusted, 15);
    const accentLight = colorWithAlpha(accentAdjusted, 0.14);
    const surfaceColor = createSurfaceColor(bgColor);
    const borderColor = createBorderColor(bgColor);
    const textSecondary = createSecondaryTextColor(textColor);
    const surfaceHover = darkenColor(surfaceColor, 8);
    const accentText = getContrastingTextColor(accentColor);

    // Inject CSS variables into the widget container
    const widgetContainer = document.querySelector('.pn-widget');
    if (widgetContainer) {
      widgetContainer.style.setProperty('--site-color-text', textColor);
      widgetContainer.style.setProperty('--site-color-bg', bgColor);
      widgetContainer.style.setProperty('--site-color-accent', accentAdjusted);
      widgetContainer.style.setProperty('--site-color-accent-dark', accentDark);
      widgetContainer.style.setProperty('--site-color-accent-light', accentLight);
      widgetContainer.style.setProperty('--site-color-accent-text', accentText);
      widgetContainer.style.setProperty('--site-color-surface', surfaceColor);
      widgetContainer.style.setProperty('--site-color-border', borderColor);
      widgetContainer.style.setProperty('--site-color-text-secondary', textSecondary);
      widgetContainer.style.setProperty('--site-color-surface-hover', surfaceHover);

      // Optional: Log for debugging
      if (window.location.hostname === 'localhost' || window.location.protocol === 'file:') {
        console.log('Patristic Nectar Widget: Squarespace colors applied', {
          text: textColor,
          bg: bgColor,
          accent: accentColor,
          accentAdjusted,
          accentDark,
          accentText,
          surface: surfaceColor,
          border: borderColor,
          textSecondary,
          surfaceHover
        });
      }
    }
  } catch (error) {
    // Silently fail - widget will use default colors
    console.warn('Patristic Nectar Widget: Could not apply Squarespace colors, using defaults', error);
  }
}
