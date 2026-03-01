/**
 * API 调用封装
 * API Key Manager - Wails 后端调用
 */

import AppState from './state.js';

/**
 * API 调用错误处理
 * @param {Error} error - 原始错误
 * @param {string} defaultMessage - 默认错误消息
 */
function handleApiError(error, defaultMessage = '操作失败') {
    // 生产环境移除 console 语句

    // 尝试解析结构化错误
    if (error && error.message) {
        return {
            success: false,
            message: error.message,
            code: error.code || 'UNKNOWN_ERROR'
        };
    }

    return {
        success: false,
        message: defaultMessage,
        code: 'UNKNOWN_ERROR'
    };
}

/**
 * 统一 API 调用封装
 * @param {Function} apiCall - Wails API 调用函数
 * @param {string} errorMessage - 错误消息
 */
async function callAPI(apiCall, errorMessage = '操作失败') {
    try {
        const result = await apiCall();
        return {
            success: true,
            data: result
        };
    } catch (error) {
        return handleApiError(error, errorMessage);
    }
}

/**
 * API 接口定义
 */
const API = {
    /**
     * 加载所有 API Key
     * @returns {Promise<Object>}
     */
    async loadKeys() {
        AppState.setLoading(true);
        const result = await callAPI(
            () => window.go.main.App.LoadKeys(),
            '加载数据失败'
        );
        AppState.setLoading(false);
        return result;
    },

    /**
     * 添加新的 API Key
     * @param {string} website - 网站名称
     * @param {string} key - API Key
     * @param {Array<string>} tags - 标签数组
     * @param {string} note - 备注
     * @returns {Promise<Object>}
     */
    async addKey(website, key, tags = [], note = '') {
        return callAPI(
            () => window.go.main.App.AddKey(website, key, tags, note),
            '添加失败'
        );
    },

    /**
     * 更新 API Key
     * @param {string} id - Key ID
     * @param {string} website - 网站名称
     * @param {string} key - API Key
     * @param {Array<string>} tags - 标签数组
     * @param {string} note - 备注
     * @returns {Promise<Object>}
     */
    async updateKey(id, website, key, tags = [], note = '') {
        return callAPI(
            () => window.go.main.App.UpdateKey(id, website, key, tags, note),
            '更新失败'
        );
    },

    /**
     * 删除 API Key
     * @param {string} id - Key ID
     * @returns {Promise<Object>}
     */
    async deleteKey(id) {
        return callAPI(
            () => window.go.main.App.DeleteKey(id),
            '删除失败'
        );
    },

    /**
     * 解密 API Key（用于查看/复制）
     * @param {string} id - Key ID
     * @returns {Promise<Object>}
     */
    async decryptKey(id) {
        return callAPI(
            () => window.go.main.App.DecryptKey(id),
            '解密失败'
        );
    },

    /**
     * 获取标签列表及统计
     * @returns {Promise<Object>}
     */
    async getTags() {
        return callAPI(
            () => window.go.main.App.GetTags(),
            '获取标签失败'
        );
    },

    /**
     * 搜索 API Key
     * @param {string} query - 搜索关键字
     * @param {string} selectedTag - 选中的标签
     * @returns {Promise<Object>}
     */
    async searchKeys(query, selectedTag = '') {
        return callAPI(
            () => window.go.main.App.SearchKeys(query, selectedTag),
            '搜索失败'
        );
    },

    /**
     * 导出数据
     * @returns {Promise<Object>}
     */
    async exportData() {
        return callAPI(
            () => window.go.main.App.ExportData(),
            '导出失败'
        );
    },

    /**
     * 导入数据
     * @param {string} dataPath - 数据文件路径
     * @param {string} keyPath - 密钥文件路径
     * @returns {Promise<Object>}
     */
    async importData(dataPath, keyPath) {
        return callAPI(
            () => window.go.main.App.ImportData(dataPath, keyPath),
            '导入失败'
        );
    }
};

export default API;
