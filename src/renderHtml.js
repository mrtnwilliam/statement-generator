import fs from "fs";

export const MARGIN_TOP_MM    = 92.6;
export const MARGIN_BOTTOM_MM = 79;

const defaultCss      = fs.readFileSync("Stylesheets/default.css", "utf8");
const defaultTableCss = fs.readFileSync("Stylesheets/default_table_styles.css", "utf8");
const contextCss      = fs.readFileSync("Stylesheets/context_all_styles.css", "utf8");

const repPage  = fs.readFileSync("Master pages/repPage.html", "utf8");
const lastPage = fs.readFileSync("Master pages/lastPage.html", "utf8");

const sectionRaw   = fs.readFileSync("Context/section.html", "utf8");
const trMatch      = sectionRaw.match(/<tr[\s\S]*?<\/tr>/i);
const rowTemplate  = trMatch ? trMatch[0] : "";
const tableTemplate = sectionRaw.replace(/<tbody>[\s\S]*?<\/tbody>/i, "<tbody>{{rows}}</tbody>");

function replaceVars(template, data) {
  let html = template;
  for (const key in data) {
    html = html.replace(new RegExp(`{{${key}}}`, "g"), data[key] ?? "");
  }
  return html;
}

export function renderMassiveTransactions(cards) {
  const allTables = [];
  let cardIndex = 0;

  for (const card of cards) {
    const transactions = card.transactions || [];
    const rows = transactions.map((t) => replaceVars(rowTemplate, t)).join("\n");
    let tableHtml = tableTemplate.replace("{{rows}}", rows);

    // Invisible CARD_MARKER so Phase 2 can detect page boundaries per card
    tableHtml += `\n<div style="font-size: 1px; color: #ffffff00; line-height: 0;">CARD_MARKER_${cardIndex}</div>`;

    const breakStyle = cardIndex > 0 ? ' style="page-break-before: always;"' : '';
    allTables.push(`<div${breakStyle}>\n${tableHtml}\n</div>`);
    cardIndex++;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    ${defaultCss}
    ${defaultTableCss}
    ${contextCss}
    @page { size: A4; margin-top: ${MARGIN_TOP_MM}mm; margin-bottom: ${MARGIN_BOTTOM_MM}mm; margin-left: 12mm; margin-right: 12mm; }
    body { margin: 0; padding: 0; background-color: transparent; }
    tr { break-inside: avoid; page-break-inside: avoid; }
  </style>
</head>
<body>
  ${allTables.join("\n")}
</body>
</html>`;
}

export function renderMassiveOverlays(cards, cardsPageCounts) {
  const pagesHtml = [];
  let cardIndex = 0;

  for (const card of cards) {
    const totalPages = cardsPageCounts[cardIndex];
    const header = card.header;

    for (let i = 1; i <= totalPages; i++) {
      const isLastPage = (i === totalPages);
      let pageContent = replaceVars(isLastPage ? lastPage : repPage, header);
      pageContent = pageContent.replace(/{#}/g, i);
      pageContent = pageContent.replace(/{##}/g, totalPages);

      const isAbsoluteLast = (cardIndex === cards.length - 1) && isLastPage;
      const pageBreak = isAbsoluteLast ? "" : ' style="page-break-after: always;"';
      pagesHtml.push(`\n<div class="page-container"${pageBreak}>\n${pageContent}\n</div>\n`);
    }
    cardIndex++;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    ${defaultCss}
    ${defaultTableCss}
    ${contextCss}
    @page { size: A4; margin: 0; }
    body { margin: 0; padding: 0; background-color: transparent; }
    .page-container { position: relative; width: 210mm; height: 297mm; box-sizing: border-box; overflow: hidden; }
  </style>
</head>
<body>
  ${pagesHtml.join("")}
</body>
</html>`;
}