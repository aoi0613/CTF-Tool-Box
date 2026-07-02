// xterm.js の初期化
const term = new Terminal({
    cursorBlink: true,
    fontFamily: 'monospace',
    theme: { background: '#1e1e1e' }
});
term.open(document.getElementById('terminal-container'));

// ==========================================
// 仮想ファイルシステム (VFS)
// ==========================================
let rootDir = { type: 'dir', children: {} };
let pathStack = []; // ルートからの相対パス配列

// 初期ファイルの設置
rootDir.children['flag.txt'] = { type: 'file', content: stringToBuffer("CTF{p1p3_4nd_r3d1r3ct_m4st3r}\n") };
rootDir.children['memo.txt'] = { type: 'file', content: stringToBuffer("Try to use pipeline:\ncat flag.txt | grep CTF\n") };

// 文字列 <-> Uint8Array の相互変換
function bufferToString(buf) { return new TextDecoder('utf-8').decode(buf); }
function stringToBuffer(str) { return new TextEncoder().encode(str); }

// パス文字列から絶対パス配列を取得
function getAbsoluteParts(pathStr) {
    let parts = pathStr.startsWith('/') ? [] : [...pathStack];
    for (let p of pathStr.split('/')) {
        if (p === '' || p === '.') continue;
        if (p === '..') { if (parts.length > 0) parts.pop(); }
        else parts.push(p);
    }
    return parts;
}

// パス配列から該当ノードを取得
function getNodeByParts(parts) {
    let node = rootDir;
    for (let p of parts) {
        if (node.type !== 'dir' || !node.children[p]) return null;
        node = node.children[p];
    }
    return node;
}

// ファイルをVFSに保存（上書き または 追記）
function saveToFile(filePath, contentStr, append = false) {
    let parts = getAbsoluteParts(filePath);
    if (parts.length === 0) return "bash: redirect: invalid path";
    let fileName = parts.pop();
    let parentDir = getNodeByParts(parts);

    if (!parentDir || parentDir.type !== 'dir') return `bash: ${filePath}: No such file or directory`;
    let existing = parentDir.children[fileName];
    if (existing && existing.type === 'dir') return `bash: ${filePath}: Is a directory`;

    let newContent = contentStr;
    if (append && existing && existing.type === 'file') {
        newContent = bufferToString(existing.content) + contentStr;
    }

    parentDir.children[fileName] = { type: 'file', content: stringToBuffer(newContent) };
    return null;
}

// ==========================================
// コマンド解析と実行エンジン (パイプ・リダイレクト対応)
// ==========================================

// 引用符を考慮してコマンドラインからリダイレクトを抽出
function extractRedirect(line) {
    let inSingle = false, inDouble = false, append = false;
    let redirectFile = null, splitIdx = -1;
    
    for (let i = line.length - 1; i >= 0; i--) {
        let char = line[i];
        if (char === "'" && !inDouble) inSingle = !inSingle;
        else if (char === '"' && !inSingle) inDouble = !inDouble;
        else if (!inSingle && !inDouble) {
            if (char === '>' && i > 0 && line[i-1] === '>') {
                splitIdx = i - 1; append = true; break;
            } else if (char === '>') {
                splitIdx = i; append = false; break;
            }
        }
    }
    
    let cmdLine = line;
    if (splitIdx !== -1) {
        cmdLine = line.substring(0, splitIdx).trim();
        redirectFile = line.substring(splitIdx + (append ? 2 : 1)).trim().replace(/^["']|["']$/g, '');
    }
    return { cmdLine, redirectFile, append };
}

// 引用符を考慮したパイプ分割
function splitPipeline(line) {
    let parts = [], current = "";
    let inSingle = false, inDouble = false;
    for (let i = 0; i < line.length; i++) {
        let char = line[i];
        if (char === "'" && !inDouble) inSingle = !inSingle;
        else if (char === '"' && !inSingle) inDouble = !inDouble;
        else if (char === '|' && !inSingle && !inDouble) {
            parts.push(current); current = ""; continue;
        }
        current += char;
    }
    parts.push(current);
    return parts;
}

// 引用符を考慮した引数分割
function parseArgs(str) {
    const regex = /(?:[^\s"']+|"[^"]*"|'[^']*')+/g;
    let args = str.match(regex) || [];
    return args.map(a => a.replace(/^["']|["']$/g, ''));
}

// ==========================================
// 個別コマンドの実装 (出力を文字列で返す)
// ==========================================

function execCat(args, stdin) {
    if (args.length === 1) return stdin;
    let output = [];
    for (let i = 1; i < args.length; i++) {
        let node = getNodeByParts(getAbsoluteParts(args[i]));
        if (!node) output.push(`cat: ${args[i]}: No such file or directory`);
        else if (node.type === 'dir') output.push(`cat: ${args[i]}: Is a directory`);
        else output.push(bufferToString(node.content));
    }
    return output.join('\n');
}

function execGrep(args, stdin) {
    let query = args[1];
    if (!query) return "Usage: grep <pattern> [file]";
    let text = stdin;
    if (args.length > 2) {
        let node = getNodeByParts(getAbsoluteParts(args[2]));
        if (node && node.type === 'file') text = bufferToString(node.content);
    }
    if (!text) return "";
    return text.split(/\r?\n/).filter(line => line.includes(query)).join('\n');
}

function execStrings(args, stdin) {
    let text = stdin;
    if (args.length > 1) {
        let node = getNodeByParts(getAbsoluteParts(args[1]));
        if (node && node.type === 'file') text = bufferToString(node.content);
    }
    if (!text) return "";
    let matches = text.match(/[ -~]{4,}/g) || [];
    return matches.join('\n');
}

function execLs(args) {
    let pathStr = args.length > 1 ? args[1] : ".";
    let node = getNodeByParts(getAbsoluteParts(pathStr));
    if (!node) return `ls: cannot access '${pathStr}': No such file or directory`;
    if (node.type === 'file') return pathStr;
    return Object.keys(node.children).sort().join('  ');
}

function execCd(args) {
    let pathStr = args.length > 1 ? args[1] : "/";
    let parts = getAbsoluteParts(pathStr);
    let node = getNodeByParts(parts);
    if (!node) return `bash: cd: ${pathStr}: No such file or directory`;
    if (node.type !== 'dir') return `bash: cd: ${pathStr}: Not a directory`;
    pathStack = parts;
    return "";
}

function execMkdir(args) {
    if (args.length < 2) return "mkdir: missing operand";
    let parts = getAbsoluteParts(args[1]);
    if (parts.length === 0) return "";
    let name = parts.pop();
    let parent = getNodeByParts(parts);
    if (!parent || parent.type !== 'dir') return `mkdir: cannot create directory '${args[1]}': No such file or directory`;
    if (parent.children[name]) return `mkdir: cannot create directory '${args[1]}': File exists`;
    parent.children[name] = { type: 'dir', children: {} };
    return "";
}

// 1つのコマンドを処理して結果を返す（パイプで繋がれる前提）
function runSingleCommand(args, stdin) {
    let cmd = args[0];
    switch(cmd) {
        case 'cat': return execCat(args, stdin);
        case 'grep': return execGrep(args, stdin);
        case 'strings': return execStrings(args, stdin);
        case 'echo': return args.slice(1).join(' ') + (args.length > 1 ? '\n' : '');
        case 'ls': return execLs(args);
        case 'pwd': return '/' + pathStack.join('/');
        case 'cd': return execCd(args);
        case 'mkdir': return execMkdir(args);
        case 'clear': term.clear(); return "";
        case 'nano': openNano(args[1]); return null; // nullを返してプロセスを一時停止
        default:
            if (cmd.startsWith('./')) return `Executing ${cmd.substring(2)}...\r\n[Output] Hello from CTF Web Shell!`;
            return `bash: ${cmd}: command not found`;
    }
}

// ==========================================
// ターミナルの入出力・実行管理
// ==========================================
function prompt() {
    term.write(`\r\n\x1b[1;32mctf-user@browser\x1b[0m:\x1b[1;34m/${pathStack.join('/')}\x1b[0m$ `);
}

function executeCommandLine(rawLine) {
    let line = rawLine.trim();
    if (!line) { prompt(); return; }

    let { cmdLine, redirectFile, append } = extractRedirect(line);
    let commands = splitPipeline(cmdLine).map(c => c.trim());
    let currentStdin = "";

    // パイプライン処理（左から順に実行し、出力を次の入力に渡す）
    for (let i = 0; i < commands.length; i++) {
        if (!commands[i]) continue;
        let args = parseArgs(commands[i]);
        let result = runSingleCommand(args, currentStdin);
        
        // null が返ってきた場合 (nano起動時など) はプロンプトを出さずに処理を中断
        if (result === null) return; 
        currentStdin = result;
    }

    // 最終出力の処理 (ファイルへのリダイレクト or 画面出力)
    if (redirectFile) {
        let err = saveToFile(redirectFile, currentStdin, append);
        if (err) term.write(err + '\r\n');
    } else if (currentStdin !== undefined && currentStdin !== "") {
        // 出力末尾の改行を整えてターミナルへ
        term.write(currentStdin.replace(/\r?\n/g, '\r\n'));
        if (!currentStdin.endsWith('\n')) term.write('\r\n');
    }
    
    prompt();
}

// 入力イベントのバインディング
let inputBuffer = '';
term.onData(data => {
    // ペースト対策のため、入力データを1文字ずつ処理
    for (let i = 0; i < data.length; i++) {
        const char = data[i];
        const code = char.charCodeAt(0);
        
        if (code === 13 || code === 10) { // Enter
            term.write('\r\n');
            executeCommandLine(inputBuffer);
            inputBuffer = '';
        } else if (code === 127 || code === 8) { // Backspace
            if (inputBuffer.length > 0) {
                inputBuffer = inputBuffer.slice(0, -1);
                term.write('\b \b');
            }
        } else if (code >= 32 && code <= 126) { // Printable chars
            inputBuffer += char;
            term.write(char);
        }
    }
});

// 初期画面
term.write('Welcome to CTF Web Shell (Enhanced Pipeline Edition)\r\n');
term.write('Supported: cat, grep, strings, echo, ls, pwd, cd, mkdir, clear, nano\r\n');
prompt();

// ==========================================
// GUIベースの nano シミュレータ
// ==========================================
let nanoCurrentFile = null;

function openNano(filename) {
    if (!filename) {
        term.write('nano: missing filename\r\n');
        prompt();
        return;
    }
    nanoCurrentFile = filename;
    let node = getNodeByParts(getAbsoluteParts(filename));
    let content = "";
    
    if (node && node.type === 'file') {
        content = bufferToString(node.content);
    } else if (node && node.type === 'dir') {
        term.write(`nano: ${filename}: Is a directory\r\n`);
        prompt();
        return;
    }

    document.getElementById('nanoTitle').innerText = `GNU nano - ${filename}`;
    document.getElementById('nanoTextarea').value = content;
    document.getElementById('nanoModal').style.display = 'flex';
    document.getElementById('nanoTextarea').focus();
}

window.nanoSave = function() {
    if (!nanoCurrentFile) return;
    let content = document.getElementById('nanoTextarea').value;
    let err = saveToFile(nanoCurrentFile, content, false);
    if (err) alert(err);
    else alert(`[ ${nanoCurrentFile} に書き込みました ]`);
};

window.nanoExit = function() {
    document.getElementById('nanoModal').style.display = 'none';
    nanoCurrentFile = null;
    prompt(); // nano終了時にターミナルプロンプトを復帰
    term.focus();
};

// nano内でのショートカットキー (Ctrl+S, Ctrl+X)
document.getElementById('nanoTextarea').addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        nanoSave();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        nanoExit();
    }
});

// ==========================================
// 外部からのファイルアップロード対応
// ==========================================
document.getElementById('fileInput').addEventListener('change', function(e) {
    let file = e.target.files[0];
    if (!file) return;
    
    let reader = new FileReader();
    reader.onload = function(evt) {
        let uint8 = new Uint8Array(evt.target.result);
        let parentDir = getNodeByParts(pathStack); // 現在のディレクトリ
        parentDir.children[file.name] = { type: 'file', content: uint8 };
        
        // ターミナルの入力行をリセットしてメッセージを表示
        term.write(`\r\n\x1b[32m[System]\x1b[0m Uploaded '${file.name}' to /${pathStack.join('/')}\r\n`);
        prompt();
        inputBuffer = '';
    };
    reader.readAsArrayBuffer(file);
});