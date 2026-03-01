/**
 * API Key Manager - Theme Manager
 * 主题管理模块
 */

const ThemeManager = {
  STORAGE_KEY: 'theme-preference',

  // 初始化主题
  init() {
    // 读取保存的主题偏好
    const savedTheme = localStorage.getItem(this.STORAGE_KEY);
    if (savedTheme) {
      this.applyTheme(savedTheme);
    } else {
      // 默认为暗色主题
      this.applyTheme('dark');
    }
    this.bindEvents();
  },

  // 绑定切换事件
  bindEvents() {
    const toggleBtn = document.getElementById('themeToggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.toggle());
    }
  },

  // 切换主题
  toggle() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    this.applyTheme(newTheme);
    // 保存偏好到 localStorage
    localStorage.setItem(this.STORAGE_KEY, newTheme);
  },

  // 应用主题
  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    // 更新图标
    const icon = document.querySelector('#themeToggle i');
    if (icon) {
      icon.className = theme === 'light' ? 'ph ph-sun' : 'ph ph-moon';
    }
  }
};

export default ThemeManager;
