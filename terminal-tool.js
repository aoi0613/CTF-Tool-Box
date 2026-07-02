// xterm.js の初期化
const term = new Terminal({
    cursorBlink: true,
    fontFamily: 'monospace',
    theme: {
        background: '#1e1e1e'
    }
});

// HTMLのコンテナにターミナルをアタッチ
term.open(document.getElementById('terminal-container'));

// 初期メッセージの表示
term.write('Welcome to CTF Web Shell\r\n');
term.write('Type "help" to see available commands.\r\n\r\n');
prompt();

// 入力バッファ
let command = '';

// コマンドプロンプトを表示する関数
function prompt() {
    term.write('\x1b[1;32mctf-user@browser\x1b[0m:\x1b[1;34m~\x1b[0m$ ');
}

// ターミナルのキーボード入力イベント処理
term.onData(e => {
    switch (e) {
        case '\r': // Enterキー
            term.write('\r\n');
            processCommand(command.trim());
            command = '';
            prompt();
            break;
        case '\u007F': // Backspaceキー
            if (command.length > 0) {
                term.write('\b \b'); // カーソルを戻して空白で上書きし、再度戻す
                command = command.substring(0, command.length - 1);
            }
            break;
        default:
            // 印刷可能な文字のみバッファに追加して画面に表示
            if (e >= String.fromCharCode(0x20) && e <= String.fromCharCode(0x7E)) {
                command += e;
                term.write(e);
            }
    }
});

// コマンドを処理する関数（モック）
function processCommand(cmd) {
    if (cmd === '') return;

    if (cmd === 'help') {
        term.write('Available commands: help, clear, echo\r\n');
    } else if (cmd === 'clear') {
        term.clear();
    } else if (cmd.startsWith('echo ')) {
        term.write(cmd.substring(5) + '\r\n');
    } else {
        term.write(`bash: ${cmd}: command not found\r\n`);
    }
}

// -----------------------------------------
// ファイルアップロードの処理
// -----------------------------------------
const fileInput = document.getElementById('fileInput');
const fileError = document.getElementById('fileError');

// アップロードされたファイル情報を保持する変数
let currentUploadedFile = null;

fileInput.addEventListener('change', function(event) {
    fileError.textContent = '';
    const file = event.target.files[0];
    
    if (!file) {
        return;
    }

    // 簡易的なバリデーション: サイズ制限 (例: 10MB)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
        fileError.textContent = 'エラー: ファイルサイズは10MB以下にしてください。';
        fileInput.value = ''; // 選択をリセット
        return;
    }

    currentUploadedFile = file;

    // ターミナル上にファイルが認識されたことを通知
    term.write(`\r\n\x1b[1;33m[System] File uploaded: ${file.name} (${file.size} bytes)\x1b[0m\r\n`);
    prompt();
});