/**
 * 工具函数
 * API Key Manager - 通用工具
 */

/**
 * 复制文本到剪贴板
 * @param {string} text - 要复制的文本
 * @returns {Promise<boolean>} - 是否成功
 */
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (error) {
        // 复制失败，尝试降级方案
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();

        try {
            const successful = document.execCommand('copy');
            document.body.removeChild(textarea);
            return successful;
        } catch (err) {
            document.body.removeChild(textarea);
            return false;
        }
    }
}

/**
 * 脱敏显示 API Key
 * @param {string} key - 原始 Key
 * @param {number} showStart - 显示开头字符数
 * @param {number} showEnd - 显示结尾字符数
 * @returns {string} - 脱敏后的 Key
 */
function maskKey(key, showStart = 8, showEnd = 4) {
    if (!key || key.length <= showStart + showEnd) {
        return '••••••••';
    }

    const start = key.substring(0, showStart);
    const end = key.substring(key.length - showEnd);
    const middle = '•'.repeat(Math.min(key.length - showStart - showEnd, 8));

    return `${start}${middle}${end}`;
}

/**
 * 格式化时间戳
 * @param {number} timestamp - Unix 时间戳（毫秒）
 * @returns {string} - 格式化后的时间字符串
 */
function formatTimestamp(timestamp) {
    if (!timestamp) return '';

    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    // 小于 1 分钟
    if (diff < 60000) {
        return '刚刚';
    }

    // 小于 1 小时
    if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        return `${minutes} 分钟前`;
    }

    // 小于 1 天
    if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        return `${hours} 小时前`;
    }

    // 小于 7 天
    if (diff < 604800000) {
        const days = Math.floor(diff / 86400000);
        return `${days} 天前`;
    }

    // 超过 7 天，显示具体日期
    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

/**
 * 生成随机 ID
 * @returns {string} - 随机 ID
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/**
 * 防抖函数
 * @param {Function} func - 要防抖的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function} - 防抖后的函数
 */
function debounce(func, delay = 300) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

/**
 * 节流函数
 * @param {Function} func - 要节流的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function} - 节流后的函数
 */
function throttle(func, delay = 300) {
    let lastCall = 0;
    return function (...args) {
        const now = Date.now();
        if (now - lastCall >= delay) {
            lastCall = now;
            return func.apply(this, args);
        }
    };
}

/**
 * 验证网站名称
 * @param {string} name - 网站名称
 * @returns {boolean} - 是否有效
 */
function validateWebsite(name) {
    if (!name || typeof name !== 'string') {
        return false;
    }
    const trimmed = name.trim();
    return trimmed.length >= 1 && trimmed.length <= 100;
}

/**
 * 验证 API Key
 * @param {string} key - API Key
 * @returns {boolean} - 是否有效
 */
function validateAPIKey(key) {
    if (!key || typeof key !== 'string') {
        return false;
    }
    return key.trim().length >= 16;
}

/**
 * 验证标签
 * @param {Array<string>} tags - 标签数组
 * @returns {boolean} - 是否有效
 */
function validateTags(tags) {
    if (!Array.isArray(tags)) {
        return false;
    }
    if (tags.length > 20) {
        return false;
    }
    return tags.every(tag => tag && tag.length >= 1 && tag.length <= 20);
}

/**
 * 验证备注
 * @param {string} note - 备注
 * @returns {boolean} - 是否有效
 */
function validateNote(note) {
    if (!note) {
        return true; // 备注可选
    }
    return note.length <= 500;
}

/**
 * 切换 Key 显示/隐藏状态
 * @param {HTMLElement} displayElement - 显示 Key 的 DOM 元素
 * @param {string} maskedKey - 掩码后的 Key
 * @param {string} fullKey - 完整 Key
 * @returns {boolean} - 当前是否为明文显示状态
 */
function toggleKeyVisibility(displayElement, maskedKey, fullKey = null) {
    const isPlaintext = displayElement.classList.contains('key-plaintext');

    if (isPlaintext) {
        // 切换为掩码显示
        displayElement.textContent = maskedKey;
        displayElement.classList.remove('key-plaintext');
        displayElement.classList.add('key-masked');
        return false;
    } else {
        // 切换为明文显示
        if (fullKey) {
            displayElement.textContent = fullKey;
            displayElement.classList.remove('key-masked');
            displayElement.classList.add('key-plaintext');
            return true;
        }
        return false;
    }
}

export {
    copyToClipboard,
    maskKey,
    formatTimestamp,
    generateId,
    debounce,
    throttle,
    validateWebsite,
    validateAPIKey,
    validateTags,
    validateNote,
    toggleKeyVisibility
};
