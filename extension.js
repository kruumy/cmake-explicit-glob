const vscode = require('vscode');
const { glob } = require('glob');
const path = require('path');

const IDENTIFIER = "@glob";
const SUPPORTED_COMMANDS = ['add_library', 'add_executable', 'target_sources'];

/**
 * @param {string} line
 * @param {string} identifier
 * @returns {number}
 */
function indexOfInstruction(line, identifier) {
  if (!line.startsWith('#')) return -1;
  return line.indexOf(identifier);
}

/**
 * @param {string} line
 * @param {number} instructionIndex
 * @returns {string}
 */
function getInstructionParameter(line, instructionIndex) {
  const start = line.indexOf('(', instructionIndex + IDENTIFIER.length);
  if (start === -1) return '';

  const end = line.indexOf(')', start + 1);
  if (end === -1) return '';

  let pattern = line.slice(start + 1, end).trim();
  if (pattern.startsWith('"') && pattern.endsWith('"')) {
    pattern = pattern.slice(1, -1);
  }
  return pattern;
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function parseCMakeArgs(text) {
  const args = [];
  let i = 0;
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i])) i++;
    if (i >= text.length) break;
    let arg = '';
    let quoted = false;
    if (text[i] === '"') {
      quoted = true;
      i++;
    }
    while (i < text.length) {
      if (quoted) {
        if (text[i] === '"') {
          i++;
          break;
        }
      } else {
        if (/\s/.test(text[i])) break;
      }
      arg += text[i];
      i++;
    }
    args.push(arg);
  }
  return args;
}

/**
 * @param {vscode.TextDocument} document
 * @param {number} globLineNumber
 * @returns {number | null}
 */
function findCommandStartLine(document, globLineNumber) {
  let line = globLineNumber + 1;
  while (line < document.lineCount) {
    const text = document.lineAt(line).text.trim();
    if (text === '' || text.startsWith('#')) {
      line++;
      continue;
    }
    const cmd = text.split('(')[0].trim().toLowerCase();
    if (SUPPORTED_COMMANDS.includes(cmd)) return line;
    line++;
  }
  return null;
}

/**
 * @param {vscode.TextDocument} document
 * @param {number} startLine
 * @param {number} openIndex
 * @returns {vscode.Position | null}
 */
function findCommandEndPosition(document, startLine, openIndex) {
  let parenCount = 1;
  let line = startLine;
  let char = openIndex + 1;

  while (line < document.lineCount && parenCount > 0) {
    const text = document.lineAt(line).text;
    const startChar = (line === startLine ? char : 0);
    for (let i = startChar; i < text.length; i++) {
      if (text[i] === '(') parenCount++;
      else if (text[i] === ')') {
        parenCount--;
        if (parenCount === 0) return new vscode.Position(line, i);
      }
    }
    line++;
  }
  return null;
}

/**
 * @param {string} lowerCmd
 * @param {string[]} args
 * @returns {number}
 */
function getFixedArgsCount(lowerCmd, args) {
  if (lowerCmd === 'target_sources') return 2;
  let count = 1;
  if (lowerCmd === 'add_library' && args.length >= 2 && /^(static|shared|module|object)$/i.test(args[1])) {
    count = 2;
  }
  return count;
}

/**
 * @param {string} indent
 * @param {string} cmdName
 * @param {string[]} fixedArgs
 * @param {string[]} newSources
 * @returns {string}
 */
function buildNewCommandText(indent, cmdName, fixedArgs, newSources) {
  const innerIndent = indent + '  ';
  let text = `${indent}${cmdName}(`;
  if (fixedArgs.length > 0) text += ` ${fixedArgs.join(' ')}`;
  if (newSources.length > 0) text += `\n${newSources.map(src => innerIndent + src).join('\n')}`;
  text += `\n${indent})`;
  return text;
}

/**
 * @param {vscode.TextLine} textLine
 * @param {vscode.TextDocument} document
 * @param {number} globInstructionIndex 
 */
async function cmakeGlobAssist_refresh(textLine, document, globInstructionIndex) {
  const pattern = getInstructionParameter(textLine.text, globInstructionIndex);
  if (!pattern) {
    void vscode.window.showErrorMessage("Invalid glob pattern");
    return;
  }

  let files = await glob(pattern, { cwd: path.dirname(document.fileName) });
  if (files.length === 0) {
    void vscode.window.showInformationMessage("No files found for glob");
    return;
  }

  files.sort();

  const cmdStartLine = findCommandStartLine(document, textLine.lineNumber);
  if (cmdStartLine === null) {
    void vscode.window.showErrorMessage("No supported CMake command found after glob");
    return;
  }

  const cmdLineText = document.lineAt(cmdStartLine).text;
  const indent = cmdLineText.slice(0, cmdLineText.search(/\S/));
  const openIndex = cmdLineText.indexOf('(');
  if (openIndex === -1) {
    void vscode.window.showErrorMessage("No opening parenthesis found");
    return;
  }

  const endPos = findCommandEndPosition(document, cmdStartLine, openIndex);
  if (endPos === null) {
    void vscode.window.showErrorMessage("Unbalanced parentheses");
    return;
  }

  const innerText = document.getText(new vscode.Range(
    new vscode.Position(cmdStartLine, openIndex + 1),
    endPos
  ));

  const args = parseCMakeArgs(innerText);
  const cmdName = cmdLineText.substring(cmdLineText.search(/\S/), openIndex).trim();
  const lowerCmd = cmdName.toLowerCase();

  const fixedArgsCount = getFixedArgsCount(lowerCmd, args);
  const fixedArgs = args.slice(0, fixedArgsCount);
  const newSources = files.map(f => `"${f.replace(/\\/g, '/')}"`);

  const newCommandText = buildNewCommandText(indent, cmdName, fixedArgs, newSources);

  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, new vscode.Range(
    new vscode.Position(cmdStartLine, 0),
    new vscode.Position(endPos.line, document.lineAt(endPos.line).text.length)
  ), newCommandText);

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
      for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i);
        const globInstructionIndex = indexOfInstruction(line.text.trim(), IDENTIFIER);
        if (globInstructionIndex > -1) {
          lenses.push(new vscode.CodeLens(line.range, {
            title: "↻ Refresh glob",
            command: "cmakeGlobAssist.refresh",
            arguments: [line, document, globInstructionIndex]
          }));
        }
      }
      return lenses;
    }
  });

  const refreshCommand = vscode.commands.registerCommand("cmakeGlobAssist.refresh", cmakeGlobAssist_refresh);

  context.subscriptions.push(provider, refreshCommand);
}

function deactivate() {}

module.exports = { activate, deactivate };