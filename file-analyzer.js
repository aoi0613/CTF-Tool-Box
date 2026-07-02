// グローバル変数：検索フィルター用に現在抽出された全文字列を保持
let currentStrings = [];
let currentImageFile = null; // LSBの再抽出用

// --- マジックナンバー（ファイルシグネチャ）の定義リスト ---
const MAGIC_NUMBERS = [
    { hex: '89504e470d0a1a0a', mime: 'image/png', ext: ['png'], name: 'PNG画像' },
    { hex: 'ffd8ff', mime: 'image/jpeg', ext: ['jpg', 'jpeg'], name: 'JPEG画像' },
    { hex: '474946383761', mime: 'image/gif', ext: ['gif'], name: 'GIF画像 (GIF87a)' },
    { hex: '474946383961', mime: 'image/gif', ext: ['gif'], name: 'GIF画像 (GIF89a)' },
    { hex: '25504446', mime: 'application/pdf', ext: ['pdf'], name: 'PDFドキュメント' },
    { hex: '504b0304', mime: 'application/zip', ext: ['zip', 'docx', 'xlsx', 'pptx', 'jar', 'apk'], name: 'ZIPアーカイブ / Office文書' },
    { hex: '4d5a', mime: 'application/x-msdownload', ext: ['exe', 'dll', 'sys'], name: 'Windows実行ファイル/ライブラリ (MZ)' },
    { hex: '7f454c46', mime: 'application/x-elf', ext: ['elf', 'o', 'so', 'bin'], name: 'Linux ELF実行ファイル' },
    { hex: '377abcaf271c', mime: 'application/x-7z-compressed', ext: ['7z'], name: '7-Zipアーカイブ' },
    { hex: '526172211a07', mime: 'application/vnd.rar', ext: ['rar'], name: 'RARアーカイブ' },
    { hex: '424d', mime: 'image/bmp', ext: ['bmp'], name: 'BMP画像' },
    { hex: '494433', mime: 'audio/mpeg', ext: ['mp3'], name: 'MP3音声 (ID3v2)' },
    { hex: '1f8b', mime: 'application/gzip', ext: ['gz', 'tar.gz'], name: 'GZIP圧縮ファイル' }
];

async function detectFileType(file) {
    try {
        const buffer = await file.slice(0, 16).arrayBuffer();
        const uint8 = new Uint8Array(buffer);
        let hexString = '';
        for (let i = 0; i < uint8.length; i++) {
            hexString += uint8[i].toString(16).padStart(2, '0');
        }
        for (const type of MAGIC_NUMBERS) {
            if (hexString.startsWith(type.hex)) {
                const formattedHex = type.hex.toUpperCase().match(/.{1,2}/g).join(' ');
                return { name: type.name, mime: type.mime, exts: type.ext, hex: formattedHex, matched: true };
            }
        }
        const rawHex = hexString.substring(0, 16).toUpperCase().match(/.{1,2}/g).join(' ');
        return { name: '未知の形式 / 解析不能', mime: 'unknown', exts: [], hex: rawHex, matched: false };
    } catch (e) {
        return { name: '読み込みエラー', mime: 'unknown', exts: [], hex: '-', matched: false };
    }
}

// --- 【改良】画像のLSB抽出処理 (チャンネル選択対応) ---
async function runLSBExtraction(file) {
    const stegoTextArea = document.getElementById('stegoTextArea');
    const mode = document.getElementById('lsbModeSelect').value;
    stegoTextArea.value = 'LSB解析中...';

    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                // willReadFrequently は getImageData のパフォーマンスを向上させます
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(img, 0, 0);
                
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                let bits = '';
                
                // 選択されたチャンネルに従って最下位ビットを抽出
                for (let i = 0; i < imageData.length; i += 4) {
                    if (mode === 'rgb' || mode === 'r') bits += (imageData[i] & 1);
                    if (mode === 'rgb' || mode === 'g') bits += (imageData[i+1] & 1);
                    if (mode === 'rgb' || mode === 'b') bits += (imageData[i+2] & 1);
                    if (mode === 'a') bits += (imageData[i+3] & 1);
                }

                let extractedText = '';
                for (let i = 0; i < bits.length; i += 8) {
                    const byteStr = bits.substring(i, i + 8);
                    if (byteStr.length === 8) {
                        const charCode = parseInt(byteStr, 2);
                        if (charCode >= 32 && charCode <= 126) {
                            extractedText += String.fromCharCode(charCode);
                        } else {
                            extractedText += '\n';
                        }
                    }
                }

                const validStrings = extractedText.split('\n').filter(s => s.length >= 4);
                if (validStrings.length > 0) {
                    stegoTextArea.value = validStrings.slice(0, 100).join('\n') + (validStrings.length > 100 ? '\n... (以降省略)' : '');
                } else {
                    stegoTextArea.value = 'LSBに隠された有効な文字列は見つかりませんでした。';
                }
            } catch (e) {
                stegoTextArea.value = '解析中にエラーが発生しました。';
            }
            URL.revokeObjectURL(url);
            resolve();
        };
        img.onerror = () => {
            stegoTextArea.value = '画像の読み込みに失敗しました。';
            resolve();
        };
        img.src = url;
    });
}

// LSB再抽出ボタンのイベント
document.getElementById('lsbRecalcBtn').addEventListener('click', () => {
    if (currentImageFile) runLSBExtraction(currentImageFile);
});

// --- 画像からのOCR（文字抽出）処理 ---
async function runOCR(file) {
    const ocrTextArea = document.getElementById('ocrTextArea');
    ocrTextArea.value = 'OCRモデルを読み込み中... (初回は時間がかかります)';
    try {
        const result = await Tesseract.recognize(
            file,
            'eng+jpn',
            { logger: m => { if(m.status === 'recognizing text') ocrTextArea.value = `テキスト抽出中... ${Math.round(m.progress * 100)}%`; } }
        );
        ocrTextArea.value = result.data.text.trim() || 'テキストが検出されませんでした。';
    } catch (e) {
        ocrTextArea.value = 'OCRの実行中にエラーが発生しました。';
    }
}

// --- 【改良】Web Workerを用いた Strings 抽出 (UTF-8 & ASCII対応) ---
// WorkerのソースコードをBlobとして定義することで、外部ファイル不要で並列処理を実現
const stringsWorkerCode = `
self.onmessage = function(e) {
    const uint8 = new Uint8Array(e.data);
    let strings = [];
    const minLength = 4;
    const maxCount = 15000;
    let limitReached = false;
    let start = -1;

    // UTF-8デコーダ（fatal: true にすることで、不正なバイト列は例外を投げる）
    const decoder = new TextDecoder('utf-8', { fatal: true });

    function processSlice(startIdx, endIdx) {
        const len = endIdx - startIdx;
        if (len < minLength) return;
        
        const slice = uint8.subarray(startIdx, endIdx);
        try {
            // 1. まずUTF-8としてのデコードを試みる
            const text = decoder.decode(slice);
            if (text.length >= minLength) {
                strings.push(text);
            }
        } catch(err) {
            // 2. UTF-8として不正だった場合、純粋なASCII（英語など）部分のみを救出する
            let currentAsciiStart = -1;
            for (let i = 0; i < len; i++) {
                const b = slice[i];
                if (b >= 0x20 && b <= 0x7E) {
                    if (currentAsciiStart === -1) currentAsciiStart = i;
                } else {
                    if (currentAsciiStart !== -1) {
                        if (i - currentAsciiStart >= minLength) {
                            let str = "";
                            for (let j = currentAsciiStart; j < i; j++) {
                                str += String.fromCharCode(slice[j]);
                            }
                            strings.push(str);
                        }
                        currentAsciiStart = -1;
                    }
                }
            }
            if (currentAsciiStart !== -1 && len - currentAsciiStart >= minLength) {
                let str = "";
                for (let j = currentAsciiStart; j < len; j++) str += String.fromCharCode(slice[j]);
                strings.push(str);
            }
        }
    }

    for (let i = 0; i < uint8.length; i++) {
        const b = uint8[i];
        // 抽出対象: 表示可能なASCII (0x20~0x7E)、タブ (0x09)、またはUTF-8のマルチバイト文字の可能性(>= 0x80)
        if ((b >= 0x20 && b <= 0x7E) || b === 0x09 || b >= 0x80) {
            if (start === -1) start = i;
        } else {
            if (start !== -1) {
                processSlice(start, i);
                start = -1;
                if (strings.length >= maxCount) {
                    limitReached = true;
                    break;
                }
            }
        }
    }
    // 終端処理
    if (!limitReached && start !== -1) {
        processSlice(start, uint8.length);
    }

    self.postMessage({ strings: strings, limitReached: limitReached });
};
`;

async function runStringsExtraction(file) {
    const stringsTextArea = document.getElementById('stringsTextArea');
    const stringsInputGroup = document.getElementById('stringsInputGroup');
    const stringsNotice = document.getElementById('stringsNotice');
    
    stringsTextArea.classList.add('loading-text');
    stringsTextArea.value = 'Web Worker を使用してバックグラウンドで解析中...\n(UIはフリーズせず他の操作が可能です)';
    stringsInputGroup.style.display = 'none';
    stringsNotice.textContent = '';
    currentStrings = [];

    try {
        let bufferToProcess;
        const MAX_FULL_SCAN = 4 * 1024 * 1024; // 4MB

        if (file.size <= MAX_FULL_SCAN) {
            bufferToProcess = await file.arrayBuffer();
        } else {
            // ファイルが大きい場合は先頭2MBと末尾2MBを結合して処理
            const partSize = 2 * 1024 * 1024; 
            const headBlob = file.slice(0, partSize);
            const tailBlob = file.slice(file.size - partSize, file.size);
            
            const headBuf = await headBlob.arrayBuffer();
            const tailBuf = await tailBlob.arrayBuffer();
            
            const uint8 = new Uint8Array(headBuf.byteLength + tailBuf.byteLength);
            uint8.set(new Uint8Array(headBuf), 0);
            uint8.set(new Uint8Array(tailBuf), headBuf.byteLength);
            bufferToProcess = uint8.buffer;
            
            stringsNotice.textContent = `※ファイルサイズが大きいため、先頭2MBと末尾2MBのみを高速スキャンしました。`;
        }

        // Web Worker の起動
        const blob = new Blob([stringsWorkerCode], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);
        const worker = new Worker(workerUrl);

        worker.onmessage = (e) => {
            currentStrings = e.data.strings;
            if (e.data.limitReached) {
                stringsNotice.textContent += ` (抽出数が上限の15000件に達したため解析を打ち切りました)`;
            }
            stringsTextArea.classList.remove('loading-text');
            stringsInputGroup.style.display = 'block';
            renderStrings();
            
            // 完了後はWorkerを終了してメモリ解放
            worker.terminate();
            URL.revokeObjectURL(workerUrl);
        };

        // Workerの処理中にエラーが発生した場合
        worker.onerror = (err) => {
            console.error('Worker Error:', err);
            stringsTextArea.classList.remove('loading-text');
            stringsTextArea.value = '文字列の抽出中にエラーが発生しました。';
            worker.terminate();
            URL.revokeObjectURL(workerUrl);
        };

        // データをWorkerに送信（ゼロコピー転送を利用して高速化）
        worker.postMessage(bufferToProcess, [bufferToProcess]);

    } catch (e) {
        console.error('Strings抽出エラー:', e);
        stringsTextArea.classList.remove('loading-text');
        stringsTextArea.value = '文字列の読み込み中にエラーが発生しました。';
    }
}

function renderStrings() {
    const filterText = document.getElementById('stringsSearch').value.toLowerCase();
    const stringsTextArea = document.getElementById('stringsTextArea');
    const stringsCount = document.getElementById('stringsCount');
    
    const filtered = currentStrings.filter(str => str.toLowerCase().includes(filterText));
    
    if (filtered.length > 0) {
        stringsTextArea.value = filtered.join('\n');
    } else {
        stringsTextArea.value = filterText ? '一致する文字列が見つかりません。' : '人間が読める文字列は見つかりませんでした。';
    }
    stringsCount.textContent = `${filtered.length} / ${currentStrings.length}`;
}

// --- 共通のファイル解析処理 ---
async function processFile(file) {
    const errorMessage = document.getElementById('errorMessage');
    const resultBox = document.getElementById('resultBox');
    const metadataList = document.getElementById('metadataList');
    const signatureAlert = document.getElementById('signatureAlert');
    const imageAnalysisSection = document.getElementById('imageAnalysisSection');

    currentImageFile = file; // LSBの再抽出のために保存
    errorMessage.textContent = '';
    metadataList.innerHTML = '';
    signatureAlert.innerHTML = '';
    document.getElementById('stringsSearch').value = ''; 
    resultBox.style.display = 'none';
    imageAnalysisSection.style.display = 'none';

    if (!file) {
        errorMessage.textContent = 'エラー: ファイルが読み込めませんでした。';
        return;
    }

    try {
        const detected = await detectFileType(file);
        const fileExt = file.name.split('.').pop().toLowerCase(); 

        if (detected.matched) {
            if (detected.exts.includes(fileExt)) {
                signatureAlert.innerHTML = `<div class="alert-badge badge-success">✓ ファイル検証: 正常（拡張子と内部シグネチャが一致しています: ${detected.name}）</div>`;
            } else {
                signatureAlert.innerHTML = `<div class="alert-badge badge-warning">⚠️ 【警告】ファイル形式の偽装を検知しました！<br>拡張子は「.${fileExt}」ですが、バイナリシグネチャは「${detected.name}」を示しています。</div>`;
            }
        } else {
            signatureAlert.innerHTML = `<div class="alert-badge badge-info">ℹ シグネチャ解析: 未知のファイル形式です（拡張子 .${fileExt} として通常のメタデータ展開を試みます）</div>`;
        }

        const metadata = {
            'ファイル名': file.name,
            'OS判定の形式 (MIME)': file.type || '不明',
            'シグネチャ判定の形式': `<strong>${detected.name}</strong>`,
            'マジックナンバー (HEX)': `<code style="background:#efefef; padding:2px 4px; border-radius:4px;">${detected.hex}</code>`,
            'ファイルサイズ': formatBytes(file.size),
            '最終更新日時': new Date(file.lastModified).toLocaleString('ja-JP')
        };

        for (const [key, value] of Object.entries(metadata)) {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${key}:</strong> ${value}`;
            metadataList.appendChild(li);
        }

        resultBox.style.display = 'block';

        if (detected.mime === 'image/jpeg' || fileExt === 'jpg' || fileExt === 'jpeg') {
            EXIF.getData(file, function() {
                const allMetaData = EXIF.getAllTags(this);
                if (allMetaData && Object.keys(allMetaData).length > 0) {
                    const headerLi = document.createElement('li');
                    headerLi.innerHTML = `<h4 style="margin: 15px 0 5px 0; color: #007bff; border-bottom: 2px solid #007bff; padding-bottom: 3px;">画像EXIFメタデータ</h4>`;
                    metadataList.appendChild(headerLi);
                    
                    const exifFields = {
                        'Make': 'カメラ製造元', 'Model': 'カメラ機種名', 'DateTimeOriginal': '写真撮影日時',
                        'ExposureTime': 'シャッタースピード (秒)', 'FNumber': 'F値 (絞り値)', 'ISOSpeedRatings': 'ISO感度',
                        'FocalLength': '焦点距離 (mm)', 'GPSLatitude': 'GPS 緯度', 'GPSLongitude': 'GPS 経度'
                    };
                    for (const [tag, label] of Object.entries(exifFields)) {
                        let value = allMetaData[tag];
                        if (value !== undefined && value !== null) {
                            if ((tag === 'GPSLatitude' || tag === 'GPSLongitude') && Array.isArray(value)) {
                                if (value.length >= 3) {
                                    const deg = typeof value[0] === 'object' ? value[0].numerator / value[0].denominator : value[0];
                                    const min = typeof value[1] === 'object' ? value[1].numerator / value[1].denominator : value[1];
                                    const sec = typeof value[2] === 'object' ? value[2].numerator / value[2].denominator : value[2];
                                    value = `${deg}° ${min}' ${sec.toFixed(2)}"`;
                                    const refTag = tag === 'GPSLatitude' ? 'GPSLatitudeRef' : 'GPSLongitudeRef';
                                    if (allMetaData[refTag]) value += ` (${allMetaData[refTag]})`;
                                }
                            }
                            if (typeof value === 'object' && value.numerator !== undefined && value.denominator !== undefined) {
                                value = value.denominator === 1 ? value.numerator : `${value.numerator}/${value.denominator}`;
                            }
                            const li = document.createElement('li');
                            li.innerHTML = `<strong>${label}:</strong> ${value}`;
                            metadataList.appendChild(li);
                        }
                    }
                }
            });
        }

        const isImage = detected.mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'bmp'].includes(fileExt);
        if (isImage) {
            imageAnalysisSection.style.display = 'block';
            runLSBExtraction(file); 
            runOCR(file);          
        }

        if (detected.mime === 'application/pdf' || fileExt === 'pdf') {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
                const headerLi = document.createElement('li');
                headerLi.innerHTML = `<h4 style="margin: 15px 0 5px 0; color: #dc3545; border-bottom: 2px solid #dc3545; padding-bottom: 3px;">PDFメタデータ</h4>`;
                metadataList.appendChild(headerLi);
            } catch (e) {}
        }
        
        // Strings抽出（裏側で実行）
        runStringsExtraction(file);

    } catch (error) {
        errorMessage.textContent = 'エラー: ファイルの解析中に問題が発生しました。';
        console.error('解析エラー:', error);
    }
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

document.getElementById('stringsSearch').addEventListener('input', renderStrings);

document.getElementById('copyStringsBtn').addEventListener('click', function() {
    const textArea = document.getElementById('stringsTextArea');
    textArea.select();
    try {
        const successful = document.execCommand('copy');
        if (successful) alert('抽出された文字列をクリップボードにコピーしました！');
    } catch (err) { }
});

document.getElementById('fileInput').addEventListener('change', function(event) {
    const file = event.target.files[0];
    processFile(file);
});

const dropZone = document.getElementById('dropZone');
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
        const file = e.dataTransfer.files[0];
        processFile(file);
        document.getElementById('fileInput').files = e.dataTransfer.files;
    }
});