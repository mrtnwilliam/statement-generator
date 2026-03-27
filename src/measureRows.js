import fs from "fs";
import { MARGIN_TOP_MM, MARGIN_BOTTOM_MM } from "./renderHtml.js";

// Derived automatically from renderHtml.js — edit margins there, not here
const TRANSACTION_AREA_MM = 297 - MARGIN_TOP_MM - MARGIN_BOTTOM_MM;

/**
 * Launches a single Puppeteer page with the same CSS used in the real PDFs,
 * renders one sample row, measures its clientHeight, and derives how many
 * rows fit in the available transaction area.
 *
 * @param {import('puppeteer').Browser} browser  - the shared browser instance
 * @returns {Promise<number>} the number of rows that fit per page
 */
export async function measureRowsPerPage(browser) {
  const defaultCss     = fs.readFileSync("Stylesheets/default.css", "utf8");
  const defaultTableCss = fs.readFileSync("Stylesheets/default_table_styles.css", "utf8");
  const contextCss     = fs.readFileSync("Stylesheets/context_all_styles.css", "utf8");

  const sectionRaw  = fs.readFileSync("Context/section.html", "utf8");
  const trMatch     = sectionRaw.match(/<tr[\s\S]*?<\/tr>/i);
  const sampleRow   = trMatch ? trMatch[0] : "<tr><td>x</td></tr>";

  // Build a minimal A4 page with the real CSS and a single sample row
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    ${defaultCss}
    ${defaultTableCss}
    ${contextCss}
    @page { margin: 0; size: A4; }
    body  { margin: 0; padding: 0; }
  </style>
</head>
<body>
  <table id="trans" class="trans" style="width: 99.3%;">
    <tbody>
      ${sampleRow}
    </tbody>
  </table>
</body>
</html>`;

  const page = await browser.newPage();
  // Use a viewport that matches A4 at 96dpi
  await page.setViewport({ width: 794, height: 1123 });
  await page.setContent(html, { waitUntil: "load" });

  // Measure the actual rendered height of the <tr> element in pixels
  const rowHeightPx = await page.evaluate(() => {
    const tr = document.querySelector("#trans tr");
    return tr ? tr.getBoundingClientRect().height : 0;
  });

  await page.close();

  if (!rowHeightPx || rowHeightPx === 0) {
    console.warn("Could not measure row height — falling back to 30 rows per page");
    return 30;
  }

  // Convert the available transaction area from mm to px (96dpi → 1mm = 3.7795px)
  const areaHeightPx = TRANSACTION_AREA_MM * (96 / 25.4);

  const rowsPerPage = Math.floor(areaHeightPx / rowHeightPx);
  console.log(`Row height: ${rowHeightPx.toFixed(2)}px | Area: ${areaHeightPx.toFixed(2)}px | Rows per page: ${rowsPerPage}`);
  return rowsPerPage;
}
