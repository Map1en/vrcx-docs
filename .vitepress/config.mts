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
                                        text: 'Change Entry Map',
                                        link: '/en/architecture/change-entry-map',
                                    },
                                    {
                                        text: 'Store Boundary Rules',
                                        link: '/en/architecture/store-boundary-rules',
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
                            {
                                text: 'Module Deep-Dives',
                                items: [
                                    {
                                        text: 'Friend System',
                                        link: '/en/modules/friend-system',
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
                                        text: 'Dashboard System',
                                        link: '/en/modules/dashboard-system',
                                    },
                                    {
                                        text: 'Web Worker Architecture',
                                        link: '/en/modules/web-worker',
                                    },
                                    {
                                        text: 'Refactoring Directions',
                                        link: '/en/modules/refactoring-directions',
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
                                        text: '前端改动入口地图',
                                        link: '/zh/architecture/change-entry-map',
                                    },
                                    {
                                        text: 'Store 边界规则',
                                        link: '/zh/architecture/store-boundary-rules',
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
                            {
                                text: '模块详解',
                                items: [
                                    {
                                        text: 'Friend 系统',
                                        link: '/zh/modules/friend-system',
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
                                        text: '自定义仪表盘',
                                        link: '/zh/modules/dashboard-system',
                                    },
                                    {
                                        text: 'Web Worker 架构',
                                        link: '/zh/modules/web-worker',
                                    },
                                    {
                                        text: '重构方向与进度',
                                        link: '/zh/modules/refactoring-directions',
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
