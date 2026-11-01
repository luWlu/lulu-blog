/** 学习路径里的短标题：去掉「实验X：」前缀和括号、逗号后的补充说明。 */
export const shortTitle = (title: string) => title.replace(/^[^：:]*实验[^：:]*[：:]\s*/, '').split(/[（(，,]/)[0].trim();
