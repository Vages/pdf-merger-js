'use strict';

var fs = require('fs/promises');
var pdfLib = require('pdf-lib');

function parsePagesString(pages) {
  const throwError = () => {
    throw new Error([
      'Invalid parameter "pages".',
      'Must be a string like "1,2,3" or "1-3" or "1to3"',
      `Was "${pages}" instead.`
    ].join(" "));
  };
  const isRangeString = (rangeString) => {
    return rangeString.includes("-") || rangeString.toLowerCase().includes("to");
  };
  const parseRange = (rangeString) => {
    const [start, end] = rangeString.split(/-|to/).map((s) => typeof s === "string" ? parseInt(s.trim()) : s);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  };
  if (typeof pages !== "string") {
    throwError();
  } else if (!pages.trim().replace(/ /g, "").match(/^(\d+|\d+-\d+|\d+to\d+)(,(\d+|\d+-\d+|\d+to\d+))*$/)) {
    throwError();
  } else if (pages.trim().match(/^\d+$/)) {
    return [parseInt(pages.trim())];
  } else if (pages.trim().includes(",")) {
    return pages.split(",").flatMap((s) => isRangeString(s) ? parseRange(s) : parseInt(s));
  } else if (isRangeString(pages)) {
    return parseRange(pages);
  }
  throwError();
}

class PDFMergerBase {
  /**
   * The internal pdf-lib document.
   *
   * @protected
   * @type {PDFDocument | undefined}
   */
  _doc = void 0;
  /**
   * The load options for pdf-lib.
   *
   * @type { import('pdf-lib').LoadOptions }
   * @protected
   */
  _loadOptions = {
    // allow merging of encrypted pdfs (issue #88)
    ignoreEncryption: true
  };
  constructor() {
    this.reset();
  }
  /**
   * Resets the internal state of the document, to start again.
   *
   * @returns {void}
   */
  reset() {
    this._doc = void 0;
  }
  /**
   * Set the metadata of the merged PDF.
   *
   * @async
   * @param {Metadata} metadata
   * @returns {Promise<void>}
   */
  async setMetadata(metadata) {
    await this._ensureDoc();
    if (metadata.producer) this._doc.setProducer(metadata.producer);
    if (metadata.author) this._doc.setAuthor(metadata.author);
    if (metadata.title) this._doc.setTitle(metadata.title);
    if (metadata.creator) this._doc.setCreator(metadata.creator);
  }
  /**
   * Add pages from a PDF document to the end of the merged document.
   *
   * @async
   * @param {PdfInput} input - a pdf source
   * @param {string | string[] | number | number[] | undefined | null} [pages]
   * @returns {Promise<void>}
   */
  async add(input, pages) {
    await this._ensureDoc();
    if (typeof pages === "undefined" || pages === null || pages === "all") {
      await this._addPagesFromDocument(input);
    } else if (typeof pages === "number") {
      await this._addPagesFromDocument(input, [pages]);
    } else if (Array.isArray(pages)) {
      const pagesAsNumbers = pages.map((p) => typeof p === "string" ? parseInt(p.trim()) : p);
      await this._addPagesFromDocument(input, pagesAsNumbers);
    } else if (typeof pages === "string" || pages instanceof String) {
      const pagesArray = parsePagesString(pages);
      await this._addPagesFromDocument(input, pagesArray);
    } else {
      throw new Error([
        'Invalid parameter "pages".',
        'Must be a string like "1,2,3" or "1-3" or an Array of numbers.'
      ].join(" "));
    }
  }
  /**
   * Creates a new PDFDocument and sets the metadata
   * if this.#doc does not exist yet
   *
   * @protected
   * @async
   * @returns {Promise<void>}
   */
  async _ensureDoc() {
    if (!this._doc) {
      this._doc = await pdfLib.PDFDocument.create();
      this._doc.setProducer("pdf-merger-js");
      this._doc.setCreationDate(/* @__PURE__ */ new Date());
    }
  }
  /**
   * Get the merged PDF as a Uint8Array.
   *
   * @async
   * @protected
   * @returns {Promise<Uint8Array>}
   */
  async _saveAsUint8Array() {
    await this._ensureDoc();
    return await this._doc.save();
  }
  /**
   * Get the merged PDF as a Base64 encoded string.
   *
   * @async
   * @protected
   * @returns {Promise<string>}
   */
  async _saveAsBase64() {
    await this._ensureDoc();
    return await this._doc.saveAsBase64({ dataUri: true });
  }
  /**
   * Converts the input to a Uint8Array.
   * If the input is a string, it is treated as a URL and the document gets fetched.
   *
   * @async
   * @protected
   * @param {PdfInput} input
   * @returns {Uint8Array}
   */
  async _getInputAsUint8Array(input) {
    if (input instanceof Uint8Array) {
      return input;
    }
    if (input instanceof ArrayBuffer || Object.prototype.toString.call(input) === "[object ArrayBuffer]") {
      return new Uint8Array(input);
    }
    if (typeof Blob !== "undefined" && input instanceof Blob) {
      const aBuffer = await input.arrayBuffer();
      return new Uint8Array(aBuffer);
    }
    if (input instanceof URL) {
      if (typeof fetch === "undefined") {
        throw new Error("fetch is not defined. You need to use a polyfill for this to work.");
      }
      const res = await fetch(input);
      const aBuffer = await res.arrayBuffer();
      return new Uint8Array(aBuffer);
    }
    const allowedTypes = ["Uint8Array", "ArrayBuffer", "File", "Blob", "URL"];
    let errorMsg = `pdf-input must be of type ${allowedTypes.join(", ")}, a valid filename or url!`;
    if (typeof input === "string" || input instanceof String) {
      errorMsg += ` Input was "${input}" wich is not an existing file, nor a valid URL!`;
    } else {
      errorMsg += ` Input was of type "${typeof input}" instead.`;
    }
    throw new Error(errorMsg);
  }
  /**
   * @async
   * @protected
   * @param {PdfInput} input
   * @param {number[] | undefined} pages - array of page numbers to add (starts at 1)
   * @returns {Promise<void>}
   */
  async _addPagesFromDocument(input, pages = void 0) {
    const src = await this._getInputAsUint8Array(input);
    const srcDoc = await pdfLib.PDFDocument.load(src, this._loadOptions);
    let indices = [];
    if (pages === void 0) {
      indices = srcDoc.getPageIndices();
    } else {
      indices = pages.map((p) => p - 1);
    }
    const copiedPages = await this._doc.copyPages(srcDoc, indices);
    copiedPages.forEach((page) => {
      this._doc.addPage(page);
    });
  }
}

class PDFMerger extends PDFMergerBase {
  /**
   * Returns a Uint8Array of the input.
   *
   * If input is a string, it is treated as an Filepath
   * If the file does not exist, it is treated as an URL.
   *
   * @async
   * @protected
   * @override
   * @param {PdfInput} input
   * @returns {Uint8Array}
   */
  async _getInputAsUint8Array(input) {
    if (input instanceof Buffer) {
      return input;
    }
    if (typeof input === "string" || input instanceof String) {
      try {
        await fs.access(input);
        return await fs.readFile(input);
      } catch (e) {
        try {
          Boolean(new URL(input));
          input = new URL(input);
        } catch (e2) {
          throw new Error(`The provided string "${input}" is neither a valid file-path nor a valid URL!`);
        }
      }
    }
    return await super._getInputAsUint8Array(input);
  }
  /**
   * Return the merged PDF as a Buffer.
   *
   * @async
   * @returns {Promise<Buffer>}
   */
  async saveAsBuffer() {
    const uInt8Array = await this._saveAsUint8Array();
    return Buffer.from(uInt8Array);
  }
  /**
   * Save the merged PDF to the given path.
   *
   * @async
   * @param {string | PathLike} fileName
   * @returns {Promise<void>}
   */
  async save(fileName) {
    const pdfBytes = await this._saveAsUint8Array();
    await fs.writeFile(fileName, pdfBytes);
  }
}

exports.PDFMerger = PDFMerger;
exports.parsePagesString = parsePagesString;
