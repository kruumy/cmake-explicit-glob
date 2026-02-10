const vscode = require('vscode');
const { glob } = require('glob');
const path = require('path');
const { FunctionDefinition } = require("./FunctionDefinition")

const IDENTIFIER = "@glob";
const SUPPORTED_COMMANDS = ['add_library', 'add_executable', 'target_sources'];

/**
 * @param {() => FunctionDefinition} globFunctionGetter
 * @param {() => FunctionDefinition} cMakeFunctionGetter
 * @param {vscode.TextDocument} document
 */
async function cmakeGlobAssist_refresh(globFunctionGetter, cMakeFunctionGetter, document) {

  const globFunction = globFunctionGetter();
  const cMakeFunction = cMakeFunctionGetter();

  if (globFunction.parameters.length <= 0) {
    vscode.window.showErrorMessage("Glob function call has 0 parameters");
    return;
  }

  const files = await glob(globFunction.parameters[0], { cwd: path.dirname(document.fileName) });
  if (files.length === 0) {
    void vscode.window.showInformationMessage("No files found for glob");
    return;
  }
  files.sort();

  for (let i = 0; i < files.length; i++) {
    cMakeFunction.parameters[2 + i] = `"${files[i].replace(/\\/g, '/')}"`;
  }

  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri,
    new vscode.Range(cMakeFunction.startPosition, cMakeFunction.endPosition),
    cMakeFunction.toString(" ")
  );
  await vscode.workspace.applyEdit(edit);

  void vscode.window.showInformationMessage("Glob refreshed");
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  const provider = vscode.languages.registerCodeLensProvider({ language: 'cmake', scheme: 'file' }, {
    provideCodeLenses(document) {
      const lenses = [];

      let globFunction = null;
      let cMakeFunction = null;

      for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i);

        if (line.text.startsWith('#') && line.text.indexOf(IDENTIFIER) > -1) {
          globFunction = () => FunctionDefinition.parseFromDocument(document, i);

        }

        if (globFunction != null) {

          SUPPORTED_COMMANDS.forEach(element => {
            if (line.text.indexOf(element) > -1) {
              cMakeFunction = () => FunctionDefinition.parseFromDocument(document, i);
              return;
            }
          });

          if (cMakeFunction != null) {
            lenses.push(new vscode.CodeLens(line.range, {
              title: "↻ Refresh Glob",
              command: "cmakeGlobAssist.refresh",
              arguments: [globFunction, cMakeFunction, document]
            }));
            globFunction = null;
            cMakeFunction = null;
          }
        }
      }

      return lenses;
    }
  });

  const refreshCommand = vscode.commands.registerCommand("cmakeGlobAssist.refresh", cmakeGlobAssist_refresh);

  context.subscriptions.push(provider, refreshCommand);
}

function deactivate() { }

module.exports = { activate, deactivate };