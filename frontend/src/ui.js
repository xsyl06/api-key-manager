/**
 * UI 组件渲染
 * API Key Manager - 界面渲染逻辑
 */

import AppState from './state.js';
import { copyToClipboard, maskKey, formatTimestamp } from './utils.js';

/**
 * 渲染标签列表
 */
function renderTagList() {
    const container = document.getElementById('tagList');
    if (!container) return;

    const tags = AppState.tags || [];

    // 构建 HTML
    let html = `
        <div class="tag-item ${!AppState.selectedTag ? 'active' : ''}" data-tag="">
            <i class="ph ph-folders tag-item-icon"></i>
            <span class="tag-name">全部</span>
            <span class="tag-count">${AppState.keys.length}</span>
        </div>
    `;

    tags.forEach(tag => {
        const isActive = AppState.selectedTag === tag.name;
        html += `
            <div class="tag-item ${isActive ? 'active' : ''}" data-tag="${tag.name}">
                <i class="ph ph-tag tag-item-icon"></i>
                <span class="tag-name">${escapeHtml(tag.name)}</span>
                <span class="tag-count">${tag.count}</span>
            </div>
        `;
    });

    container.innerHTML = html;

    // 绑定点击事件
    container.querySelectorAll('.tag-item').forEach(item => {
        item.addEventListener('click', () => {
            const tag = item.dataset.tag || null;
            AppState.selectTag(tag);
        });
    });
}

/**
 * 渲染 API Key 列表
 */
function renderKeyList() {
    const container = document.getElementById('keyList');
    if (!container) return;

    const keys = AppState.getFilteredKeys();

    // 空状态
    if (keys.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="ph ph-key"></i>
                <h3>暂无 API Key</h3>
                <p>${AppState.searchQuery || AppState.selectedTag ? '没有找到匹配的结果' : '点击右上角「添加」按钮添加第一个 API Key'}</p>
            </div>
        `;
        return;
    }

    // 构建 HTML
    let html = '';
    keys.forEach(key => {
        const maskedKey = key.maskedKey || maskKey(key.id); // 使用后端返回的脱敏 Key
        const tagsHtml = (key.tags || []).map(tag =>
            `<span class="key-tag">${escapeHtml(tag)}</span>`
        ).join('');

        html += `
            <div class="key-item" data-id="${key.id}">
                <div class="key-website">
                    ${escapeHtml(key.website)}
                    <div class="key-tags">${tagsHtml}</div>
                </div>
                <span class="key-display" data-full-key="${key.id}">${maskedKey}</span>
                <div class="key-actions">
                    <button class="icon-btn" data-action="view" title="查看完整 Key">
                        <i class="ph ph-eye"></i>
                    </button>
                    <button class="icon-btn" data-action="copy" title="复制 Key">
                        <i class="ph ph-copy"></i>
                    </button>
                    <button class="icon-btn" data-action="edit" title="编辑">
                        <i class="ph ph-pencil"></i>
                    </button>
                    <button class="icon-btn danger" data-action="delete" title="删除">
                        <i class="ph ph-trash"></i>
                    </button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    // 绑定事件
    container.querySelectorAll('.key-item').forEach(item => {
        const keyId = item.dataset.id;

        // 查看完整 Key
        item.querySelector('[data-action="view"]')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            await handleViewKey(keyId, item);
        });

        // 复制 Key
        item.querySelector('[data-action="copy"]')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            await handleCopyKey(keyId);
        });

        // 编辑
        item.querySelector('[data-action="edit"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            handleEditKey(keyId);
        });

        // 删除
        item.querySelector('[data-action="delete"]')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            await handleDeleteKey(keyId);
        });
    });
}

/**
 * 处理查看完整 Key
 */
async function handleViewKey(keyId, itemElement) {
    const displayElement = itemElement.querySelector('.key-display');
    const button = itemElement.querySelector('[data-action="view"]');
    const icon = button?.querySelector('i');

    // 如果已经显示完整 Key，则隐藏
    if (displayElement.dataset.plaintext === 'true') {
        const key = AppState.keys.find(k => k.id === keyId);
        displayElement.textContent = key?.maskedKey || '••••••••';
        displayElement.dataset.plaintext = 'false';
        icon?.classList.replace('ph-eye-slash', 'ph-eye');
        return;
    }

    // 解密并显示完整 Key
    try {
        const API = (await import('./api.js')).default;
        const result = await API.decryptKey(keyId);

        if (result.success) {
            displayElement.textContent = result.data;
            displayElement.dataset.plaintext = 'true';
            icon?.classList.replace('ph-eye', 'ph-eye-slash');
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('查看 Key 失败', 'error');
    }
}

/**
 * 处理复制 Key
 */
async function handleCopyKey(keyId) {
    try {
        const API = (await import('./api.js')).default;
        const result = await API.decryptKey(keyId);

        if (result.success) {
            const success = await copyToClipboard(result.data);
            if (success) {
                showToast('已复制到剪贴板', 'success');
            } else {
                showToast('复制失败', 'error');
            }
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('复制失败', 'error');
    }
}

/**
 * 处理编辑 Key
 */
function handleEditKey(keyId) {
    const key = AppState.keys.find(k => k.id === keyId);
    if (!key) return;

    AppState.setEditingKeyId(keyId);

    // 填充表单
    document.getElementById('modalTitle').textContent = '编辑 API Key';
    document.getElementById('websiteInput').value = key.website || '';
    document.getElementById('keyInput').value = ''; // Key 不回填，需重新输入
    document.getElementById('noteInput').value = key.note || '';

    // 渲染标签
    renderTagsInput(key.tags || []);

    // 打开弹窗
    document.getElementById('keyModal').showModal();
}

/**
 * 处理删除 Key
 */
async function handleDeleteKey(keyId) {
    if (!confirm('确定要删除这个 API Key 吗？此操作不可恢复。')) {
        return;
    }

    try {
        const API = (await import('./api.js')).default;
        const result = await API.deleteKey(keyId);

        if (result.success) {
            showToast('删除成功', 'success');
            await loadAllData(); // 重新加载数据
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('删除失败', 'error');
    }
}

/**
 * 渲染标签输入框
 */
function renderTagsInput(tags = []) {
    const container = document.getElementById('tagsInput');
    const input = document.getElementById('tagInputField');

    // 清空现有标签（保留 input）
    container.querySelectorAll('.tag-chip').forEach(chip => chip.remove());

    // 添加标签
    tags.forEach(tag => {
        addTagChip(tag);
    });
}

/**
 * 添加标签芯片
 */
function addTagChip(tagText) {
    const container = document.getElementById('tagsInput');
    const input = document.getElementById('tagInputField');

    const chip = document.createElement('div');
    chip.className = 'tag-chip';
    chip.innerHTML = `
        ${escapeHtml(tagText)}
        <button type="button" data-remove-tag="${tagText}">&times;</button>
    `;

    container.insertBefore(chip, input);

    // 绑定删除事件
    chip.querySelector('button').addEventListener('click', () => {
        chip.remove();
    });
}

/**
 * 显示 Toast 消息
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast glass-toast ${type}`;

    const icons = {
        success: 'ph-check-circle',
        error: 'ph-x-circle',
        warning: 'ph-warning',
        info: 'ph-info'
    };

    toast.innerHTML = `
        <i class="ph ${icons[type] || icons.info}"></i>
        <span>${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    // 动画显示
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // 自动消失
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 250);
    }, 3000);
}

/**
 * 加载所有数据
 */
async function loadAllData() {
    const API = (await import('./api.js')).default;

    // 并行加载 Keys 和 Tags
    const [keysResult, tagsResult] = await Promise.all([
        API.loadKeys(),
        API.getTags()
    ]);

    if (keysResult.success) {
        AppState.setKeys(keysResult.data || []);
    }

    if (tagsResult.success) {
        AppState.setTags(tagsResult.data || []);
    }

    if (!keysResult.success) {
        showToast(keysResult.message, 'error');
    }
}

/**
 * HTML 转义（优化版本）
 */
function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

export {
    renderTagList,
    renderKeyList,
    renderTagsInput,
    addTagChip,
    showToast,
    loadAllData
};
