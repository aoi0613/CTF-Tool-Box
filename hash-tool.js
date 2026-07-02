// メイン処理：すべてを一括で生成・変換
function generateAll() {
    const inputText = document.getElementById('inputText').value;
    const globalError = document.getElementById('globalError');

    // エラーメッセージの初期化
    globalError.textContent = '';

    // 1. ユーザ入力の検証（空白チェック）
    if (!inputText) {
        globalError.textContent = 'エラー: 文字列を入力してください。';
        clearResults();
        return;
    }

    // 2. ユーザ入力の検証（文字数上限）
    if (inputText.length > 10000) {
        globalError.textContent = `エラー: 入力文字数が上限（10,000文字）を超えています。（現在: ${inputText.length}文字）`;
        clearResults();
        return;
    }

    // 各変換処理の実行
    runGenerator('out-md5', () => CryptoJS.MD5(inputText).toString());
    runGenerator('out-sha256', () => CryptoJS.SHA256(inputText).toString());
    runGenerator('out-hex', () => stringToHex(inputText));
    runGenerator('out-bin', () => stringToBinary(inputText));
}

// ヘルパー関数：各処理を安全に実行し、エラーをキャッチする
function runGenerator(targetId, generateFn) {
    const outputEl = document.getElementById(targetId);
    try {
        outputEl.value = generateFn();
    } catch (e) {
        outputEl.value = "変換エラー: " + (e.message || "処理に失敗しました");
        console.error(e);
    }
}

// 文字列を16進数(Hex)に変換する関数
function stringToHex(str) {
    // UTF-8としてエンコードしてからHexに変換（CTFの標準的な挙動に合わせる）
    const utf8Bytes = new TextEncoder().encode(str);
    return Array.from(utf8Bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');
}

// 文字列を2進数(Binary)に変換する関数
function stringToBinary(str) {
    const utf8Bytes = new TextEncoder().encode(str);
    return Array.from(utf8Bytes)
        .map(b => b.toString(2).padStart(8, '0'))
        .join(' ');
}

// 結果欄をクリアする関数
function clearResults() {
    document.getElementById('out-md5').value = '';
    document.getElementById('out-sha256').value = '';
    document.getElementById('out-hex').value = '';
    document.getElementById('out-bin').value = '';
}

// クリップボードへのコピー機能（既存コードを踏襲）
function copyResult(targetId) {
    const outputText = document.getElementById(targetId).value;
    if (!outputText || outputText.startsWith("変換エラー")) {
        alert("コピーする有効な結果がありません。");
        return;
    }
    
    // クリップボードAPIを使用したモダンなコピー処理
    if (navigator.clipboard) {
        navigator.clipboard.writeText(outputText)
            .then(() => alert('コピーしました！'))
            .catch(() => alert('コピーに失敗しました。'));
    } else {
        // フォールバック
        const textArea = document.getElementById(targetId);
        textArea.select();
        try {
            document.execCommand('copy');
            alert('コピーしました！');
        } catch (err) {
            alert('自動コピーがサポートされていません。');
        }
    }
}

// キーボード入力イベントの設定
window.onload = function() {
    const inputTextEl = document.getElementById('inputText');
    
    // リアルタイム変換ではなく、Enterキー（Shiftなし）で実行する仕様（既存踏襲）
    inputTextEl.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            generateAll();
        }
    });
};