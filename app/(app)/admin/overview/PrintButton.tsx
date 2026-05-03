'use client'

/**
 * Triggers the browser's print dialog. From there the user can pick
 * "Save as PDF" as the destination on any modern browser/OS.
 *
 * The button itself is hidden in print output via the `print-hide`
 * class (defined in the parent page's <style> block).
 */
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="fg-btn-gold print-hide"
      style={{ width: 'auto', padding: '8px 16px' }}
    >
      Save as PDF
    </button>
  )
}
