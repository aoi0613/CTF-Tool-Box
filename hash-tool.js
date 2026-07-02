// エラーや結果表示のクリア
function clearResults() {
    ['out-md5', 'out-sha1', 'out-sha256', 'out-hex', 'out-bin', 'out-decoded-text'].forEach(id => {
        document.getElementById(id).value = '';
    });
    document.getElementById('decodedTextContainer').style.display = 'none';
    document.getElementById('hexBinGroup').style.display = 'block'; // テキスト処理時はHex/Binを表示
    document.getElementById('globalError').textContent = '';
    document.getElementById('fileInfo').textContent = '';
}

// ヘルパー：UTF-8文字列 -> Hex
function stringToHex(str) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
}

// ヘルパー：UTF-8文字列 -> Binary
function stringToBinary(str) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    return Array.from(bytes).map(b => b.toString(2).padStart(8, '0')).join(' ');
}

// ヘルパー：Hex -> UTF-8文字列
function hexToString(hex) {
    const cleanHex = hex.replace(/[\s0x,]/g, ''); // 空白や '0x' などを除去
    if (cleanHex.length % 2 !== 0) throw new Error("Hexの文字数が不正です。(2文字で1バイト)");
    if (!/^[0-9a-fA-F]+$/.test(cleanHex)) throw new Error("不正なHex文字が含まれています。");
    
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < cleanHex.length; i += 2) {
        bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
    }
    // fatal: true にすることで、不正なUTF-8バイト列の場合にエラーを投げる
    const decoder = new TextDecoder('utf-8', { fatal: true });
    return decoder.decode(bytes);
}

// ヘルパー：Binary -> UTF-8文字列
function binaryToString(bin) {
    const cleanBin = bin.replace(/[\s,]/g, ''); // 空白等を除去
    if (cleanBin.length % 8 !== 0) throw new Error("Binaryの文字数が不正です。(8文字で1バイト)");
    if (!/^[01]+$/.test(cleanBin)) throw new Error("0と1以外の文字が含まれています。");
    
    const bytes = new Uint8Array(cleanBin.length / 8);
    for (let i = 0; i < cleanBin.length; i += 8) {
        bytes[i / 8] = parseInt(cleanBin.substring(i, i + 8), 2);
    }
    const decoder = new TextDecoder('utf-8', { fatal: true });
    return decoder.decode(bytes);
}

// 共通ハッシュ・変換処理（テキストデータが確定している場合）
function computeHashesAndEncodings(text, isDecoded = false) {
    document.getElementById('out-md5').value = CryptoJS.MD5(text).toString();
    document.getElementById('out-sha1').value = CryptoJS.SHA1(text).toString();
    document.getElementById('out-sha256').value = CryptoJS.SHA256(text).toString();
    document.getElementById('out-hex').value = stringToHex(text);
    document.getElementById('out-bin').value = stringToBinary(text);

    // デコード処理経由の場合は、復元されたテキスト枠を表示
    if (isDecoded) {
        document.getElementById('decodedTextContainer').style.display = 'block';
        document.getElementById('out-decoded-text').value = text;
    }
}

// ボタンアクション：テキストとしてエンコード
function processText() {
    clearResults();
    const input = document.getElementById('inputText').value;
    if (!input) {
        document.getElementById('globalError').textContent = "文字列を入力してください。";
        return;
    }
    computeHashesAndEncodings(input, false);
}

// ボタンアクション：Hexとしてデコード
function decodeFromHex() {
    clearResults();
    const input = document.getElementById('inputText').value;
    if (!input) {
        document.getElementById('globalError').textContent = "Hex (16進数) の文字列を入力してください。";
        return;
    }
    try {
        const text = hexToString(input);
        computeHashesAndEncodings(text, true);
    } catch (e) {
        document.getElementById('globalError').textContent = "デコードエラー: " + e.message;
    }
}

// ボタンアクション：Binaryとしてデコード
function decodeFromBin() {
    clearResults();
    const input = document.getElementById('inputText').value;
    if (!input) {
        document.getElementById('globalError').textContent = "Binary (2進数) の文字列を入力してください。";
        return;
    }
    try {
        const text = binaryToString(input);
        computeHashesAndEncodings(text, true);
    } catch (e) {
        document.getElementById('globalError').textContent = "デコードエラー: " + e.message;
    }
}

// ==========================================
// ファイルのハッシュ計算 (CryptoJS + FileReader)
// ==========================================
function handleFileSelect(file) {
    if (!file) return;
    clearResults();
    
    // Hex, Bin枠はファイルに対しては意味をなさない（または大きすぎる）ため隠す
    document.getElementById('hexBinGroup').style.display = 'none'; 
    document.getElementById('fileInfo').innerHTML = `選択されたファイル: <span>${file.name}</span> (${formatBytes(file.size)})`;
    
    const progress = document.getElementById('fileHashProgress');
    progress.style.display = 'block';

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            // ArrayBufferをCryptoJSが扱えるWordArrayに変換してハッシュ計算
            const wordArray = CryptoJS.lib.WordArray.create(e.target.result);
            document.getElementById('out-md5').value = CryptoJS.MD5(wordArray).toString();
            document.getElementById('out-sha1').value = CryptoJS.SHA1(wordArray).toString();
            document.getElementById('out-sha256').value = CryptoJS.SHA256(wordArray).toString();
            progress.style.display = 'none';
        } catch (err) {
            progress.style.display = 'none';
            document.getElementById('globalError').textContent = "ファイルの読み込みまたはハッシュ計算中にエラーが発生しました。";
        }
    };
    reader.onerror = function() {
        progress.style.display = 'none';
        document.getElementById('globalError').textContent = "ファイルの読み込みに失敗しました。";
    };
    
    // ファイルをArrayBufferとして読み込む
    reader.readAsArrayBuffer(file);
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ファイルインプットイベント
document.getElementById('fileInput').addEventListener('change', function(e) {
    handleFileSelect(e.target.files[0]);
});

// ファイルドラッグ＆ドロップイベント
const dropZone = document.getElementById('fileDropZone');
dropZone.addEventListener('dragover', function(e) {
    e.preventDefault();
    dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', function(e) {
    e.preventDefault();
    dropZone.classList.remove('dragover');
});
dropZone.addEventListener('drop', function(e) {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFileSelect(e.dataTransfer.files[0]);
    }
});

function copyResult(targetId) {
    const outputText = document.getElementById(targetId).value;
    if (!outputText) {
        alert("コピーする有効な結果がありません。");
        return;
    }
    navigator.clipboard.writeText(outputText).then(() => {
        alert('コピーしました！');
    }).catch(err => {
        alert('コピーに失敗しました。');
    });
}