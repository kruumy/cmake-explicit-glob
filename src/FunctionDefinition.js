const vscode = require('vscode');

class FunctionDefinition {
    /**
     * @param {string} name
     * @param {string[]} parameters
     * @param {vscode.Position | null} startPosition
     * @param {vscode.Position | null} endPosition
     */
    constructor(name, parameters, startPosition = null, endPosition = null) {
        this.name = name;
        this.parameters = parameters;
        this.startPosition = startPosition;
        this.endPosition = endPosition;
    }

    /**
     * Parse a function call from a raw string (single-line or collected text)
     * @param {string} rawstr
     * @returns {FunctionDefinition | null}
     */
    static parseFromString(rawstr) {
        const match = rawstr.match(/([a-zA-Z_$][\w$]*)\s*\(\s*([\s\S]*?)\s*\)$/);
        if (!match) return null;

        const name = match[1];
        const paramsStr = match[2].trim();
        const parameters = [];

        let current = '';
        let inQuotes = false;
        let braceDepth = 0;

        for (let i = 0; i < paramsStr.length; i++) {
            const ch = paramsStr[i];

            if (ch === '"') {
                inQuotes = !inQuotes;
                continue;
            }

            if (!inQuotes) {
                if (ch === '{') {
                    braceDepth++;
                } else if (ch === '}') {
                    if (braceDepth > 0) braceDepth--;
                }
            }

            if (!inQuotes && braceDepth === 0 && (ch === ',' || /\s/.test(ch))) {
                if (current.length > 0) {
                    parameters.push(current);
                    current = '';
                }
                continue;
            }
            current += ch;
        }

        if (current.length > 0) {
            parameters.push(current);
        }

        return new FunctionDefinition(name, parameters);
    }

    /**
     * Parse a function call starting at a given line in a document
     * @param {vscode.TextDocument} document
     * @param {number} startLine
     * @returns {FunctionDefinition | null}
     */
    static parseFromDocument(document, startLine) {
        let rawstr = "";
        let startPosition = null;
        let endPosition = null;
        let openParens = 0;
        let started = false;

        for (let i = startLine; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text;

            for (let col = 0; col < lineText.length; col++) {
                const ch = lineText[col];

                if (!started && /[a-zA-Z_$]/.test(ch)) {
                    startPosition = new vscode.Position(i, col);
                    started = true;
                }

                if (started) {
                    rawstr += ch;

                    if (ch === "(") {
                        openParens++;
                    } else if (ch === ")") {
                        openParens--;
                        if (openParens === 0) {
                            endPosition = new vscode.Position(i, col + 1);
                            break;
                        }
                    }
                }
            }

            if (endPosition) break;
            if (started) rawstr += "\n";
        }

        if (!startPosition || !endPosition) return null;

        const result = this.parseFromString(rawstr);
        if (!result) return null;

        result.startPosition = startPosition;
        result.endPosition = endPosition;
        return result;
    }
}

module.exports = { FunctionDefinition };
