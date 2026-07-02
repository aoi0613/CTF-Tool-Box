// メイン処理：すべてを一括で解読
function decodeAll() {
    const inputText = document.getElementById('inputText').value.trim();
    const rsaC = document.getElementById('rsaC').value.trim();
    const globalError = document.getElementById('globalError');

    globalError.textContent = '';

    // メイン文字列もRSA暗号文(c)も入力されていない場合はエラー
    if (!inputText && !rsaC) {
        globalError.textContent = 'エラー: 解読したい文字列、またはRSAの暗号文(c)を入力してください。';
        return;
    }

    if (inputText.length > 10000) {
        globalError.textContent = `エラー: 入力文字数が上限（10,000文字）を超えています。（現在: ${inputText.length}文字）`;
        return;
    }

    // 1. 一般的な文字列デコード処理（inputTextがある場合のみ実行）
    if (inputText) {
        const caesarShift = parseInt(document.getElementById('caesarShift').value) || 0;
        const vigenereKey = document.getElementById('vigenereKey').value;
        const rsaPrivateKey = document.getElementById('rsaPrivateKey').value.trim();

        runDecoder('out-base64', () => decodeURIComponent(escape(atob(inputText))));
        runDecoder('out-url', () => decodeURIComponent(inputText));
        runDecoder('out-rot13', () => decodeCaesar(inputText, 13));
        runDecoder('out-caesar', () => decodeCaesar(inputText, caesarShift));
        runDecoder('out-vigenere', () => decodeVigenere(inputText, vigenereKey));
        runDecoder('out-morse', () => decodeMorse(inputText));
        runDecoder('out-rsa', () => decodeRSA(inputText, rsaPrivateKey));
    } else {
        // inputTextが無い場合は無関係な結果欄をクリアする
        ['out-base64', 'out-url', 'out-rot13', 'out-caesar', 'out-vigenere', 'out-morse', 'out-rsa'].forEach(id => {
            document.getElementById(id).value = '';
        });
    }

    // 2. RSAパラメータデコード処理（関連フィールドに入力がある場合実行）
    if (document.getElementById('rsaN').value.trim() || rsaC) {
        runDecoder('out-rsa-params', decodeRSAParams);
    } else {
        document.getElementById('out-rsa-params').value = '';
    }
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

// ==========================================
// 追加: RSAパラメータ計算 (BigInt) 関連の関数
// ==========================================

// 繰り返し二乗法によるモジュラべき乗算 (base^exp mod modulus)
function modPow(base, exponent, modulus) {
    if (modulus === 1n) return 0n;
    let result = 1n;
    base = base % modulus;
    while (exponent > 0n) {
        if (exponent % 2n === 1n) {
            result = (result * base) % modulus;
        }
        exponent = exponent / 2n;
        base = (base * base) % modulus;
    }
    return result;
}

// 文字列（10進数または16進数）を安全にBigIntに変換
function parseBigIntSafe(str, paramName) {
    str = str.trim();
    if (!str) return null;
    try {
        return BigInt(str);
    } catch (e) {
        throw new Error(`${paramName} の数値形式が不正です (10進数か0x始まりの16進数)`);
    }
}

// BigInt数値を16進数を経由してASCII文字列に変換
function bigIntToAscii(bigNum) {
    let hex = bigNum.toString(16);
    if (hex.length % 2 !== 0) hex = '0' + hex; // バイト単位にするため偶数長にする
    let str = '';
    for (let i = 0; i < hex.length; i += 2) {
        let code = parseInt(hex.substring(i, i + 2), 16);
        // ASCIIの印字可能文字 (32-126) であれば文字化、それ以外はドット
        if (code >= 32 && code <= 126) {
            str += String.fromCharCode(code);
        } else {
            str += '.';
        }
    }
    return str;
}

// CTF向けRSA解読メイン処理
function decodeRSAParams() {
    const nStr = document.getElementById('rsaN').value;
    const dStr = document.getElementById('rsaD').value;
    const cStr = document.getElementById('rsaC').value;

    if (!nStr || !dStr || !cStr) {
        throw new Error("復号には n, d, c の3つのパラメータが必要です");
    }

    const n = parseBigIntSafe(nStr, 'n');
    const d = parseBigIntSafe(dStr, 'd');
    const c = parseBigIntSafe(cStr, 'c');

    // m = c^d mod n
    const m = modPow(c, d, n);

    const asciiResult = bigIntToAscii(m);
    return `[復号結果 (10進数)]\n${m.toString()}\n\n[復号結果 (ASCII文字列)]\n${asciiResult}`;
}

// ==========================================
// 既存のアルゴリズム群
// ==========================================

function decodeRSA(encodedStr, pemKey) {
    if (!pemKey) throw new Error("秘密鍵が入力されていません");
    if (typeof forge === 'undefined') throw new Error("暗号ライブラリの読み込みに失敗");

    try {
        const privateKey = forge.pki.privateKeyFromPem(pemKey);
        const encryptedBytes = forge.util.decode64(encodedStr);
        const decryptedBytes = privateKey.decrypt(encryptedBytes, 'RSA-OAEP'); 
        return forge.util.decodeUtf8(decryptedBytes);
    } catch (err) {
        throw new Error("復号に失敗しました。鍵または暗号文が正しくありません。");
    }
}

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
    let normalized = str
        .replace(/・/g, '.')         
        .replace(/[ー〜−―-]/g, '-') 
        .replace(/ /g, ' ');        

    if (!/^[.\-\s]+$/.test(normalized)) {
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
    
    return normalized.trim().split(/\s+/).map(code => morseMap[code] || '?').join('');
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

window.onload = function() {
    const inputTextEl = document.getElementById('inputText');
    const caesarShiftEl = document.getElementById('caesarShift');
    const vigenereKeyEl = document.getElementById('vigenereKey');
    // 新しく追加した入力欄もEnterキーの対象にする
    const rsaInputs = ['rsaN', 'rsaE', 'rsaD', 'rsaC'].map(id => document.getElementById(id));

    inputTextEl.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); 
            decodeAll();        
        }
    });

    const triggerOnEnter = function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            decodeAll();
        }
    };
    
    caesarShiftEl.addEventListener('keydown', triggerOnEnter);
    vigenereKeyEl.addEventListener('keydown', triggerOnEnter);
    rsaInputs.forEach(el => el.addEventListener('keydown', triggerOnEnter));
};