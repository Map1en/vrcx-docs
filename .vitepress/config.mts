import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';

const repository = process.env.GITHUB_REPOSITORY ?? '';
const repoName = repository.split('/')[1] ?? '';
const isUserOrOrgSite = repoName.endsWith('.github.io');
const base =
    process.env.GITHUB_ACTIONS === 'true'
        ? isUserOrOrgSite
            ? '/'
            : `/${repoName}/`
        : '/';

export default withMermaid(
    defineConfig({
        title: 'VRCX Internal Docs',
        description: 'Architecture, decision framework & module deep-dives for VRCX frontend',
        base,

        locales: {
            en: {
                label: 'English',
                lang: 'en',
                link: '/en/',
                themeConfig: {
                    nav: [
                        { text: 'Architecture', link: '/en/architecture/overview' },
                        { text: 'Decision', link: '/en/decision/feature-matrix' },
                        { text: 'Modules', link: '/en/modules/friend-system' },
                    ],
                    sidebar: {
                        '/en/': [
                            {
                                text: 'Architecture',
                                items: [
                                    {
                                        text: 'System Overview',
                                        link: '/en/architecture/overview',
                                    },
                                    {
                                        text: 'Data Flow',
                                        link: '/en/architecture/data-flow',
                                    },
                                    {
                                        text: 'Module Dependencies',
                                        link: '/en/architecture/dependencies',
                                    },
                                    {
                                        text: 'Backend Architecture',
                                        link: '/en/architecture/backend',
                                    },
                                ],
                            },
                            {
                                text: 'Feature Modules',
                                collapsed: false,
                                items: [
                                    {
                                        text: 'Auth System',
                                        link: '/en/modules/auth-system',
                                    },
                                    {
                                        text: 'User System',
                                        link: '/en/modules/user-system',
                                    },
                                    {
                                        text: 'Friend System',
                                        link: '/en/modules/friend-system',
                                    },
                                    {
                                        text: 'Notification System',
                                        link: '/en/modules/notification-system',
                                    },
                                    {
                                        text: 'Group System',
                                        link: '/en/modules/group-system',
                                    },
                                    {
                                        text: 'Favorite System',
                                        link: '/en/modules/favorite-system',
                                    },
                                    {
                                        text: 'Instance & Location',
                                        link: '/en/modules/instance-location',
                                    },
                                    {
                                        text: 'Search & Direct Access',
                                        link: '/en/modules/search-system',
                                    },
                                    {
                                        text: 'Feed System',
                                        link: '/en/modules/feed-system',
                                    },
                                    {
                                        text: 'GameLog System',
                                        link: '/en/modules/gamelog-system',
                                    },
                                    {
                                        text: 'WebSocket Service',
                                        link: '/en/modules/websocket-service',
                                    },
                                    {
                                        text: 'Modal System',
                                        link: '/en/modules/modal-system',
                                    },
                                    {
                                        text: 'Dashboard System',
                                        link: '/en/modules/dashboard-system',
                                    },
                                    {
                                        text: 'Status Bar',
                                        link: '/en/modules/status-bar',
                                    },
                                ],
                            },
                            {
                                text: 'Optimization',
                                items: [
                                    {
                                        text: 'Performance Analysis',
                                        link: '/en/architecture/performance-analysis',
                                    },
                                    {
                                        text: 'Web Worker Architecture',
                                        link: '/en/modules/web-worker',
                                    },
                                ],
                            },
                            {
                                text: 'Engineering',
                                items: [
                                    {
                                        text: 'Store Boundary Rules',
                                        link: '/en/architecture/store-boundary-rules',
                                    },
                                    {
                                        text: 'Change Entry Map',
                                        link: '/en/architecture/change-entry-map',
                                    },
                                    {
                                        text: 'Refactoring Directions',
                                        link: '/en/modules/refactoring-directions',
                                    },
                                ],
                            },
                            {
                                text: 'Decision Framework',
                                items: [
                                    {
                                        text: 'Feature Matrix',
                                        link: '/en/decision/feature-matrix',
                                    },
                                    {
                                        text: 'Layout Strategy',
                                        link: '/en/decision/layout-strategy',
                                    },
                                    {
                                        text: 'Impact Analysis Template',
                                        link: '/en/decision/impact-template',
                                    },
                                ],
                            },
                        ],
                    },
                },
            },
            zh: {
                label: '中文',
                lang: 'zh-CN',
                link: '/zh/',
                themeConfig: {
                    nav: [
                        { text: '架构', link: '/zh/architecture/overview' },
                        { text: '决策', link: '/zh/decision/feature-matrix' },
                        { text: '模块', link: '/zh/modules/friend-system' },
                    ],
                    sidebar: {
                        '/zh/': [
                            {
                                text: '架构',
                                items: [
                                    {
                                        text: '系统总览',
                                        link: '/zh/architecture/overview',
                                    },
                                    {
                                        text: '数据流',
                                        link: '/zh/architecture/data-flow',
                                    },
                                    {
                                        text: '模块依赖',
                                        link: '/zh/architecture/dependencies',
                                    },
                                    {
                                        text: '后端架构参考',
                                        link: '/zh/architecture/backend',
                                    },
                                ],
                            },
                            {
                                text: '功能模块',
                                collapsed: false,
                                items: [
                                    {
                                        text: '认证系统',
                                        link: '/zh/modules/auth-system',
                                    },
                                    {
                                        text: '用户系统',
                                        link: '/zh/modules/user-system',
                                    },
                                    {
                                        text: 'Friend 系统',
                                        link: '/zh/modules/friend-system',
                                    },
                                    {
                                        text: '通知系统',
                                        link: '/zh/modules/notification-system',
                                    },
                                    {
                                        text: '群组系统',
                                        link: '/zh/modules/group-system',
                                    },
                                    {
                                        text: 'Favorite 系统',
                                        link: '/zh/modules/favorite-system',
                                    },
                                    {
                                        text: 'Instance & Location',
                                        link: '/zh/modules/instance-location',
                                    },
                                    {
                                        text: '搜索与直接访问',
                                        link: '/zh/modules/search-system',
                                    },
                                    {
                                        text: 'Feed 系统',
                                        link: '/zh/modules/feed-system',
                                    },
                                    {
                                        text: '游戏日志系统',
                                        link: '/zh/modules/gamelog-system',
                                    },
                                    {
                                        text: 'WebSocket 服务',
                                        link: '/zh/modules/websocket-service',
                                    },
                                    {
                                        text: 'Modal 系统',
                                        link: '/zh/modules/modal-system',
                                    },
                                    {
                                        text: '自定义仪表盘',
                                        link: '/zh/modules/dashboard-system',
                                    },
                                    {
                                        text: '状态栏',
                                        link: '/zh/modules/status-bar',
                                    },
                                ],
                            },
                            {
                                text: '性能优化',
                                items: [
                                    {
                                        text: '性能分析',
                                        link: '/zh/architecture/performance-analysis',
                                    },
                                    {
                                        text: 'Web Worker 架构',
                                        link: '/zh/modules/web-worker',
                                    },
                                ],
                            },
                            {
                                text: '工程化',
                                items: [
                                    {
                                        text: 'Store 边界规则',
                                        link: '/zh/architecture/store-boundary-rules',
                                    },
                                    {
                                        text: '前端改动入口地图',
                                        link: '/zh/architecture/change-entry-map',
                                    },
                                    {
                                        text: '重构方向与进度',
                                        link: '/zh/modules/refactoring-directions',
                                    },
                                ],
                            },
                            {
                                text: '决策框架',
                                items: [
                                    {
                                        text: '功能矩阵',
                                        link: '/zh/decision/feature-matrix',
                                    },
                                    {
                                        text: '布局策略',
                                        link: '/zh/decision/layout-strategy',
                                    },
                                    {
                                        text: '影响分析模板',
                                        link: '/zh/decision/impact-template',
                                    },
                                ],
                            },
                        ],
                    },
                },
            },
        },

        themeConfig: {
            search: {
                provider: 'local',
            },
            socialLinks: [
                { icon: 'github', link: 'https://github.com/vrcx-team/VRCX' },
            ],
        },

        mermaid: {},
    })
);
