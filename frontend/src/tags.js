/**
 * API Key Manager - 标签管理模块
 * V1.1 标签管理系统
 */

// Wails 运行时
import {
    GetAllTags,
    CreateTag,
    UpdateTag,
    DeleteTag,
    GetTagUsageCount
} from '../wailsjs/go/main/App';

// === 标签颜色预设 ===
const PRESET_COLORS = [
    { hex: '#667eea', name: '蓝紫色' },
    { hex: '#10b981', name: '翠绿色' },
    { hex: '#f59e0b', name: '琥珀色' },
    { hex: '#3b82f6', name: '天蓝色' },
    { hex: '#06b6d4', name: '青色' },
    { hex: '#ec4899', name: '粉红色' },
    { hex: '#ef4444', name: '红色' },
    { hex: '#8b5cf6', name: '紫色' },
];

// === 标签管理模块 ===
const TagManager = {
    // 标签缓存
    tagsCache: [],
    cacheTime: 0,
    CACHE_DURATION: 5000, // 5秒缓存

    /**
     * 获取所有标签（带缓存）
     */
    async getAllTags() {
        const now = Date.now();
        if (this.tagsCache.length > 0 && now - this.cacheTime < this.CACHE_DURATION) {
            return this.tagsCache;
        }

        const tags = await GetAllTags();
        this.tagsCache = tags || [];
        this.cacheTime = now;
        return this.tagsCache;
    },

    /**
     * 清除缓存
     */
    clearCache() {
        this.tagsCache = [];
        this.cacheTime = 0;
    },

    /**
     * 创建标签
     */
    async createTag(name, color) {
        const tag = await CreateTag(name, color);
        this.clearCache();
        return tag;
    },

    /**
     * 更新标签
     */
    async updateTag(id, name, color) {
        const tag = await UpdateTag(id, name, color);
        this.clearCache();
        return tag;
    },

    /**
     * 删除标签
     */
    async deleteTag(id, removeFromKeys) {
        const result = await DeleteTag(id, removeFromKeys);
        this.clearCache();
        return result;
    },

    /**
     * 获取标签使用数量
     */
    async getUsageCount(id) {
        return await GetTagUsageCount(id);
    },

    /**
     * 根据ID获取标签
     */
    getTagById(id, tags = null) {
        const tagList = tags || this.tagsCache;
        return tagList.find(t => t.id === id);
    },

    /**
     * 根据ID获取多个标签
     */
    getTagsByIds(ids, tags = null) {
        const tagList = tags || this.tagsCache;
        const tagMap = new Map(tagList.map(t => [t.id, t]));
        return ids.map(id => tagMap.get(id)).filter(t => t);
    },

    /**
     * 获取标签颜色样式
     */
    getTagStyle(tag) {
        if (!tag) return {};
        return {
            backgroundColor: tag.color,
            color: this.getContrastColor(tag.color)
        };
    },

    /**
     * 根据背景色获取合适的文字颜色（黑/白）
     */
    getContrastColor(hexColor) {
        const hex = hexColor.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 128 ? '#000000' : '#ffffff';
    },

    /**
     * 验证颜色格式
     */
    isValidColor(color) {
        return /^#[0-9A-Fa-f]{6}$/.test(color);
    },

    /**
     * 验证标签名称
     */
    isValidTagName(name) {
        return name && name.trim().length > 0 && name.length <= 20;
    }
};

// === 标签管理弹窗 ===
function openTagManagementModal() {
    const modal = document.createElement('dialog');
    modal.className = 'modal tag-modal';
    modal.innerHTML = `
        <div class="modal-content tag-modal animate-scale-in">
            <div class="modal-header">
                <h2><i class="ph ph-tag"></i> 标签管理</h2>
                <button class="modal-close"><i class="ph ph-x"></i></button>
            </div>

            <!-- 创建标签区域 -->
            <div class="tag-create-section">
                <h3 style="font-size: 14px; margin-bottom: var(--spacing-sm);">新建标签</h3>
                <div class="tag-create-form">
                    <div class="form-group" style="flex: 2;">
                        <label>名称</label>
                        <input type="text" class="glass-input form-input" id="newTagName" placeholder="输入标签名称" maxlength="20">
                    </div>
                    <div class="form-group" style="flex: 1;">
                        <label>颜色</label>
                        <div class="color-picker" id="colorPicker">
                            ${PRESET_COLORS.map(c => `
                                <div class="color-option" data-color="${c.hex}" style="background-color: ${c.hex};" title="${c.name}"></div>
                            `).join('')}
                            <div class="color-custom">
                                <input type="color" id="customColor" value="#667eea">
                            </div>
                        </div>
                    </div>
                    <button class="glass-btn glass-btn-primary" id="btnCreateTag" style="height: 38px; align-self: flex-end;">
                        <i class="ph ph-plus"></i> 创建
                    </button>
                </div>
            </div>

            <!-- 现有标签列表 -->
            <h3 style="font-size: 14px; margin-bottom: var(--spacing-sm);">现有标签（点击编辑，悬停显示删除）</h3>
            <div class="tag-list" id="tagList" style="max-height: 300px; overflow-y: auto;">
                <!-- 标签列表动态加载 -->
            </div>

            <div class="modal-footer">
                <button class="glass-btn" id="btnClose">完成</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.showModal();

    let selectedColor = PRESET_COLORS[0].hex;
    let tags = [];

    // 颜色选择器
    const colorOptions = modal.querySelectorAll('.color-option');
    const customColorInput = modal.querySelector('#customColor');

    colorOptions.forEach(option => {
        option.addEventListener('click', () => {
            colorOptions.forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            selectedColor = option.dataset.color;
        });
    });

    // 默认选中第一个颜色
    colorOptions[0].classList.add('selected');

    // 自定义颜色
    customColorInput.addEventListener('input', (e) => {
        colorOptions.forEach(o => o.classList.remove('selected'));
        selectedColor = e.target.value;
    });

    // 加载标签列表
    async function loadTagList() {
        try {
            tags = await TagManager.getAllTags();
            renderTagList();
        } catch (error) {
            console.error('加载标签失败:', error);
        }
    }

    // 渲染标签列表
    function renderTagList() {
        const tagListEl = modal.querySelector('#tagList');
        if (tags.length === 0) {
            tagListEl.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: var(--spacing-lg);">暂无标签</p>';
            return;
        }

        tagListEl.innerHTML = tags.map(tag => `
            <div class="tag-list-item" data-tag-id="${tag.id}">
                <div class="tag-list-item-info">
                    <span class="tag-pill" style="background-color: ${tag.color}; color: ${TagManager.getContrastColor(tag.color)};">
                        ${escapeHtml(tag.name)}
                    </span>
                    <span class="tag-list-item-count">使用: <span class="usage-count" data-tag-id="${tag.id}">...</span></span>
                </div>
                <div class="tag-list-item-actions">
                    <button class="icon-btn" data-action="edit" title="编辑"><i class="ph ph-pencil"></i></button>
                    <button class="icon-btn danger" data-action="delete" title="删除"><i class="ph ph-trash"></i></button>
                </div>
            </div>
        `).join('');

        // 加载使用数量
        tags.forEach(async tag => {
            try {
                const count = await TagManager.getUsageCount(tag.id);
                const countEl = tagListEl.querySelector(`.usage-count[data-tag-id="${tag.id}"]`);
                if (countEl) countEl.textContent = count;
            } catch (error) {
                console.error('获取使用数量失败:', error);
            }
        });

        // 绑定事件
        tagListEl.querySelectorAll('.tag-list-item').forEach(item => {
            const tagId = item.dataset.tagId;

            item.querySelector('[data-action="edit"]')?.addEventListener('click', () => {
                openEditTagModal(tags.find(t => t.id === tagId), () => loadTagList());
            });

            item.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
                const tag = tags.find(t => t.id === tagId);
                openDeleteTagConfirm(tag, () => loadTagList());
            });
        });
    }

    // 创建标签
    modal.querySelector('#btnCreateTag').addEventListener('click', async () => {
        const nameInput = modal.querySelector('#newTagName');
        const name = nameInput.value.trim();

        if (!TagManager.isValidTagName(name)) {
            showToast('error', '请输入有效的标签名称（1-20个字符）');
            return;
        }

        if (!TagManager.isValidColor(selectedColor)) {
            showToast('error', '请选择有效的颜色');
            return;
        }

        try {
            await TagManager.createTag(name, selectedColor);
            showToast('success', '标签创建成功');
            nameInput.value = '';
            await loadTagList();
        } catch (error) {
            showToast('error', '创建失败: ' + error.message);
        }
    });

    // 关闭按钮 - 刷新主页面
    const closeModal = () => {
        modal.close();
        modal.remove();
        // 刷新主页面的数据和标签列表
        if (window.loadData) {
            window.loadData();
        }
    };

    modal.querySelector('#btnClose').addEventListener('click', closeModal);
    modal.querySelector('.modal-close').addEventListener('click', closeModal);

    modal.addEventListener('close', () => {
        modal.remove();
    });

    // 初始加载
    loadTagList();
}

// === 编辑标签弹窗 ===
function openEditTagModal(tag, onSave) {
    const modal = document.createElement('dialog');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content animate-scale-in">
            <div class="modal-header">
                <h2>编辑标签</h2>
                <button class="modal-close"><i class="ph ph-x"></i></button>
            </div>

            <div class="form-group">
                <label>标签名称</label>
                <input type="text" class="glass-input form-input" id="editTagName" value="${escapeHtml(tag.name)}" maxlength="20">
            </div>

            <div class="form-group">
                <label>标签颜色</label>
                <div class="color-picker" id="editColorPicker">
                    ${PRESET_COLORS.map(c => `
                        <div class="color-option ${c.hex === tag.color ? 'selected' : ''}" data-color="${c.hex}" style="background-color: ${c.hex};" title="${c.name}"></div>
                    `).join('')}
                    <div class="color-custom">
                        <input type="color" id="editCustomColor" value="${tag.color}">
                    </div>
                </div>
            </div>

            <div class="modal-footer">
                <button class="glass-btn" id="btnCancel">取消</button>
                <button class="glass-btn glass-btn-primary" id="btnSave">保存</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.showModal();

    let selectedColor = tag.color;

    // 颜色选择器
    const colorOptions = modal.querySelectorAll('.color-option');
    const customColorInput = modal.querySelector('#editCustomColor');

    colorOptions.forEach(option => {
        option.addEventListener('click', () => {
            colorOptions.forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            selectedColor = option.dataset.color;
        });
    });

    customColorInput.addEventListener('input', (e) => {
        colorOptions.forEach(o => o.classList.remove('selected'));
        selectedColor = e.target.value;
    });

    // 取消按钮
    modal.querySelector('#btnCancel').addEventListener('click', () => {
        modal.close();
        modal.remove();
    });

    modal.querySelector('.modal-close').addEventListener('click', () => {
        modal.close();
        modal.remove();
    });

    // 保存按钮
    modal.querySelector('#btnSave').addEventListener('click', async () => {
        const nameInput = modal.querySelector('#editTagName');
        const name = nameInput.value.trim();

        if (!TagManager.isValidTagName(name)) {
            showToast('error', '请输入有效的标签名称（1-20个字符）');
            return;
        }

        if (!TagManager.isValidColor(selectedColor)) {
            showToast('error', '请选择有效的颜色');
            return;
        }

        try {
            await TagManager.updateTag(tag.id, name, selectedColor);
            showToast('success', '标签更新成功');
            modal.close();
            modal.remove();
            if (onSave) onSave();
        } catch (error) {
            showToast('error', '更新失败: ' + error.message);
        }
    });

    modal.addEventListener('close', () => {
        modal.remove();
    });
}

// === 删除标签确认对话框 ===
function openDeleteTagConfirm(tag, onDelete) {
    TagManager.getUsageCount(tag.id).then(count => {
        const modal = document.createElement('dialog');
        modal.className = 'modal confirm-dialog';
        modal.innerHTML = `
            <div class="modal-content animate-scale-in">
                <div class="modal-header">
                    <h2><i class="ph ph-warning"></i> 确认删除标签</h2>
                    <button class="modal-close"><i class="ph ph-x"></i></button>
                </div>

                <div class="confirm-dialog-content">
                    <p>确定要删除标签 <span class="tag-pill" style="background-color: ${tag.color}; color: ${TagManager.getContrastColor(tag.color)};">${escapeHtml(tag.name)}</span> 吗？</p>

                    ${count > 0 ? `
                        <p style="margin-top: var(--spacing-sm); color: var(--color-warning);">
                            <i class="ph ph-warning"></i>
                            该标签当前被 <strong>${count}</strong> 个 API Key 使用，删除后将同时从这些 Key 中移除。
                        </p>
                    ` : '<p style="margin-top: var(--spacing-sm);">该标签未被使用，可以安全删除。</p>'}
                </div>

                <div class="modal-footer">
                    <button class="glass-btn" id="btnCancel">取消</button>
                    <button class="glass-btn" id="btnDelete" style="background: rgba(239, 68, 68, 0.8); border-color: var(--color-error);">
                        <i class="ph ph-trash"></i> 删除
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modal.showModal();

        // 取消按钮
        modal.querySelector('#btnCancel').addEventListener('click', () => {
            modal.close();
            modal.remove();
        });

        modal.querySelector('.modal-close').addEventListener('click', () => {
            modal.close();
            modal.remove();
        });

        // 删除按钮 - V1.0.1: 固定为 true，统一从标签库和所有 Key 中删除
        modal.querySelector('#btnDelete').addEventListener('click', async () => {
            try {
                await TagManager.deleteTag(tag.id, true);
                showToast('success', '标签删除成功');
                modal.close();
                modal.remove();
                if (onDelete) onDelete();
            } catch (error) {
                showToast('error', '删除失败: ' + error.message);
            }
        });

        modal.addEventListener('close', () => {
            modal.remove();
        });
    });
}

// === 工具函数 ===
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(type, message) {
    // 假设在 main.js 中有全局的 showToast 函数
    if (window.showToast) {
        window.showToast(type, message);
    } else {
        console.log(`[${type}]`, message);
    }
}

// === 导出 ===
export {
    TagManager,
    openTagManagementModal,
    openEditTagModal,
    openDeleteTagConfirm,
    PRESET_COLORS
};
