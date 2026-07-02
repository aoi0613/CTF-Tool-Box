// xterm.js の初期化
const term = new Terminal({
    cursorBlink: true,
    fontFamily: 'monospace',
    theme: { background: '#1e1e1e' }
});
term.open(document.getElementById('terminal-container'));

// -----------------------------------------
// 仮想ファイルシステム (VFS) の構築
// -----------------------------------------
let rootDir = { type: 'dir', permissions: 'drwxr-xr-x', children: {} };
let fileSystem = { '~': rootDir }; // ~ (ホーム) をルートとして扱う
let currentPath = ['~']; // 現在のパスを配列で管理

function getCurrentDirNode() {
    let node = fileSystem['~'];
    for (let i = 1; i < currentPath.length; i++) {
        node = node.children[currentPath[i]];
    }
    return node;
}

function getPwdString() {
    return currentPath.join('/').replace('~/', '~/') || '~';
}

function prompt() {
    term.write(`\x1b[1;32mctf-user@browser\x1b[0m:\x1b[1;34m${getPwdString()}\x1b[0m$ `);
}

term.write('Welcome to CTF Web Shell (Enhanced VFS)\r\n');
term.write('Type "help" to see available commands.\r\n\r\n');
prompt();

let command = '';

// キーボード入力の処理
term.onData(e => {
    switch (e) {
        case '\r': // Enter
            term.write('\r\n');
            processCommand(command.trim());
            command = '';
            prompt();
            break;
        case '\u007F': // Backspace
            if (command.length > 0) {
                term.write('\b \b');
                command = command.substring(0, command.length - 1);
            }
            break;
        default:
            if (e >= String.fromCharCode(0x20) && e <= String.fromCharCode(0x7E)) {
                command += e;
                term.write(e);
            }
    }
});

// -----------------------------------------
// ファイルアップロード (カレントディレクトリに保存)
// -----------------------------------------
document.getElementById('fileInput').addEventListener('change', function(event) {
    const fileError = document.getElementById('fileError');
    fileError.textContent = '';
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
        fileError.textContent = 'エラー: ファイルサイズは10MB以下にしてください。';
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const bytes = new Uint8Array(e.target.result);
        const text = new TextDecoder().decode(bytes);
        
        // カレントディレクトリにファイルを追加
        const curDir = getCurrentDirNode();
        curDir.children[file.name] = {
            type: 'file',
            permissions: '-rw-r--r--', // デフォルト権限
            size: file.size,
            bytes: bytes,
            text: text
        };
        
        term.write(`\r\n\x1b[1;33m[System] Uploaded to ${getPwdString()}/${file.name}\x1b[0m\r\n`);
        prompt();
    };
    reader.readAsArrayBuffer(file);
});

// -----------------------------------------
// コマンド処理
// -----------------------------------------
function processCommand(cmdLine) {
    if (cmdLine === '') return;
    
    // 引数の分割 (クォーテーションなどは考慮しない簡易版)
    const args = cmdLine.split(/\s+/);
    const cmd = args[0];
    const curDir = getCurrentDirNode();

    switch (cmd) {
        case 'help':
            term.write('Commands: pwd, cd, ls, mkdir, cp, chmod, cat, strings, file, grep, clear\r\n');
            break;
        case 'clear':
            term.clear();
            break;
        case 'pwd':
            term.write(getPwdString() + '\r\n');
            break;
        case 'cd':
            if (args.length < 2 || args[1] === '~') {
                currentPath = ['~'];
            } else if (args[1] === '..') {
                if (currentPath.length > 1) currentPath.pop();
            } else {
                const target = args[1];
                if (curDir.children[target] && curDir.children[target].type === 'dir') {
                    currentPath.push(target);
                } else {
                    term.write(`cd: ${target}: No such file or directory\r\n`);
                }
            }
            break;
        case 'ls':
            let isLong = args.includes('-l');
            for (let name in curDir.children) {
                let node = curDir.children[name];
                if (isLong) {
                    let size = node.type === 'dir' ? '4096' : (node.size || 0);
                    term.write(`${node.permissions} 1 user user ${size.toString().padStart(5)} Jan 1 00:00 ${name}\r\n`);
                } else {
                    // ディレクトリなら青色にする簡易的な装飾
                    let color = node.type === 'dir' ? '\x1b[1;34m' : '';
                    let reset = node.type === 'dir' ? '\x1b[0m' : '';
                    term.write(color + name + reset + '  ');
                }
            }
            if (!isLong) term.write('\r\n');
            break;
        case 'mkdir':
            if (args.length < 2) {
                term.write('mkdir: missing operand\r\n');
                return;
            }
            // -p オプションの処理（簡易版：現在の階層にだけ対応）
            let dirName = args[1] === '-p' ? args[2] : args[1];
            if (!dirName) return;
            if (!curDir.children[dirName]) {
                curDir.children[dirName] = { type: 'dir', permissions: 'drwxr-xr-x', children: {} };
            }
            break;
        case 'cp':
            if (args.length < 3) {
                term.write('cp: missing file operand\r\n');
                return;
            }
            let src = curDir.children[args[1]];
            let destName = args[2];
            if (!src) {
                term.write(`cp: ${args[1]}: No such file\r\n`);
            } else if (src.type === 'dir') {
                term.write(`cp: omitting directory '${args[1]}'\r\n`);
            } else {
                curDir.children[destName] = { ...src }; // コピーを作成
            }
            break;
        case 'chmod':
            if (args.length < 3) {
                term.write('chmod: missing operand\r\n');
                return;
            }
            let mode = args[1];
            let targetFile = curDir.children[args[2]];
            if (!targetFile) {
                term.write(`chmod: ${args[2]}: No such file\r\n`);
            } else if (mode === '+x') {
                // 簡易的に x を追加 (例: -rw-r--r-- -> -rwxr-xr-x)
                targetFile.permissions = targetFile.permissions.replace(/-/g, (match, offset) => {
                    return (offset === 3 || offset === 6 || offset === 9) ? 'x' : match;
                });
            }
            break;
        case 'cat':
            if (args.length < 2 || !curDir.children[args[1]]) {
                term.write(`cat: ${args[1] || ''}: No such file\r\n`);
            } else if (curDir.children[args[1]].type === 'dir') {
                term.write(`cat: ${args[1]}: Is a directory\r\n`);
            } else {
                let fNode = curDir.children[args[1]];
                // 💡 バイナリファイル（Null文字を含むか）を判定する安全装置
                if (fNode.text.indexOf('\0') !== -1) {
                    term.write(`\x1b[1;31mcat: ${args[1]}: binary file (バイナリファイルです)\x1b[0m\r\n`);
                    term.write(`※中身の文字を確認したい場合は 'strings ${args[1]}' を使用してください。\r\n`);
                } else {
                    term.write(fNode.text.replace(/\n/g, '\r\n') + '\r\n');
                }
            }
            break;
        case 'file':
            if (args.length < 2 || !curDir.children[args[1]]) {
                term.write(`file: ${args[1] || ''}: cannot open\r\n`);
            } else {
                let f = curDir.children[args[1]];
                if (f.type === 'dir') term.write(`${args[1]}: directory\r\n`);
                // バイナリかテキストかの簡易判定 (Null文字等が含まれるか)
                else if (f.text.indexOf('\0') !== -1) term.write(`${args[1]}: data (binary)\r\n`);
                else term.write(`${args[1]}: ASCII text\r\n`);
            }
            break;
        case 'grep':
            if (args.length < 3 || !curDir.children[args[2]]) {
                term.write(`grep: missing operand or file\r\n`);
            } else {
                let searchWord = args[1];
                let fNode = curDir.children[args[2]];
                if (fNode.type === 'dir') {
                    term.write(`grep: ${args[2]}: Is a directory\r\n`);
                } else {
                    let lines = fNode.text.split('\n');
                    lines.forEach(line => {
                        if (line.includes(searchWord)) {
                            // マッチした行を出力（簡易的に赤色でハイライト）
                            let highlighted = line.split(searchWord).join(`\x1b[1;31m${searchWord}\x1b[0m`);
                            term.write(highlighted + '\r\n');
                        }
                    });
                }
            }
            break;
        case 'strings':
            if (args.length < 2 || !curDir.children[args[1]]) {
                term.write(`strings: ${args[1] || ''}: No such file\r\n`);
            } else {
                let fBytes = curDir.children[args[1]].bytes;
                let currentStr = "";
                for (let i = 0; i < fBytes.length; i++) {
                    const byte = fBytes[i];
                    if (byte >= 32 && byte <= 126) currentStr += String.fromCharCode(byte);
                    else {
                        if (currentStr.length >= 4) term.write(currentStr + '\r\n');
                        currentStr = "";
                    }
                }
                if (currentStr.length >= 4) term.write(currentStr + '\r\n');
            }
            break;
        default:
            // ./実行ファイルの処理
            if (cmd.startsWith('./')) {
                let execName = cmd.substring(2);
                let execFile = curDir.children[execName];
                if (!execFile) {
                    term.write(`bash: ${cmd}: No such file or directory\r\n`);
                } else if (!execFile.permissions.includes('x')) {
                    term.write(`bash: ${cmd}: Permission denied\r\n`);
                } else {
                    // 実行権限がある場合のシミュレーション
                    term.write(`Executing ${execName}...\r\n`);
                    term.write(`[Output] Hello from ${execName}!\r\n`);
                }
            } else {
                term.write(`bash: ${cmd}: command not found\r\n`);
            }
    }
}