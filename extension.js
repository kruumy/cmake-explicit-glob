const vscode = require('vscode');
import { glob, globSync, globStream, globStreamSync, Glob, Path } from 'glob'

const IDENTIFIER = "@glob";

/**
 * @param {String} line
 * @returns {number}
 */
function indexOfGlobInstruction(line) {
  if (line.startsWith('#')) {
    return line.indexOf(IDENTIFIER);
  }
}

/**
 * @param {String} line
 * @returns {Promise<Path[]>}
 */
async function parseLine(line) {
  const globIndex = indexOfGlobInstruction(line);
  if (globIndex != -1) {
    const startPoint = line.indexOf('(', indexOfGlobInstruction + IDENTIFIER.length);
    const endPoint = line.indexOf(')', startPoint);

    if (startPoint != -1 && endPoint != -1) {
      const globInstruction = line.substring(startPoint, endPoint).trim();
      return await glob(globInstruction,{ withFileTypes: true });
    }
  }
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
 * @param {vscode.ExtensionContext} context
 */
function activate(context)
{
  const provider = vscode.languages.registerCodeLensProvider({ language: 'cmake', scheme: 'file' }, {provideCodeLenses(document) {
    const lenses = [];
    let lines = document.getText().split('\n');

    for (let i = 0; i, lines.length; i++) {
      if (indexOfGlobInstruction(lines[i].trim()) != -1) {

        const range = new vscode.Range(
          new vscode.Position(i, 0),
          new vscode.Position(i, lines[i].length)
        );

        lenses.push(new vscode.CodeLens(range, {
          title: "↻ Refresh glob",
          command: "cmakeGlobAssist.refresh",
          arguments: []
        }));
      }
    }
    return lenses;
  }});
  
  const refreshCommand = vscode.commands.registerCommand("cmakeGlobAssist.refresh", async () => {
	  
	});

  context.subscriptions.push(provider, refreshCommand);
}

function deactivate() {}

module.exports = { activate, deactivate };