// メイン処理：isEncode(true: 暗号化, false: 解読) に応じて一括処理
function processAll(isEncode) {
    const inputText = document.getElementById('inputText').value.trim();
    const caesarShift = parseInt(document.getElementById('caesarShift').value) || 0;
    const vigenereKey = document.getElementById('vigenereKey').value;
    const globalError = document.getElementById('globalError');
    
    // シーザー全探索エリアは一旦隠す
    document.getElementById('bf-results').style.display = 'none';
    globalError.textContent = '';

    if (!inputText) {
        globalError.textContent = 'エラー: 文字列を入力してください。';
        return;
    }
    if (inputText.length > 10000) {
        globalError.textContent = `エラー: 入力文字数が上限（10,000文字）を超えています。`;
        return;
    }

    // 各処理を実行（エラー時は赤字で出力される）
    runProcess('out-base64', () => processBase64(inputText, isEncode));
    runProcess('out-url', () => processUrl(inputText, isEncode));
    runProcess('out-rot13', () => processCaesar(inputText, 13, isEncode)); // ROT13は13ずらし
    runProcess('out-caesar', () => processCaesar(inputText, caesarShift, isEncode));
    runProcess('out-vigenere', () => processVigenere(inputText, vigenereKey, isEncode));
    runProcess('out-morse', () => processMorse(inputText, isEncode));
}

// ヘルパー関数：安全に実行し、エラーの場合はテキストエリアを赤文字にする
function runProcess(targetId, processFn) {
    const outputEl = document.getElementById(targetId);
    try {
        outputEl.value = processFn();
        outputEl.style.color = '#333'; // 成功時は通常の色
    } catch (e) {
        outputEl.value = "エラー: " + (e.message || "処理に失敗しました");
        outputEl.style.color = 'red';  // エラー時は赤色
    }
}

// --- 個別のアルゴリズム実装 ---

function processBase64(str, isEncode) {
    if (isEncode) {
        try {
            // 日本語(UTF-8)にも対応するためのエンコード処理
            return btoa(unescape(encodeURIComponent(str)));
        } catch(e) {
            throw new Error("エンコード不可: ASCII以外の不正な文字が含まれている可能性があります。");
        }
    } else {
        let cleanStr = str.replace(/\s+/g, ''); // 空白や改行を無視
        if (cleanStr.length === 0) return "";
        
        // 1. 使用禁止文字のチェック
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleanStr)) {
            throw new Error("Base64に使用できない不正な文字が含まれています。");
        }
        // 2. 文字数のパディングチェック
        if (cleanStr.length % 4 !== 0) {
            throw new Error("文字数が4の倍数ではありません。（末尾の '=' が欠けている可能性があります）");
        }
        try {
            return decodeURIComponent(escape(atob(cleanStr)));
        } catch(e) {
            throw new Error("デコード中にエラーが発生しました。（UTF-8として不正なデータ等）");
        }
    }
}

function processUrl(str, isEncode) {
    try {
        return isEncode ? encodeURIComponent(str) : decodeURIComponent(str);
    } catch(e) {
        throw new Error("不正なパーセントエンコーディングが含まれています。");
    }
}

function processCaesar(str, shift, isEncode) {
    // エンコードは指定数進める、デコードは指定数戻す
    let actualShift = isEncode ? shift : -shift;
    actualShift = (actualShift % 26 + 26) % 26; // 負の値も正しくループさせる
    
    return str.replace(/[a-zA-Z]/g, function(c) {
        const base = c <= 'Z' ? 65 : 97;
        return String.fromCharCode(((c.charCodeAt(0) - base + actualShift) % 26) + base);
    });
}

function processVigenere(str, key, isEncode) {
    if (!key) throw new Error("鍵が指定されていません。");
    key = key.toLowerCase().replace(/[^a-z]/g, '');
    if (!key) throw new Error("鍵には少なくとも1つの英字を含める必要があります。");
    
    let keyIndex = 0;
    return str.replace(/[a-zA-Z]/g, function(c) {
        const base = c <= 'Z' ? 65 : 97;
        const k = key.charCodeAt(keyIndex % key.length) - 97;
        const actualShift = isEncode ? k : -k; // エンコードは進める、デコードは戻す
        keyIndex++;
        return String.fromCharCode(((c.charCodeAt(0) - base + actualShift + 26) % 26) + base);
    });
}

// モールス符号の定義
const morseMap = {
    'A':'.-', 'B':'-...', 'C':'-.-.', 'D':'-..', 'E':'.', 'F':'..-.',
    'G':'--.', 'H':'....', 'I':'..', 'J':'.---', 'K':'-.-', 'L':'.-..',
    'M':'--', 'N':'-.', 'O':'---', 'P':'.--.', 'Q':'--.-', 'R':'.-.',
    'S':'...', 'T':'-', 'U':'..-', 'V':'...-', 'W':'.--', 'X':'-..-',
    'Y':'-.--', 'Z':'--..', '1':'.----', '2':'..---', '3':'...--',
    '4':'....-', '5':'.....', '6':'-....', '7':'--...', '8':'---..',
    '9':'----.', '0':'-----', ' ': '/' // 単語の区切りをスラッシュとする
};
const morseDecodeMap = Object.fromEntries(Object.entries(morseMap).map(([k, v]) => [v, k]));

function processMorse(str, isEncode) {
    if (isEncode) {
        return str.toUpperCase().split('').map(c => morseMap[c] || c).join(' ');
    } else {
        let normalized = str.replace(/・/g, '.').replace(/[ー〜−―-]/g, '-').replace(/ /g, ' ');
        // モールス符号として有効な文字かチェック
        if (!/^[.\-\s/]+$/.test(normalized)) {
            throw new Error("モールス符号として無効な文字が含まれています。（使用可能: . - 空白 /）");
        }
        return normalized.trim().split(/\s+/).map(code => {
            if (code === '/') return ' '; // スラッシュはスペースに変換
            return morseDecodeMap[code] || '?';
        }).join('');
    }
}

// --- 追加機能：シーザー暗号の全探索（ブルートフォース） ---
function bruteForceCaesar() {
    const inputText = document.getElementById('inputText').value.trim();
    const bfResultsEl = document.getElementById('bf-results');
    
    if (!inputText) {
        alert("文字列を入力してください。");
        return;
    }
    
    let resultHTML = "<strong>[シーザー暗号 全探索 (Shift 1〜25)]</strong>\n\n";
    for (let i = 1; i <= 25; i++) {
        // 全探索なので「デコード」方向に1〜25ずらしたものを列挙する
        const decoded = processCaesar(inputText, i, false);
        resultHTML += `Shift +${i.toString().padStart(2, '0')}: ${decoded}\n`;
    }
    
    bfResultsEl.innerHTML = resultHTML;
    bfResultsEl.style.display = 'block';
}

function copyResult(targetId) {
    const outputText = document.getElementById(targetId).value;
    if (!outputText || outputText.startsWith("エラー:")) {
        alert("コピーする有効な結果がありません。");
        return;
    }
    navigator.clipboard.writeText(outputText).then(() => {
        alert('コピーしました！');
    }).catch(err => {
        alert('コピーに失敗しました。');
    });
}

// キーボード入力イベントの設定
window.onload = function() {
    const inputTextEl = document.getElementById('inputText');
    const caesarShiftEl = document.getElementById('caesarShift');
    const vigenereKeyEl = document.getElementById('vigenereKey');

    // Enterキーのデフォルトは「デコード」とする
    const triggerDecodeOnEnter = function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            processAll(false);
        }
    };

    inputTextEl.addEventListener('keydown', triggerDecodeOnEnter);
    caesarShiftEl.addEventListener('keydown', triggerDecodeOnEnter);
    vigenereKeyEl.addEventListener('keydown', triggerDecodeOnEnter);
};