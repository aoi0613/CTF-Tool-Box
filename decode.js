// メイン処理：すべてを一括で解読
function decodeAll() {
    const inputText = document.getElementById('inputText').value.trim();
    const caesarShift = parseInt(document.getElementById('caesarShift').value) || 0;
    const vigenereKey = document.getElementById('vigenereKey').value;
    const globalError = document.getElementById('globalError');

    globalError.textContent = '';

    // 1. 空白チェック
    if (!inputText) {
        globalError.textContent = 'エラー: 文字列を入力してください。';
        return;
    }

    // 2. 文字数上限のチェック
    if (inputText.length > 10000) {
        globalError.textContent = `エラー: 入力文字数が上限（10,000文字）を超えています。（現在: ${inputText.length}文字）`;
        return;
    }

    // 各解読処理を安全に実行
    runDecoder('out-base64', () => decodeURIComponent(escape(atob(inputText))));
    runDecoder('out-url', () => decodeURIComponent(inputText));
    runDecoder('out-rot13', () => decodeCaesar(inputText, 13));
    runDecoder('out-caesar', () => decodeCaesar(inputText, caesarShift));
    runDecoder('out-vigenere', () => decodeVigenere(inputText, vigenereKey));
    runDecoder('out-morse', () => decodeMorse(inputText));
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

// モールス符号の解読（全角の「・」「ー」や全角スペースに対応）
function decodeMorse(str) {
    // 1. ユーザー入力の表記揺れをクレンジング（正規化）
    let normalized = str
        .replace(/・/g, '.')         // 全角の中黒をドットに変換
        .replace(/[ー〜−―-]/g, '-') // 様々な種類の長音記号・ハイフンをダッシュに変換
        .replace(/ /g, ' ');        // 全角スペースを半角スペースに変換

    // 2. ユーザ入力の検証：モールス符号（. - 空白）以外の文字が含まれている場合はエラー
    if (!/^[.\-\s]+$/.test(normalized)) {
        throw new Error("モールス符号の形式（・、ー、空白など）ではありません");
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
    
    // 3. スペースで区切って各文字をデコード
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

// キーボード入力イベントの設定
window.onload = function() {
    const inputTextEl = document.getElementById('inputText');
    const caesarShiftEl = document.getElementById('caesarShift');
    const vigenereKeyEl = document.getElementById('vigenereKey');

    // 1. メイン入力欄（textarea）のイベント
    inputTextEl.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); // デフォルトの挙動（改行）を防ぐ
            decodeAll();        // 解読処理を一括実行
        }
    });

    // 2. パラメータ入力欄（input）のイベント
    const triggerOnEnter = function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            decodeAll();
        }
    };
    caesarShiftEl.addEventListener('keydown', triggerOnEnter);
    vigenereKeyEl.addEventListener('keydown', triggerOnEnter);
};