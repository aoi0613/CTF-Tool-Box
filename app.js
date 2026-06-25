// メイン処理：すべてを一括で解読
function decodeAll() {
    const inputText = document.getElementById('inputText').value.trim();
    const caesarShift = parseInt(document.getElementById('caesarShift').value) || 0;
    const vigenereKey = document.getElementById('vigenereKey').value;
    const rsaPrivateKey = document.getElementById('rsaPrivateKey').value.trim();
    const globalError = document.getElementById('globalError');

    globalError.textContent = '';

    if (!inputText) {
        globalError.textContent = 'エラー: 文字列を入力してください。';
        return;
    }

    // 各解読処理を安全に実行
    runDecoder('out-base64', () => decodeURIComponent(escape(atob(inputText))));
    runDecoder('out-url', () => decodeURIComponent(inputText));
    runDecoder('out-rot13', () => decodeCaesar(inputText, 13));
    runDecoder('out-caesar', () => decodeCaesar(inputText, caesarShift));
    runDecoder('out-vigenere', () => decodeVigenere(inputText, vigenereKey));
    runDecoder('out-morse', () => decodeMorse(inputText));
    
    // 追加：RSA復号の実行
    runDecoder('out-rsa', () => decodeRSA(inputText, rsaPrivateKey));
}

// ヘルパー関数：各解読処理のエラーを個別にキャッチする
function runDecoder(targetId, decodeFn) {
    const outputEl = document.getElementById(targetId);
    try {
        outputEl.value = decodeFn();
    } catch (e) {
        outputEl.value = "解読不可: " + (e.message || "不正な形式です");
    }
}

// --- 追加：RSA暗号の復号ロジック ---
function decodeRSA(encodedStr, pemKey) {
    if (!pemKey) {
        throw new Error("秘密鍵が入力されていません");
    }
    // forgeライブラリが正しく読み込まれているかチェック
    if (typeof forge === 'undefined') {
        throw new Error("暗号ライブラリの読み込みに失敗しています");
    }

    try {
        // PEM形式の秘密鍵をパース
        const privateKey = forge.pki.privateKeyFromPem(pemKey);
        
        // 入力文字列（Base64）をバイナリデータにデコード
        const encryptedBytes = forge.util.decode64(encodedStr);
        
        // 秘密鍵を使って復号 (標準的な PKCS#1 v1.5 パディングを想定)
        const decryptedBytes = privateKey.decrypt(encryptedBytes, 'RSA-OAEP'); 
        // ※ もし標準的なPKCS#1 v1.5の場合は 'RSA-OAEP' を省くか 'RSAES-PKCS1-V1_5' を指定します。
        // ここでは、近年の標準である 'RSA-OAEP' をデフォルトとします。

        // バイナリからUTF-8文字列に変換
        return forge.util.decodeUtf8(decryptedBytes);
    } catch (err) {
        // 詳細なエラーを投げず、カスタムメッセージにする（鍵の間違いやパディングエラーなど）
        throw new Error("復号に失敗しました。鍵または暗号文が正しくありません。");
    }
}

// --- 既存のアルゴリズム群 (省略せずそのまま残す) ---

function decodeCaesar(str, shift) {
    shift = (shift % 26 + 26) % 26; 
    return str.replace(/[a-zA-Z]/g, function(c) {
        const base = c <= 'Z' ? 65 : 97;
        return String.fromCharCode(((c.charCodeAt(0) - base - shift + 26) % 26) + base);
    });
}

function decodeVigenere(str, key) {
    if (!key) throw new Error("鍵が指定されていません");
    key = key.toLowerCase().replace(/[^a-z]/g, '');
    if (!key) throw new Error("鍵は英字を含める必要があります");
    
    let keyIndex = 0;
    return str.replace(/[a-zA-Z]/g, function(c) {
        const base = c <= 'Z' ? 65 : 97;
        const shift = key.charCodeAt(keyIndex % key.length) - 97;
        keyIndex++;
        return String.fromCharCode(((c.charCodeAt(0) - base - shift + 26) % 26) + base);
    });
}

function decodeMorse(str) {
    if (!/^[.\-\s]+$/.test(str)) {
        throw new Error("モールス符号の形式ではありません");
    }
    const morseMap = {
        '.-':'A', '-...':'B', '-.-.':'C', '-..':'D', '.':'E', '..-.':'F',
        '--.':'G', '....':'H', '..':'I', '.---':'J', '-.-':'K', '.-..':'L',
        '--':'M', '-.':'N', '---':'O', '.--.':'P', '--.-':'Q', '.-.':'R',
        '...':'S', '-':'T', '..-':'U', '...-':'V', '.--':'W', '-..-':'X',
        '-.--':'Y', '--..':'Z', '.----':'1', '..---':'2', '...--':'3',
        '....-':'4', '.....':'5', '-....':'6', '--...':'7', '---..':'8',
        '----.':'9', '-----':'0'
    };
    return str.trim().split(/\s+/).map(code => morseMap[code] || '?').join('');
}

function copyResult(targetId) {
    const outputText = document.getElementById(targetId).value;
    if (!outputText || outputText.startsWith("解読不可")) {
        alert("コピーする有効な結果がありません。");
        return;
    }
    navigator.clipboard.writeText(outputText).then(() => {
        alert('コピーしました！');
    }).catch(err => {
        alert('コピーに失敗しました。');
    });
}