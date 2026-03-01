/**
 * 状态管理
 * API Key Manager - 简单观察者模式实现
 */

// 全局应用状态
const AppState = {
    // 数据状态
    keys: [],           // API Key 列表
    tags: [],           // 标签列表
    selectedTag: null,  // 当前选中的标签 (null = 全部)
    searchQuery: '',    // 搜索关键字

    // UI 状态
    loading: false,     // 加载状态
    editingKeyId: null, // 正在编辑的 Key ID (null = 新增)

    // 观察者列表
    listeners: [],

    /**
     * 订阅状态变化
     * @param {Function} listener - 状态变化回调函数
     */
    subscribe(listener) {
        if (typeof listener === 'function') {
            this.listeners.push(listener);
        }
    },

    /**
     * 取消订阅
     * @param {Function} listener - 要取消的回调函数
     */
    unsubscribe(listener) {
        const index = this.listeners.indexOf(listener);
        if (index > -1) {
            this.listeners.splice(index, 1);
        }
    },

    /**
     * 通知所有观察者
     */
    notify() {
        this.listeners.forEach(listener => {
            try {
                listener(this);
            } catch (error) {
                // 状态监听器错误，静默处理避免影响其他监听器
            }
        });
    },

    /**
     * 设置加载状态
     * @param {boolean} loading
     */
    setLoading(loading) {
        this.loading = loading;
        this.notify();
    },

    /**
     * 设置 API Key 列表
     * @param {Array} keys
     */
    setKeys(keys) {
        this.keys = keys || [];
        this.notify();
    },

    /**
     * 设置标签列表
     * @param {Array} tags
     */
    setTags(tags) {
        this.tags = tags || [];
        this.notify();
    },

    /**
     * 选择标签
     * @param {string|null} tag - 标签名，null 表示全部
     */
    selectTag(tag) {
        this.selectedTag = tag;
        this.notify();
    },

    /**
     * 设置搜索关键字
     * @param {string} query
     */
    setSearchQuery(query) {
        this.searchQuery = query || '';
        this.notify();
    },

    /**
     * 设置编辑中的 Key ID
     * @param {string|null} keyId
     */
    setEditingKeyId(keyId) {
        this.editingKeyId = keyId;
        this.notify();
    },

    /**
     * 获取过滤后的 Key 列表
     * @returns {Array} 过滤后的列表
     */
    getFilteredKeys() {
        let filtered = [...this.keys];

        // 按标签筛选
        if (this.selectedTag) {
            filtered = filtered.filter(key =>
                key.tags && key.tags.includes(this.selectedTag)
            );
        }

        // 按搜索关键字筛选
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            filtered = filtered.filter(key => {
                const website = (key.website || '').toLowerCase();
                const tags = (key.tags || []).join(' ').toLowerCase();
                const note = (key.note || '').toLowerCase();
                return website.includes(query) ||
                       tags.includes(query) ||
                       note.includes(query);
            });
        }

        return filtered;
    },

    /**
     * 重置状态
     */
    reset() {
        this.keys = [];
        this.tags = [];
        this.selectedTag = null;
        this.searchQuery = '';
        this.loading = false;
        this.editingKeyId = null;
        this.notify();
    }
};

export default AppState;
