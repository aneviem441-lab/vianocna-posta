function escapeCsv(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function escapeXml(value) {
  const str = value === null || value === undefined ? '' : String(value);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const EXPORT_COLUMNS = [
  'id',
  'reference',
  'approvalCode',
  'authorizationId',
  'networkReference',
  'processor',
  'status',
  'authorizedAmount',
  'capturedAmount',
  'remainingAmount',
  'currency',
  'customerLabel',
  'instrumentMask',
  'createdAt',
  'updatedAt',
  'expiresAt'
];

/**
 * Generates an RFC-4180 CSV export with UTF-8 BOM for Excel / ERP import.
 * @param {Array<Record<string, any>>} records
 */
export function exportToCsv(records) {
  const header = EXPORT_COLUMNS.join(',');
  const rows = records.map((rec) =>
    EXPORT_COLUMNS.map((col) => escapeCsv(rec[col])).join(',')
  );
  return `\uFEFF${[header, ...rows].join('\r\n')}\r\n`;
}

/**
 * Generates an ERP-friendly XML batch export of pre-authorization records.
 * @param {Array<Record<string, any>>} records
 */
export function exportToXml(records) {
  const exportedAt = new Date().toISOString();
  const itemsXml = records
    .map((rec) => {
      const fields = EXPORT_COLUMNS.map(
        (col) => `      <${col}>${escapeXml(rec[col] ?? '')}</${col}>`
      ).join('\n');
      return `    <Transaction>\n${fields}\n    </Transaction>`;
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<PreAuthBatchExport exportedAt="${escapeXml(exportedAt)}" count="${records.length}">`,
    '  <Transactions>',
    itemsXml,
    '  </Transactions>',
    '</PreAuthBatchExport>',
    ''
  ].join('\n');
}
