/**
 * API Key Manager - Main Application Entry
 * 前端主入口文件
 */

// Wails 运行时
import { LoadKeys, AddKey, UpdateKey, DeleteKey, DecryptKey, GetTags, SearchKeys, GetAllTags } from '../wailsjs/go/main/App';

// 主题管理
import ThemeManager from './theme.js';

// 标签管理
import { TagManager, openTagManagementModal } from './tags.js';

// 导入导出
import { openExportDialog, openImportDialog } from './import-export.js';

// 导入样式
import '../styles/reset.css';
import '../styles/variables.css';
import '../styles/glass.css';
import '../styles/components.css';
import '../styles/animations.css';

// === 网站图标映射 ===
const websiteIcons = {
    'openai': 'ph-fill ph-chat-centered',
    'anthropic': 'ph-fill ph-sparkle',
    'github': 'ph-fill ph-github-logo',
    'google': 'ph-fill ph-google-logo',
    'microsoft': 'ph-fill ph-microsoft-logo',
    'aws': 'ph-fill ph-cloud',
    'azure': 'ph-fill ph-microsoft-logo',
    'stripe': 'ph-fill ph-credit-card',
    'sendgrid': 'ph-fill ph-envelope',
    'cloudflare': 'ph-fill ph-cloud',
    'vercel': 'ph-fill ph-vector-three',
    'netlify': 'ph-fill ph-globe',
    'digitalocean': 'ph-fill ph-hard-drives',
    'heroku': 'ph-fill ph-cloud-arrow-up',
    'gitlab': 'ph-fill ph-gitlab-logo',
    'bitbucket': 'ph-fill ph-bitbucket-logo',
    'slack': 'ph-fill ph-chats-circle',
    'discord': 'ph-fill ph-discord-logo',
    'twitter': 'ph-fill ph-twitter-logo',
    'notion': 'ph-fill ph-notebook',
    'figma': 'ph-fill ph-figma-logo',
    'default': 'ph-fill ph-globe'
};

function getWebsiteIcon(website) {
    const lower = website.toLowerCase();
    for (const [key, icon] of Object.entries(websiteIcons)) {
        if (lower.includes(key)) return icon;
    }
    return websiteIcons.default;
}

// === 应用状态 ===
const AppState = {
    keys: [],
    tags: [],       // V1.1: Tag 对象数组（从 GetAllTags 获取）
    colors: [],     // 新增：用于标签颜色映射
    selectedTag: null,
    searchQuery: '',
    loading: false,
    displayedKeys: [],
    selectedKeyId: null,     // V1.0.1: 当前选中的 Key ID（用于键盘快捷键）
    currentModal: null,      // V1.0.1: 当前打开的模态框引用
    keyVisibilityTimers: new Map()  // V1.0.1: Key 显示定时器映射
};

// === DOM 元素 ===
let elements = {};

// === 初始化应用 ===
function initApp() {
    renderLayout();
    // 初始化主题（在 renderLayout 之后，确保 DOM 元素已存在）
    ThemeManager.init();
    bindEvents();
    loadData();
}

// === 渲染布局 ===
function renderLayout() {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="app-header">
            <div class="header-left">
                <h1><i class="ph ph-key"></i> API Key Manager</h1>
                <button class="theme-toggle" id="themeToggle" aria-label="切换主题">
                    <i class="ph ph-moon"></i>
                </button>
            </div>
            <div style="display: flex; gap: var(--spacing-sm);">
                <button class="glass-btn" id="btnExport" title="导出数据">
                    <i class="ph ph-download-simple"></i> 导出
                </button>
                <button class="glass-btn" id="btnImport" title="导入数据">
                    <i class="ph ph-upload-simple"></i> 导入
                </button>
                <button class="btn-add" id="btnAdd">
                    <i class="ph ph-plus"></i> 添加
                </button>
            </div>
        </div>
        <div class="app-main">
            <aside class="sidebar">
                <div class="sidebar-header">
                    <h2><i class="ph ph-tag"></i> 标签</h2>
                </div>
                <div class="sidebar-content" id="tagList">
                    <!-- 标签列表 -->
                </div>
                <div class="sidebar-footer">
                    <button class="btn-manage-tags" id="btnManageTags">
                        <i class="ph ph-gear"></i> 管理标签
                    </button>
                </div>
            </aside>
            <main class="main-content">
                <div class="search-bar">
                    <div class="search-input-wrapper">
                        <i class="ph ph-magnifying-glass"></i>
                        <input type="text" class="glass-input search-input" id="searchInput" placeholder="搜索网站、标签或备注...">
                    </div>
                </div>
                <div class="key-list" id="keyList">
                    <!-- Key 列表 -->
                </div>
            </main>
        </div>
        <div class="toast-container" id="toastContainer"></div>
    `;

    // 缓存 DOM 元素
    elements = {
        btnAdd: document.getElementById('btnAdd'),
        btnExport: document.getElementById('btnExport'),
        btnImport: document.getElementById('btnImport'),
        btnManageTags: document.getElementById('btnManageTags'),
        tagList: document.getElementById('tagList'),
        searchInput: document.getElementById('searchInput'),
        keyList: document.getElementById('keyList'),
        toastContainer: document.getElementById('toastContainer')
    };
}

// === 绑定事件 ===
function bindEvents() {
    elements.btnAdd.addEventListener('click', () => openAddModal());
    elements.btnExport.addEventListener('click', () => openExportDialog());
    elements.btnImport.addEventListener('click', () => openImportDialog());
    elements.btnManageTags.addEventListener('click', () => openTagManagementModal());
    elements.searchInput.addEventListener('input', (e) => {
        AppState.searchQuery = e.target.value;
        filterKeys();
    });

    // V1.0.1: 添加全局键盘快捷键监听
    document.addEventListener('keydown', handleGlobalKeyboard);
}

// === 加载数据 ===
async function loadData() {
    AppState.loading = true;
    try {
        // 加载 Keys
        const keys = await LoadKeys();
        AppState.keys = keys || [];

        // 加载标签（V1.1: 使用 GetAllTags）
        const tags = await GetAllTags();
        AppState.tags = tags || [];
        AppState.colors = tags || [];  // 存储标签颜色映射

        renderTags();
        filterKeys();
    } catch (error) {
        // 生产环境移除 console，仅显示用户友好错误消息
        showToast('error', '加载数据失败');
        console.error(error);
    } finally {
        AppState.loading = false;
    }
}

// === 渲染标签列表 ===
function renderTags() {
    // 创建"全部"选项
    const allTag = {
        id: 'all',
        name: 'all',
        displayName: '全部',
        color: '#6b7280',
        count: AppState.keys.length
    };

    // 为每个标签统计使用数量
    const tagsWithCount = (AppState.tags || []).map(tag => ({
        ...tag,
        displayName: tag.name,
        count: AppState.keys.filter(k => k.tagIds?.includes(tag.id)).length
    }));

    const tags = [allTag, ...tagsWithCount];

    elements.tagList.innerHTML = tags.map(tag => `
        <div class="tag-item ${AppState.selectedTag === tag.id ? 'active' : ''}"
             data-tag="${tag.id}">
            <i class="ph ph-${getTagIcon(tag.name)}"></i>
            <span class="tag-name">${tag.displayName || tag.name}</span>
            <span class="tag-count">${tag.count}</span>
        </div>
    `).join('');

    // 绑定点击事件
    elements.tagList.querySelectorAll('.tag-item').forEach(item => {
        item.addEventListener('click', () => {
            const tagId = item.dataset.tag;
            AppState.selectedTag = tagId === 'all' ? null : tagId;
            renderTags();
            filterKeys();
        });
    });
}

// === 获取标签图标 ===
function getTagIcon(tagName) {
    const iconMap = {
        'all': 'folders',
        'AI': 'brain',
        'MCP': 'plugs',
        '支付': 'credit-card',
        '邮箱': 'envelope',
        '代码': 'code',
        '默认': 'tag'
    };
    return iconMap[tagName] || 'tag';
}

// === 筛选 Keys ===
async function filterKeys() {
    try {
        // V1.1: 传递标签ID，如果没有选择则传 'all'
        const selectedTagId = AppState.selectedTag || 'all';
        const keys = await SearchKeys(AppState.searchQuery, selectedTagId);
        AppState.displayedKeys = keys || [];
        renderKeys();
    } catch (error) {
        console.error('筛选失败:', error);
        // 筛选失败，显示全部数据
        AppState.displayedKeys = AppState.keys || [];
        renderKeys();
    }
}

// === 渲染 Key 列表 ===
function renderKeys() {
    if (AppState.displayedKeys.length === 0) {
        elements.keyList.innerHTML = `
            <div class="empty-state">
                <i class="ph ph-key"></i>
                <h3>暂无 API Key</h3>
                <p>点击右上角「添加」按钮添加第一个 Key</p>
            </div>
        `;
        return;
    }

    // 创建标签ID到标签对象的映射
    const tagMap = new Map();
    for (const tag of (AppState.colors || [])) {
        tagMap.set(tag.id, tag);
    }

    elements.keyList.innerHTML = AppState.displayedKeys.map((key, index) => `
        <div class="key-item animate-list-item ${AppState.selectedKeyId === key.id ? 'selected' : ''}"
             style="animation-delay: ${index * 50}ms" data-id="${key.id}" tabindex="0">
            <div class="key-website">
                <i class="ph ${getWebsiteIcon(key.website)}"></i> ${escapeHtml(key.website)}
            </div>
            <div class="key-tags">
                ${(key.tagIds || []).map(tagId => {
                    const tag = tagMap.get(tagId);
                    if (tag) {
                        return `<span class="key-tag" style="background-color: ${tag.color}; color: ${getContrastColor(tag.color)};">${escapeHtml(tag.name)}</span>`;
                    }
                    return '';
                }).join('')}
            </div>
            <div class="key-display" data-key-id="${key.id}">sk-xxxx...xxxx</div>
            <div class="key-actions">
                <button class="icon-btn" data-action="toggle" title="显示/隐藏">
                    <i class="ph ph-eye"></i>
                </button>
                <button class="icon-btn" data-action="copy" title="复制">
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
    `).join('');

    // 绑定操作事件
    elements.keyList.querySelectorAll('.key-item').forEach(item => {
        const keyId = item.dataset.id;

        // V1.0.1: 点击选中 Key（用于键盘快捷键）
        item.addEventListener('click', () => {
            selectKeyItem(keyId);
        });

        // V1.0.1: 双击编辑
        item.addEventListener('dblclick', () => {
            const keyData = AppState.keys.find(k => k.id === keyId);
            if (keyData) {
                openEditModal(keyData);
            }
        });

        // 显示/隐藏切换
        item.querySelector('[data-action="toggle"]')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            await toggleKeyVisibility(keyId, item);
        });

        // 复制
        item.querySelector('[data-action="copy"]')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            await copyKeyToClipboard(keyId);
        });

        // 编辑
        item.querySelector('[data-action="edit"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const keyData = AppState.keys.find(k => k.id === keyId);
            if (keyData) {
                openEditModal(keyData);
            }
        });

        // 删除 - V1.0.1: 使用自定义确认对话框
        item.querySelector('[data-action="delete"]')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            const keyData = AppState.keys.find(k => k.id === keyId);
            if (keyData) {
                await showDeleteConfirmDialog(keyData);
            }
        });
    });
}

// === 根据背景色获取合适的文字颜色 ===
function getContrastColor(hexColor) {
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128 ? '#000000' : '#ffffff';
}

// === Key 脱敏显示 ===
function maskKey(key, masked = true) {
    if (!masked) return key;
    if (key.length <= 12) return '****';
    return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

// === 打开添加弹窗 ===
async function openAddModal() {
    const modal = document.createElement('dialog');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content animate-scale-in">
            <div class="modal-header">
                <h2>添加 API Key</h2>
                <button class="modal-close"><i class="ph ph-x"></i></button>
            </div>
            <form id="addKeyForm">
                <div class="form-group">
                    <label>网站名称 *</label>
                    <input type="text" class="glass-input form-input" name="website" required placeholder="例如: OpenAI">
                </div>
                <div class="form-group">
                    <label>API Key *</label>
                    <input type="password" class="glass-input form-input" name="apiKey" required placeholder="sk-...">
                </div>
                <div class="form-group">
                    <label>标签（点击选择）</label>
                    <div class="tag-selector" id="tagSelector">
                        <!-- 标签选择器动态加载 -->
                        <span style="color: var(--text-muted); font-size: 13px;">加载中...</span>
                    </div>
                    <div class="selected-tags" id="selectedTags">
                        <!-- 已选标签 -->
                    </div>
                </div>
                <div class="form-group">
                    <label>备注</label>
                    <textarea class="glass-input form-textarea" name="note" placeholder="可选备注信息"></textarea>
                </div>
                <div class="modal-footer">
                    <button type="button" class="glass-btn" id="btnCancel">取消</button>
                    <button type="submit" class="glass-btn glass-btn-primary">添加</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);
    modal.showModal();
    AppState.currentModal = modal;  // V1.0.1: 追踪当前模态框

    let selectedTagIds = [];
    let allTags = [];

    // 加载标签
    try {
        allTags = await TagManager.getAllTags();
        renderTagSelector();
    } catch (error) {
        modal.querySelector('#tagSelector').innerHTML = '<span style="color: var(--color-error);">加载标签失败</span>';
    }

    // 渲染标签选择器
    function renderTagSelector() {
        const selectorEl = modal.querySelector('#tagSelector');
        if (allTags.length === 0) {
            selectorEl.innerHTML = '<span style="color: var(--text-muted); font-size: 13px;">暂无可用标签，请先在"管理标签"中创建</span>';
            return;
        }

        selectorEl.innerHTML = allTags.map(tag => `
            <span class="tag-pill ${selectedTagIds.includes(tag.id) ? 'selected' : ''}"
                  data-tag-id="${tag.id}"
                  style="background-color: ${tag.color}; color: ${TagManager.getContrastColor(tag.color)};">
                ${escapeHtml(tag.name)}
            </span>
        `).join('');

        // 绑定点击事件
        selectorEl.querySelectorAll('.tag-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                const tagId = pill.dataset.tagId;
                if (selectedTagIds.includes(tagId)) {
                    selectedTagIds = selectedTagIds.filter(id => id !== tagId);
                    pill.classList.remove('selected');
                } else {
                    selectedTagIds.push(tagId);
                    pill.classList.add('selected');
                }
                renderSelectedTags();
            });
        });
    }

    // 渲染已选标签
    function renderSelectedTags() {
        const selectedEl = modal.querySelector('#selectedTags');
        const selectedTags = allTags.filter(t => selectedTagIds.includes(t.id));
        selectedEl.innerHTML = selectedTags.map(tag => `
            <span class="selected-tag" style="background-color: ${tag.color};">
                ${escapeHtml(tag.name)}
                <button type="button" data-tag-id="${tag.id}">&times;</button>
            </span>
        `).join('');

        selectedEl.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                const tagId = btn.dataset.tagId;
                selectedTagIds = selectedTagIds.filter(id => id !== tagId);
                renderTagSelector();
                renderSelectedTags();
            });
        });
    }

    modal.querySelector('#btnCancel').addEventListener('click', () => {
        modal.close();
        modal.remove();
    });

    modal.querySelector('.modal-close').addEventListener('click', () => {
        modal.close();
        modal.remove();
    });

    modal.querySelector('#addKeyForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        try {
            await AddKey(
                formData.get('website'),
                formData.get('apiKey'),
                selectedTagIds,
                formData.get('note') || ''
            );
            showToast('success', '添加成功');
            modal.close();
            modal.remove();
            await loadData();
        } catch (error) {
            showToast('error', '添加失败: ' + error.message);
        }
    });

    modal.addEventListener('close', () => {
        modal.remove();
        AppState.currentModal = null;  // V1.0.1: 清除模态框引用
    });
}

// === 打开编辑弹窗 ===
async function deleteKey(id) {
    try {
        await DeleteKey(id);
        showToast('success', '删除成功');
        await loadData();
    } catch (error) {
        showToast('error', '删除失败: ' + error.message);
    }
}

// === 显示 Toast ===
function showToast(type, message) {
    const toast = document.createElement('div');
    toast.className = `toast glass-toast ${type} animate-fade-in-up`;
    const icons = {
        success: 'check-circle',
        error: 'warning-circle',
        info: 'info'
    };
    toast.innerHTML = `<i class="ph ph-${icons[type] || 'info'}"></i><span>${escapeHtml(message)}</span>`;
    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('animate-fade-in');
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 250);
    }, 3000);
}

// 将函数挂载到 window，供其他模块使用
window.showToast = showToast;
window.loadData = loadData;

// === HTML 转义 ===
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// === 打开编辑弹窗 ===
async function openEditModal(keyData) {
    const modal = document.createElement('dialog');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content animate-scale-in">
            <div class="modal-header">
                <h2>编辑 API Key</h2>
                <button class="modal-close"><i class="ph ph-x"></i></button>
            </div>
            <form id="editKeyForm">
                <input type="hidden" name="keyId" value="${escapeHtml(keyData.id)}">
                <div class="form-group">
                    <label>网站名称 *</label>
                    <input type="text" class="glass-input form-input" name="website" required placeholder="例如: OpenAI" value="${escapeHtml(keyData.website)}">
                </div>
                <div class="form-group">
                    <label>API Key *</label>
                    <input type="password" class="glass-input form-input" name="apiKey" required placeholder="sk-...">
                    <button type="button" class="glass-btn" id="btnFillKey" style="margin-top: var(--spacing-xs); font-size: 12px;">
                        <i class="ph ph-arrow-counter-clockwise"></i> 填入当前 Key
                    </button>
                </div>
                <div class="form-group">
                    <label>标签（点击选择）</label>
                    <div class="tag-selector" id="editTagSelector">
                        <!-- 标签选择器动态加载 -->
                        <span style="color: var(--text-muted); font-size: 13px;">加载中...</span>
                    </div>
                    <div class="selected-tags" id="editSelectedTags">
                        <!-- 已选标签 -->
                    </div>
                </div>
                <div class="form-group">
                    <label>备注</label>
                    <textarea class="glass-input form-textarea" name="note" placeholder="可选备注信息">${escapeHtml(keyData.note || '')}</textarea>
                </div>
                <div class="modal-footer">
                    <button type="button" class="glass-btn" id="btnCancel">取消</button>
                    <button type="submit" class="glass-btn glass-btn-primary">保存</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);
    modal.showModal();
    AppState.currentModal = modal;  // V1.0.1: 追踪当前模态框

    let selectedTagIds = [...(keyData.tagIds || [])];
    let allTags = [];
    let currentKeyValue = '';

    // 加载标签
    try {
        allTags = await TagManager.getAllTags();
        renderTagSelector();
    } catch (error) {
        modal.querySelector('#editTagSelector').innerHTML = '<span style="color: var(--color-error);">加载标签失败</span>';
    }

    // 渲染标签选择器
    function renderTagSelector() {
        const selectorEl = modal.querySelector('#editTagSelector');
        if (allTags.length === 0) {
            selectorEl.innerHTML = '<span style="color: var(--text-muted); font-size: 13px;">暂无可用标签，请先在"管理标签"中创建</span>';
            return;
        }

        selectorEl.innerHTML = allTags.map(tag => `
            <span class="tag-pill ${selectedTagIds.includes(tag.id) ? 'selected' : ''}"
                  data-tag-id="${tag.id}"
                  style="background-color: ${tag.color}; color: ${TagManager.getContrastColor(tag.color)};">
                ${escapeHtml(tag.name)}
            </span>
        `).join('');

        // 绑定点击事件
        selectorEl.querySelectorAll('.tag-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                const tagId = pill.dataset.tagId;
                if (selectedTagIds.includes(tagId)) {
                    selectedTagIds = selectedTagIds.filter(id => id !== tagId);
                    pill.classList.remove('selected');
                } else {
                    selectedTagIds.push(tagId);
                    pill.classList.add('selected');
                }
                renderSelectedTags();
            });
        });
    }

    // 渲染已选标签
    function renderSelectedTags() {
        const selectedEl = modal.querySelector('#editSelectedTags');
        const selectedTags = allTags.filter(t => selectedTagIds.includes(t.id));
        selectedEl.innerHTML = selectedTags.map(tag => `
            <span class="selected-tag" style="background-color: ${tag.color};">
                ${escapeHtml(tag.name)}
                <button type="button" data-tag-id="${tag.id}">&times;</button>
            </span>
        `).join('');

        selectedEl.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                const tagId = btn.dataset.tagId;
                selectedTagIds = selectedTagIds.filter(id => id !== tagId);
                renderTagSelector();
                renderSelectedTags();
            });
        });
    }

    // 填入当前 Key 按钮
    modal.querySelector('#btnFillKey').addEventListener('click', async () => {
        try {
            const plaintext = await DecryptKey(keyData.id);
            const input = modal.querySelector('[name="apiKey"]');
            input.value = plaintext;
            currentKeyValue = plaintext;
            showToast('info', '已填入当前 Key');
        } catch (error) {
            showToast('error', '获取 Key 失败');
        }
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
    modal.querySelector('#editKeyForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const apiKey = formData.get('apiKey');

        try {
            await UpdateKey(
                formData.get('keyId'),
                formData.get('website'),
                apiKey,
                selectedTagIds,
                formData.get('note') || ''
            );
            showToast('success', '更新成功');
            modal.close();
            modal.remove();
            await loadData();
        } catch (error) {
            showToast('error', '更新失败: ' + error.message);
        }
    });

    modal.addEventListener('close', () => {
        modal.remove();
        AppState.currentModal = null;  // V1.0.1: 清除模态框引用
    });
}

// ============================================
// V1.0.1 新增功能
// ============================================

/**
 * V1.0.1: 选中 Key 项（用于键盘快捷键）
 */
function selectKeyItem(keyId) {
    // 清除之前的选中状态
    elements.keyList.querySelectorAll('.key-item').forEach(item => {
        item.classList.remove('selected');
    });

    // 设置新的选中状态
    const item = elements.keyList.querySelector(`[data-id="${keyId}"]`);
    if (item) {
        item.classList.add('selected');
        AppState.selectedKeyId = keyId;
    }
}

/**
 * V1.0.1: 切换 Key 显示/隐藏（带30秒自动隐藏）
 */
async function toggleKeyVisibility(keyId, itemElement) {
    const displayEl = itemElement.querySelector('.key-display');
    const iconEl = itemElement.querySelector('[data-action="toggle"] i');
    const isVisible = displayEl.dataset.visible === 'true';

    // 清除之前的定时器
    if (AppState.keyVisibilityTimers.has(keyId)) {
        clearTimeout(AppState.keyVisibilityTimers.get(keyId));
        AppState.keyVisibilityTimers.delete(keyId);
    }

    if (isVisible) {
        // 隐藏
        displayEl.textContent = 'sk-xxxx...xxxx';
        displayEl.dataset.visible = 'false';
        iconEl.className = 'ph ph-eye';
    } else {
        // 显示
        try {
            const plaintext = await DecryptKey(keyId);
            displayEl.textContent = maskKey(plaintext, false);
            displayEl.dataset.visible = 'true';
            iconEl.className = 'ph ph-eye-slash';

            // V1.0.1: 30秒后自动隐藏
            const timer = setTimeout(() => {
                displayEl.textContent = 'sk-xxxx...xxxx';
                displayEl.dataset.visible = 'false';
                iconEl.className = 'ph ph-eye';
                AppState.keyVisibilityTimers.delete(keyId);
            }, 30000);
            AppState.keyVisibilityTimers.set(keyId, timer);
        } catch (error) {
            showToast('error', '解密失败');
        }
    }
}

/**
 * V1.0.1: 复制 Key 到剪贴板
 */
async function copyKeyToClipboard(keyId) {
    try {
        const plaintext = await DecryptKey(keyId);
        await navigator.clipboard.writeText(plaintext);
        showToast('success', '已复制到剪贴板');
    } catch (error) {
        showToast('error', '复制失败');
    }
}

/**
 * V1.0.1: 显示删除确认对话框
 */
async function showDeleteConfirmDialog(keyData) {
    const modal = document.createElement('dialog');
    modal.className = 'modal confirm-dialog';
    modal.innerHTML = `
        <div class="modal-content animate-scale-in" style="min-width: 380px; max-width: 420px;">
            <div class="modal-header">
                <h2><i class="ph ph-warning" style="color: var(--color-error);"></i> 确认删除</h2>
                <button class="modal-close"><i class="ph ph-x"></i></button>
            </div>
            <div class="confirm-dialog-content">
                <p style="margin-bottom: var(--spacing-md);">
                    确定要删除 <strong>${escapeHtml(keyData.website)}</strong> 的密钥吗？
                </p>
                <p style="color: var(--text-muted); font-size: 13px;">
                    <i class="ph ph-info"></i> 此操作不可恢复
                </p>
            </div>
            <div class="modal-footer" style="justify-content: center;">
                <button type="button" class="glass-btn" id="btnCancelDelete">
                    <i class="ph ph-x"></i> 取消 (Esc)
                </button>
                <button type="button" class="glass-btn" id="btnConfirmDelete" style="background: rgba(239, 68, 68, 0.8); border-color: var(--color-error);">
                    <i class="ph ph-trash"></i> 删除 (Enter)
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.showModal();
    AppState.currentModal = modal;

    // 聚焦到删除按钮
    modal.querySelector('#btnConfirmDelete')?.focus();

    // 取消
    const closeDialog = () => {
        modal.close();
        modal.remove();
        AppState.currentModal = null;
    };

    modal.querySelector('#btnCancelDelete').addEventListener('click', closeDialog);
    modal.querySelector('.modal-close').addEventListener('click', closeDialog);

    // 确认删除
    modal.querySelector('#btnConfirmDelete').addEventListener('click', async () => {
        closeDialog();
        await deleteKey(keyData.id);
    });

    modal.addEventListener('close', () => {
        modal.remove();
        AppState.currentModal = null;
    });
}

/**
 * V1.0.1: 处理全局键盘快捷键
 */
function handleGlobalKeyboard(e) {
    // Ctrl + N: 新建密钥
    if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        openAddModal();
        return;
    }

    // Ctrl + F: 聚焦搜索框
    if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        elements.searchInput?.focus();
        return;
    }

    // Esc: 关闭模态框
    if (e.key === 'Escape') {
        if (AppState.currentModal) {
            AppState.currentModal.close();
            return;
        }
    }

    // Ctrl + Enter: 在模态框中保存
    if (e.ctrlKey && e.key === 'Enter') {
        if (AppState.currentModal) {
            const submitBtn = AppState.currentModal.querySelector('button[type="submit"]');
            if (submitBtn) {
                e.preventDefault();
                submitBtn.click();
                return;
            }
        }
    }

    // 以下快捷键需要在主界面（非模态框）中生效
    if (AppState.currentModal) return;

    // Delete: 删除选中的 Key
    if (e.key === 'Delete') {
        if (AppState.selectedKeyId) {
            const keyData = AppState.keys.find(k => k.id === AppState.selectedKeyId);
            if (keyData) {
                showDeleteConfirmDialog(keyData);
            }
        }
        return;
    }

    // C: 复制选中的 Key
    if (e.key === 'c' || e.key === 'C') {
        // 排除在输入框中的情况
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (AppState.selectedKeyId) {
            copyKeyToClipboard(AppState.selectedKeyId);
        }
        return;
    }

    // 上/下箭头: 在 Key 列表中导航
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        e.preventDefault();
        const keys = AppState.displayedKeys;
        if (keys.length === 0) return;

        const currentIndex = keys.findIndex(k => k.id === AppState.selectedKeyId);

        if (e.key === 'ArrowUp') {
            const newIndex = currentIndex <= 0 ? keys.length - 1 : currentIndex - 1;
            selectKeyItem(keys[newIndex].id);
        } else {
            const newIndex = currentIndex >= keys.length - 1 ? 0 : currentIndex + 1;
            selectKeyItem(keys[newIndex].id);
        }

        // 滚动到可见区域
        const selectedItem = elements.keyList.querySelector('.key-item.selected');
        selectedItem?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
    }

    // Enter: 编辑选中的 Key
    if (e.key === 'Enter') {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (AppState.selectedKeyId) {
            const keyData = AppState.keys.find(k => k.id === AppState.selectedKeyId);
            if (keyData) {
                openEditModal(keyData);
            }
        }
        return;
    }
}

// === 启动应用 ===
initApp();

