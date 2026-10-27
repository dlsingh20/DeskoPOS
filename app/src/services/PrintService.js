/**
 * PrintService - bill and KOT printing for the POS.
 *
 * Layouts come from utils/printTemplates in the format saved in Settings >
 * Printing (PrintSettingsService, per device and restaurant). The same HTML is
 * printed through the browser (hidden frame + print dialog) or sent to the
 * companion app for direct thermal printing.
 */
import printSettingsService from './PrintSettingsService';
import staffService from './StaffService';
import hotelService from './HotelService';
import orderService from './OrderService';
import { buildBillModel, buildKotModel, renderBillHtml, renderKotHtml } from '../utils/printTemplates';
import { resolveRegionalFormat } from '../utils/regionalFormat';

const PRINT_MODE_KEY = 'pos_print_mode';
const COMPANION_URL = 'http://localhost:9100';

class PrintService {
  /**
   * Get the current print mode
   * @returns {'browser' | 'companion'}
   */
  getPrintMode() {
    try {
      const mode = localStorage.getItem(PRINT_MODE_KEY);
      return mode === 'companion' ? 'companion' : 'browser';
    } catch {
      return 'browser';
    }
  }

  /**
   * Set the print mode
   * @param {'browser' | 'companion'} mode
   */
  setPrintMode(mode) {
    try {
      localStorage.setItem(PRINT_MODE_KEY, mode === 'companion' ? 'companion' : 'browser');
    } catch (e) {
      console.error('Failed to save print mode setting:', e);
    }
  }

  /**
   * Check if companion app mode is enabled
   * @returns {boolean}
   */
  isCompanionMode() {
    return this.getPrintMode() === 'companion';
  }

  /**
   * Check if the companion print server is running
   * @returns {Promise<{running: boolean, printer: string|null}>}
   */
  async checkCompanionStatus() {
    try {
      const response = await fetch(`${COMPANION_URL}/status`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      return await response.json();
    } catch {
      return { running: false, printer: null };
    }
  }

  /**
   * Send HTML to the companion app's local print server for direct printing
   * @param {string} html - Full HTML document to print
   * @returns {Promise<void>}
   */
  async printHtmlViaCompanion(html) {
    const response = await fetch(`${COMPANION_URL}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Print failed');
    }
  }

  /**
   * Print a complete HTML document through a hidden frame (no pop-up needed)
   * @param {string} html
   */
  printHtmlInBrowser(html) {
    return new Promise((resolve, reject) => {
      const frame = document.createElement('iframe');
      frame.setAttribute('aria-hidden', 'true');
      frame.setAttribute('tabindex', '-1');
      Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
      document.body.appendChild(frame);
      const remove = () => setTimeout(() => frame.remove(), 1000);
      try {
        const doc = frame.contentWindow.document;
        doc.open();
        doc.write(html);
        doc.close();
      } catch (error) {
        frame.remove();
        reject(error);
        return;
      }
      // Give the frame a moment to lay out before opening the dialog
      setTimeout(() => {
        try {
          frame.contentWindow.focus();
          frame.contentWindow.print();
          resolve();
        } catch (error) {
          reject(error);
        } finally {
          remove();
        }
      }, 250);
    });
  }

  /** Prints HTML with the device's print method */
  printHtml(html) {
    return this.isCompanionMode() ? this.printHtmlViaCompanion(html) : this.printHtmlInBrowser(html);
  }

  /**
   * Server name plus the hotel's time zone, locale, currency and country for templates.
   * Missing data never blocks printing.
   */
  async _context(serverId) {
    const [staff, hotel] = await Promise.all([
      serverId != null ? staffService.getAllStaff().catch(() => []) : Promise.resolve([]),
      hotelService.getCurrentHotelSettings().catch(() => null),
    ]);
    const server = staff.find((s) => String(s.id) === String(serverId));
    return { serverName: server?.name || '', ...resolveRegionalFormat(hotel) };
  }

  /** HTML for a bill in the saved (or given) format */
  async getBillHtml(order, { duplicate = false, settings = null } = {}) {
    const context = await this._context(order.server);
    // Nothing saved yet: defaults follow the hotel's country
    const s = settings || printSettingsService.get(order.restaurant, context.country);
    const model = buildBillModel(order, { settings: s, duplicate, ...context });
    return renderBillHtml(model, s.billFormat, s.sheetSize);
  }

  /** HTML for a KOT in the saved (or given) format, with every copy */
  async getKOTHtml(kotData, { settings = null } = {}) {
    const context = await this._context(kotData.serverId);
    const s = settings || printSettingsService.get(kotData.restaurantId, context.country);
    const copies = s.kotCopies || 1;
    const models = Array.from({ length: copies }, (_, i) => buildKotModel(kotData, { ...context, copy: i + 1, copies }));
    return renderKotHtml(models, s.kotFormat, s.sheetSize);
  }

  /**
   * Print a KOT (Kitchen Order Ticket)
   * @param {Object} kotData - from buildKOTData: items, tableNumber, orderNumber, timestamp, restaurantId, serverId
   */
  async printKOT(kotData) {
    return this.printHtml(await this.getKOTHtml(kotData));
  }

  /**
   * Print the bill for an order
   * @param {Object} order - order with items and payments
   * @param {Object} [options] - { duplicate: true } marks a reprint
   */
  async printBill(order, options = {}) {
    return this.printHtml(await this.getBillHtml(order, options));
  }

  /**
   * Print the bill for an order id, reading the latest items, discount and payments first
   * @returns {Promise<Object>} the order that was printed
   */
  async printBillById(orderId, options = {}) {
    const order = await orderService.getOrder(orderId);
    await this.printBill(order, options);
    return order;
  }

  /** @deprecated kept for older screens; use printBill */
  async printInvoice(order) {
    return this.printBill(order);
  }

  /** Test page for the bill or KOT format, using sample data */
  async printSample(kind, settings, sample) {
    const html = kind === 'kot'
      ? await this.getKOTHtml(sample, { settings })
      : await this.getBillHtml(sample, { settings });
    return this.printHtml(html);
  }

  /** Printer test page */
  async printTest() {
    return this.printHtml(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
  body { font-family: monospace; font-size: 13px; margin: 0; padding: 8px; text-align: center; }
</style></head><body>
  <div style="font-size:16px;font-weight:bold">PRINTER TEST PAGE</div>
  <div>${new Date().toLocaleString()}</div>
  <div style="margin-top:8px">If you can read this, printing is working.</div>
</body></html>`);
  }
}

export default new PrintService();
