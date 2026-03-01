/**
 * API Key Manager - 导入导出模块
 * V1.1 智能导入导出功能
 */

// Wails 运行时
import { ExportData, ImportData, ImportWithResolution, OpenImportFileDialog } from '../wailsjs/go/main/App';

// === 导入导出模块 ===
const ImportExportManager = {
    /**
     * 导出数据
     */
    async exportData() {
        try {
            const filePath = await ExportData();
            return filePath;
        } catch (error) {
            throw new Error('导出失败: ' + error.message);
        }
    },

    /**
     * 导入数据（检测冲突）
     */
    async importData(zipPath) {
        try {
            const result = await ImportData(zipPath);
            return result;
        } catch (error) {
            // 增强错误信息处理 - 兼容不同错误对象结构
            const errorMsg = error.message || error.error || error.toString() || '未知错误';
            console.error('ImportData 错误详情:', error);
            throw new Error('导入失败: ' + errorMsg);
        }
    },

    /**
     * 带冲突解决的导入
     */
    async importWithResolution(zipPath, resolutions) {
        try {
            const stats = await ImportWithResolution(zipPath, resolutions);
            return stats;
        } catch (error) {
            // 增强错误信息处理
            const errorMsg = error.message || error.error || error.toString() || '未知错误';
            console.error('ImportWithResolution 错误详情:', error);
            throw new Error('导入失败: ' + errorMsg);
        }
    }
};

// === 打开导出对话框 ===
function openExportDialog() {
    ImportExportManager.exportData()
        .then(filePath => {
            // 提取文件名（从完整路径中）
            const fileName = filePath.split(/[\\/]/).pop() || filePath;
            showToast('success', `✅ 导出成功！\n\n📁 ${fileName}`);
        })
        .catch(error => {
            showToast('error', '❌ ' + error.message);
        });
}

// === 打开导入对话框 ===
function openImportDialog() {
    // 使用 Wails 原生文件对话框
    OpenImportFileDialog()
        .then(filePath => {
            // 用户取消选择
            if (!filePath) {
                return Promise.resolve();
            }

            console.log('选择的文件路径:', filePath);

            showToast('info', '正在分析导入数据...');

            return ImportExportManager.importData(filePath)
                .then(result => {
                    if (result.hasConflicts) {
                        // 有冲突，显示冲突解决对话框，返回其 Promise
                        return openConflictResolveDialog(filePath, result);
                    } else {
                        // 无冲突，直接导入
                        return ImportExportManager.importWithResolution(filePath, {})
                            .then(stats => {
                                showImportResult(stats);
                            });
                    }
                });
        })
        .catch(error => {
            // 增强错误信息处理
            const errorMsg = error.message || error.error || error.toString() || '未知错误';
            console.error('导入错误详情:', error);
            showToast('error', '导入失败: ' + errorMsg);
        });
}

// === 冲突解决对话框 ===
// 返回 Promise，在用户确认或取消后 resolve
function openConflictResolveDialog(zipPath, importInfo) {
    return new Promise((resolve, reject) => {
        const modal = document.createElement('dialog');
        modal.className = 'modal conflict-dialog';

        const conflictsHtml = importInfo.conflicts.map((conflict, index) => `
            <div class="conflict-item">
                <div class="conflict-item-header">
                    <i class="ph ph-warning"></i>
                    <span>${escapeHtml(conflict.website)}</span>
                </div>
                <div class="conflict-item-details">
                    <span>现有版本：更新于 ${conflict.existingUpdatedAt}</span>
                    <span>导入版本：更新于 ${conflict.importedUpdatedAt}</span>
                </div>
                <div class="conflict-item-actions">
                    <label class="conflict-option">
                        <input type="radio" name="conflict_${index}" value="keep">
                        <span>保留现有</span>
                    </label>
                    <label class="conflict-option">
                        <input type="radio" name="conflict_${index}" value="replace" checked>
                        <span>使用导入</span>
                    </label>
                    <label class="conflict-option">
                        <input type="radio" name="conflict_${index}" value="both">
                        <span>保留两者</span>
                    </label>
                </div>
            </div>
        `).join('');

        modal.innerHTML = `
            <div class="modal-content animate-scale-in">
                <div class="modal-header">
                    <h2><i class="ph ph-warning"></i> 导入冲突解决</h2>
                    <button class="modal-close"><i class="ph ph-x"></i></button>
                </div>

                <p>检测到 <strong>${importInfo.conflicts.length}</strong> 个冲突的记录。请选择处理方式：</p>

                <div class="conflict-list">
                    ${conflictsHtml}
                </div>

                <div style="margin-top: var(--spacing-md); padding: var(--spacing-sm); background: rgba(255,255,255,0.03); border-radius: var(--radius-sm);">
                    <label style="display: flex; align-items: center; gap: var(--spacing-sm); font-size: 13px;">
                        <input type="checkbox" id="applyToAll">
                        <span>将以上选择应用到所有冲突（不推荐，请仔细检查）</span>
                    </label>
                </div>

                <p style="margin-top: var(--spacing-md); font-size: 13px; color: var(--text-secondary);">
                    导入还将添加 <strong>${importInfo.newCount}</strong> 个新记录。
                </p>

                <div class="modal-footer">
                    <button class="glass-btn" id="btnCancel">取消导入</button>
                    <button class="glass-btn glass-btn-primary" id="btnConfirm">确认导入</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modal.showModal();

        // 关闭按钮
        modal.querySelector('.modal-close').addEventListener('click', () => {
            modal.close();
            modal.remove();
            resolve(null); // 用户取消
        });

        // 取消按钮
        modal.querySelector('#btnCancel').addEventListener('click', () => {
            modal.close();
            modal.remove();
            resolve(null); // 用户取消
        });

        // 确认导入
        let isImporting = false; // 防止重复点击
        modal.querySelector('#btnConfirm').addEventListener('click', async () => {
            // 防止重复点击
            if (isImporting) {
                return;
            }
            isImporting = true;

            // 禁用按钮
            const btnConfirm = modal.querySelector('#btnConfirm');
            btnConfirm.disabled = true;
            btnConfirm.textContent = '导入中...';

            const applyToAll = modal.querySelector('#applyToAll').checked;
            const conflicts = importInfo.conflicts;

            // 构建解决方案映射
            const resolutions = {};

            if (applyToAll) {
                // 获取第一个冲突的选择并应用到所有
                const firstChoice = modal.querySelector('input[name="conflict_0"]:checked').value;
                for (const conflict of conflicts) {
                    resolutions[conflict.id] = firstChoice;
                }
            } else {
                // 每个冲突单独选择
                for (let i = 0; i < conflicts.length; i++) {
                    const choice = modal.querySelector(`input[name="conflict_${i}"]:checked`).value;
                    resolutions[conflicts[i].id] = choice;
                }
            }

            try {
                console.log('开始导入，resolutions:', resolutions);
                const stats = await ImportExportManager.importWithResolution(zipPath, resolutions);
                console.log('导入完成，stats:', stats);
                modal.close();
                modal.remove();
                showImportResult(stats);
                resolve(stats); // 解决 Promise
            } catch (error) {
                console.error('导入失败:', error);
                showToast('error', '导入失败: ' + error.message);
                reject(error); // 拒绝 Promise
            } finally {
                isImporting = false;
            }
        });

        // 对话框关闭事件（用户按 ESC 或点击遮罩关闭）
        modal.addEventListener('close', () => {
            modal.remove();
            resolve(null); // 用户取消
        });
    }); // Promise 结束
}

// === 导入结果对话框 ===
function showImportResult(stats) {
    const modal = document.createElement('dialog');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content animate-scale-in">
            <div class="modal-header">
                <h2><i class="ph ph-check-circle"></i> 导入成功</h2>
                <button class="modal-close"><i class="ph ph-x"></i></button>
            </div>

            <div class="import-stats">
                <div class="stat-item">
                    <div class="stat-value">${stats.new || 0}</div>
                    <div class="stat-label">新增记录</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${stats.updated || 0}</div>
                    <div class="stat-label">更新记录</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${stats.skipped || 0}</div>
                    <div class="stat-label">跳过记录</div>
                </div>
            </div>

            <div class="modal-footer">
                <button class="glass-btn glass-btn-primary" id="btnOK">确定</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.showModal();

    modal.querySelector('#btnOK').addEventListener('click', () => {
        modal.close();
        modal.remove();
        // 刷新数据
        if (window.loadData) {
            window.loadData();
        }
    });

    modal.querySelector('.modal-close').addEventListener('click', () => {
        modal.close();
        modal.remove();
    });

    modal.addEventListener('close', () => {
        modal.remove();
    });
}

// === 工具函数 ===
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(type, message) {
    if (window.showToast) {
        window.showToast(type, message);
    } else {
        console.log(`[${type}]`, message);
    }
}

// === 导出 ===
export {
    ImportExportManager,
    openExportDialog,
    openImportDialog
};
