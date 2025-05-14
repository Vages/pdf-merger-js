'use strict';

var fs = require('fs');
var commander = require('commander');
var index = require('./index-BHNsGCUf.cjs');
require('fs/promises');
require('pdf-lib');

var _documentCurrentScript = typeof document !== 'undefined' ? document.currentScript : null;
function main(packageJson) {
  commander.program.version(packageJson.version).description(packageJson.description).option("-o, --output <outputFile>", "Merged PDF output file path").option("-v, --verbose", "Print verbose output").option("-s, --silent", "do not print any output to stdout. Overwrites --verbose").arguments("<inputFiles...>").action(async (inputFiles, cmd) => {
    const outputFile = cmd.output;
    const verbose = cmd.verbose && !cmd.silent;
    const silent = cmd.silent;
    if (!outputFile) {
      console.error("Please provide an output file using the --output flag");
      return;
    }
    if (!inputFiles || !inputFiles.length) {
      console.error("Please provide at least one input file");
      return;
    }
    try {
      const merger = new index.PDFMerger();
      for (const inputFile of inputFiles) {
        const [filePath, pagesString] = inputFile.split("#");
        const pages = pagesString ? index.parsePagesString(pagesString) : null;
        if (verbose) {
          if (pages && pages.length) {
            console.log(`adding page${pages.length > 1 ? "s" : ""} ${pages.join(",")} from ${filePath} to output...`);
          } else {
            console.log(`adding all pages from ${filePath} to output...`);
          }
        }
        await merger.add(filePath, pages);
      }
      if (verbose) {
        console.log(`Saving merged output to ${outputFile}...`);
      }
      await merger.save(outputFile);
      if (!silent) {
        console.log(`Merged pages successfully into ${outputFile}`);
      }
    } catch (error) {
      console.error("An error occurred while merging the PDFs:", error);
    }
  });
  commander.program.parse(process.argv);
}
(() => {
  const packageJson = JSON.parse(fs.readFileSync(new URL("./package.json", (typeof document === 'undefined' ? require('u' + 'rl').pathToFileURL(__filename).href : (_documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === 'SCRIPT' && _documentCurrentScript.src || new URL('cli.cjs', document.baseURI).href))), "utf-8"));
  main(packageJson);
})();
