/**
 * UI 组件渲染
 * API Key Manager - 界面渲染逻辑
 */

import AppState from './state.js';
import { copyToClipboard, maskKey, formatTimestamp, toggleKeyVisibility } from './utils.js';

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
        const isSearching = AppState.searchQuery || AppState.selectedTag;
        container.innerHTML = `
            <div class="empty-state animate-fade-in">
                <i class="ph ${isSearching ? 'ph-magnifying-glass' : 'ph-key'}"></i>
                <h3>${isSearching ? '未找到匹配结果' : '暂无 API Key'}</h3>
                <p>${isSearching
                    ? `没有找到与"${escapeHtml(AppState.searchQuery || '')}"匹配的结果，请尝试其他关键词或标签`
                    : '点击右上角「添加」按钮添加第一个 API Key，或从其他设备导入数据'
                }</p>
                ${!isSearching ? `
                    <div style="display: flex; gap: var(--spacing-md); margin-top: var(--spacing-lg);">
                        <button class="glass-btn glass-btn-primary" id="btnAddFromEmpty">
                            <i class="ph ph-plus"></i> 添加 API Key
                        </button>
                        <button class="glass-btn" id="btnImportFromEmpty">
                            <i class="ph ph-upload-simple"></i> 导入数据
                        </button>
                    </div>
                ` : `
                    <button class="glass-btn" id="btnClearSearch" style="margin-top: var(--spacing-lg);">
                        <i class="ph ph-x-circle"></i> 清除搜索条件
                    </button>
                `}
            </div>
        `;

        // 绑定空状态按钮事件
        if (!isSearching) {
            document.getElementById('btnAddFromEmpty')?.addEventListener('click', () => {
                document.getElementById('btnAdd')?.click();
            });
            document.getElementById('btnImportFromEmpty')?.addEventListener('click', () => {
                document.getElementById('btnImport')?.click();
            });
        } else {
            document.getElementById('btnClearSearch')?.addEventListener('click', () => {
                AppState.searchQuery = '';
                AppState.selectTag(null);
                document.getElementById('searchInput').value = '';
            });
        }
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

    // 尝试切换显示状态
    const isPlaintext = displayElement.classList.contains('key-plaintext');

    if (isPlaintext) {
        // 当前为明文，切换为掩码
        const key = AppState.keys.find(k => k.id === keyId);
        toggleKeyVisibility(displayElement, key?.maskedKey || '••••••••');
        icon?.classList.replace('ph-eye-slash', 'ph-eye');
        return;
    }

    // 当前为掩码，解密后切换为明文
    try {
        const API = (await import('./api.js')).default;
        const result = await API.decryptKey(keyId);

        if (result.success) {
            toggleKeyVisibility(displayElement, result.data.maskedKey || maskKey(keyId), result.data);
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
    const confirmed = await showConfirmDialog({
        title: '删除 API Key',
        message: '确定要删除这个 API Key 吗？此操作不可恢复。',
        confirmText: '删除',
        cancelText: '取消',
        type: 'danger'
    });

    if (!confirmed) {
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

/**
 * 显示确认对话框
 * @param {string} title - 对话框标题
 * @param {string} message - 确认消息
 * @param {string} confirmText - 确认按钮文字
 * @param {string} cancelText - 取消按钮文字
 * @param {string} type - 类型 (danger, warning, info)
 * @returns {Promise<boolean>} - 用户是否确认
 */
function showConfirmDialog(options = {}) {
    const {
        title = '确认操作',
        message = '确定要执行此操作吗？',
        confirmText = '确认',
        cancelText = '取消',
        type = 'danger'
    } = options;

    return new Promise((resolve) => {
        const modal = document.createElement('dialog');
        modal.className = 'modal confirm-dialog';
        modal.innerHTML = `
            <div class="modal-content animate-scale-in">
                <div class="modal-header">
                    <h2>${escapeHtml(title)}</h2>
                    <button class="modal-close"><i class="ph ph-x"></i></button>
                </div>
                <div class="confirm-dialog-content">
                    <p style="margin-bottom: var(--spacing-md); color: var(--text-secondary);">${escapeHtml(message)}</p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="glass-btn btn-cancel">${escapeHtml(cancelText)}</button>
                    <button type="button" class="glass-btn glass-btn-${type === 'danger' ? 'danger' : 'primary'} btn-confirm">${escapeHtml(confirmText)}</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modal.showModal();

        const handleConfirm = () => {
            modal.close();
            modal.remove();
            resolve(true);
        };

        const handleCancel = () => {
            modal.close();
            modal.remove();
            resolve(false);
        };

        modal.querySelector('.btn-confirm').addEventListener('click', handleConfirm);
        modal.querySelector('.btn-cancel').addEventListener('click', handleCancel);
        modal.querySelector('.modal-close').addEventListener('click', handleCancel);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                handleCancel();
            }
        });
    });
}

export {
    renderTagList,
    renderKeyList,
    renderTagsInput,
    addTagChip,
    showToast,
    loadAllData,
    showConfirmDialog
};
