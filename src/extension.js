const vscode = require('vscode');
const { glob } = require('glob');
const path = require('path');
const { FunctionDefinition } = require("./FunctionDefinition")

const ESCAPE_TOKEN = "@";
const CODE_LENS_COMMANDS = {
  glob: {
    codeLensText: "↻ Refresh Glob",
    command: "cMakeExplicitGlob.refresh",
    commandHandler: cMakeExplicitGlob_refresh,
  }
};
const END_COMMAND_KEY = "end";

/**
 * @param {vscode.TextDocument} document
 * @param {number} startLine line index
 * @returns {number | null}
 */
function getNextEndLine(document, startLine) {
  for (let i = startLine; i < document.lineCount; i++) {
    const line = document.lineAt(i);
    if (line.text.trimStart().startsWith("#") && line.text.includes(`${ESCAPE_TOKEN}${END_COMMAND_KEY}`)) {
      return i;
    }
  }
  return null;
}

/**
 * @param {() => FunctionDefinition | null} globFunctionGetter
 * @param {vscode.TextDocument} document
 */
async function cMakeExplicitGlob_refresh(globFunctionGetter, document) {

  const globFunction = globFunctionGetter();
  if (globFunction == null) {
    vscode.window.showErrorMessage("Could not parse glob function call");
    return;
  }
  if (globFunction.parameters.length <= 0) {
    vscode.window.showErrorMessage("Glob function call has 0 parameters");
    return;
  }
  const endLine = getNextEndLine(document, globFunction.endPosition.line)
  if (endLine == null) {
    vscode.window.showErrorMessage(`Could not find ${ESCAPE_TOKEN}${END_COMMAND_KEY}`);
    return;
  }
  const files = await glob(globFunction.parameters[0], { cwd: path.dirname(document.fileName) });
  if (files.length <= 0) {
    void vscode.window.showInformationMessage("No files found for glob :(");
    return;
  }

  files.sort();

  let indent_spaces = document.lineAt(globFunction.startPosition.line).text.indexOf('#');
  if (indent_spaces === -1) {
    indent_spaces = globFunction.startPosition.character - 1;
  }
  let sourceList = "";
  for (let i = 0; i < files.length; i++) {
    sourceList += `\n${" ".repeat(indent_spaces)}"${files[i].replace(/\\/g, '/')}"`;
  }
  sourceList += "\n"

  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri,
    new vscode.Range(globFunction.endPosition, new vscode.Position(endLine, 0)),
    sourceList
  );
  await vscode.workspace.applyEdit(edit);

  void vscode.window.showInformationMessage("Glob refreshed");
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

  for (const [key, cmd] of Object.entries(CODE_LENS_COMMANDS)) {
    context.subscriptions.push(vscode.commands.registerCommand(cmd.command, cmd.commandHandler));
  }

  context.subscriptions.push(vscode.languages.registerCodeLensProvider({ language: 'cmake', scheme: 'file' }, {
    provideCodeLenses(document) {
      const lenses = [];

      for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i);

        Object.entries(CODE_LENS_COMMANDS)
          .filter(([key]) => line.text.includes(`${ESCAPE_TOKEN}${key}`))
          .forEach(([_, cmd]) => {
            lenses.push(new vscode.CodeLens(line.range, {
              title: cmd.codeLensText,
              command: cmd.command,
              arguments: [() => FunctionDefinition.parseFromDocument(document, i), document]
            }));
          });
      }

      return lenses;
    }
  }));

}

function deactivate() { }

module.exports = { activate, deactivate };