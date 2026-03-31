import fs from "fs";

// ------------------------------------------------------------------
// PAGE MARGIN CONSTANTS — edit these to change the transaction area
// ------------------------------------------------------------------
export const MARGIN_TOP_MM    = 92.6;
export const MARGIN_BOTTOM_MM = 79;

// ------------------------------------------------------------------
// CACHING DISK READS LOCALLY SO THEY DON'T TRIGGER PER-CUSTOMER
// ------------------------------------------------------------------
const defaultCss = fs.readFileSync("Stylesheets/default.css", "utf8");
const defaultTableCss = fs.readFileSync("Stylesheets/default_table_styles.css", "utf8");
const contextCss = fs.readFileSync("Stylesheets/context_all_styles.css", "utf8");

const repPage = fs.readFileSync("Master pages/repPage.html", "utf8");
const lastPage = fs.readFileSync("Master pages/lastPage.html", "utf8");

// Parse section.html: extract the row template from the <tr> inside <tbody>,
// and build the table shell with a {{rows}} placeholder.
const sectionRaw = fs.readFileSync("Context/section.html", "utf8");
const trMatch = sectionRaw.match(/<tr[\s\S]*?<\/tr>/i);
const rowTemplate = trMatch ? trMatch[0] : "";
const tableTemplate = sectionRaw.replace(/<tbody>[\s\S]*?<\/tbody>/i, "<tbody>{{rows}}</tbody>");

function replaceVars(template, data) {
  let html = template;

  for (const key in data) {
    const regex = new RegExp(`{{${key}}}`, "g");
    html = html.replace(regex, data[key] ?? "");
  }

  return html;
}

export function renderCardTransactions(card) {
  const transactions = card.transactions || [];

  const rows = transactions
    .map((t) => replaceVars(rowTemplate, t))
    .join("\n");

  const transactionTable = tableTemplate.replace("{{rows}}", rows);

  const finalHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    ${defaultCss}
    ${defaultTableCss}
    ${contextCss}
    
    @page {
      size: A4;
      margin-top: ${MARGIN_TOP_MM}mm;
      margin-bottom: ${MARGIN_BOTTOM_MM}mm;
      margin-left: 12mm;
      margin-right: 12mm;
    }
    
    body {
      margin: 0;
      padding: 0;
      background-color: transparent;
    }
    
    tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
  </style>
</head>
<body>
  ${transactionTable}
</body>
</html>
  `;

  return finalHtml;
}

export function renderCardOverlays(card, totalPages) {
  const header = card.header;
  const pagesHtml = [];

  for (let i = 1; i <= totalPages; i++) {
    const isLastPage = i === totalPages;
    let pageTemplate = isLastPage ? lastPage : repPage;
    let pageContent = replaceVars(pageTemplate, header);

    // Inject exact pagination
    pageContent = pageContent.replace(/{#}/g, i);
    pageContent = pageContent.replace(/{##}/g, totalPages);

    const isAbsoluteLast = i === totalPages;
    const pageBreak = isAbsoluteLast ? "" : ' style="page-break-after: always;"';
    
    pagesHtml.push(`\n<div class="page-container"${pageBreak}>\n${pageContent}\n</div>\n`);
  }

  const finalHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    ${defaultCss}
    ${defaultTableCss}
    ${contextCss}
    
    @page {
      size: A4;
      margin: 0;
    }
    
    body {
      margin: 0;
      padding: 0;
      background-color: transparent;
    }

    .page-container {
      position: relative;
      width: 210mm;
      height: 297mm; /* strictly A4 */
      box-sizing: border-box;
      overflow: hidden;
    }
  </style>
</head>
<body>
  ${pagesHtml.join("")}
</body>
</html>
  `;

  return finalHtml;
}