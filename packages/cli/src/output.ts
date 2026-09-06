/**
 * Output sinks for the probe command. Production writes stdio; tests record.
 * The results table goes to stdout so it stays pipeable
 * (`pnpm probe > results.txt`); progress and failure lines go to stderr.
 */
export interface RunCliOutput {
  /** Print the final results table (stdout in production). */
  printTable: (text: string) => void;
  /** Print one progress line (stderr in production). */
  printProgress: (line: string) => void;
  /** Print a failure message (stderr in production). */
  printError: (message: string) => void;
}

/** Production output sinks. */
export function stdioOutput(): RunCliOutput {
  return {
    printTable: (text) => console.log(text),
    printProgress: (line) => {
      process.stderr.write(`${line}\n`);
    },
    printError: (message) => console.error(message),
  };
}
