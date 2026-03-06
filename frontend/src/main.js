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

// UI 组件（Toast、确认对话框）
import { showToast, showConfirmDialog } from './ui.js';

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
    displayedKeys: []
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

    // 导出全局函数供其他模块使用
    window.showToast = showToast;
    window.loadData = loadData;
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
                        <button class="search-clear-btn" id="searchClearBtn" title="清除搜索条件" style="display: none;">
                            <i class="ph ph-x-circle"></i>
                        </button>
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
        searchClearBtn: document.getElementById('searchClearBtn'),
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
        updateSearchClearButton();
        filterKeys();
    });
    elements.searchClearBtn.addEventListener('click', () => {
        AppState.searchQuery = '';
        elements.searchInput.value = '';
        updateSearchClearButton();
        filterKeys();
    });

    // === 键盘快捷键 ===
    document.addEventListener('keydown', handleKeyboardShortcuts);
}

// === 键盘快捷键处理 ===
function handleKeyboardShortcuts(e) {
    // 忽略输入框中的按键（除了 Escape）
    const isInputFocused = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';

    // Escape: 关闭当前对话框/清除搜索
    if (e.key === 'Escape') {
        // 尝试关闭当前打开的对话框
        const openDialog = document.querySelector('dialog[open]');
        if (openDialog) {
            openDialog.close();
            openDialog.remove();
            return;
        }
        // 清除搜索
        if (AppState.searchQuery) {
            AppState.searchQuery = '';
            elements.searchInput.value = '';
            filterKeys();
            return;
        }
    }

    // 输入框聚焦时，不响应其他快捷键
    if (isInputFocused) return;

    // Ctrl/Cmd + N: 新建 API Key
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        openAddModal();
        return;
    }

    // Ctrl/Cmd + F: 聚焦搜索框
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        elements.searchInput.focus();
        return;
    }

    // Ctrl/Cmd + E: 导出数据
    if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        openExportDialog();
        return;
    }

    // Ctrl/Cmd + I: 导入数据
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault();
        openImportDialog();
        return;
    }

    // Ctrl/Cmd + T: 管理标签
    if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault();
        openTagManagementModal();
        return;
    }

    // Delete/Backspace: 删除选中的 Key（需要先选中）
    if (e.key === 'Delete' || e.key === 'Backspace') {
        // 未来可扩展：删除选中的 key
        return;
    }
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
        showToast('加载数据失败', 'error');
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
        updateSearchClearButton();
        renderKeys();
    } catch (error) {
        console.error('筛选失败:', error);
        // 筛选失败，显示全部数据
        AppState.displayedKeys = AppState.keys || [];
        renderKeys();
    }
}

// === 更新搜索清除按钮显示状态 ===
function updateSearchClearButton() {
    if (elements.searchClearBtn) {
        const hasQuery = AppState.searchQuery && AppState.searchQuery.trim().length > 0;
        elements.searchClearBtn.style.display = hasQuery ? 'inline-flex' : 'none';
    }
}

// === 渲染 Key 列表 ===
function renderKeys() {
    if (AppState.displayedKeys.length === 0) {
        const isEmpty = !AppState.selectedTag && !AppState.searchQuery;
        elements.keyList.innerHTML = `
            <div class="empty-state">
                <i class="ph ${isEmpty ? 'ph-key' : 'ph-magnifying-glass'}"></i>
                <h3>${isEmpty ? '还没有密钥' : '未找到匹配的密钥'}</h3>
                <p>${isEmpty
                    ? '点击右上角「添加」按钮添加第一个 API Key'
                    : '尝试其他关键词，或清除筛选条件'}</p>
                ${isEmpty ? `
                    <button class="btn-add" id="emptyStateAddBtn" style="margin-top: var(--spacing-md);">
                        <i class="ph ph-plus"></i> 添加第一个密钥
                    </button>
                ` : ''}
            </div>
        `;

        // 绑定添加按钮事件
        const addBtn = document.getElementById('emptyStateAddBtn');
        if (addBtn) {
            addBtn.addEventListener('click', () => openAddModal());
        }
        return;
    }

    // 创建标签ID到标签对象的映射
    const tagMap = new Map();
    for (const tag of (AppState.colors || [])) {
        tagMap.set(tag.id, tag);
    }

    elements.keyList.innerHTML = AppState.displayedKeys.map((key, index) => {
        // 生成脱敏 Key
        const fullKey = key.key || '';
        const maskedKey = fullKey.length > 12
            ? `${fullKey.slice(0, 8)}••••••${fullKey.slice(-4)}`
            : '••••••••';

        return `
        <div class="key-item animate-list-item" style="animation-delay: ${index * 50}ms" data-id="${key.id}">
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
            <div class="key-display key-masked" data-key-id="${key.id}" data-masked-key="${maskedKey}">${maskedKey}</div>
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
    `}).join('');

    // 绑定操作事件
    elements.keyList.querySelectorAll('.key-item').forEach(item => {
        const keyId = item.dataset.id;
        let keyVisible = false;

        // 存储定时器 ID 在元素上
        let autoHideTimer = null;

        item.querySelector('[data-action="toggle"]')?.addEventListener('click', async () => {
            keyVisible = !keyVisible;
            const displayEl = item.querySelector('.key-display');
            const iconEl = item.querySelector('[data-action="toggle"] i');

            // 清除之前的定时器
            if (autoHideTimer) {
                clearTimeout(autoHideTimer);
                autoHideTimer = null;
            }

            if (keyVisible) {
                try {
                    const plaintext = await DecryptKey(keyId);
                    displayEl.textContent = plaintext;
                    displayEl.classList.add('key-plaintext');
                    displayEl.classList.remove('key-masked');
                    iconEl.className = 'ph ph-eye-slash';

                    // 30 秒后自动隐藏
                    autoHideTimer = setTimeout(() => {
                        displayEl.textContent = displayEl.dataset.maskedKey || 'sk-••••••••';
                        displayEl.classList.remove('key-plaintext');
                        displayEl.classList.add('key-masked');
                        iconEl.className = 'ph ph-eye';
                        keyVisible = false;
                    }, 30000); // 30 秒
                } catch (error) {
                    showToast('解密失败', 'error');
                }
            } else {
                const maskedKey = displayEl.dataset.maskedKey || 'sk-••••••••';
                displayEl.textContent = maskedKey;
                displayEl.classList.remove('key-plaintext');
                displayEl.classList.add('key-masked');
                iconEl.className = 'ph ph-eye';
            }
        });

        item.querySelector('[data-action="copy"]')?.addEventListener('click', async () => {
            try {
                const plaintext = await DecryptKey(keyId);
                await navigator.clipboard.writeText(plaintext);
                showToast('已复制到剪贴板', 'success');
            } catch (error) {
                showToast('复制失败', 'error');
            }
        });

        item.querySelector('[data-action="edit"]')?.addEventListener('click', () => {
            const keyData = AppState.keys.find(k => k.id === keyId);
            if (keyData) {
                openEditModal(keyData);
            }
        });

        item.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
            const confirmed = await showConfirmDialog({
                title: '删除 API Key',
                message: '确定要删除这个 Key 吗？此操作不可恢复。',
                confirmText: '删除',
                cancelText: '取消',
                type: 'danger'
            });

            if (confirmed) {
                deleteKey(keyId);
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
            showToast('添加成功', 'success');
            modal.close();
            modal.remove();
            await loadData();
        } catch (error) {
            showToast('添加失败： ' + error.message, 'error');
        }
    });

    modal.addEventListener('close', () => {
        modal.remove();
    });
}

// === 删除 Key ===
async function deleteKey(id) {
    try {
        await DeleteKey(id);
        showToast('删除成功', 'success');
        await loadData();
    } catch (error) {
        showToast('删除失败： ' + error.message, 'error');
    }
}

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
            showToast('已填入当前 Key', 'info');
        } catch (error) {
            showToast('获取 Key 失败', 'error');
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
            showToast('更新成功', 'success');
            modal.close();
            modal.remove();
            await loadData();
        } catch (error) {
            showToast('更新失败： ' + error.message, 'error');
        }
    });

    modal.addEventListener('close', () => {
        modal.remove();
    });
}

// === 启动应用 ===
initApp();

