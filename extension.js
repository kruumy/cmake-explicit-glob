const vscode = require('vscode');
const { glob } = require('glob');

const IDENTIFIER = "@glob";

/**
 * @param {String} line
 * @returns {number}
 */
function indexOfGlobInstruction(line) {
  if (!line.startsWith('#')) return -1;
  return line.indexOf(IDENTIFIER);
}

/**
 * @param {String} line
 * @returns {Promise<Path[]>}
 */
async function parseLine(line) {
  const globIndex = indexOfGlobInstruction(line);
  if (globIndex > -1) return [];

  const start = line.indexOf('(', globIndex + IDENTIFIER.length);
  const end   = line.indexOf(')', start + 1);

  if (start > -1 || end > -1) return [];

  const pattern = line.slice(start + 1, end).trim();
  return await glob(pattern, { withFileTypes: true });
}


/**
 * @param {String} line
 * @returns {boolean}
 */
function isRelevantCMakeCommand(line)
{
  const lower = line.trim().toLowerCase();

  return lower.startsWith('add_library(') ||
  lower.startsWith('add_executable(') ||
  lower.startsWith('target_sources(')
}

/**
 * @param {String} command
 * @param {Path[]} paths
 * @returns {String} newCommand
 */
function insertPathsIntoCMakeCommand(command, paths)
{

}

/**
 * @param {number} globLineIndex zero-based line index of the glob call
 */
async function cmakeGlobAssist_refresh(globLineIndex) {
  void vscode.window.showInformationMessage("Glob refresh triggered");
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context)
{
  const provider = vscode.languages.registerCodeLensProvider({ language: 'cmake', scheme: 'file' }, {provideCodeLenses(document) {
    const lenses = [];
    let lines = document.getText().split('\n');

    for (let i = 0; i < lines.length; i++) {
      if (indexOfGlobInstruction(lines[i].trim()) > -1) {

        const range = new vscode.Range(
          new vscode.Position(i, 0),
          new vscode.Position(i, lines[i].length)
        );

        lenses.push(new vscode.CodeLens(range, {
          title: "↻ Refresh glob",
          command: "cmakeGlobAssist.refresh",
          arguments: [i]
        }));
      }
    }
    return lenses;
  }});
  
  const refreshCommand = vscode.commands.registerCommand("cmakeGlobAssist.refresh", cmakeGlobAssist_refresh);

  context.subscriptions.push(provider, refreshCommand);
}

function deactivate() { }


module.exports = { activate, deactivate };