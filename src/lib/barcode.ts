/**
 * Generates the compact internal barcode format used throughout Kroniqos. The
 * database enforces SKU uniqueness within each store as the final guard.
 */
export function generateInternalBarcode() {
  return `KRN${Date.now().toString().slice(-10)}${Math.floor(Math.random() * 90 + 10)}`
}
